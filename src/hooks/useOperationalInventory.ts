import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type {
  DailyWithdrawal,
  InventoryAlert,
  InventoryBatch,
  InventoryCategoryRecord,
  InventoryPurchaseRequest,
  OperationalInventoryItem,
  OperationalMovement,
} from '@/types/operationalInventory';

type RawRecord = Record<string, unknown>;

const numeric = (value: unknown) => Number(value ?? 0);
const asRecords = (value: unknown): RawRecord[] => Array.isArray(value) ? value as RawRecord[] : [];

export function useOperationalInventory(brandId: string) {
  const [items, setItems] = useState<OperationalInventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategoryRecord[]>([]);
  const [movements, setMovements] = useState<OperationalMovement[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<InventoryPurchaseRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<DailyWithdrawal[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!brandId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const client = supabase as unknown as { from: (table: string) => any };
    const [itemsRes, balancesRes, categoriesRes, movementsRes, requestsRes, requestLinesRes, withdrawalsRes, withdrawalLinesRes, batchesRes] = await Promise.all([
      client.from('items_master').select('id, brand_id, item_code, name, category, purchase_unit, min_stock, last_purchase_price, avg_cost, status, notes').eq('brand_id', brandId).order('name'),
      client.from('inventory_balances').select('item_id, on_hand, location_name').eq('brand_id', brandId),
      client.from('inventory_categories').select('id, code, name_ar, name_en, sort_order, is_active').eq('is_active', true).order('sort_order'),
      client.from('inventory_movements').select('id, item_id, movement_type, quantity, unit_cost, location_name, notes, created_at').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(30),
      client.from('inventory_purchase_requests').select('id, request_no, supplier_name, status, notes, created_at').eq('brand_id', brandId).order('created_at', { ascending: false }),
      client.from('inventory_purchase_request_lines').select('id, purchase_request_id, item_id, quantity, unit_cost, location_name, notes, batch_no, expiry_date'),
      client.from('inventory_daily_withdrawals').select('id, withdrawal_no, withdrawal_date, status, notes').eq('brand_id', brandId).order('withdrawal_date', { ascending: false }).limit(100),
      client.from('inventory_daily_withdrawal_lines').select('id, withdrawal_id, item_id, quantity, unit_cost, line_value, location_name, reason'),
      client.from('inventory_batches').select('id, item_id, batch_no, expiry_date, quantity_on_hand, unit_cost, status').eq('brand_id', brandId).in('status', ['available', 'reserved']).order('expiry_date', { ascending: true, nullsFirst: false }),
    ]);

    const firstError = [itemsRes, balancesRes, categoriesRes, movementsRes, requestsRes, requestLinesRes, withdrawalsRes, withdrawalLinesRes, batchesRes].find((response) => response.error)?.error;
    if (firstError) {
      toast.error(firstError.message || 'تعذر تحميل بيانات المخزون');
      setLoading(false);
      return;
    }

    const rawItems = asRecords(itemsRes.data);
    const itemNames = new Map(rawItems.map((item) => [String(item.id), String(item.name)]));
    const balancesByItem = new Map<string, { onHand: number; locationName: string }>();
    asRecords(balancesRes.data).forEach((balance) => {
      const itemId = String(balance.item_id);
      const existing = balancesByItem.get(itemId) ?? { onHand: 0, locationName: String(balance.location_name ?? 'main') };
      balancesByItem.set(itemId, { onHand: existing.onHand + numeric(balance.on_hand), locationName: existing.locationName });
    });

    setItems(rawItems.map((item) => {
      const balance = balancesByItem.get(String(item.id)) ?? { onHand: 0, locationName: 'main' };
      return {
        id: String(item.id), brandId: String(item.brand_id), code: String(item.item_code), name: String(item.name),
        category: String(item.category), unit: String(item.purchase_unit), minStock: numeric(item.min_stock),
        lastPurchasePrice: numeric(item.last_purchase_price), averageCost: numeric(item.avg_cost), onHand: balance.onHand,
        locationName: balance.locationName, status: item.status === 'inactive' ? 'inactive' : 'active', notes: String(item.notes ?? ''),
      };
    }));
    setCategories(asRecords(categoriesRes.data).map((category) => ({
      id: String(category.id), code: String(category.code), name_ar: String(category.name_ar), name_en: String(category.name_en),
      sort_order: numeric(category.sort_order), is_active: Boolean(category.is_active),
    })));
    setMovements(asRecords(movementsRes.data).map((movement) => ({
      id: String(movement.id), itemId: String(movement.item_id), itemName: itemNames.get(String(movement.item_id)) ?? 'صنف محذوف',
      type: String(movement.movement_type), quantity: numeric(movement.quantity), unitCost: numeric(movement.unit_cost),
      value: numeric(movement.quantity) * numeric(movement.unit_cost), locationName: String(movement.location_name),
      notes: String(movement.notes ?? ''), createdAt: String(movement.created_at),
    })));

    const requestLines = asRecords(requestLinesRes.data);
    setPurchaseRequests(asRecords(requestsRes.data).map((request) => ({
      id: String(request.id), requestNo: String(request.request_no), supplierName: String(request.supplier_name),
      status: request.status as InventoryPurchaseRequest['status'], notes: String(request.notes ?? ''), createdAt: String(request.created_at),
      lines: requestLines.filter((line) => line.purchase_request_id === request.id).map((line) => ({
        id: String(line.id), itemId: String(line.item_id), itemName: itemNames.get(String(line.item_id)) ?? 'صنف', quantity: numeric(line.quantity),
        unitCost: numeric(line.unit_cost), locationName: String(line.location_name), notes: String(line.notes ?? ''), batchNo: String(line.batch_no ?? ''), expiryDate: line.expiry_date ? String(line.expiry_date) : null,
      })),
    })));

    const withdrawalLines = asRecords(withdrawalLinesRes.data);
    setWithdrawals(asRecords(withdrawalsRes.data).map((withdrawal) => {
      const lines = withdrawalLines.filter((line) => line.withdrawal_id === withdrawal.id).map((line) => ({
        id: String(line.id), itemId: String(line.item_id), itemName: itemNames.get(String(line.item_id)) ?? 'صنف',
        quantity: numeric(line.quantity), unitCost: numeric(line.unit_cost), lineValue: numeric(line.line_value),
        locationName: String(line.location_name), reason: String(line.reason),
      }));
      return { id: String(withdrawal.id), withdrawalNo: String(withdrawal.withdrawal_no), withdrawalDate: String(withdrawal.withdrawal_date), status: String(withdrawal.status), notes: String(withdrawal.notes ?? ''), lines, totalValue: lines.reduce((sum, line) => sum + line.lineValue, 0) };
    }));
    setBatches(asRecords(batchesRes.data).map((batch) => ({
      id: String(batch.id), itemId: String(batch.item_id), batchNo: String(batch.batch_no), expiryDate: batch.expiry_date ? String(batch.expiry_date) : null,
      quantityOnHand: numeric(batch.quantity_on_hand), unitCost: numeric(batch.unit_cost), status: String(batch.status) as InventoryBatch['status'],
    })));
    setLoading(false);
  }, [brandId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const invoke = useCallback(async (fn: string, args: RawRecord) => {
    const { data, error } = await (supabase as any).rpc(fn, args);
    if (error) {
      toast.error(error.message || 'تعذر تنفيذ عملية المخزون');
      return null;
    }
    await refresh();
    return data;
  }, [refresh]);

  const inventoryValue = useMemo(() => items.reduce((sum, item) => sum + (item.onHand * item.averageCost), 0), [items]);
  const alerts = useMemo<InventoryAlert[]>(() => [
    ...items.filter((item) => item.onHand <= item.minStock).map((item) => ({ id: `low-${item.id}`, type: 'low_stock' as const, title: `مخزون منخفض: ${item.name}`, description: `المتاح ${item.onHand} ${item.unit} مقابل حد ${item.minStock}.`, itemId: item.id })),
    ...items.filter((item) => item.averageCost <= 0).map((item) => ({ id: `cost-${item.id}`, type: 'missing_cost' as const, title: `تكلفة غير مسجلة: ${item.name}`, description: 'أضف سعر شراء أو رصيد افتتاحي لإظهار قيمة الصنف.', itemId: item.id })),
    ...purchaseRequests.filter((request) => request.status === 'pending_store_approval').map((request) => ({ id: `purchase-${request.id}`, type: 'purchase_pending' as const, title: 'شراء بانتظار الاعتماد', description: `${request.requestNo} — ${request.supplierName || 'بدون مورد'}.` })),
    ...batches.filter((batch) => batch.expiryDate && batch.quantityOnHand > 0 && new Date(batch.expiryDate).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000).map((batch) => ({ id: `expiry-${batch.id}`, type: 'low_stock' as const, title: `صلاحية قريبة: ${items.find((item) => item.id === batch.itemId)?.name ?? 'صنف'}`, description: `دفعة ${batch.batchNo} تنتهي في ${batch.expiryDate}.`, itemId: batch.itemId })),
  ], [batches, items, purchaseRequests]);

  return { items, categories, movements, purchaseRequests, withdrawals, batches, alerts, inventoryValue, loading, refresh, invoke };
}
