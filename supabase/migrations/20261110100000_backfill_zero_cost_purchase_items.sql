-- Items created on the fly from purchases were stored with zero average cost
-- and zero reorder level. Backfill them from their latest purchase line.
WITH latest_line AS (
  SELECT DISTINCT ON (line.item_id)
    line.item_id, line.quantity, line.unit_cost
  FROM public.inventory_purchase_request_lines AS line
  JOIN public.inventory_purchase_requests AS request ON request.id = line.purchase_request_id
  WHERE request.status <> 'rejected' AND line.unit_cost > 0
  ORDER BY line.item_id, line.created_at DESC
)
UPDATE public.items_master AS item
SET avg_cost = ROUND(latest_line.unit_cost / COALESCE(NULLIF(item.conversion_factor, 0), 1), 2),
    last_purchase_price = CASE WHEN item.last_purchase_price = 0 THEN latest_line.unit_cost ELSE item.last_purchase_price END
FROM latest_line
WHERE item.id = latest_line.item_id
  AND COALESCE(item.avg_cost, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_balances AS balance
    WHERE balance.item_id = item.id AND balance.on_hand > 0
  );

WITH latest_line AS (
  SELECT DISTINCT ON (line.item_id)
    line.item_id, line.quantity
  FROM public.inventory_purchase_request_lines AS line
  ORDER BY line.item_id, line.created_at DESC
)
UPDATE public.items_master AS item
SET min_stock = ROUND(latest_line.quantity * COALESCE(NULLIF(item.conversion_factor, 0), 1) * 0.2, 3)
FROM latest_line
WHERE item.id = latest_line.item_id
  AND COALESCE(item.min_stock, 0) = 0
  AND item.notes LIKE '%الإدخال السريع للمشتريات%';

NOTIFY pgrst, 'reload schema';
