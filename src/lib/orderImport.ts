import type { Order } from '@/types/order';
import { compactWhitespace, extractLegacyOrderMetadata, normalizePhone } from '@/lib/utils';

export type ImportedOrder = Omit<Order, 'id' | 'created_at'>;
type ExistingOrder = Pick<
  Order,
  | 'order_number'
  | 'customer_name'
  | 'phone'
  | 'address'
  | 'execution_date'
  | 'order_mode'
  | 'package'
  | 'package_plan_id'
  | 'meal_type'
  | 'price'
  | 'selected_meal_ids'
  | 'brand_id'
> & {
  phone_secondary?: string | null;
  notes: string | null;
};

function normalizedText(value: string | null | undefined) {
  return compactWhitespace(value ?? '').toLocaleLowerCase();
}

export function getOrderImportFingerprint(order: Pick<
  Order,
  | 'brand_id'
  | 'customer_name'
  | 'phone'
  | 'phone_secondary'
  | 'location_link'
  | 'address'
  | 'execution_date'
  | 'order_mode'
  | 'package'
  | 'package_plan_id'
  | 'meal_type'
  | 'notes'
  | 'price'
  | 'selected_meal_ids'
>) {
  return JSON.stringify([
    order.brand_id ?? '',
    normalizedText(order.customer_name),
    normalizePhone(order.phone),
    normalizePhone(order.phone_secondary),
    normalizedText(order.location_link),
    normalizedText(order.address),
    order.execution_date,
    order.order_mode,
    normalizedText(order.package),
    order.package_plan_id ?? '',
    order.meal_type,
    normalizedText(order.notes),
    Number(order.price.toFixed(2)),
    [...order.selected_meal_ids].sort(),
  ]);
}

function hashFingerprint(value: string, seed: number) {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function getImportedOrderNumber(order: ImportedOrder) {
  const fingerprint = getOrderImportFingerprint(order);
  const rawOrderNumber = compactWhitespace(order.order_number);
  const isPackageLabel = /باكدج|باقة|package|^(weekly|week|monthly|daily)$/iu.test(rawOrderNumber)
    || normalizedText(rawOrderNumber) === normalizedText(order.package);
  const sourceNumber = rawOrderNumber && !isPackageLabel
    ? rawOrderNumber.normalize('NFKC').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40)
    : '';
  const stableHash = `${hashFingerprint(fingerprint, 0x811c9dc5)}${hashFingerprint(fingerprint, 0x9747b28c)}`;
  return `IMP-${sourceNumber ? `${sourceNumber}-` : ''}${stableHash}`;
}

export function hasDuplicateOrderImport(order: ImportedOrder, existingOrders: ExistingOrder[]) {
  const fingerprint = getOrderImportFingerprint(order);
  return existingOrders.some(existing => {
    if (existing.order_number === order.order_number) return true;

    const metadata = extractLegacyOrderMetadata(existing.notes);
    return getOrderImportFingerprint({
      brand_id: existing.brand_id,
      customer_name: existing.customer_name,
      phone: existing.phone,
      phone_secondary: existing.phone_secondary ?? metadata.phoneSecondary,
      location_link: metadata.locationLink,
      address: existing.address,
      execution_date: existing.execution_date || metadata.executionDate,
      order_mode: existing.order_mode,
      package: existing.package,
      package_plan_id: existing.package_plan_id,
      meal_type: existing.meal_type,
      notes: metadata.notes,
      price: Number(existing.price),
      selected_meal_ids: existing.selected_meal_ids,
    }) === fingerprint;
  });
}
