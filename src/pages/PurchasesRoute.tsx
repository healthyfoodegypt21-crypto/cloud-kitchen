import { useEffect, useMemo, useState } from 'react';
import { useBrands } from '@/hooks/useBrands';
import { useOperationalInventory } from '@/hooks/useOperationalInventory';
import PurchasesPage from '@/pages/Purchases';
import type { InventoryCategory, InventoryItem, InventoryUnit } from '@/types/inventory';

const supportedUnits = new Set<InventoryUnit>(['kg', 'g', 'l', 'ml', 'piece', 'box', 'tray', 'carton', 'bag', 'bottle', 'can', 'set', 'dozen']);

function toPurchaseItem(item: ReturnType<typeof useOperationalInventory>['items'][number]): InventoryItem {
  const unit = supportedUnits.has(item.unit as InventoryUnit) ? item.unit as InventoryUnit : 'piece';
  return {
    id: item.id, brand_id: item.brandId, name: item.name, sku: item.code, category: 'other' as InventoryCategory,
    unit, purchase_unit: unit, base_unit: unit, issue_unit: unit, quantity: item.onHand, reorder_point: item.minStock,
    cost_per_unit: item.averageCost, last_purchase_price: item.lastPurchasePrice, avg_cost: item.averageCost,
    min_stock: item.minStock, supplier_name: '', storage_location: item.locationName, warehouse_location: item.locationName,
    is_active: item.status === 'active', notes: item.notes, created_at: '', updated_at: '',
  };
}

export default function PurchasesRoute() {
  const { brands, loading: brandsLoading } = useBrands();
  const [brandId, setBrandId] = useState('');
  useEffect(() => { if (!brandId && brands[0]) setBrandId(brands[0].id); }, [brandId, brands]);
  const { items: operationalItems, loading: inventoryLoading } = useOperationalInventory(brandId);
  const items = useMemo(() => operationalItems.map(toPurchaseItem), [operationalItems]);

  return (
    <PurchasesPage
      inventoryItems={items}
      inventoryLoading={brandsLoading || inventoryLoading}
      storageMode="local"
      fallbackReason="تُعرض أصناف المخزون الفعلية المسجلة في النظام."
      brandOptions={brands}
    />
  );
}