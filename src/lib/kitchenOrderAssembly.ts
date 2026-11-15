import { Brand } from '@/hooks/useBrands';
import {
  compareKitchenMealLabels,
  isFrozenOrReadyToCookText,
  KITCHEN_CATEGORY_LABELS,
  KitchenCategory,
  resolveKitchenMealCategory,
} from '@/lib/kitchen';
import { getRecoveredSheetMealsForPhone, resolveOrderMeals } from '@/lib/orderMeals';
import { compactWhitespace } from '@/lib/utils';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

export const UNASSIGNED_COMPANY_KEY = 'unassigned';
export const UNASSIGNED_COMPANY_LABEL = 'عملاء أفراد / بدون شركة';

export interface AssemblyMealLine {
  key: string;
  label: string;
  quantity: number;
  category: KitchenCategory;
  isFrozen: boolean;
  instruction?: string;
}

export interface AssemblyNoteHighlight {
  key: string;
  scope: 'order' | 'meal';
  mealLabel?: string;
  text: string;
}

export interface AssemblyCustomerOrderRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  mealLines: AssemblyMealLine[];
  totalMealCount: number;
  notes: AssemblyNoteHighlight[];
}

export interface CompanyAssemblyItemSummaryRow {
  key: string;
  label: string;
  category: KitchenCategory;
  categoryLabel: string;
  isFrozen: boolean;
  totalQuantity: number;
}

export interface CompanyAssemblyBlock {
  key: string;
  brandId: string | null;
  companyName: string;
  isUnassigned: boolean;
  customerCount: number;
  totalMealCount: number;
  itemSummary: CompanyAssemblyItemSummaryRow[];
  orders: AssemblyCustomerOrderRow[];
}

export interface KitchenOrderAssemblyReport {
  date: string;
  totalCompanies: number;
  totalCustomerOrders: number;
  totalMeals: number;
  hasUnassignedOrders: boolean;
  companies: CompanyAssemblyBlock[];
}

export interface BuildKitchenOrderAssemblyOptions {
  orders: Order[];
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
  date: string;
  companyFilter?: string;
  searchQuery?: string;
}

const IMPORTED_DETAILS_NOTE_PATTERN = /^تفاصيل\s*(?:الطلب\s*المستوردة|الشيت)\s*:/u;
const NON_COOKING_NOTE_SEGMENT_PATTERN =
  /^(?:رسوم التوصيل\s*:|حساب العميل\s*:|حساب التوصيل\s*:|مدفوع\b|دفع\b|دفعت\b|فودافون كاش|انستا\s*باي|انستاباي)/iu;

function stripMetadataFromNotes(notes: string): string {
  return notes
    .replace(
      /(?:^|\n|\s+-\s+)تفاصيل(?:\s+الطلب\s+المستوردة|\s*الشيت)\s*:\s*.*?(?=\s+-\s+رسوم التوصيل\s*:|\n|$)/gu,
      '',
    )
    .split('\n')
    .map((line) =>
      line
        .split(/\s+-\s+/)
        .filter((segment) => {
          const trimmed = segment.trim();
          return (
            trimmed.length > 0 &&
            !IMPORTED_DETAILS_NOTE_PATTERN.test(trimmed) &&
            !NON_COOKING_NOTE_SEGMENT_PATTERN.test(trimmed)
          );
        })
        .join(' - '),
    )
    .filter((line) => line.trim().length > 0)
    .join(' | ');
}

function cleanOrderComment(notes?: string | null): string {
  const cleaned = compactWhitespace(stripMetadataFromNotes(notes ?? ''));
  if (!cleaned) return '';
  if (/^\[demo-orders/i.test(cleaned) || /^طلب تجريبي/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

function normalizeSearchText(value: string): string {
  return compactWhitespace(
    value
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/gu, '')
      .replace(/[أإآٱ]/gu, 'ا')
      .replace(/ة/gu, 'ه')
      .replace(/ى/gu, 'ي'),
  );
}

function normalizeMealKeyLabel(value: string): string {
  return compactWhitespace(
    value
      .replace(/^\*+\s*/u, '')
      .replace(/\(\s+/gu, '(')
      .replace(/\s+\)/gu, ')'),
  ).toLocaleLowerCase('ar');
}

export function buildKitchenOrderAssemblyReport({
  orders,
  brands,
  meals,
  packages,
  date,
  companyFilter = 'all',
  searchQuery = '',
}: BuildKitchenOrderAssemblyOptions): KitchenOrderAssemblyReport {
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const normalizedQuery = normalizeSearchText(searchQuery);

  // 1. Active orders for the target execution date (strictly exclude 'cancelled')
  const activeDayOrders = orders.filter(
    (order) => order.execution_date === date && order.status !== 'cancelled',
  );

  let hasUnassignedOrders = false;
  for (const order of activeDayOrders) {
    if (!order.brand_id || !brandById.has(order.brand_id)) {
      hasUnassignedOrders = true;
      break;
    }
  }

  const companyBuckets = new Map<
    string,
    {
      key: string;
      brandId: string | null;
      companyName: string;
      isUnassigned: boolean;
      rows: AssemblyCustomerOrderRow[];
    }
  >();

  for (const order of activeDayOrders) {
    const matchedBrand = order.brand_id ? brandById.get(order.brand_id) ?? null : null;
    const isUnassigned = !matchedBrand;
    const companyKey = matchedBrand ? matchedBrand.id : UNASSIGNED_COMPANY_KEY;
    const companyName = matchedBrand ? matchedBrand.name : UNASSIGNED_COMPANY_LABEL;

    if (companyFilter !== 'all' && companyFilter !== companyKey) {
      continue;
    }

    const isImportedOrder =
      (order.imported_meal_details ?? []).length > 0 ||
      /تفاصيل\s*(?:الطلب\s*المستوردة|الشيت)\s*:/u.test(order.notes) ||
      Boolean(getRecoveredSheetMealsForPhone(order.phone));

    const cleanedOrderNote = cleanOrderComment(order.notes);
    // Keep order-level notes even on imported orders if the customer/sheet included an actual note column
    const orderLevelFrozenNote =
      isImportedOrder && isFrozenOrReadyToCookText(cleanedOrderNote) ? cleanedOrderNote : '';

    const customizationMap = new Map(
      (order.meal_customizations ?? []).map((c) => [c.key, cleanOrderComment(c.notes)]),
    );

    const resolvedMeals = resolveOrderMeals(order, meals, packages);

    // Group identical meal + instruction lines inside the single customer order
    const mealLineMap = new Map<string, AssemblyMealLine>();
    const mealSpecificNotes: AssemblyNoteHighlight[] = [];
    const seenMealNotes = new Set<string>();

    for (const item of resolvedMeals) {
      const perMealNote = [
        cleanOrderComment(item.instruction),
        customizationMap.get(item.customizationKey) ?? '',
      ]
        .filter(Boolean)
        .join(' | ');

      const combinedForCategory = [orderLevelFrozenNote || (!isImportedOrder ? cleanedOrderNote : ''), perMealNote]
        .filter(Boolean)
        .join(' | ');

      const category = resolveKitchenMealCategory({
        label: item.label,
        baseCategory: item.category,
        customCategory: item.customCategory,
        description: item.description,
        instruction: combinedForCategory,
        packageLabel: order.package,
      });

      const isFrozen = category === 'frozen';
      const lineGroupKey = `${isFrozen ? 'frozen' : 'cooked'}::${normalizeMealKeyLabel(item.label)}::${normalizeMealKeyLabel(perMealNote)}`;

      const existingLine = mealLineMap.get(lineGroupKey);
      if (existingLine) {
        existingLine.quantity += 1;
      } else {
        mealLineMap.set(lineGroupKey, {
          key: lineGroupKey,
          label: item.label,
          quantity: 1,
          category,
          isFrozen,
          ...(perMealNote ? { instruction: perMealNote } : {}),
        });
      }

      if (perMealNote) {
        const noteDedupKey = `${normalizeMealKeyLabel(item.label)}::${normalizeMealKeyLabel(perMealNote)}`;
        if (!seenMealNotes.has(noteDedupKey)) {
          seenMealNotes.add(noteDedupKey);
          mealSpecificNotes.push({
            key: `meal-note-${order.id}-${seenMealNotes.size}`,
            scope: 'meal',
            mealLabel: item.label,
            text: perMealNote,
          });
        }
      }
    }

    // Fallback when an order is a custom/unexpanded package name with 0 resolved meals
    if (mealLineMap.size === 0 && compactWhitespace(order.package)) {
      const fallbackLabel = compactWhitespace(order.package);
      const isFrozen = isFrozenOrReadyToCookText(fallbackLabel) || isFrozenOrReadyToCookText(cleanedOrderNote);
      mealLineMap.set(`fallback::${normalizeMealKeyLabel(fallbackLabel)}`, {
        key: `fallback::${normalizeMealKeyLabel(fallbackLabel)}`,
        label: fallbackLabel,
        quantity: 1,
        category: isFrozen ? 'frozen' : 'uncategorized',
        isFrozen,
      });
    }

    const sortedMealLines = [...mealLineMap.values()].sort((a, b) => {
      if (a.isFrozen !== b.isFrozen) return a.isFrozen ? 1 : -1;
      return compareKitchenMealLabels(a.label, b.label);
    });

    const noteHighlights: AssemblyNoteHighlight[] = [];
    const seenHighlightTexts = new Set<string>();
    if (cleanedOrderNote) {
      seenHighlightTexts.add(normalizeMealKeyLabel(cleanedOrderNote));
      noteHighlights.push({
        key: `order-note-${order.id}`,
        scope: 'order',
        text: cleanedOrderNote,
      });
    }
    for (const mn of mealSpecificNotes) {
      const fullKey = mn.mealLabel
        ? `${normalizeMealKeyLabel(mn.mealLabel)}::${normalizeMealKeyLabel(mn.text)}`
        : normalizeMealKeyLabel(mn.text);
      if (!seenHighlightTexts.has(fullKey) && !seenHighlightTexts.has(normalizeMealKeyLabel(mn.text))) {
        seenHighlightTexts.add(fullKey);
        noteHighlights.push(mn);
      }
    }

    const customerName = compactWhitespace(order.customer_name) || 'عميل بدون اسم';

    // Apply quick search filter (matches customer name OR any item name OR note)
    if (normalizedQuery) {
      const customerMatches = normalizeSearchText(customerName).includes(normalizedQuery);
      const itemMatches = sortedMealLines.some((line) =>
        normalizeSearchText(line.label).includes(normalizedQuery),
      );
      const noteMatches = noteHighlights.some((n) =>
        normalizeSearchText(n.text).includes(normalizedQuery),
      );
      if (!customerMatches && !itemMatches && !noteMatches) {
        continue;
      }
    }

    const totalMealCount = sortedMealLines.reduce((sum, l) => sum + l.quantity, 0);

    const bucket = companyBuckets.get(companyKey) ?? {
      key: companyKey,
      brandId: matchedBrand?.id ?? null,
      companyName,
      isUnassigned,
      rows: [],
    };

    bucket.rows.push({
      orderId: order.id,
      orderNumber: order.order_number,
      customerName,
      mealLines: sortedMealLines,
      totalMealCount,
      notes: noteHighlights,
    });

    companyBuckets.set(companyKey, bucket);
  }

  // Build finalized CompanyAssemblyBlocks:
  // - Sort customers alphabetically inside each company
  // - Compute Company Item Summary sorted alphabetically (cooked vs frozen isolated)
  // - Sort companies alphabetically with "عملاء أفراد / بدون شركة" strictly at the end
  const companies: CompanyAssemblyBlock[] = [...companyBuckets.values()]
    .map((bucket) => {
      const sortedOrders = [...bucket.rows].sort(
        (left, right) =>
          compareKitchenMealLabels(left.customerName, right.customerName) ||
          left.orderNumber.localeCompare(right.orderNumber, 'en'),
      );

      const summaryMap = new Map<string, CompanyAssemblyItemSummaryRow>();
      for (const orderRow of sortedOrders) {
        for (const mealLine of orderRow.mealLines) {
          const itemKey = `${mealLine.isFrozen ? 'frozen' : 'cooked'}::${normalizeMealKeyLabel(mealLine.label)}`;
          const existing = summaryMap.get(itemKey);
          if (existing) {
            existing.totalQuantity += mealLine.quantity;
          } else {
            summaryMap.set(itemKey, {
              key: itemKey,
              label: mealLine.label,
              category: mealLine.category,
              categoryLabel: KITCHEN_CATEGORY_LABELS[mealLine.category],
              isFrozen: mealLine.isFrozen,
              totalQuantity: mealLine.quantity,
            });
          }
        }
      }

      const itemSummary = [...summaryMap.values()].sort((a, b) => {
        if (a.isFrozen !== b.isFrozen) return a.isFrozen ? 1 : -1;
        return compareKitchenMealLabels(a.label, b.label);
      });

      const totalMealCount = sortedOrders.reduce((sum, row) => sum + row.totalMealCount, 0);

      return {
        key: bucket.key,
        brandId: bucket.brandId,
        companyName: bucket.companyName,
        isUnassigned: bucket.isUnassigned,
        customerCount: sortedOrders.length,
        totalMealCount,
        itemSummary,
        orders: sortedOrders,
      };
    })
    .sort((left, right) => {
      if (left.isUnassigned !== right.isUnassigned) {
        return left.isUnassigned ? 1 : -1;
      }
      return compareKitchenMealLabels(left.companyName, right.companyName);
    });

  return {
    date,
    totalCompanies: companies.length,
    totalCustomerOrders: companies.reduce((sum, c) => sum + c.customerCount, 0),
    totalMeals: companies.reduce((sum, c) => sum + c.totalMealCount, 0),
    hasUnassignedOrders,
    companies,
  };
}

const QC_STORAGE_PREFIX = 'cloud_kitchen_order_qc_v1_';

export function loadQcCheckedState(date: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(`${QC_STORAGE_PREFIX}${date}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === true) clean[k] = true;
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveQcCheckedState(date: string, checkedMap: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${QC_STORAGE_PREFIX}${date}`, JSON.stringify(checkedMap));
  } catch {
    // Ignore storage quota errors
  }
}
