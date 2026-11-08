# Archived Supabase migration drafts

## 20260715123000_create_identity_access_core.sql

This file is an unexecuted identity/access foundation draft. It is archived rather than retained in `supabase/migrations` because it creates `public.profiles` and `public.user_roles` from scratch, while the active migration history already creates and depends on those legacy tables.

The active application, RLS helpers, and Edge Functions currently depend on the legacy access model:

- `public.app_role`
- `public.user_roles.role`
- `public.user_brand_access`
- `public.user_page_permissions`
- `public.has_role(...)`
- `public.has_page_permission(...)`

Running the draft after the existing history fails with `relation "profiles" already exists` and would then fail on `user_roles`. It is not a forward-only migration and does not migrate legacy data, dependencies, policies, or frontend/Edge Function consumers.

Any future organization/business/permission redesign must be introduced as a separately approved forward-only migration program, including data migration and consumer cutover. This archived draft must not be copied back into `supabase/migrations`.
