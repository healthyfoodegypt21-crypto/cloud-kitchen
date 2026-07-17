ALTER TYPE public.inventory_purchase_request_status ADD VALUE IF NOT EXISTS 'pending_procurement' BEFORE 'pending_store_approval';
ALTER TYPE public.inventory_purchase_request_status ADD VALUE IF NOT EXISTS 'purchased_pending_receipt' BEFORE 'approved';
