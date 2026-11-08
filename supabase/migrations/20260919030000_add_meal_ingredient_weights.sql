-- Adds optional pre/post-cooking weight (grams) for each meal ingredient link,
-- so the UI can show exact ingredient weights before and after cooking.
-- Safe, additive, nullable columns; does not affect existing rows or data.

ALTER TABLE public.menu_meal_ingredients
  ADD COLUMN IF NOT EXISTS weight_before_grams numeric(10,2),
  ADD COLUMN IF NOT EXISTS weight_after_grams numeric(10,2);
