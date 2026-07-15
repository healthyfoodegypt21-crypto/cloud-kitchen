import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function syncBrandAccess(supabaseAdmin: ReturnType<typeof createClient>, userId: string, brandIds: string[]) {
  const deleteResponse = await supabaseAdmin.from('user_brand_access').delete().eq('user_id', userId);
  if (deleteResponse.error) {
    throw new Error(`Failed to clear brand access: ${deleteResponse.error.message}`);
  }

  if (brandIds.length === 0) {
    return;
  }

  const insertResponse = await supabaseAdmin.from('user_brand_access').insert(
    brandIds.map((brand_id) => ({ user_id: userId, brand_id }))
  );

  if (insertResponse.error) {
    throw new Error(`Failed to save brand access: ${insertResponse.error.message}`);
  }
}

async function syncPagePermissions(supabaseAdmin: ReturnType<typeof createClient>, userId: string, pages: string[]) {
  const deleteResponse = await supabaseAdmin.from('user_page_permissions').delete().eq('user_id', userId);
  if (deleteResponse.error) {
    throw new Error(`Failed to clear page permissions: ${deleteResponse.error.message}`);
  }

  if (pages.length === 0) {
    return;
  }

  const insertResponse = await supabaseAdmin.from('user_page_permissions').insert(
    pages.map((page) => ({ user_id: userId, page }))
  );

  if (insertResponse.error) {
    throw new Error(`Failed to save page permissions: ${insertResponse.error.message}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const [{ data: isOwner }, { data: hasUsersPageAccess, error: pageAccessError }] = await Promise.all([
      supabaseUser.rpc('has_role', { _user_id: caller.id, _role: 'owner' }),
      supabaseUser.rpc('has_page_permission', { _user_id: caller.id, _page: 'users' }),
    ]);

    if (pageAccessError) {
      return jsonResponse({ error: pageAccessError.message }, 500);
    }

    if (!isOwner || !hasUsersPageAccess) {
      return jsonResponse({ error: 'Only owners can manage users' }, 403);
    }

    const body = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Handle different actions
    if (body.action === 'reset_password') {
      const { user_id, password } = body;
      if (!user_id || !password || password.length < 6) {
        return jsonResponse({ error: 'Invalid password' }, 400);
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });
      if (error) {
        return jsonResponse({ error: error.message }, 400);
      }
      return jsonResponse({ success: true });
    }

    if (body.action === 'update_permissions') {
      const { user_id, brand_ids, pages } = body;
      if (!user_id) {
        return jsonResponse({ error: 'Missing user_id' }, 400);
      }

      const normalizedBrandIds = Array.isArray(brand_ids) ? brand_ids : [];
      const normalizedPages = Array.isArray(pages) ? pages : [];

      const [existingBrandAccess, existingPagePermissions] = await Promise.all([
        supabaseAdmin.from('user_brand_access').select('brand_id').eq('user_id', user_id),
        supabaseAdmin.from('user_page_permissions').select('page').eq('user_id', user_id),
      ]);

      if (existingBrandAccess.error || existingPagePermissions.error) {
        return jsonResponse({ error: existingBrandAccess.error?.message || existingPagePermissions.error?.message || 'Failed to read current permissions' }, 500);
      }

      try {
        await syncBrandAccess(supabaseAdmin, user_id, normalizedBrandIds);
        await syncPagePermissions(supabaseAdmin, user_id, normalizedPages);
      } catch (error) {
        try {
          await syncBrandAccess(supabaseAdmin, user_id, (existingBrandAccess.data ?? []).map((item) => item.brand_id));
          await syncPagePermissions(supabaseAdmin, user_id, (existingPagePermissions.data ?? []).map((item) => item.page));
        } catch (rollbackError) {
          return jsonResponse({ error: `${error instanceof Error ? error.message : 'Failed to update permissions'}. Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : 'unknown error'}` }, 500);
        }

        return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to update permissions' }, 500);
      }

      return jsonResponse({ success: true });
    }

    // Default: create new user
    const { email, password, display_name, role, brand_ids, pages } = body;
    if (!email || !password || !display_name || !role) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    if (!Array.isArray(brand_ids) || brand_ids.length === 0) {
      return jsonResponse({ error: 'Select at least one brand' }, 400);
    }

    if (!Array.isArray(pages) || pages.length === 0) {
      return jsonResponse({ error: 'Select at least one page permission' }, 400);
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
    });

    if (createError) {
      return jsonResponse({ error: createError.message }, 400);
    }

    try {
      const roleInsert = await supabaseAdmin.from('user_roles').insert({ user_id: newUser.user.id, role });
      if (roleInsert.error) {
        throw new Error(`Failed to assign role: ${roleInsert.error.message}`);
      }

      await syncBrandAccess(supabaseAdmin, newUser.user.id, Array.isArray(brand_ids) ? brand_ids : []);
      await syncPagePermissions(supabaseAdmin, newUser.user.id, Array.isArray(pages) ? pages : []);
    } catch (error) {
      const deleteResponse = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      if (deleteResponse.error) {
        return jsonResponse({ error: `${error instanceof Error ? error.message : 'Failed to create user'}. Cleanup failed: ${deleteResponse.error.message}` }, 500);
      }

      return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to create user' }, 500);
    }

    return jsonResponse({ success: true, user_id: newUser.user.id });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
