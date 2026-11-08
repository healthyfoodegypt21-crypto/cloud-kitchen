import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { serverNow, syncServerTime } from '@/lib/serverTime';
import { isSupabaseNetworkError } from '@/integrationssupabase/runtime';
import type {
  DailyWithdrawal,
  InventoryAlert,
  InventoryBatch,
  InventoryCategoryRecord,
  InventoryCountApproval,
  InventoryLocation,
  InventoryItemRequest,
  InventoryNotification,
  InventoryPurchaseRequest,
  OperationalInventoryItem,
  OperationalMovement,
} from '@/types/operationalInventory';

type RawRecord = Record<string, unknown>;

const numeric = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const asRecords = (value: unknown): RawRecord[] => Array.isArray(value) ? value as RawRecord[] : [];

const MOVEMENTS_PAGE_SIZE = 30;
const REQUESTS_PAGE_SIZE = 100;
const MAX_BATCH_ROWS = 500;
const CACHE_KEY_PREFIX = 'operational_inventory_cache_v1:';

type InventorySnapshot = {
  savedAt: string;
  items: OperationalInventoryItem[];
  categories: InventoryCategoryRecord[];
  locations: InventoryLocation[];
};

function readSnapshot(brandId: string): InventorySnapshot | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${brandId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InventorySnapshot;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSnapshot(brandId: string, snapshot: InventorySnapshot) {
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${brandId}`, JSON.stringify(snapshot));
  } catch {
    // Storage quota exceeded — caching is best-effort only.
  }
}

function groupByParent(rows: RawRecord[], parentKey: string) {
  const grouped = new Map<string, RawRecord[]>();
  for (const row of rows) {
    const parentId = String(row[parentKey] ?? '');
    const list = grouped.get(parentId) ?? [];
    list.push(row);
    grouped.set(parentId, list);
  }
  return grouped;
}

export function useOperationalInventory(brandId: string, linkedBrandIds: string[] = []) {
  const [items, setItems] = useState<OperationalInventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategoryRecord[]>([]);
  const [movements, setMovements] = useState<OperationalMovement[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<InventoryPurchaseRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<DailyWithdrawal[]>([]);
  const [itemRequests, setItemRequests] = useState<InventoryItemRequest[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [countApprovals, setCountApprovals] = useState<InventoryCountApproval[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [notifications, setNotifications] = useState<InventoryNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [partialError, setPartialError] = useState('');
  const [offline, setOffline] = useState(false);
  const [offlineSnapshotAt, setOfflineSnapshotAt] = useState('');
  const [movementsLimit, setMovementsLimit] = useState(MOVEMENTS_PAGE_SIZE);
  const [requestsLimit, setRequestsLimit] = useState(REQUESTS_PAGE_SIZE);
  const [hasMoreMovements, setHasMoreMovements] = useState(false);
  const [hasMoreRequests, setHasMoreRequests] = useState(false);
  const refreshVersion = useRef(0);
  const brandScopeKey = [...new Set([brandId, ...linkedBrandIds].filter(Boolean))].join(',');

  const refresh = useCallback(async () => {
    const requestVersion = ++refreshVersion.current;
    if (!brandId) {
      setItems([]);
      setCategories([]);
      setMovements([]);
      setPurchaseRequests([]);
      setWithdrawals([]);
      setItemRequests([]);
      setBatches([]);
      setCountApprovals([]);
      setLocations([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void syncServerTime();
    const client = asSupabaseLooseClient(supabase);
    const withdrawalBrandIds = brandScopeKey.split(',').filter(Boolean);

    // Critical datasets decide whether the screen can render at all; secondary
    // datasets fail soft so one broken table never blanks the whole inventory.
    const [itemsRes, balancesRes, categoriesRes, warehousesRes] = await Promise.all([
      client.from('items_master').select('id, brand_id, item_code, name, category, purchase_unit, usage_unit, conversion_factor, min_stock, last_purchase_price, avg_cost, status, notes').eq('brand_id', brandId).order('name'),
      client.from('inventory_balances').select('id,item_id,on_hand,reserved_qty,location_name').eq('brand_id', brandId),
      client.from('inventory_categories').select('id, code, name_ar, name_en, sort_order, is_active').eq('is_active', true).order('sort_order'),
      client.from('warehouses').select('id,warehouse_code,name,status').eq('brand_id', brandId).eq('status', 'active').order('name'),
    ]);

    if (requestVersion !== refreshVersion.current) return;
    const criticalError = [itemsRes, balancesRes, categoriesRes, warehousesRes].find((response) => response.error)?.error;
    if (criticalError) {
      if (isSupabaseNetworkError(criticalError)) {
        // Offline: fall back to the last cached snapshot instead of blanking.
        const snapshot = readSnapshot(brandId);
        if (snapshot) {
          setItems(snapshot.items);
          setCategories(snapshot.categories);
          setLocations(snapshot.locations);
          setOffline(true);
          setOfflineSnapshotAt(snapshot.savedAt);
          setPartialError('');
          setLoading(false);
          return;
        }
      }
      toast.error(criticalError.message || 'تعذر تحميل بيانات المخزون');
      setItems([]);
      setCategories([]);
      setMovements([]);
      setPurchaseRequests([]);
      setWithdrawals([]);
      setItemRequests([]);
      setBatches([]);
      setCountApprovals([]);
      setLocations([]);
      setNotifications([]);
      setPartialError('');
      setLoading(false);
      return;
    }
    setOffline(false);
    setOfflineSnapshotAt('');

    const [movementsRes, requestsRes, withdrawalsRes, batchesRes, itemRequestsRes, notificationsRes, countRes] = await Promise.all([
      client.from('inventory_movements').select('id, item_id, movement_type, quantity, unit_cost, location_name, notes, created_at').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(movementsLimit + 1),
      client.from('inventory_purchase_requests').select('id, request_no, supplier_name, status, notes, created_at').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(requestsLimit + 1),
      client.from('inventory_daily_withdrawals').select('id, brand_id, is_shared, withdrawal_no, withdrawal_date, status, notes').in('brand_id', withdrawalBrandIds).order('withdrawal_date', { ascending: false }).limit(100),
      client.from('inventory_batches').select('id,warehouse_id,item_id,batch_no,expiry_date,quantity_on_hand,unit_cost,reserved_qty,status').eq('brand_id', brandId).gt('quantity_on_hand', 0).order('expiry_date', { ascending: true, nullsFirst: false }).limit(MAX_BATCH_ROWS),
      client.from('inventory_item_requests').select('id, item_name, product_brand, item_code, unit, min_stock, notes, status').eq('brand_id', brandId).eq('status', 'pending_store_approval').limit(100),
      client.from('inventory_notifications').select('id, notification_type, title, message, reference_id, is_read, created_at').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(20),
      client.from('inventory_counts').select('id,count_no,counted_by,created_at,book_qty,physical_qty,notes').eq('brand_id', brandId).eq('status', 'submitted').order('created_at', { ascending: true }).limit(100),
    ]);

    if (requestVersion !== refreshVersion.current) return;
    const secondaryError = [movementsRes, requestsRes, withdrawalsRes, batchesRes, itemRequestsRes, notificationsRes, countRes].find((response) => response.error)?.error;
    if (secondaryError) {
      setPartialError(secondaryError.message || 'بعض بيانات المخزون الثانوية تعذر تحميلها');
      toast.error('بعض بيانات المخزون الثانوية تعذر تحميلها؛ المعروض قد يكون غير مكتمل. حاول التحديث.');
    } else {
      setPartialError('');
    }

    const rawItems = asRecords(itemsRes.data);
    const itemNames = new Map(rawItems.map((item) => [String(item.id), String(item.name)]));
    const balanceRows = asRecords(balancesRes.data);
    const balancesByItem = new Map<string, Array<{ onHand: number; reservedQuantity: number; locationName: string }>>();
    balanceRows.forEach((balance) => {
      const itemId = String(balance.item_id);
      const locationName = String(balance.location_name ?? 'main');
      const itemBalances = balancesByItem.get(itemId) ?? [];
      const existing = itemBalances.find((entry) => entry.locationName === locationName);
      if (existing) {
        existing.onHand += numeric(balance.on_hand);
        existing.reservedQuantity += numeric(balance.reserved_qty);
      } else itemBalances.push({ onHand: numeric(balance.on_hand), reservedQuantity: numeric(balance.reserved_qty), locationName });
      balancesByItem.set(itemId, itemBalances);
    });

    setItems(rawItems.map((item) => {
      const itemBalances = balancesByItem.get(String(item.id)) ?? [];
      const defaultBalance = itemBalances.find((entry) => entry.locationName.toLowerCase() === 'main') ?? itemBalances[0];
      return {
        id: String(item.id), brandId: String(item.brand_id), code: String(item.item_code), name: String(item.name),
        category: String(item.category), unit: String(item.usage_unit ?? item.purchase_unit),
        purchaseUnit: String(item.purchase_unit), conversionFactor: numeric(item.conversion_factor ?? 1),
        minStock: numeric(item.min_stock),
        lastPurchasePrice: numeric(item.last_purchase_price), averageCost: numeric(item.avg_cost),
        onHand: itemBalances.reduce((sum, balance) => sum + balance.onHand, 0),
        reservedQuantity: itemBalances.reduce((sum, balance) => sum + balance.reservedQuantity, 0),
        availableQuantity: itemBalances.reduce((sum, balance) => sum + Math.max(balance.onHand - balance.reservedQuantity, 0), 0),
        locationName: defaultBalance?.locationName ?? 'main',
        balances: itemBalances.map((balance) => ({
          ...balance,
          availableQuantity: Math.max(balance.onHand - balance.reservedQuantity, 0),
        })),
        status: item.status === 'inactive' ? 'inactive' : 'active', notes: String(item.notes ?? ''),
      };
    }));
    setCategories(asRecords(categoriesRes.data).map((category) => ({
      id: String(category.id), code: String(category.code), name_ar: String(category.name_ar), name_en: String(category.name_en),
      sort_order: numeric(category.sort_order), is_active: Boolean(category.is_active),
    })));
    if (!movementsRes.error) {
      const movementRows = asRecords(movementsRes.data);
      setHasMoreMovements(movementRows.length > movementsLimit);
      setMovements(movementRows.slice(0, movementsLimit).map((movement) => ({
        id: String(movement.id), itemId: String(movement.item_id), itemName: itemNames.get(String(movement.item_id)) ?? 'صنف محذوف',
        type: String(movement.movement_type), quantity: numeric(movement.quantity), unitCost: numeric(movement.unit_cost),
        value: numeric(movement.quantity) * numeric(movement.unit_cost), locationName: String(movement.location_name),
        notes: String(movement.notes ?? ''), createdAt: String(movement.created_at),
      })));
    }

    const allRequestRows = asRecords(requestsRes.data);
    const requestRows = requestsRes.error ? [] : allRequestRows.slice(0, requestsLimit);
    if (!requestsRes.error) setHasMoreRequests(allRequestRows.length > requestsLimit);
    const withdrawalRows = withdrawalsRes.error ? [] : asRecords(withdrawalsRes.data);
    const submittedCountRows = countRes.error ? [] : asRecords(countRes.data);
    const [requestLinesRes, withdrawalLinesRes, countLinesRes] = await Promise.all([
      requestRows.length
        ? client.from('inventory_purchase_request_lines').select('id,purchase_request_id,item_id,quantity,unit_cost,location_name,notes,batch_no,expiry_date').in('purchase_request_id', requestRows.map((request) => String(request.id)))
        : Promise.resolve({ data: [], error: null }),
      withdrawalRows.length
        ? client.from('inventory_daily_withdrawal_lines').select('id,withdrawal_id,item_id,quantity,unit_cost,line_value,location_name,reason').in('withdrawal_id', withdrawalRows.map((withdrawal) => String(withdrawal.id)))
        : Promise.resolve({ data: [], error: null }),
      submittedCountRows.length
        ? client.from('inventory_count_lines').select('id,inventory_count_id,item_id,location_name,book_qty,physical_qty').in('inventory_count_id', submittedCountRows.map((count) => String(count.id)))
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (requestVersion !== refreshVersion.current) return;
    const dependentError = requestLinesRes.error || withdrawalLinesRes.error || countLinesRes.error;
    if (dependentError) {
      setPartialError(dependentError.message || 'تعذر تحميل تفاصيل حركات المخزون');
      toast.error('تعذر تحميل تفاصيل بعض المستندات؛ أعد التحديث لعرضها كاملة.');
    }

    if (!requestsRes.error && !requestLinesRes.error) {
      const requestLinesByRequest = groupByParent(asRecords(requestLinesRes.data), 'purchase_request_id');
      setPurchaseRequests(requestRows.map((request) => ({
        id: String(request.id), requestNo: String(request.request_no), supplierName: String(request.supplier_name),
        status: request.status as InventoryPurchaseRequest['status'], notes: String(request.notes ?? ''), createdAt: String(request.created_at),
        lines: (requestLinesByRequest.get(String(request.id)) ?? []).map((line) => ({
          id: String(line.id), itemId: String(line.item_id), itemName: itemNames.get(String(line.item_id)) ?? 'صنف', quantity: numeric(line.quantity),
          unitCost: numeric(line.unit_cost), locationName: String(line.location_name), notes: String(line.notes ?? ''), batchNo: String(line.batch_no ?? ''), expiryDate: line.expiry_date ? String(line.expiry_date) : null,
        })),
      })));
    }

    if (!withdrawalsRes.error && !withdrawalLinesRes.error) {
      const withdrawalLinesByWithdrawal = groupByParent(asRecords(withdrawalLinesRes.data), 'withdrawal_id');
      setWithdrawals(withdrawalRows.map((withdrawal) => {
        const lines = (withdrawalLinesByWithdrawal.get(String(withdrawal.id)) ?? []).map((line) => ({
          id: String(line.id), itemId: String(line.item_id), itemName: itemNames.get(String(line.item_id)) ?? 'صنف',
          quantity: numeric(line.quantity), unitCost: numeric(line.unit_cost), lineValue: numeric(line.line_value),
          locationName: String(line.location_name), reason: String(line.reason),
        }));
        return { id: String(withdrawal.id), brandId: String(withdrawal.brand_id), isShared: Boolean(withdrawal.is_shared), withdrawalNo: String(withdrawal.withdrawal_no), withdrawalDate: String(withdrawal.withdrawal_date), status: String(withdrawal.status), notes: String(withdrawal.notes ?? ''), lines, totalValue: lines.reduce((sum, line) => sum + line.lineValue, 0) };
      }));
    }
    const warehouseNameById = new Map(asRecords(warehousesRes.data).map((warehouse) => [
      String(warehouse.id),
      String(warehouse.warehouse_code ?? 'main').toLowerCase(),
    ]));
    setLocations(asRecords(warehousesRes.data).map((warehouse) => ({
      code: String(warehouse.warehouse_code ?? 'main').toLowerCase(),
      name: String(warehouse.name ?? warehouse.warehouse_code ?? 'المخزن'),
    })));
    if (!batchesRes.error) {
      setBatches(asRecords(batchesRes.data).map((batch) => ({
        id: String(batch.id), itemId: String(batch.item_id), batchNo: String(batch.batch_no), expiryDate: batch.expiry_date ? String(batch.expiry_date) : null,
        locationName: warehouseNameById.get(String(batch.warehouse_id)) ?? 'unknown',
        quantityOnHand: numeric(batch.quantity_on_hand), reservedQuantity: numeric(batch.reserved_qty),
        unitCost: numeric(batch.unit_cost), status: String(batch.status) as InventoryBatch['status'],
      })));
    }
    if (!countRes.error && !countLinesRes.error) {
      const countLinesByCount = groupByParent(asRecords(countLinesRes.data), 'inventory_count_id');
      setCountApprovals(submittedCountRows.map((count) => {
        const lines = (countLinesByCount.get(String(count.id)) ?? []).map((line) => {
          const bookQuantity = numeric(line.book_qty);
          const physicalQuantity = numeric(line.physical_qty);
          return {
            id: String(line.id), itemId: String(line.item_id), itemName: itemNames.get(String(line.item_id)) ?? 'صنف',
            locationName: String(line.location_name ?? 'main'), bookQuantity, physicalQuantity,
            variance: physicalQuantity - bookQuantity,
          };
        });
        return {
          id: String(count.id), countNo: String(count.count_no), countedBy: String(count.counted_by ?? ''),
          countedAt: String(count.created_at), bookQuantity: numeric(count.book_qty),
          physicalQuantity: numeric(count.physical_qty), notes: String(count.notes ?? ''), lines,
        };
      }));
    }
    if (!itemRequestsRes.error) {
      setItemRequests(asRecords(itemRequestsRes.data).map((request) => ({ id: String(request.id), itemName: String(request.item_name), productBrand: String(request.product_brand ?? ''), itemCode: String(request.item_code), unit: String(request.unit), minStock: numeric(request.min_stock), notes: String(request.notes ?? ''), status: request.status as InventoryItemRequest['status'] })));
    }
    if (!notificationsRes.error) {
      setNotifications(asRecords(notificationsRes.data).map((notification) => ({ id: String(notification.id), notificationType: String(notification.notification_type), title: String(notification.title), message: String(notification.message), referenceId: notification.reference_id ? String(notification.reference_id) : null, isRead: Boolean(notification.is_read), createdAt: String(notification.created_at) })));
    }
    writeSnapshot(brandId, {
      savedAt: new Date().toISOString(),
      items: rawItems.map((item) => {
        const itemBalances = balancesByItem.get(String(item.id)) ?? [];
        const defaultBalance = itemBalances.find((entry) => entry.locationName.toLowerCase() === 'main') ?? itemBalances[0];
        return {
          id: String(item.id), brandId: String(item.brand_id), code: String(item.item_code), name: String(item.name),
          category: String(item.category), unit: String(item.usage_unit ?? item.purchase_unit),
          purchaseUnit: String(item.purchase_unit), conversionFactor: numeric(item.conversion_factor ?? 1),
          minStock: numeric(item.min_stock),
          lastPurchasePrice: numeric(item.last_purchase_price), averageCost: numeric(item.avg_cost),
          onHand: itemBalances.reduce((sum, balance) => sum + balance.onHand, 0),
          reservedQuantity: itemBalances.reduce((sum, balance) => sum + balance.reservedQuantity, 0),
          availableQuantity: itemBalances.reduce((sum, balance) => sum + Math.max(balance.onHand - balance.reservedQuantity, 0), 0),
          locationName: defaultBalance?.locationName ?? 'main',
          balances: itemBalances.map((balance) => ({ ...balance, availableQuantity: Math.max(balance.onHand - balance.reservedQuantity, 0) })),
          status: item.status === 'inactive' ? 'inactive' : 'active', notes: String(item.notes ?? ''),
        };
      }),
      categories: asRecords(categoriesRes.data).map((category) => ({
        id: String(category.id), code: String(category.code), name_ar: String(category.name_ar), name_en: String(category.name_en),
        sort_order: numeric(category.sort_order), is_active: Boolean(category.is_active),
      })),
      locations: asRecords(warehousesRes.data).map((warehouse) => ({
        code: String(warehouse.warehouse_code ?? 'main').toLowerCase(),
        name: String(warehouse.name ?? warehouse.warehouse_code ?? 'المخزن'),
      })),
    });
    setLoading(false);
  }, [brandId, brandScopeKey, movementsLimit, requestsLimit]);

  useEffect(() => { void refresh(); }, [refresh]);

  useSupabaseRealtimeRefresh({
    enabled: Boolean(brandId),
    channelName: `operational-inventory-${brandId}`,
    tables: [
      { table: 'items_master', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_balances', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_categories' },
      { table: 'inventory_movements', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_purchase_requests', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_purchase_request_lines' },
      { table: 'inventory_daily_withdrawals' },
      { table: 'inventory_daily_withdrawal_lines' },
      { table: 'inventory_batches', filter: `brand_id=eq.${brandId}` },
      { table: 'warehouses', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_counts', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_count_lines' },
      { table: 'inventory_item_requests', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_notifications', filter: `brand_id=eq.${brandId}` },
    ],
    onRefresh: refresh,
  });

  const invoke = useCallback(async (fn: string, args: RawRecord) => {
    if (offline) {
      toast.error('أنت غير متصل حاليًا؛ لا يمكن تنفيذ عمليات المخزون حتى يعود الاتصال.');
      return null;
    }
    const { data, error } = await asSupabaseLooseClient(supabase).rpc(fn, args);
    if (error) {
      toast.error(error.message || 'تعذر تنفيذ عملية المخزون');
      return null;
    }
    await refresh();
    return data;
  }, [offline, refresh]);

  const inventoryValue = useMemo(() => items.reduce((sum, item) => sum + (item.onHand * item.averageCost), 0), [items]);
  const markNotificationRead = useCallback(async (notificationId: string) => {
    const { error } = await asSupabaseLooseClient(supabase).from('inventory_notifications').update({ is_read: true }).eq('id', notificationId).eq('brand_id', brandId);
    if (error) { toast.error(error.message || 'تعذر تحديث الإشعار'); return; }
    setNotifications((current) => current.map((notification) => notification.id === notificationId ? { ...notification, isRead: true } : notification));
  }, [brandId]);
  const loadMoreMovements = useCallback(() => setMovementsLimit((current) => current + MOVEMENTS_PAGE_SIZE), []);
  const loadMoreRequests = useCallback(() => setRequestsLimit((current) => current + REQUESTS_PAGE_SIZE), []);
  const alerts = useMemo<InventoryAlert[]>(() => {
    const now = serverNow();
    return [
    ...items.filter((item) => item.minStock > 0 && item.availableQuantity <= item.minStock).map((item) => ({ id: `low-${item.id}`, type: 'low_stock' as const, title: `مخزون منخفض: ${item.name}`, description: `المتاح ${item.availableQuantity} ${item.unit} مقابل حد ${item.minStock}.`, itemId: item.id })),
    ...items.filter((item) => item.averageCost <= 0).map((item) => ({ id: `cost-${item.id}`, type: 'missing_cost' as const, title: `تكلفة غير مسجلة: ${item.name}`, description: 'أضف سعر شراء أو رصيد افتتاحي لإظهار قيمة الصنف.', itemId: item.id })),
    ...purchaseRequests.filter((request) => request.status === 'purchased_pending_receipt').map((request) => ({ id: `purchase-${request.id}`, type: 'purchase_pending' as const, title: 'شراء بانتظار الاستلام', description: `${request.requestNo} — ${request.supplierName || 'بدون مورد'}.` })),
    ...batches.filter((batch) => batch.expiryDate && batch.quantityOnHand > batch.reservedQuantity
      && (batch.status === 'available' || batch.status === 'expired')
      && (batch.status === 'expired' || new Date(`${batch.expiryDate}T23:59:59`).getTime() <= now + 7 * 24 * 60 * 60 * 1000)).map((batch) => {
      const expired = batch.status === 'expired' || new Date(`${batch.expiryDate}T23:59:59`).getTime() < now;
      return {
        id: `expiry-${batch.id}`,
        type: expired ? 'expired' as const : 'expiry' as const,
        title: `${expired ? 'دفعة منتهية الصلاحية' : 'صلاحية قريبة'}: ${items.find((item) => item.id === batch.itemId)?.name ?? 'صنف'}`,
        description: `دفعة ${batch.batchNo} — المتاح ${batch.quantityOnHand - batch.reservedQuantity}، وتنتهي في ${batch.expiryDate}.`,
        itemId: batch.itemId,
      };
    }),
    ];
  }, [batches, items, purchaseRequests]);

  return { items, categories, movements, purchaseRequests, withdrawals, batches, countApprovals, locations, itemRequests, notifications, alerts, inventoryValue, loading, partialError, offline, offlineSnapshotAt, hasMoreMovements, hasMoreRequests, loadMoreMovements, loadMoreRequests, refresh, invoke, markNotificationRead };
}
