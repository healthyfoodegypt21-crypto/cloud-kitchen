CREATE INDEX IF NOT EXISTS idx_user_brand_access_user_id_brand_id
  ON public.user_brand_access (user_id, brand_id);

CREATE INDEX IF NOT EXISTS idx_user_page_permissions_user_id_page
  ON public.user_page_permissions (user_id, page);

CREATE OR REPLACE FUNCTION public.has_page_permission(_user_id UUID, _page TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_page_permissions
    WHERE user_id = _user_id AND page = _page
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_page_permission(_user_id UUID, _pages TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_page_permissions
    WHERE user_id = _user_id AND page = ANY(_pages)
  )
$$;

INSERT INTO public.user_page_permissions (user_id, page)
SELECT DISTINCT owner_roles.user_id, page_catalog.page
FROM public.user_roles AS owner_roles
CROSS JOIN (
  SELECT unnest(ARRAY[
    'dashboard',
    'orders',
    'kitchen',
    'customers',
    'leaderboard',
    'menu-packages',
    'inventory',
    'users',
    'settings'
  ]) AS page
) AS page_catalog
WHERE owner_roles.role = 'owner'
ON CONFLICT (user_id, page) DO NOTHING;

DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Owner can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owner can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owner can delete roles" ON public.user_roles;

CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'owner')
      AND public.has_page_permission(auth.uid(), 'users')
    )
  );

CREATE POLICY "Owner can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  );

CREATE POLICY "Owner can update roles"
  ON public.user_roles FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  );

CREATE POLICY "Owner can delete roles"
  ON public.user_roles FOR DELETE
  USING (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  );

DROP POLICY IF EXISTS "Users can view own brand access" ON public.user_brand_access;
DROP POLICY IF EXISTS "Owners can manage brand access" ON public.user_brand_access;

CREATE POLICY "Users can view own brand access"
  ON public.user_brand_access FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'owner')
      AND public.has_page_permission(auth.uid(), 'users')
    )
  );

CREATE POLICY "Owners can manage brand access"
  ON public.user_brand_access FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  );

DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_page_permissions;
DROP POLICY IF EXISTS "Owners can manage permissions" ON public.user_page_permissions;

CREATE POLICY "Users can view own permissions"
  ON public.user_page_permissions FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR (
      public.has_role(auth.uid(), 'owner')
      AND public.has_page_permission(auth.uid(), 'users')
    )
  );

CREATE POLICY "Owners can manage permissions"
  ON public.user_page_permissions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  );