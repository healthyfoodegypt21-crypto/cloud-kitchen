-- One-time data cleanup: remove all meals added under the "Healthy Food" company
-- in the Companies & Menus module. Categories, ingredients, and the company
-- record itself are preserved untouched; only menu_company_meals rows (and
-- their cascaded menu_meal_ingredients links) for this company are removed.

DELETE FROM public.menu_company_meals
WHERE company_id IN (
  SELECT id FROM public.menu_companies WHERE lower(trim(name)) = lower(trim('Healthy Food'))
);
