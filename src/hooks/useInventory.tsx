import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  buildReorderSuggestions,
  deleteLocalInventoryItem,
  getInventoryBatches,
  getInventoryCounts,
  getInventoryMovements,
  getInventoryTransfers,
  getLocalInventoryItems,
  seedLocalInventoryForBrand,
  summarizeInventoryByActivity,
  summarizeInventoryValue,
  upsertLocalInventoryItem,
} from '@/store/inventory';
import { InventoryBatch, InventoryCount, InventoryItem, InventoryItemInput, InventoryMovement, InventoryReorderSuggestion, InventoryTransfer } from '@/types/inventory';

type InventoryStorageMode = 'local';

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  const [reorderSuggestions, setReorderSuggestions] = useState<InventoryReorderSuggestion[]>([]);
  const [activitySummary, setActivitySummary] = useState({ active: 0, inactive: 0 });
  const [inventoryValue, setInventoryValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [storageMode] = useState<InventoryStorageMode>('local');
  const [fallbackReason] = useState('تم تفعيل إدارة المخزون محليًا داخل المتصفح كمرحلة أولى لحين ربط جداول Supabase وحركات المخزون التفصيلية.');

  const refresh = useCallback(async () => {
    setLoading(true);
    const nextItems = getLocalInventoryItems();
    setItems(nextItems);
    setMovements(getInventoryMovements());
    setBatches(getInventoryBatches());
    setCounts(getInventoryCounts());
    setTransfers(getInventoryTransfers());
    setReorderSuggestions(buildReorderSuggestions(nextItems));
    setActivitySummary(summarizeInventoryByActivity(nextItems));
    setInventoryValue(summarizeInventoryValue(nextItems));
    setLoading(false);
    return true;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveItem = async (input: InventoryItemInput) => {
    setItems(upsertLocalInventoryItem(input));
    setReorderSuggestions(buildReorderSuggestions(getLocalInventoryItems()));
    setActivitySummary(summarizeInventoryByActivity(getLocalInventoryItems()));
    setInventoryValue(summarizeInventoryValue(getLocalInventoryItems()));
    toast.success(input.id ? 'تم تعديل الصنف المخزني' : 'تمت إضافة صنف مخزني جديد');
    return true;
  };

  const deleteItem = async (id: string) => {
    setItems(deleteLocalInventoryItem(id));
    setReorderSuggestions(buildReorderSuggestions(getLocalInventoryItems()));
    setActivitySummary(summarizeInventoryByActivity(getLocalInventoryItems()));
    setInventoryValue(summarizeInventoryValue(getLocalInventoryItems()));
    toast.success('تم حذف الصنف المخزني');
    return true;
  };

  const loadDemoInventory = async (brandId: string) => {
    setItems(seedLocalInventoryForBrand(brandId));
    const nextItems = getLocalInventoryItems();
    setMovements(getInventoryMovements());
    setBatches(getInventoryBatches());
    setCounts(getInventoryCounts());
    setTransfers(getInventoryTransfers());
    setReorderSuggestions(buildReorderSuggestions(nextItems));
    setActivitySummary(summarizeInventoryByActivity(nextItems));
    setInventoryValue(summarizeInventoryValue(nextItems));
    toast.success('تم تجهيز مخزون تجريبي للبراند المحدد');
    return true;
  };

  return {
    items,
    movements,
    batches,
    counts,
    transfers,
    reorderSuggestions,
    activitySummary,
    inventoryValue,
    loading,
    storageMode,
    fallbackReason,
    refresh,
    saveItem,
    deleteItem,
    loadDemoInventory,
  };
}
