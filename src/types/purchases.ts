import { InventoryCategory, InventoryItem, InventoryUnit } from '@/types/inventory';

export type PurchaseOrderStatus = 'draft_review' | 'sent_to_procurement' | 'partially_purchased' | 'awaiting_receipt' | 'completed';
export type PurchaseLineStatus = 'review' | 'sent_to_procurement' | 'purchased_pending_receipt' | 'received' | 'cancelled';
export type PurchasePaymentMethod = 'cash' | 'bank_transfer' | 'credit';
export type PurchasePaymentStatus = 'paid' | 'partial' | 'unpaid';
export type ReceiptQualityStatus = 'accepted' | 'rejected' | 'partial';
export type PurchaseNotificationAudience = 'store_manager' | 'procurement_manager';

export interface SupplierDirectoryEntry {
  id: string;
  name: string;
  phone: string;
  categories: InventoryCategory[];
  supplied_item_names: string[];
  rating: number;
  notes: string;
  is_preferred: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLine {
  id: string;
  item_id: string;
  item_name: string;
  sku: string;
  category: InventoryCategory;
  supplier_name: string;
  alternate_supplier_name: string;
  best_supplier_name: string;
  current_quantity: number;
  minimum_stock: number;
  reorder_point: number;
  suggested_quantity: number;
  requested_quantity: number;
  purchase_unit: InventoryUnit;
  storage_unit: InventoryUnit;
  lowest_price: number | null;
  highest_price: number | null;
  average_price: number | null;
  expected_unit_price: number | null;
  review_note: string;
  notes: string;
  status: PurchaseLineStatus;
  purchased_quantity: number | null;
  purchased_unit_price: number | null;
  purchased_supplier_name: string | null;
  payment_method: PurchasePaymentMethod | null;
  payment_status: PurchasePaymentStatus | null;
  paid_amount: number | null;
  remaining_amount: number | null;
  due_date: string | null;
  purchased_at: string | null;
  receipt_date: string | null;
  received_by: string | null;
  quality_status: ReceiptQualityStatus | null;
  rejected_quantity: number | null;
  rejection_reason: string | null;
  receipt_notes: string | null;
  received_storage_quantity: number | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderDraft {
  id: string;
  created_by: string;
  title: string;
  status: PurchaseOrderStatus;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  lines: PurchaseOrderLine[];
}

export interface PurchaseNotification {
  id: string;
  audience: PurchaseNotificationAudience;
  title: string;
  message: string;
  order_id: string;
  line_id: string | null;
  created_at: string;
  is_read: boolean;
}

export interface PurchaseItemAnalytics {
  item_id: string;
  item_name: string;
  sku: string;
  supplier_name: string;
  purchase_unit: InventoryUnit;
  storage_unit: InventoryUnit;
  total_spend: number;
  total_purchased_quantity: number;
  average_unit_price: number | null;
  lowest_unit_price: number | null;
  highest_unit_price: number | null;
  required_quantity: number;
  purchase_count: number;
}

export interface PurchaseDailySpend {
  day: string;
  total_spend: number;
  purchase_count: number;
}

export interface PurchaseInsight {
  id: string;
  title: string;
  description: string;
}

export interface RecordPurchaseInput {
  orderId?: string;
  lineId?: string;
  itemId: string;
  purchasedQuantity: number;
  purchaseUnit: InventoryUnit;
  purchasedUnitPrice: number;
  purchasedSupplierName: string;
  paymentMethod?: PurchasePaymentMethod | null;
  paymentStatus?: PurchasePaymentStatus | null;
  paidAmount?: number | null;
  dueDate: string | null;
}

export interface ConfirmReceiptInput {
  orderId: string;
  lineId: string;
  receiptDate: string;
  receivedBy: string;
  qualityStatus: ReceiptQualityStatus;
  rejectedQuantity: number;
  rejectionReason: string;
  receiptNotes: string;
  receivedStorageQuantity: number;
}

export interface PurchasesStateSnapshot {
  order: PurchaseOrderDraft;
  suppliers: SupplierDirectoryEntry[];
  notifications: PurchaseNotification[];
  analytics: PurchaseItemAnalytics[];
  dailySpend: PurchaseDailySpend[];
  insights: PurchaseInsight[];
}

export type PurchaseSourceItem = Pick<InventoryItem,
  'id'
  | 'name'
  | 'sku'
  | 'category'
  | 'supplier_name'
  | 'alternate_supplier_name'
  | 'quantity'
  | 'reorder_point'
  | 'min_stock'
  | 'purchase_unit'
  | 'unit'
  | 'last_purchase_price'
  | 'avg_cost'
  | 'min_purchase_price'
  | 'max_purchase_price'
>;