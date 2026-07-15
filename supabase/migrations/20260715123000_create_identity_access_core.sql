CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  legal_name text,
  status text NOT NULL DEFAULT 'active',
  default_timezone text NOT NULL DEFAULT 'UTC',
  default_locale text NOT NULL DEFAULT 'en',
  base_currency_code text NOT NULL DEFAULT 'USD',
  country_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT organizations_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT organizations_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT organizations_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT organizations_default_timezone_not_blank CHECK (btrim(default_timezone) <> ''),
  CONSTRAINT organizations_default_locale_not_blank CHECK (btrim(default_locale) <> ''),
  CONSTRAINT organizations_currency_code_format CHECK (base_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT organizations_country_code_format CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  code text NOT NULL,
  legal_name text,
  status text NOT NULL DEFAULT 'active',
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en',
  currency_code text NOT NULL DEFAULT 'USD',
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT businesses_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT businesses_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT businesses_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT businesses_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT businesses_code_format CHECK (code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT businesses_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT businesses_timezone_not_blank CHECK (btrim(timezone) <> ''),
  CONSTRAINT businesses_locale_not_blank CHECK (btrim(locale) <> ''),
  CONSTRAINT businesses_currency_code_format CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email extensions.citext,
  display_name text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  locale text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'UTC',
  employee_code text,
  status text NOT NULL DEFAULT 'active',
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT profiles_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT profiles_locale_not_blank CHECK (btrim(locale) <> ''),
  CONSTRAINT profiles_timezone_not_blank CHECK (btrim(timezone) <> ''),
  CONSTRAINT profiles_status_check CHECK (status IN ('active', 'invited', 'suspended', 'inactive'))
);

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text NOT NULL DEFAULT '',
  precedence smallint NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT false,
  is_assignable boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT roles_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT roles_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT roles_code_format CHECK (code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  module text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT permissions_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT permissions_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT permissions_module_not_blank CHECK (btrim(module) <> ''),
  CONSTRAINT permissions_resource_not_blank CHECK (btrim(resource) <> ''),
  CONSTRAINT permissions_action_not_blank CHECK (btrim(action) <> ''),
  CONSTRAINT permissions_code_format CHECK (code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  CONSTRAINT permissions_module_format CHECK (module ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  CONSTRAINT permissions_resource_format CHECK (resource ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  CONSTRAINT permissions_action_format CHECK (action ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE RESTRICT,
  effect text NOT NULL DEFAULT 'allow',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT role_permissions_effect_check CHECK (effect IN ('allow', 'deny'))
);

CREATE TABLE public.user_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_type text NOT NULL DEFAULT 'employee',
  membership_status text NOT NULL DEFAULT 'active',
  is_primary boolean NOT NULL DEFAULT false,
  active_from timestamptz NOT NULL DEFAULT now(),
  active_until timestamptz,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_access_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT user_businesses_membership_type_check CHECK (membership_type IN ('employee', 'contractor', 'partner', 'auditor')),
  CONSTRAINT user_businesses_membership_status_check CHECK (membership_status IN ('invited', 'active', 'suspended', 'inactive')),
  CONSTRAINT user_businesses_active_window_check CHECK (active_until IS NULL OR active_until > active_from)
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_business_id uuid NOT NULL REFERENCES public.user_businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assignment_status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT user_roles_assignment_status_check CHECK (assignment_status IN ('active', 'suspended', 'revoked', 'expired')),
  CONSTRAINT user_roles_effective_window_check CHECK (effective_until IS NULL OR effective_until > effective_from)
);

COMMENT ON TABLE public.organizations IS 'Top-level tenant entity for the restaurant group, owning shared policies, brands, and access control boundaries.';
COMMENT ON TABLE public.businesses IS 'Operational brand or business unit inside an organization, such as Protein Box or Healthy Station.';
COMMENT ON TABLE public.profiles IS 'Application-facing identity profile that extends auth.users with employee and localization data.';
COMMENT ON TABLE public.roles IS 'Reusable permission groups defined per organization and assignable to users inside businesses.';
COMMENT ON TABLE public.permissions IS 'Canonical capability catalog used to model fine-grained application actions.';
COMMENT ON TABLE public.role_permissions IS 'Mapping table that grants or denies permissions to a role within an organization.';
COMMENT ON TABLE public.user_businesses IS 'Membership registry that assigns a user to one or more businesses with lifecycle and primary-business semantics.';
COMMENT ON TABLE public.user_roles IS 'Role assignment ledger that grants a role to a specific user membership inside a business.';

CREATE UNIQUE INDEX organizations_slug_active_uidx
  ON public.organizations (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX organizations_status_idx
  ON public.organizations (status)
  WHERE deleted_at IS NULL;

CREATE INDEX organizations_deleted_at_idx
  ON public.organizations (deleted_at);

CREATE UNIQUE INDEX businesses_org_slug_active_uidx
  ON public.businesses (organization_id, slug)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX businesses_org_code_active_uidx
  ON public.businesses (organization_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX businesses_org_status_sort_idx
  ON public.businesses (organization_id, status, sort_order, name)
  WHERE deleted_at IS NULL;

CREATE INDEX businesses_deleted_at_idx
  ON public.businesses (deleted_at);

CREATE UNIQUE INDEX profiles_email_active_uidx
  ON public.profiles (email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX profiles_status_idx
  ON public.profiles (status)
  WHERE deleted_at IS NULL;

CREATE INDEX profiles_employee_code_idx
  ON public.profiles (employee_code)
  WHERE employee_code IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX profiles_last_seen_at_idx
  ON public.profiles (last_seen_at DESC);

CREATE INDEX profiles_deleted_at_idx
  ON public.profiles (deleted_at);

CREATE UNIQUE INDEX roles_org_code_active_uidx
  ON public.roles (organization_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX roles_org_precedence_idx
  ON public.roles (organization_id, precedence, name)
  WHERE deleted_at IS NULL;

CREATE INDEX roles_deleted_at_idx
  ON public.roles (deleted_at);

CREATE UNIQUE INDEX permissions_code_active_uidx
  ON public.permissions (code)
  WHERE deleted_at IS NULL;

CREATE INDEX permissions_module_resource_action_idx
  ON public.permissions (module, resource, action)
  WHERE deleted_at IS NULL;

CREATE INDEX permissions_deleted_at_idx
  ON public.permissions (deleted_at);

CREATE UNIQUE INDEX role_permissions_active_uidx
  ON public.role_permissions (organization_id, role_id, permission_id)
  WHERE deleted_at IS NULL;

CREATE INDEX role_permissions_org_role_idx
  ON public.role_permissions (organization_id, role_id, effect)
  WHERE deleted_at IS NULL;

CREATE INDEX role_permissions_permission_idx
  ON public.role_permissions (permission_id)
  WHERE deleted_at IS NULL;

CREATE INDEX role_permissions_deleted_at_idx
  ON public.role_permissions (deleted_at);

CREATE UNIQUE INDEX user_businesses_active_uidx
  ON public.user_businesses (organization_id, user_id, business_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX user_businesses_primary_active_uidx
  ON public.user_businesses (organization_id, user_id)
  WHERE is_primary = true AND membership_status = 'active' AND deleted_at IS NULL;

CREATE INDEX user_businesses_business_status_idx
  ON public.user_businesses (business_id, membership_status, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX user_businesses_user_status_idx
  ON public.user_businesses (user_id, membership_status, organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX user_businesses_deleted_at_idx
  ON public.user_businesses (deleted_at);

CREATE UNIQUE INDEX user_roles_active_uidx
  ON public.user_roles (user_business_id, role_id)
  WHERE deleted_at IS NULL AND assignment_status = 'active';

CREATE INDEX user_roles_user_business_status_idx
  ON public.user_roles (organization_id, business_id, user_id, assignment_status)
  WHERE deleted_at IS NULL;

CREATE INDEX user_roles_role_idx
  ON public.user_roles (role_id)
  WHERE deleted_at IS NULL;

CREATE INDEX user_roles_deleted_at_idx
  ON public.user_roles (deleted_at);

CREATE OR REPLACE FUNCTION public.current_user_owns_organization(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = _organization_id
      AND o.created_by = auth.uid()
      AND o.deleted_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_active_org_access(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_owns_organization(_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_businesses ub
      WHERE ub.organization_id = _organization_id
        AND ub.user_id = auth.uid()
        AND ub.deleted_at IS NULL
        AND ub.membership_status = 'active'
        AND ub.active_from <= now()
        AND (ub.active_until IS NULL OR ub.active_until > now())
    )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_active_org_admin(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_owns_organization(_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.user_businesses ub ON ub.id = ur.user_business_id
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.organization_id = _organization_id
        AND ur.user_id = auth.uid()
        AND ur.deleted_at IS NULL
        AND ur.assignment_status = 'active'
        AND ur.effective_from <= now()
        AND (ur.effective_until IS NULL OR ur.effective_until > now())
        AND ub.deleted_at IS NULL
        AND ub.membership_status = 'active'
        AND ub.active_from <= now()
        AND (ub.active_until IS NULL OR ub.active_until > now())
        AND r.deleted_at IS NULL
        AND r.is_assignable = true
        AND r.code IN ('organization_owner', 'organization_admin', 'business_owner', 'business_admin')
    )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_active_business_access(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_businesses ub
    WHERE ub.business_id = _business_id
      AND ub.user_id = auth.uid()
      AND ub.deleted_at IS NULL
      AND ub.membership_status = 'active'
      AND ub.active_from <= now()
      AND (ub.active_until IS NULL OR ub.active_until > now())
  )
  OR EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = _business_id
      AND b.deleted_at IS NULL
      AND public.current_user_has_active_org_admin(b.organization_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_active_business_admin(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.user_businesses ub ON ub.id = ur.user_business_id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.business_id = _business_id
      AND ur.user_id = auth.uid()
      AND ur.deleted_at IS NULL
      AND ur.assignment_status = 'active'
      AND ur.effective_from <= now()
      AND (ur.effective_until IS NULL OR ur.effective_until > now())
      AND ub.deleted_at IS NULL
      AND ub.membership_status = 'active'
      AND ub.active_from <= now()
      AND (ub.active_until IS NULL OR ub.active_until > now())
      AND r.deleted_at IS NULL
      AND r.is_assignable = true
      AND r.code IN ('organization_owner', 'organization_admin', 'business_owner', 'business_admin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = _business_id
      AND b.deleted_at IS NULL
      AND public.current_user_has_active_org_admin(b.organization_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_view_profile(_profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _profile_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_businesses target_ub
      WHERE target_ub.user_id = _profile_user_id
        AND target_ub.deleted_at IS NULL
        AND target_ub.membership_status = 'active'
        AND target_ub.active_from <= now()
        AND (target_ub.active_until IS NULL OR target_ub.active_until > now())
        AND public.current_user_has_active_org_access(target_ub.organization_id)
    )
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_profile(_profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _profile_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_businesses target_ub
      WHERE target_ub.user_id = _profile_user_id
        AND target_ub.deleted_at IS NULL
        AND target_ub.membership_status = 'active'
        AND target_ub.active_from <= now()
        AND (target_ub.active_until IS NULL OR target_ub.active_until > now())
        AND public.current_user_has_active_org_admin(target_ub.organization_id)
    )
$$;

CREATE OR REPLACE FUNCTION public.validate_user_business_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _business_organization_id uuid;
BEGIN
  SELECT organization_id INTO _business_organization_id
  FROM public.businesses
  WHERE id = NEW.business_id;

  IF _business_organization_id IS NULL THEN
    RAISE EXCEPTION 'Business % does not exist.', NEW.business_id;
  END IF;

  IF _business_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Membership organization and business organization must match.';
  END IF;

  IF NEW.is_primary = true AND NEW.membership_status <> 'active' THEN
    RAISE EXCEPTION 'Primary memberships must be active.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_role_permission_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _role_organization_id uuid;
BEGIN
  SELECT organization_id INTO _role_organization_id
  FROM public.roles
  WHERE id = NEW.role_id;

  IF _role_organization_id IS NULL THEN
    RAISE EXCEPTION 'Role % does not exist.', NEW.role_id;
  END IF;

  IF _role_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Role permissions must use the same organization as the referenced role.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_user_role_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _membership_user_id uuid;
  _membership_business_id uuid;
  _membership_organization_id uuid;
  _membership_status text;
  _membership_deleted_at timestamptz;
  _role_organization_id uuid;
BEGIN
  SELECT
    ub.user_id,
    ub.business_id,
    ub.organization_id,
    ub.membership_status,
    ub.deleted_at
  INTO
    _membership_user_id,
    _membership_business_id,
    _membership_organization_id,
    _membership_status,
    _membership_deleted_at
  FROM public.user_businesses ub
  WHERE ub.id = NEW.user_business_id;

  IF _membership_user_id IS NULL THEN
    RAISE EXCEPTION 'User membership % does not exist.', NEW.user_business_id;
  END IF;

  IF _membership_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Role assignments cannot target deleted memberships.';
  END IF;

  IF _membership_user_id <> NEW.user_id
     OR _membership_business_id <> NEW.business_id
     OR _membership_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'User role scope must match the referenced user membership.';
  END IF;

  IF NEW.assignment_status = 'active' AND _membership_status <> 'active' THEN
    RAISE EXCEPTION 'Active role assignments require an active membership.';
  END IF;

  SELECT organization_id INTO _role_organization_id
  FROM public.roles
  WHERE id = NEW.role_id;

  IF _role_organization_id IS NULL THEN
    RAISE EXCEPTION 'Role % does not exist.', NEW.role_id;
  END IF;

  IF _role_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'User role organization must match the referenced role organization.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    first_name,
    last_name,
    avatar_url,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name', NEW.email, 'New User'),
    NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
      last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER permissions_set_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER role_permissions_set_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER user_businesses_set_updated_at
  BEFORE UPDATE ON public.user_businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER user_roles_set_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER user_businesses_validate_scope
  BEFORE INSERT OR UPDATE ON public.user_businesses
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_business_scope();

CREATE TRIGGER role_permissions_validate_scope
  BEFORE INSERT OR UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_role_permission_scope();

CREATE TRIGGER user_roles_validate_scope
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_role_scope();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_synced ON auth.users;

CREATE TRIGGER on_auth_user_synced
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_auth_user();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_businesses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_active_org_access(id));

CREATE POLICY "organizations_insert"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "organizations_update"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_active_org_admin(id))
  WITH CHECK (public.current_user_has_active_org_admin(id));

CREATE POLICY "organizations_delete"
  ON public.organizations
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_active_org_admin(id));

CREATE POLICY "businesses_select"
  ON public.businesses
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_has_active_org_access(organization_id)
    OR public.current_user_has_active_business_access(id)
  );

CREATE POLICY "businesses_insert"
  ON public.businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "businesses_update"
  ON public.businesses
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_active_org_admin(organization_id))
  WITH CHECK (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "businesses_delete"
  ON public.businesses
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.current_user_can_view_profile(id));

CREATE POLICY "profiles_insert"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.current_user_can_manage_profile(id))
  WITH CHECK (public.current_user_can_manage_profile(id));

CREATE POLICY "roles_select"
  ON public.roles
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_active_org_access(organization_id));

CREATE POLICY "roles_insert"
  ON public.roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "roles_update"
  ON public.roles
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_active_org_admin(organization_id))
  WITH CHECK (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "roles_delete"
  ON public.roles
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "permissions_select"
  ON public.permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "role_permissions_select"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_active_org_access(organization_id));

CREATE POLICY "role_permissions_insert"
  ON public.role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "role_permissions_update"
  ON public.role_permissions
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_active_org_admin(organization_id))
  WITH CHECK (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "role_permissions_delete"
  ON public.role_permissions
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_active_org_admin(organization_id));

CREATE POLICY "user_businesses_select"
  ON public.user_businesses
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_has_active_business_admin(business_id)
  );

CREATE POLICY "user_businesses_insert"
  ON public.user_businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_active_business_admin(business_id));

CREATE POLICY "user_businesses_update"
  ON public.user_businesses
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_active_business_admin(business_id))
  WITH CHECK (public.current_user_has_active_business_admin(business_id));

CREATE POLICY "user_businesses_delete"
  ON public.user_businesses
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_active_business_admin(business_id));

CREATE POLICY "user_roles_select"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_has_active_business_admin(business_id)
  );

CREATE POLICY "user_roles_insert"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_active_business_admin(business_id));

CREATE POLICY "user_roles_update"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_active_business_admin(business_id))
  WITH CHECK (public.current_user_has_active_business_admin(business_id));

CREATE POLICY "user_roles_delete"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.current_user_has_active_business_admin(business_id));
