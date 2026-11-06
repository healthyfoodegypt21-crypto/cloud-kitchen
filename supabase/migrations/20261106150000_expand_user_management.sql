ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'inactive', 'pending'));

CREATE TABLE IF NOT EXISTS public.kitchen_hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kitchen_hubs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_kitchen_hub_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kitchen_hub_id uuid NOT NULL REFERENCES public.kitchen_hubs(id) ON DELETE CASCADE,
  UNIQUE (user_id, kitchen_hub_id)
);
ALTER TABLE public.user_kitchen_hub_access ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_kitchen_hub_access_user_id
  ON public.user_kitchen_hub_access (user_id);

DROP POLICY IF EXISTS "Owners can manage kitchen hubs" ON public.kitchen_hubs;
CREATE POLICY "Owners can manage kitchen hubs"
  ON public.kitchen_hubs FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  );

DROP POLICY IF EXISTS "Owners can manage kitchen hub access" ON public.user_kitchen_hub_access;
CREATE POLICY "Owners can manage kitchen hub access"
  ON public.user_kitchen_hub_access FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    AND public.has_page_permission(auth.uid(), 'users')
  );
