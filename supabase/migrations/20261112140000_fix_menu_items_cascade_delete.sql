-- Fix foreign key constraint on package_plan_items when a menu item is deleted:
-- Instead of ON DELETE SET NULL (which conflicts with CHECK (custom_meal_name IS NOT NULL)),
-- deleting a menu item should CASCADE to delete the referencing package_plan_items row.
ALTER TABLE public.package_plan_items
  DROP CONSTRAINT IF EXISTS package_plan_items_menu_item_id_fkey;

ALTER TABLE public.package_plan_items
  ADD CONSTRAINT package_plan_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id)
  REFERENCES public.menu_items(id)
  ON DELETE CASCADE;
