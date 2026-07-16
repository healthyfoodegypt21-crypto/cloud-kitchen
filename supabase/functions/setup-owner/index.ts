import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OWNER_DEFAULT_PAGES = [
  'dashboard',
  'orders',
  'kitchen',
  'customers',
  'leaderboard',
  'menu-packages',
  'inventory',
  'purchases',
  'cleaning',
  'users',
  'settings',
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if any owner exists
    const { data: existingOwners } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'owner')
      .limit(1);

    if (existingOwners && existingOwners.length > 0) {
      return jsonResponse({ error: 'Owner already exists. Use sign in.' }, 403);
    }

    const { email, password, display_name } = await req.json();
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedDisplayName = typeof display_name === 'string' ? display_name.trim() : '';

    if (!normalizedEmail || !password || !normalizedDisplayName) {
      return jsonResponse({ error: 'Missing fields' }, 400);
    }

    if (!isValidEmail(normalizedEmail)) {
      return jsonResponse({ error: 'Invalid email address' }, 400);
    }

    if (typeof password !== 'string' || password.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters' }, 400);
    }

    // Create user via admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: normalizedDisplayName },
    });

    if (createError) {
      return jsonResponse({ error: createError.message }, 400);
    }

    try {
      const roleInsert = await supabaseAdmin.from('user_roles').insert({
        user_id: newUser.user.id,
        role: 'owner',
      });

      if (roleInsert.error) {
        throw new Error(`Failed to assign owner role: ${roleInsert.error.message}`);
      }

      const pagePermissionInsert = await supabaseAdmin.from('user_page_permissions').insert(
        OWNER_DEFAULT_PAGES.map((page) => ({ user_id: newUser.user.id, page }))
      );

      if (pagePermissionInsert.error) {
        throw new Error(`Failed to seed owner page permissions: ${pagePermissionInsert.error.message}`);
      }
    } catch (error) {
      const deleteResponse = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      if (deleteResponse.error) {
        return jsonResponse({ error: `${error instanceof Error ? error.message : 'Failed to create owner'}. Cleanup failed: ${deleteResponse.error.message}` }, 500);
      }

      return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to create owner' }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
