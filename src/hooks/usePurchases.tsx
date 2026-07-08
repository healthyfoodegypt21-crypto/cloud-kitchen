import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { InventoryCategory, InventoryItem } from '@/types/inventory';
import { ConfirmReceiptInput, PurchaseNotification, PurchasesStateSnapshot, RecordPurchaseInput } from '@/types/purchases';
import {
  confirmReceipt,
  getPurchaseAnalytics,
  getPurchaseDailySpend,
  getPurchasesStateSnapshot,
  markPurchaseNotificationRead,
  recordPurchase,
  recordPurchasesBatch,
  removePurchaseOrderLine,
  saveSupplierDirectoryEntry,
} from '@/store/purchases';

function emptySnapshot(): PurchasesStateSnapshot {
  return {
    order: {
      id: '',
      created_by: 'store_manager',
      title: '',
      status: 'draft_review',
      sent_at: null,
      created_at: '',
      updated_at: '',
      lines: [],
    },
    suppliers: [],
    notifications: [],
    analytics: [],
    dailySpend: [],
    insights: [],
  };
}

export function usePurchases(inventoryItems: InventoryItem[], periodDays: number) {
  const [snapshot, setSnapshot] = useState<PurchasesStateSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    const nextSnapshot = getPurchasesStateSnapshot(inventoryItems);
    setSnapshot({
      ...nextSnapshot,
      analytics: getPurchaseAnalytics(periodDays, inventoryItems),
      dailySpend: getPurchaseDailySpend(periodDays),
    });
    setLoading(false);
  }, [inventoryItems, periodDays]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const removeLine = async (lineId: string) => {
    removePurchaseOrderLine(lineId);
    toast.success('تم حذف الصنف من أمر الشراء');
    refresh();
  };

  const registerPurchase = async (input: RecordPurchaseInput) => {
    recordPurchase(input);
    toast.success('تم تسجيل الشراء وإشعار مسؤول المخازن');
    refresh();
  };

  const registerQuickPurchase = async (inputs: RecordPurchaseInput[]) => {
    recordPurchasesBatch(inputs);
    toast.success(`تم تسجيل ${inputs.length} صنف وإرسالها إلى بانتظار الاستلام`);
    refresh();
  };

  const registerReceipt = async (input: ConfirmReceiptInput) => {
    confirmReceipt(input);
    toast.success('تم اعتماد الاستلام وإضافة الكمية إلى المخزن');
    refresh();
  };

  const saveSupplier = async (input: { id?: string; name: string; phone: string; categories: InventoryCategory[]; rating: number; notes: string; is_preferred: boolean }) => {
    saveSupplierDirectoryEntry({
      id: input.id ?? '',
      name: input.name,
      phone: input.phone,
      categories: input.categories,
      rating: input.rating,
      notes: input.notes,
      is_preferred: input.is_preferred,
    });
    toast.success(input.id ? 'تم تحديث المورد' : 'تمت إضافة المورد');
    refresh();
  };

  const readNotification = async (notification: PurchaseNotification) => {
    markPurchaseNotificationRead(notification.id);
    refresh();
  };

  return {
    ...snapshot,
    loading,
    refresh,
    removeLine,
    registerPurchase,
    registerQuickPurchase,
    registerReceipt,
    saveSupplier,
    readNotification,
  };
}