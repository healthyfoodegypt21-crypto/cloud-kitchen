import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type JsonObject = Record<string, unknown>;

function jsonResponse(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
    : [];
}

async function syncAccess(
  client: ReturnType<typeof createClient>,
  table: 'user_brand_access' | 'user_page_permissions' | 'user_kitchen_hub_access',
  userId: string,
  values: string[],
  column: 'brand_id' | 'page' | 'kitchen_hub_id',
) {
  const deleted = await client.from(table).delete().eq('user_id', userId);
  if (deleted.error) throw new Error(`Failed to clear ${table}: ${deleted.error.message}`);
  if (values.length === 0) return;

  const inserted = await client.from(table).insert(values.map((value) => ({
    user_id: userId,
    [column]: value,
  })));
  if (inserted.error) throw new Error(`Failed to save ${table}: ${inserted.error.message}`);
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !caller) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: isOwner, error: roleError } = await supabaseUser.rpc('has_role', {
      _user_id: caller.id,
      _role: 'owner',
    });
    if (roleError) {
      return jsonResponse({ error: roleError.message }, 500);
    }
    if (!isOwner) return jsonResponse({ error: 'Only system administrators can manage users' }, 403);

    const body = await req.json() as JsonObject;
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const action = body.action;

    if (action === 'list_users') {
      const [profiles, roles, brands, pages, hubs, hubAccess] = await Promise.all([
        admin.from('profiles').select('id, display_name, phone, status, created_at'),
        admin.from('user_roles').select('user_id, role'),
        admin.from('user_brand_access').select('user_id, brand_id'),
        admin.from('user_page_permissions').select('user_id, page'),
        admin.from('kitchen_hubs').select('id, name, is_active').eq('is_active', true).order('name'),
        admin.from('user_kitchen_hub_access').select('user_id, kitchen_hub_id'),
      ]);
      const queryError = profiles.error || roles.error || brands.error || pages.error || hubs.error || hubAccess.error;
      if (queryError) return jsonResponse({ error: queryError.message }, 500);

      const authUsers = [];
      for (let page = 1; ; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return jsonResponse({ error: error.message }, 500);
        authUsers.push(...data.users);
        if (data.users.length < 1000) break;
      }
      const authUsersById = new Map(authUsers.map((item) => [item.id, item]));

      return jsonResponse({
        users: (profiles.data ?? []).map((profile) => {
          const account = authUsersById.get(profile.id);
          return {
            id: profile.id,
            name: profile.display_name,
            email: account?.email ?? '',
            phone: profile.phone,
            status: profile.status,
            role: roles.data?.find((item) => item.user_id === profile.id)?.role ?? '',
            brands: brands.data?.filter((item) => item.user_id === profile.id).map((item) => item.brand_id) ?? [],
            branches: hubAccess.data?.filter((item) => item.user_id === profile.id).map((item) => item.kitchen_hub_id) ?? [],
            pages: pages.data?.filter((item) => item.user_id === profile.id).map((item) => item.page) ?? [],
            last_login: account?.last_sign_in_at ?? null,
            created_at: profile.created_at,
          };
        }),
        hubs: hubs.data ?? [],
      });
    }

    if (action === 'create_kitchen_hub') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 100) return jsonResponse({ error: 'Enter a kitchen name (up to 100 characters)' }, 400);
      const { data, error } = await admin.from('kitchen_hubs')
        .insert({ name, created_by: caller.id })
        .select('id, name, is_active')
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ hub: data });
    }

    if (action === 'create_user') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      const role = typeof body.role === 'string' ? body.role.trim() : '';
      const password = body.password;
      const brandIds = stringArray(body.brand_ids);
      const pages = stringArray(body.pages);
      const hubIds = stringArray(body.kitchen_hub_ids);

      if (!validEmail(email) || !name || name.length > 120 || !role || role.length > 80) {
        return jsonResponse({ error: 'Enter a valid email, name, and role' }, 400);
      }
      if (phone.length > 40) return jsonResponse({ error: 'Phone number is too long' }, 400);
      if (typeof password !== 'string' || password.length < 8) {
        return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
      }
      if (brandIds.length === 0 || pages.length === 0) {
        return jsonResponse({ error: 'Select at least one brand and one page' }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name },
      });
      if (createError) return jsonResponse({ error: createError.message }, 400);

      try {
        const profile = await admin.from('profiles').update({ display_name: name, phone, status: 'active' }).eq('id', created.user.id);
        if (profile.error) throw new Error(`Failed to save profile: ${profile.error.message}`);
        const roleInsert = await admin.from('user_roles').insert({ user_id: created.user.id, role });
        if (roleInsert.error) throw new Error(`Failed to assign role: ${roleInsert.error.message}`);
        await syncAccess(admin, 'user_brand_access', created.user.id, brandIds, 'brand_id');
        await syncAccess(admin, 'user_page_permissions', created.user.id, pages, 'page');
        await syncAccess(admin, 'user_kitchen_hub_access', created.user.id, hubIds, 'kitchen_hub_id');
      } catch (error) {
        const cleanup = await admin.auth.admin.deleteUser(created.user.id);
        const message = error instanceof Error ? error.message : 'Failed to create user';
        return jsonResponse({ error: cleanup.error ? `${message}. Cleanup failed: ${cleanup.error.message}` : message }, 500);
      }
      return jsonResponse({ success: true, user_id: created.user.id });
    }

    if (action === 'update_user') {
      const userId = typeof body.user_id === 'string' ? body.user_id : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      const role = typeof body.role === 'string' ? body.role.trim() : '';
      if (!userId || !name || name.length > 120 || !role || role.length > 80 || phone.length > 40) {
        return jsonResponse({ error: 'Enter a valid name, role, and phone number' }, 400);
      }
      const { data: existingRole, error: existingRoleError } = await admin.from('user_roles')
        .select('role').eq('user_id', userId).maybeSingle();
      if (existingRoleError) return jsonResponse({ error: existingRoleError.message }, 500);
      if (userId === caller.id && role !== 'owner') {
        return jsonResponse({ error: 'You cannot remove your own system administrator role' }, 400);
      }
      if (existingRole?.role === 'owner' && role !== 'owner') {
        return jsonResponse({ error: 'System administrator accounts cannot be changed to another role' }, 400);
      }
      const profile = await admin.from('profiles').update({ display_name: name, phone }).eq('id', userId);
      if (profile.error) return jsonResponse({ error: profile.error.message }, 500);
      const roleUpdate = existingRole
        ? await admin.from('user_roles').update({ role }).eq('user_id', userId)
        : await admin.from('user_roles').insert({ user_id: userId, role });
      if (roleUpdate.error) return jsonResponse({ error: roleUpdate.error.message }, 500);
      const metadata = await admin.auth.admin.updateUserById(userId, { user_metadata: { display_name: name } });
      if (metadata.error) return jsonResponse({ error: metadata.error.message }, 500);
      return jsonResponse({ success: true });
    }

    if (action === 'update_permissions') {
      const userId = typeof body.user_id === 'string' ? body.user_id : '';
      if (!userId) return jsonResponse({ error: 'Missing user_id' }, 400);
      const { data: targetRole, error: roleLookupError } = await admin.from('user_roles')
        .select('role').eq('user_id', userId).maybeSingle();
      if (roleLookupError) return jsonResponse({ error: roleLookupError.message }, 500);
      if (targetRole?.role === 'owner') {
        return jsonResponse({ error: 'System administrators have full access and do not use scoped permissions' }, 400);
      }
      const brandIds = stringArray(body.brand_ids);
      const pages = stringArray(body.pages);
      const hubIds = stringArray(body.kitchen_hub_ids);
      if (brandIds.length === 0 || pages.length === 0) {
        return jsonResponse({ error: 'Select at least one brand and one page' }, 400);
      }
      const oldAccess = await Promise.all([
        admin.from('user_brand_access').select('brand_id').eq('user_id', userId),
        admin.from('user_page_permissions').select('page').eq('user_id', userId),
        admin.from('user_kitchen_hub_access').select('kitchen_hub_id').eq('user_id', userId),
      ]);
      const readError = oldAccess.find((item) => item.error);
      if (readError?.error) return jsonResponse({ error: readError.error.message }, 500);
      try {
        await syncAccess(admin, 'user_brand_access', userId, brandIds, 'brand_id');
        await syncAccess(admin, 'user_page_permissions', userId, pages, 'page');
        await syncAccess(admin, 'user_kitchen_hub_access', userId, hubIds, 'kitchen_hub_id');
      } catch (error) {
        try {
          await syncAccess(admin, 'user_brand_access', userId, (oldAccess[0].data ?? []).map((item) => item.brand_id), 'brand_id');
          await syncAccess(admin, 'user_page_permissions', userId, (oldAccess[1].data ?? []).map((item) => item.page), 'page');
          await syncAccess(admin, 'user_kitchen_hub_access', userId, (oldAccess[2].data ?? []).map((item) => item.kitchen_hub_id), 'kitchen_hub_id');
        } catch (rollbackError) {
          return jsonResponse({
            error: `${error instanceof Error ? error.message : 'Failed to update permissions'}. Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : 'unknown error'}`,
          }, 500);
        }
        return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to update permissions' }, 500);
      }
      return jsonResponse({ success: true });
    }

    if (action === 'set_status') {
      const userIds = stringArray(body.user_ids);
      const status = body.status;
      if (userIds.length === 0 || !['active', 'inactive', 'pending'].includes(String(status))) {
        return jsonResponse({ error: 'Invalid users or account status' }, 400);
      }
      if (userIds.includes(caller.id)) return jsonResponse({ error: 'You cannot change your own account status' }, 400);
      const owners = await admin.from('user_roles').select('user_id').in('user_id', userIds).eq('role', 'owner');
      if (owners.error) return jsonResponse({ error: owners.error.message }, 500);
      if ((owners.data ?? []).length > 0) return jsonResponse({ error: 'System administrator accounts cannot be disabled' }, 400);

      for (const userId of userIds) {
        const profile = await admin.from('profiles').update({ status }).eq('id', userId);
        if (profile.error) return jsonResponse({ error: profile.error.message }, 500);
        const authUser = await admin.auth.admin.updateUserById(userId, {
          ban_duration: status === 'active' ? 'none' : '876000h',
        });
        if (authUser.error) return jsonResponse({ error: authUser.error.message }, 500);
      }
      return jsonResponse({ success: true });
    }

    if (action === 'delete_users') {
      const userIds = stringArray(body.user_ids);
      if (userIds.length === 0) return jsonResponse({ error: 'Select at least one user' }, 400);
      if (userIds.includes(caller.id)) return jsonResponse({ error: 'You cannot delete your own account' }, 400);
      const owners = await admin.from('user_roles').select('user_id').in('user_id', userIds).eq('role', 'owner');
      if (owners.error) return jsonResponse({ error: owners.error.message }, 500);
      if ((owners.data ?? []).length > 0) return jsonResponse({ error: 'System administrator accounts cannot be deleted' }, 400);
      for (const userId of userIds) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) return jsonResponse({ error: `Some earlier accounts may already have been deleted. ${error.message}` }, 500);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unsupported action' }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
