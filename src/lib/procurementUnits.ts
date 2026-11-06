import { normalizePurchaseUnit } from '@/lib/smartPurchaseImport';
import type { InventoryUnit } from '@/types/inventory';

export type ProcurementUnitItem = {
  purchaseUnit: string;
  usageUnit: string;
  conversionFactor: number;
};

export type ConvertedPurchaseLine = {
  quantity: number;
  unitPrice: number;
};

export function suggestPurchaseQuantity(minimumUsageQuantity: number, onHandUsageQuantity: number, conversionFactor: number): number {
  const factor = Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
  const minimum = Number.isFinite(minimumUsageQuantity) ? Math.max(minimumUsageQuantity, 0) : 0;
  const onHand = Number.isFinite(onHandUsageQuantity) ? Math.max(onHandUsageQuantity, 0) : 0;
  const shortageInUsageUnits = Math.max(minimum * 2 - onHand, 0);
  return shortageInUsageUnits === 0 ? 0 : Math.max(shortageInUsageUnits / factor, 0.001);
}

export function convertInvoiceLineToPurchaseUnit(
  quantity: number,
  unitPrice: number,
  sourceUnit: InventoryUnit | null,
  item: ProcurementUnitItem,
): ConvertedPurchaseLine | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return null;
  }

  const purchaseUnit = normalizePurchaseUnit(item.purchaseUnit);
  const usageUnit = normalizePurchaseUnit(item.usageUnit);

  if (!sourceUnit || sourceUnit === purchaseUnit) {
    return { quantity, unitPrice };
  }

  if (sourceUnit !== usageUnit || purchaseUnit === usageUnit) {
    return null;
  }

  if (!Number.isFinite(item.conversionFactor) || item.conversionFactor <= 0) {
    return null;
  }

  return {
    quantity: quantity / item.conversionFactor,
    unitPrice: unitPrice * item.conversionFactor,
  };
}
