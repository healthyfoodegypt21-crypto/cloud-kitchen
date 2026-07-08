import { beforeEach, describe, expect, it } from 'vitest';
import { getLocalInventoryItems, seedLocalInventoryForBrand } from '@/store/inventory';
import { confirmReceipt, getPurchasesStateSnapshot, recordPurchase, removePurchaseOrderLine, sendOrderToProcurement } from '@/store/purchases';

describe('purchases store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('builds a draft order from low stock items and allows deleting a line', () => {
    seedLocalInventoryForBrand('brand-1');
    const snapshot = getPurchasesStateSnapshot(getLocalInventoryItems());

    expect(snapshot.order.lines.length).toBeGreaterThan(0);
    expect(snapshot.order.lines.every((line) => line.review_note.includes('مدير المخزن'))).toBe(true);

    const nextOrder = removePurchaseOrderLine(snapshot.order.lines[0].id);
    expect(nextOrder.lines).toHaveLength(snapshot.order.lines.length - 1);
  });

  it('sends order to procurement, then records purchase and creates awaiting receipt workflow', () => {
    seedLocalInventoryForBrand('brand-1');
    const snapshot = getPurchasesStateSnapshot(getLocalInventoryItems());
    const line = snapshot.order.lines[0];

    const sentOrder = sendOrderToProcurement();
    expect(sentOrder.status).toBe('sent_to_procurement');

    const purchasedOrder = recordPurchase({
      orderId: sentOrder.id,
      lineId: line.id,
      itemId: line.item_id,
      purchasedQuantity: 4,
      purchaseUnit: line.purchase_unit,
      purchasedUnitPrice: 100,
      purchasedSupplierName: line.supplier_name,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      paidAmount: 400,
      dueDate: null,
    });

    const updatedLine = purchasedOrder.lines.find((current) => current.id === line.id);
    expect(updatedLine?.status).toBe('purchased_pending_receipt');
    expect(updatedLine?.remaining_amount).toBe(0);
  });

  it('adds stock only after confirming receipt', () => {
    seedLocalInventoryForBrand('brand-1');
    const itemsBefore = getLocalInventoryItems();
    const snapshot = getPurchasesStateSnapshot(itemsBefore);
    const line = snapshot.order.lines[0];
    const sourceItem = itemsBefore.find((item) => item.id === line.item_id);

    recordPurchase({
      orderId: snapshot.order.id,
      lineId: line.id,
      itemId: line.item_id,
      purchasedQuantity: 3,
      purchaseUnit: line.purchase_unit,
      purchasedUnitPrice: 120,
      purchasedSupplierName: line.supplier_name,
      paymentMethod: 'credit',
      paymentStatus: 'partial',
      paidAmount: 200,
      dueDate: '2026-07-20',
    });

    confirmReceipt({
      orderId: snapshot.order.id,
      lineId: line.id,
      receiptDate: '2026-07-06',
      receivedBy: 'مسؤول المخزن',
      qualityStatus: 'accepted',
      rejectedQuantity: 0,
      rejectionReason: '',
      receiptNotes: 'تم الاستلام',
      receivedStorageQuantity: 3,
    });

    const itemsAfter = getLocalInventoryItems();
    const updatedItem = itemsAfter.find((item) => item.id === line.item_id);
    expect(updatedItem?.quantity).toBe((sourceItem?.quantity ?? 0) + 3);
  });

  it('allows recording a manual purchase for an item outside the shortage list', () => {
    seedLocalInventoryForBrand('brand-1');
    const items = getLocalInventoryItems();
    const healthyItem = items.find((item) => item.quantity > item.reorder_point);

    expect(healthyItem).toBeTruthy();

    const purchasedOrder = recordPurchase({
      itemId: healthyItem?.id ?? '',
      purchasedQuantity: 2,
      purchaseUnit: healthyItem?.purchase_unit ?? healthyItem?.unit ?? 'kg',
      purchasedUnitPrice: 75,
      purchasedSupplierName: healthyItem?.supplier_name ?? 'مورد',
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      paidAmount: 150,
      dueDate: null,
    });

    expect(purchasedOrder.lines.some((line) => line.item_id === healthyItem?.id && line.status === 'purchased_pending_receipt')).toBe(true);
  });

  it('defaults accounting fields for quick operational purchases', () => {
    seedLocalInventoryForBrand('brand-1');
    const items = getLocalInventoryItems();
    const item = items[0];

    const purchasedOrder = recordPurchase({
      itemId: item.id,
      purchasedQuantity: 5,
      purchaseUnit: item.purchase_unit ?? item.unit,
      purchasedUnitPrice: 88,
      purchasedSupplierName: item.supplier_name,
      dueDate: null,
    });

    const updatedLine = purchasedOrder.lines.find((line) => line.item_id === item.id && line.status === 'purchased_pending_receipt');
    expect(updatedLine?.payment_method).toBe('cash');
    expect(updatedLine?.payment_status).toBe('paid');
    expect(updatedLine?.paid_amount).toBe(440);
    expect(updatedLine?.remaining_amount).toBe(0);
  });
});