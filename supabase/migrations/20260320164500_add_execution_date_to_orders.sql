ALTER TABLE public.orders
ADD COLUMN execution_date date;

UPDATE public.orders
SET execution_date = created_at::date
WHERE execution_date IS NULL;

ALTER TABLE public.orders
ALTER COLUMN execution_date SET NOT NULL,
ALTER COLUMN execution_date SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS orders_execution_date_idx ON public.orders (execution_date);