ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_assigned_to_idx ON public.orders (assigned_to);

DROP POLICY IF EXISTS "Users can view orders for their brands" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;

CREATE POLICY "Users can view assigned or accessible orders"
  ON public.orders FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.has_role(auth.uid(), 'owner')
    OR (NOT public.has_role(auth.uid(), 'delivery') AND public.can_access_brand(brand_id))
  );

CREATE POLICY "Users can insert orders for accessible brands"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.can_access_brand(brand_id));

CREATE POLICY "Users can update assigned or accessible orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.has_role(auth.uid(), 'owner')
    OR (NOT public.has_role(auth.uid(), 'delivery') AND public.can_access_brand(brand_id))
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR public.has_role(auth.uid(), 'owner')
    OR (NOT public.has_role(auth.uid(), 'delivery') AND public.can_access_brand(brand_id))
  );
