-- Allow administrators to assign a free-form job role while preserving the existing
-- app_role enum for owner-only RLS checks through public.has_role.
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE text USING role::text;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_not_blank CHECK (btrim(role) <> '');

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role::text
  )
$$;

DROP FUNCTION public.get_user_role(uuid);

CREATE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;
