import { compactWhitespace } from '@/lib/utils';
import { buildReorderSuggestions, getLocalInventoryItems, upsertLocalInventoryItem } from '@/store/inventory';
import { InventoryCategory, InventoryItem } from '@/types/inventory';
import {
  ConfirmReceiptInput,
  PurchaseDailySpend,
  PurchaseInsight,
  PurchaseItemAnalytics,
  PurchaseNotification,
  PurchaseOrderDraft,
  PurchaseOrderLine,
  PurchaseSourceItem,
  PurchasesStateSnapshot,
  RecordPurchaseInput,
  SupplierDirectoryEntry,
} from '@/types/purchases';

const PURCHASE_ORDER_STORAGE_KEY = 'cloud-kitchen.purchases.order';
const PURCHASE_SUPPLIERS_STORAGE_KEY = 'cloud-kitchen.purchases.suppliers';
const PURCHASE_NOTIFICATIONS_STORAGE_KEY = 'cloud-kitchen.purchases.notifications';

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeSupplierName(name: string) {
  return compactWhitespace(name || 'غير محدد');
}

function defaultOrder(): PurchaseOrderDraft {
  const timestamp = nowIso();
  return {
    id: createId('po'),
    created_by: 'store_manager',
    title: 'أمر شراء تلقائي من مدير المخازن',
    status: 'draft_review',
    sent_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    lines: [],
  };
}

function getOrder() {
  return readStorage<PurchaseOrderDraft>(PURCHASE_ORDER_STORAGE_KEY, defaultOrder());
}

function saveOrder(order: PurchaseOrderDraft) {
  writeStorage(PURCHASE_ORDER_STORAGE_KEY, order);
}

function getNotifications() {
  return readStorage<PurchaseNotification[]>(PURCHASE_NOTIFICATIONS_STORAGE_KEY, []);
}

function saveNotifications(notifications: PurchaseNotification[]) {
  writeStorage(PURCHASE_NOTIFICATIONS_STORAGE_KEY, notifications);
}

function getSuppliers() {
  return readStorage<SupplierDirectoryEntry[]>(PURCHASE_SUPPLIERS_STORAGE_KEY, []).map((supplier) => ({
    ...supplier,
    rating: Math.max(0, Math.min(5, Number(supplier.rating ?? 0))),
  }));
}

function saveSuppliers(suppliers: SupplierDirectoryEntry[]) {
  writeStorage(PURCHASE_SUPPLIERS_STORAGE_KEY, suppliers);
}

function createNotification(input: Omit<PurchaseNotification, 'id' | 'created_at' | 'is_read'>): PurchaseNotification {
  return {
    id: createId('purchase-notification'),
    created_at: nowIso(),
    is_read: false,
    ...input,
  };
}

function normalizeRecordPurchaseInput(input: RecordPurchaseInput) {
  const totalSpend = input.purchasedQuantity * input.purchasedUnitPrice;
  const paymentStatus = input.paymentStatus ?? 'paid';
  const paidAmount = paymentStatus === 'paid'
    ? totalSpend
    : paymentStatus === 'unpaid'
      ? 0
      : Math.max(0, Math.min(input.paidAmount ?? 0, totalSpend));

  return {
    ...input,
    paymentMethod: input.paymentMethod ?? 'cash',
    paymentStatus,
    paidAmount,
    dueDate: paymentStatus === 'paid' ? null : input.dueDate,
  };
}

function buildLineFromItem(item: PurchaseSourceItem): PurchaseOrderLine {
  const timestamp = nowIso();
  const requestedQuantity = Math.max((item.min_stock ?? item.reorder_point) - item.quantity, 0) || Math.max(item.reorder_point - item.quantity, 1);
  return {
    id: createId('purchase-line'),
    item_id: item.id,
    item_name: item.name,
    sku: item.sku,
    category: item.category,
    supplier_name: normalizeSupplierName(item.supplier_name),
    alternate_supplier_name: normalizeSupplierName(item.alternate_supplier_name ?? ''),
    best_supplier_name: normalizeSupplierName(item.supplier_name),
    current_quantity: item.quantity,
    minimum_stock: item.min_stock ?? item.reorder_point,
    reorder_point: item.reorder_point,
    suggested_quantity: requestedQuantity,
    requested_quantity: requestedQuantity,
    purchase_unit: item.purchase_unit ?? item.unit,
    storage_unit: item.unit,
    lowest_price: item.min_purchase_price ?? item.last_purchase_price ?? item.avg_cost ?? null,
    highest_price: item.max_purchase_price ?? item.last_purchase_price ?? item.avg_cost ?? null,
    average_price: item.avg_cost ?? item.last_purchase_price ?? null,
    expected_unit_price: item.last_purchase_price ?? item.avg_cost ?? null,
    review_note: 'مراجعة مدير المخزن',
    notes: '',
    status: 'review',
    purchased_quantity: null,
    purchased_unit_price: null,
    purchased_supplier_name: null,
    payment_method: null,
    payment_status: null,
    paid_amount: null,
    remaining_amount: null,
    due_date: null,
    purchased_at: null,
    receipt_date: null,
    received_by: null,
    quality_status: null,
    rejected_quantity: null,
    rejection_reason: null,
    receipt_notes: null,
    received_storage_quantity: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function syncPurchaseDraftFromInventory(items: InventoryItem[]) {
  const suggestions = buildReorderSuggestions(items);
  const order = getOrder();
  const existingItemIds = new Set(order.lines.filter((line) => line.status !== 'cancelled' && line.status !== 'received').map((line) => line.item_id));
  const sourceItemsById = new Map(items.map((item) => [item.id, item]));

  const nextLines = [...order.lines];
  suggestions.forEach((suggestion) => {
    if (existingItemIds.has(suggestion.item_id)) {
      return;
    }

    const item = sourceItemsById.get(suggestion.item_id);
    if (!item) {
      return;
    }

    nextLines.push(buildLineFromItem(item));
  });

  const nextOrder: PurchaseOrderDraft = {
    ...order,
    updated_at: nowIso(),
    status: nextLines.some((line) => line.status === 'review' || line.status === 'sent_to_procurement') ? 'draft_review' : order.status,
    lines: nextLines,
  };

  saveOrder(nextOrder);
  syncSuppliersFromItems(items);
  return nextOrder;
}

export function syncSuppliersFromItems(items: InventoryItem[]) {
  const existing = getSuppliers();
  const byName = new Map(existing.map((supplier) => [supplier.name, supplier]));
  const timestamp = nowIso();

  items.forEach((item) => {
    [item.supplier_name, item.alternate_supplier_name ?? ''].forEach((supplierName) => {
      const normalized = normalizeSupplierName(supplierName);
      if (!normalized || normalized === 'غير محدد') {
        return;
      }

      const current = byName.get(normalized);
      if (current) {
        current.categories = Array.from(new Set([...current.categories, item.category]));
        current.supplied_item_names = Array.from(new Set([...current.supplied_item_names, item.name]));
        current.updated_at = timestamp;
        return;
      }

      byName.set(normalized, {
        id: createId('supplier'),
        name: normalized,
        phone: '',
        categories: [item.category],
        supplied_item_names: [item.name],
        rating: 0,
        notes: '',
        is_preferred: normalized === normalizeSupplierName(item.supplier_name),
        created_at: timestamp,
        updated_at: timestamp,
      });
    });
  });

  const suppliers = Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name, 'ar'));
  saveSuppliers(suppliers);
  return suppliers;
}

export function saveSupplierDirectoryEntry(input: Pick<SupplierDirectoryEntry, 'id' | 'name' | 'phone' | 'categories' | 'rating' | 'notes' | 'is_preferred'>) {
  const current = getSuppliers();
  const timestamp = nowIso();
  const currentEntry = current.find((supplier) => supplier.id === input.id);
  const nextEntry: SupplierDirectoryEntry = {
    id: input.id || createId('supplier'),
    name: normalizeSupplierName(input.name),
    phone: compactWhitespace(input.phone),
    categories: input.categories,
    supplied_item_names: currentEntry?.supplied_item_names ?? [],
    rating: Math.max(0, Math.min(5, Number(input.rating ?? currentEntry?.rating ?? 0))),
    notes: compactWhitespace(input.notes),
    is_preferred: input.is_preferred,
    created_at: currentEntry?.created_at ?? timestamp,
    updated_at: timestamp,
  };

  const next = current.some((supplier) => supplier.id === nextEntry.id)
    ? current.map((supplier) => supplier.id === nextEntry.id ? nextEntry : supplier)
    : [nextEntry, ...current];

  saveSuppliers(next);
  return next;
}

export function removePurchaseOrderLine(lineId: string) {
  const order = getOrder();
  const nextOrder = {
    ...order,
    updated_at: nowIso(),
    lines: order.lines.filter((line) => line.id !== lineId),
  };
  saveOrder(nextOrder);
  return nextOrder;
}

export function sendOrderToProcurement() {
  const order = getOrder();
  const nextOrder: PurchaseOrderDraft = {
    ...order,
    status: 'sent_to_procurement',
    sent_at: nowIso(),
    updated_at: nowIso(),
    lines: order.lines.map((line) => (
      line.status === 'review'
        ? { ...line, status: 'sent_to_procurement', updated_at: nowIso() }
        : line
    )),
  };
  saveOrder(nextOrder);

  const notifications = [
    createNotification({
      audience: 'procurement_manager',
      title: 'أمر شراء جديد من مدير المخازن',
      message: 'تم تجهيز أمر شراء جديد ويحتاج مراجعة مدير المشتريات.',
      order_id: nextOrder.id,
      line_id: null,
    }),
    ...getNotifications(),
  ];
  saveNotifications(notifications);

  return nextOrder;
}

export function recordPurchase(input: RecordPurchaseInput) {
  const normalizedInput = normalizeRecordPurchaseInput(input);
  const order = getOrder();
  const timestamp = nowIso();
  const inventoryItems = getLocalInventoryItems();
  const inventoryItem = inventoryItems.find((item) => item.id === normalizedInput.itemId);

  let targetLine = order.lines.find((line) => line.id === normalizedInput.lineId);
  let nextLines = [...order.lines];

  if (!targetLine && inventoryItem) {
    targetLine = buildLineFromItem(inventoryItem);
    nextLines = [targetLine, ...nextLines];
  }

  if (!targetLine) {
    return order;
  }

  const nextOrder: PurchaseOrderDraft = {
    ...order,
    status: 'awaiting_receipt',
    updated_at: timestamp,
    lines: nextLines.map((line) => {
      if (line.id !== targetLine.id) {
        return line;
      }

      const totalSpend = normalizedInput.purchasedQuantity * normalizedInput.purchasedUnitPrice;
      const remainingAmount = Math.max(totalSpend - (normalizedInput.paidAmount ?? 0), 0);

      return {
        ...line,
        status: 'purchased_pending_receipt',
        purchase_unit: normalizedInput.purchaseUnit,
        purchased_quantity: normalizedInput.purchasedQuantity,
        purchased_unit_price: normalizedInput.purchasedUnitPrice,
        purchased_supplier_name: normalizeSupplierName(normalizedInput.purchasedSupplierName),
        payment_method: normalizedInput.paymentMethod,
        payment_status: normalizedInput.paymentStatus,
        paid_amount: normalizedInput.paidAmount,
        remaining_amount: remainingAmount,
        due_date: normalizedInput.dueDate,
        purchased_at: timestamp,
        updated_at: timestamp,
      };
    }),
  };
  saveOrder(nextOrder);

  const notifications = [
    createNotification({
      audience: 'store_manager',
      title: 'شراء جديد بانتظار الاستلام',
      message: 'قام مدير المشتريات بتسجيل شراء صنف جديد. يجب الضغط على تم الاستلام قبل إضافته للمخزون.',
      order_id: nextOrder.id,
      line_id: targetLine.id,
    }),
    ...getNotifications(),
  ];
  saveNotifications(notifications);

  return nextOrder;
}

export function recordPurchasesBatch(inputs: RecordPurchaseInput[]) {
  let nextOrder = getOrder();

  inputs.forEach((input) => {
    nextOrder = recordPurchase(input);
  });

  return nextOrder;
}

export function confirmReceipt(input: ConfirmReceiptInput) {
  const order = getOrder();
  const itemLine = order.lines.find((line) => line.id === input.lineId);
  if (!itemLine) {
    return order;
  }

  const timestamp = nowIso();
  const nextOrder: PurchaseOrderDraft = {
    ...order,
    updated_at: timestamp,
    status: order.lines.every((line) => line.id === input.lineId ? true : line.status === 'received' || line.status === 'cancelled')
      ? 'completed'
      : 'partially_purchased',
    lines: order.lines.map((line) => (
      line.id !== input.lineId
        ? line
        : {
          ...line,
          status: 'received',
          receipt_date: input.receiptDate,
          received_by: compactWhitespace(input.receivedBy),
          quality_status: input.qualityStatus,
          rejected_quantity: input.rejectedQuantity,
          rejection_reason: compactWhitespace(input.rejectionReason),
          receipt_notes: compactWhitespace(input.receiptNotes),
          received_storage_quantity: input.receivedStorageQuantity,
          updated_at: timestamp,
        }
    )),
  };
  saveOrder(nextOrder);

  const inventoryItems = getLocalInventoryItems();
  const inventoryItem = inventoryItems.find((item) => item.id === itemLine.item_id);
  if (inventoryItem) {
    upsertLocalInventoryItem({
      ...inventoryItem,
      quantity: inventoryItem.quantity + input.receivedStorageQuantity,
      cost_per_unit: itemLine.purchased_unit_price ?? inventoryItem.cost_per_unit,
      last_purchase_price: itemLine.purchased_unit_price ?? inventoryItem.last_purchase_price ?? null,
      avg_cost: itemLine.average_price ?? inventoryItem.avg_cost ?? inventoryItem.cost_per_unit,
      supplier_name: itemLine.purchased_supplier_name ?? inventoryItem.supplier_name,
    });
  }

  return nextOrder;
}

export function markPurchaseNotificationRead(notificationId: string) {
  const notifications = getNotifications().map((notification) => (
    notification.id === notificationId
      ? { ...notification, is_read: true }
      : notification
  ));
  saveNotifications(notifications);
  return notifications;
}

function itemInPeriod(dateValue: string | null, periodDays: number) {
  if (!dateValue) {
    return false;
  }

  const date = new Date(dateValue).getTime();
  const cutoff = Date.now() - (periodDays * 24 * 60 * 60 * 1000);
  return date >= cutoff;
}

export function getPurchaseAnalytics(periodDays: number, items: InventoryItem[]): PurchaseItemAnalytics[] {
  const order = getOrder();
  const itemMap = new Map(items.map((item) => [item.id, item]));

  return order.lines
    .filter((line) => line.purchased_at && itemInPeriod(line.purchased_at, periodDays))
    .reduce<Map<string, PurchaseItemAnalytics>>((acc, line) => {
      const current = acc.get(line.item_id);
      const spend = (line.purchased_quantity ?? 0) * (line.purchased_unit_price ?? 0);
      const item = itemMap.get(line.item_id);
      if (!current) {
        acc.set(line.item_id, {
          item_id: line.item_id,
          item_name: line.item_name,
          sku: line.sku,
          supplier_name: line.purchased_supplier_name ?? line.best_supplier_name,
          purchase_unit: line.purchase_unit,
          storage_unit: line.storage_unit,
          total_spend: spend,
          total_purchased_quantity: line.purchased_quantity ?? 0,
          average_unit_price: line.purchased_unit_price,
          lowest_unit_price: line.purchased_unit_price,
          highest_unit_price: line.purchased_unit_price,
          required_quantity: Math.max((item?.min_stock ?? item?.reorder_point ?? 0) - (item?.quantity ?? 0), 0),
          purchase_count: 1,
        });
        return acc;
      }

      const totalQuantity = current.total_purchased_quantity + (line.purchased_quantity ?? 0);
      const totalSpend = current.total_spend + spend;
      acc.set(line.item_id, {
        ...current,
        supplier_name: line.purchased_supplier_name ?? current.supplier_name,
        total_spend: totalSpend,
        total_purchased_quantity: totalQuantity,
        average_unit_price: totalQuantity > 0 ? totalSpend / totalQuantity : current.average_unit_price,
        lowest_unit_price: Math.min(current.lowest_unit_price ?? Number.POSITIVE_INFINITY, line.purchased_unit_price ?? Number.POSITIVE_INFINITY),
        highest_unit_price: Math.max(current.highest_unit_price ?? 0, line.purchased_unit_price ?? 0),
        purchase_count: current.purchase_count + 1,
      });
      return acc;
    }, new Map())
    .values()
    .toArray()
    .sort((left, right) => right.total_spend - left.total_spend);
}

export function getPurchaseDailySpend(periodDays: number): PurchaseDailySpend[] {
  const order = getOrder();
  const dailyMap = order.lines
    .filter((line) => line.purchased_at && itemInPeriod(line.purchased_at, periodDays))
    .reduce<Map<string, PurchaseDailySpend>>((acc, line) => {
      const day = (line.purchased_at ?? '').slice(0, 10);
      const spend = (line.purchased_quantity ?? 0) * (line.purchased_unit_price ?? 0);
      const current = acc.get(day);
      if (!current) {
        acc.set(day, { day, total_spend: spend, purchase_count: 1 });
        return acc;
      }

      acc.set(day, {
        day,
        total_spend: current.total_spend + spend,
        purchase_count: current.purchase_count + 1,
      });
      return acc;
    }, new Map());

  return Array.from(dailyMap.values()).sort((left, right) => right.day.localeCompare(left.day));
}

export function getPurchaseInsights(items: InventoryItem[]): PurchaseInsight[] {
  const analytics = getPurchaseAnalytics(90, items);
  const order = getOrder();
  const insights: PurchaseInsight[] = [];

  const volatileItem = analytics.find((item) => (item.highest_unit_price ?? 0) - (item.lowest_unit_price ?? 0) > 20);
  if (volatileItem) {
    insights.push({
      id: 'price-volatility',
      title: `تذبذب سعر ${volatileItem.item_name}`,
      description: 'يستحق مراجعة أفضل مورد أو التفاوض على سعر ثابت قبل أمر الشراء القادم.',
    });
  }

  const highDemandItem = order.lines
    .filter((line) => line.status === 'review' || line.status === 'sent_to_procurement')
    .sort((left, right) => right.requested_quantity - left.requested_quantity)[0];
  if (highDemandItem) {
    insights.push({
      id: 'demand-tip',
      title: `زاد الطلب على ${highDemandItem.item_name}`,
      description: 'الصنف على رأس أمر الشراء الحالي. راجع الكمية المقترحة والمورد الأفضل قبل الإرسال.',
    });
  }

  const latePayments = order.lines.filter((line) => line.payment_status === 'partial' || line.payment_status === 'unpaid').length;
  if (latePayments > 0) {
    insights.push({
      id: 'payments-tip',
      title: 'التزامات دفع مفتوحة',
      description: `هناك ${latePayments} أصناف مشتراة ما زال عليها رصيد مستحق أو دفع جزئي.`,
    });
  }

  return insights;
}

export function getPurchasesStateSnapshot(items: InventoryItem[]): PurchasesStateSnapshot {
  const order = syncPurchaseDraftFromInventory(items);
  return {
    order,
    suppliers: getSuppliers(),
    notifications: getNotifications().sort((left, right) => right.created_at.localeCompare(left.created_at)),
    analytics: getPurchaseAnalytics(90, items),
    dailySpend: getPurchaseDailySpend(30),
    insights: getPurchaseInsights(items),
  };
}

export function getPurchaseOrder() {
  return getOrder();
}