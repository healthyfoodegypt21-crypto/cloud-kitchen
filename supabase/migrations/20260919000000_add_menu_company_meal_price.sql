-- Adds an optional price field to company menu meals, requested for Excel import.
-- Safe, additive, nullable column; does not affect existing rows or data.

ALTER TABLE public.menu_company_meals
  ADD COLUMN IF NOT EXISTS price numeric(10,2);
