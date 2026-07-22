ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_category_check;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_category_check
  CHECK (category IN ('meat', 'chicken', 'fish', 'mix', 'salad', 'snacks'));