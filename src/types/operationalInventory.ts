export type StockMovementKind = 'purchase_receipt' | 'production_consumption' | 'waste' | 'adjustment';

export type InventoryCategoryRecord = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
};

export type OperationalInventoryItem = {
  id: string;
  brandId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  minStock: number;
  lastPurchasePrice: number;
  averageCost: number;
  onHand: number;
  locationName: string;
  status: 'active' | 'inactive';
  notes: string;
};

export type InventoryBatch = {
  id: string;
  itemId: string;
  batchNo: string;
  expiryDate: string | null;
  quantityOnHand: number;
  unitCost: number;
  status: 'available' | 'reserved' | 'consumed' | 'expired' | 'damaged';
};

export type OperationalMovement = {
  id: string;
  itemId: string;
  itemName: string;
  type: string;
  quantity: number;
  unitCost: number;
  value: number;
  locationName: string;
  notes: string;
  createdAt: string;
};

export type PurchaseRequestLine = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  locationName: string;
  notes: string;
  batchNo: string;
  expiryDate: string | null;
};

export type InventoryPurchaseRequest = {
  id: string;
  requestNo: string;
  supplierName: string;
  status: 'pending_store_approval' | 'approved' | 'rejected';
  notes: string;
  createdAt: string;
  lines: PurchaseRequestLine[];
};

export type DailyWithdrawalLine = {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  lineValue: number;
  locationName: string;
  reason: string;
};

export type DailyWithdrawal = {
  id: string;
  withdrawalNo: string;
  withdrawalDate: string;
  status: string;
  notes: string;
  lines: DailyWithdrawalLine[];
  totalValue: number;
};

export type InventoryAlert = {
  id: string;
  type: 'low_stock' | 'missing_cost' | 'purchase_pending';
  title: string;
  description: string;
  itemId?: string;
};
