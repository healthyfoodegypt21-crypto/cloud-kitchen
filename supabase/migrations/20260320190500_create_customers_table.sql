CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  phone_secondary text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  address_house_number text NOT NULL DEFAULT '',
  address_street text NOT NULL DEFAULT '',
  address_area text NOT NULL DEFAULT '',
  address_floor text NOT NULL DEFAULT '',
  address_apartment text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, phone)
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customers for their brands"
  ON public.customers FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'owner') OR
    brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create customers"
  ON public.customers FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'owner') OR
    brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update customers"
  ON public.customers FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'owner') OR
    brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
  );

CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.customers (
  brand_id,
  name,
  phone,
  address,
  notes,
  created_by,
  created_at,
  updated_at
)
SELECT DISTINCT ON (brand_id, phone)
  brand_id,
  customer_name,
  phone,
  address,
  COALESCE(notes, ''),
  created_by,
  created_at,
  updated_at
FROM public.orders
WHERE brand_id IS NOT NULL
ORDER BY brand_id, phone, created_at DESC;