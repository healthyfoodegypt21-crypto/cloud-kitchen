import { Brand } from '@/hooks/useBrands';
import { getRecoveredSheetMealsForPhone, resolveOrderMeals } from '@/lib/orderMeals';
import { compactWhitespace } from '@/lib/utils';
import { Meal, MenuCategory, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

export type KitchenCookedCategory =
  | 'chicken'
  | 'meat'
  | 'mix'
  | 'fish'
  | 'salad'
  | 'snacks'
  | 'breakfast_dinner'
  | 'uncategorized';

export type KitchenCategory = KitchenCookedCategory | 'frozen';

export interface KitchenModificationSummary {
  key: string;
  label: string;
  instruction: string;
  count: number;
}

export interface KitchenMealSummary {
  key: string;
  label: string;
  category: KitchenCategory;
  count: number;
  modifications: KitchenModificationSummary[];
}

export interface KitchenBrandSummary {
  key: string;
  brandId: string | null;
  brandName: string;
  orderCount: number;
  totalMealCount: number;
  meals: KitchenMealSummary[];
}

export interface KitchenDailySummary {
  date: string;
  isCombinedView: boolean;
  orderCount: number;
  totalMealCount: number;
  totalDistinctMeals: number;
  brands: KitchenBrandSummary[];
}

export interface DailyMealAggregationRow {
  key: string;
  label: string;
  category: KitchenCategory;
  countsByBrand: Record<string, number>;
  total: number;
  modifications: KitchenModificationSummary[];
}

export interface DailyMealAggregation {
  brands: Array<{ key: string; name: string; orderCount: number }>;
  rows: DailyMealAggregationRow[];
  total: number;
}

export interface KitchenSticker {
  key: string;
  label: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  date: string;
  brandName: string;
}

type AggregateKitchenOrdersOptions = {
  orders: Order[];
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
  date: string;
  brandId?: string;
};

export const KITCHEN_COOKED_CATEGORY_ORDER: KitchenCookedCategory[] = [
  'chicken',
  'meat',
  'mix',
  'fish',
  'salad',
  'snacks',
  'breakfast_dinner',
  'uncategorized',
];

export const KITCHEN_CATEGORY_ORDER: KitchenCategory[] = [
  ...KITCHEN_COOKED_CATEGORY_ORDER,
  'frozen',
];

export const KITCHEN_CATEGORY_LABELS: Record<KitchenCategory, string> = {
  chicken: 'Chicken',
  meat: 'Beef',
  mix: 'Mix',
  fish: 'Seafood',
  salad: 'Salad',
  snacks: 'Snacks',
  breakfast_dinner: 'Breakfast & Dinner',
  frozen: 'Frozen / Ready to Cook',
  uncategorized: 'غير مصنف',
};

const FROZEN_OR_READY_TO_COOK_PATTERN = new RegExp(
  [
    '\\bfrozen\\b',
    '\\bready\\s*[-\\s]*to\\s*[-\\s]*cook\\b',
    '\\braw\\b',
    '\\buncooked\\b',
    '\\brtc\\b',
    'فروزن',
    'فروزين',
    'فرزون',
    'مفرزن(?:ة|ه|ات)?',
    'مجمد(?:ة|ه|ات)?',
    'متجمد(?:ة|ه|ات)?',
    'جاهز(?:ة|ه)?\\s*لل(?:طبخ|طهي|تسوي[ةه]|تحضير)',
    'نصف\\s*(?:مطهي|مطهى|تسوي[ةه]|سوا)',
    '(?:بدون|من\\s*غير)\\s*(?:طبخ|طهي|تسوي[ةه]|سوا)',
    '(?:تتبيل|متبل(?:ة|ه)?)\\s*فقط',
    '(?:^|[\\s(\\-،,|/])(?:ني|نيه|نية|نيء|نيئه|نيئة|ناي|نايه|ناية)(?=$|[\\s)\\-،,.|/])',
  ].join('|'),
  'iu',
);

const BREAKFAST_OR_DINNER_CATEGORY_PATTERN = /(breakfast|braekfast|dinner|فطار|إفطار|افطار|عشاء|عشا|سحور)/iu;

const BREAKFAST_OR_DINNER_LABEL_PATTERN = new RegExp(
  [
    '\\bbreakfast\\b',
    '\\bbraekfast\\b',
    '\\bdinner\\b',
    'فطار',
    'إفطار',
    'افطار',
    'عشاء',
    'عشا',
    'سحور',
    '\\bomelette\\b',
    '\\bomelet\\b',
    'أومليت',
    'اومليت',
    'بيض\\s*مسلوق',
    '\\bboiled\\s*eggs?\\b',
    '\\bclub\\s*sandwich\\b',
    '\\boats\\b.*\\byogurt\\b',
    '\\byogurt\\b.*\\boats\\b',
    'شوفان\\s*بالزبادي',
  ].join('|'),
  'iu',
);

export function isFrozenOrReadyToCookText(value?: string | null): boolean {
  if (!value) return false;
  return FROZEN_OR_READY_TO_COOK_PATTERN.test(value);
}

export function resolveKitchenMealCategory(params: {
  label: string;
  baseCategory: MenuCategory | null | undefined;
  customCategory?: string | null;
  description?: string | null;
  instruction?: string | null;
  packageLabel?: string | null;
}): KitchenCategory {
  const { label, baseCategory, customCategory, description, instruction, packageLabel } = params;

  if (
    isFrozenOrReadyToCookText(customCategory) ||
    isFrozenOrReadyToCookText(label) ||
    isFrozenOrReadyToCookText(instruction) ||
    isFrozenOrReadyToCookText(description) ||
    isFrozenOrReadyToCookText(packageLabel)
  ) {
    return 'frozen';
  }

  const normalizedCustom = compactWhitespace(customCategory ?? '');
  if (
    (normalizedCustom && BREAKFAST_OR_DINNER_CATEGORY_PATTERN.test(normalizedCustom)) ||
    BREAKFAST_OR_DINNER_LABEL_PATTERN.test(label)
  ) {
    return 'breakfast_dinner';
  }

  if (normalizedCustom) {
    if (/(salad|سلط)/iu.test(normalizedCustom)) return 'salad';
    if (/(snack|dessert|سناك|حلو)/iu.test(normalizedCustom)) return 'snacks';
    if (/(seafood|sea\s*food|fish|salmon|shrimp|tuna|أسماك|اسماك|سمك|سي\s*فود|جمبري)/iu.test(normalizedCustom)) return 'fish';
    if (/(mix|ميكس|مشكل|كومبو)/iu.test(normalizedCustom)) return 'mix';
    if (/(chicken|poultry|دجاج|فراخ|تشيكن)/iu.test(normalizedCustom)) return 'chicken';
    if (/(beef|meat|steak|veal|لحوم|لحم|بيف|ستيك|استيك|كفتة|كفته)/iu.test(normalizedCustom)) return 'meat';
  }

  return baseCategory ?? 'uncategorized';
}

export function compareKitchenMealLabels(left: string, right: string) {
  const cleanLeft = compactWhitespace(left.replace(/^\*+\s*/u, ''));
  const cleanRight = compactWhitespace(right.replace(/^\*+\s*/u, ''));
  return cleanLeft.localeCompare(cleanRight, 'ar', { sensitivity: 'base', numeric: true });
}

function normalizeLabel(value: string) {
  return compactWhitespace(
    value
      .replace(/^\*+\s*/u, '')
      .replace(/\(\s+/gu, '(')
      .replace(/\s+\)/gu, ')'),
  ).toLocaleLowerCase('ar');
}

const IMPORTED_DETAILS_NOTE_PATTERN = /^تفاصيل\s*(?:الطلب\s*المستوردة|الشيت)\s*:/u;
const NON_COOKING_NOTE_SEGMENT_PATTERN = /^(?:رسوم التوصيل\s*:|حساب العميل\s*:|حساب التوصيل\s*:|مدفوع\b|دفع\b|دفعت\b|فودافون كاش|انستا\s*باي|انستاباي)/iu;

// Import-generated notes embed the raw sheet meal list and delivery/payment
// metadata as " - "-separated segments; strip those so only cooking comments
// appear next to the meal.
function stripImportedDetailsNote(notes: string) {
  return notes
    .replace(/(?:^|\n|\s+-\s+)تفاصيل(?:\s+الطلب\s+المستوردة|\s*الشيت)\s*:\s*.*?(?=\s+-\s+رسوم التوصيل\s*:|\n|$)/gu, '')
    .split('\n')
    .map(line => line
      .split(/\s+-\s+/)
      .filter(segment => {
        const trimmed = segment.trim();
        return trimmed.length > 0
          && !IMPORTED_DETAILS_NOTE_PATTERN.test(trimmed)
          && !NON_COOKING_NOTE_SEGMENT_PATTERN.test(trimmed);
      })
      .join(' - '))
    .filter(line => line.trim().length > 0)
    .join('\n');
}

function normalizeInstruction(notes: string) {
  const value = compactWhitespace(stripImportedDetailsNote(notes));
  if (!value) {
    return '';
  }

  if (/^\[demo-orders/i.test(value) || /^طلب تجريبي/i.test(value)) {
    return '';
  }

  return value;
}

function combineInstructions(...values: Array<string | undefined>) {
  const normalizedValues = values
    .map(value => normalizeInstruction(value ?? ''))
    .filter(Boolean);

  return normalizedValues.join(' | ');
}

function compareCategory(left: KitchenCategory, right: KitchenCategory) {
  const leftIndex = KITCHEN_CATEGORY_ORDER.indexOf(left);
  const rightIndex = KITCHEN_CATEGORY_ORDER.indexOf(right);
  return (leftIndex === -1 ? KITCHEN_CATEGORY_ORDER.length : leftIndex)
    - (rightIndex === -1 ? KITCHEN_CATEGORY_ORDER.length : rightIndex);
}

function findMealNutrition(mealSummary: KitchenMealSummary, brandSummary: KitchenBrandSummary, meals: Meal[]) {
  const normalizedLabel = normalizeLabel(mealSummary.label);

  const exactBrandMatch = brandSummary.brandId
    ? meals.find(meal => meal.brand_id === brandSummary.brandId && normalizeLabel(meal.name) === normalizedLabel)
    : null;

  const anyMatch = meals.find(meal => normalizeLabel(meal.name) === normalizedLabel);
  const matchedMeal = exactBrandMatch ?? anyMatch ?? null;

  return {
    calories: matchedMeal?.calories ?? null,
    protein: matchedMeal?.protein ?? null,
    carbs: matchedMeal?.carbs ?? null,
    fat: matchedMeal?.fat ?? null,
    ...(matchedMeal?.fiber !== undefined ? { fiber: matchedMeal.fiber } : {}),
  };
}

export function buildKitchenStickers(summary: KitchenDailySummary, meals: Meal[]) {
  const stickers: KitchenSticker[] = [];

  for (const brandSummary of summary.brands) {
    for (const mealSummary of brandSummary.meals) {
      const nutrition = findMealNutrition(mealSummary, brandSummary, meals);
      const modifiedCount = mealSummary.modifications.reduce((sum, modification) => sum + modification.count, 0);
      const plainCount = Math.max(mealSummary.count - modifiedCount, 0);

      for (let index = 0; index < plainCount; index += 1) {
        stickers.push({
          key: `${mealSummary.key}-plain-${index + 1}`,
          label: mealSummary.label,
          date: summary.date,
          brandName: brandSummary.brandName,
          ...nutrition,
        });
      }

      for (const modification of mealSummary.modifications) {
        for (let index = 0; index < modification.count; index += 1) {
          stickers.push({
            key: `${modification.key}-${index + 1}`,
            label: modification.label,
            date: summary.date,
            brandName: brandSummary.brandName,
            ...nutrition,
          });
        }
      }
    }
  }

  return stickers;
}

export function aggregateKitchenOrders({ orders, brands, meals, packages, date, brandId = 'all' }: AggregateKitchenOrdersOptions): KitchenDailySummary {
  const isCombinedView = brandId === 'all';
  const brandNameById = new Map(brands.map(brand => [brand.id, brand.name]));

  const filteredOrders = orders.filter((order) => {
    if (order.execution_date !== date) {
      return false;
    }

    if (brandId !== 'all' && order.brand_id !== brandId) {
      return false;
    }

    return true;
  });

  const bucketMap = new Map<string, {
    brandId: string | null;
    brandName: string;
    orderIds: Set<string>;
    totalMealCount: number;
    meals: Map<string, KitchenMealSummary>;
  }>();

  for (const order of filteredOrders) {
    const brandKey = isCombinedView ? 'all-brands' : (order.brand_id ?? 'unassigned');
    const bucket = bucketMap.get(brandKey) ?? {
      brandId: isCombinedView ? null : order.brand_id,
      brandName: isCombinedView ? 'كل الشركات' : (order.brand_id ? (brandNameById.get(order.brand_id) ?? 'براند غير معروف') : 'بدون براند'),
      orderIds: new Set<string>(),
      totalMealCount: 0,
      meals: new Map<string, KitchenMealSummary>(),
    };

    bucket.orderIds.add(order.id);

    const isImportedOrder = (order.imported_meal_details ?? []).length > 0
      || /تفاصيل\s*(?:الطلب\s*المستوردة|الشيت)\s*:/u.test(order.notes)
      || Boolean(getRecoveredSheetMealsForPhone(order.phone));
    const cleanedOrderNote = normalizeInstruction(order.notes);
    const orderLevelFrozenInstruction = isImportedOrder && isFrozenOrReadyToCookText(cleanedOrderNote)
      ? cleanedOrderNote
      : '';
    const generalInstruction = isImportedOrder ? orderLevelFrozenInstruction : cleanedOrderNote;
    const mealCustomizationMap = new Map(
      (order.meal_customizations ?? []).map(item => [item.key, normalizeInstruction(item.notes)]),
    );
    const resolvedMeals = resolveOrderMeals(order, meals, packages).map(meal => {
      const instruction = combineInstructions(generalInstruction, meal.instruction, mealCustomizationMap.get(meal.customizationKey));
      const category = resolveKitchenMealCategory({
        label: meal.label,
        baseCategory: meal.category,
        customCategory: meal.customCategory,
        description: meal.description,
        instruction,
        packageLabel: order.package,
      });

      return {
        label: meal.label,
        category,
        instruction,
      };
    });

    for (const meal of resolvedMeals) {
      const prepGroupKey = meal.category === 'frozen' ? 'frozen' : 'cooked';
      const mealKey = isCombinedView
        ? `${prepGroupKey}::${normalizeLabel(meal.label)}`
        : `${brandKey}::${prepGroupKey}::${normalizeLabel(meal.label)}`;
      const currentMeal = bucket.meals.get(mealKey) ?? {
        key: mealKey,
        label: meal.label,
        category: meal.category,
        count: 0,
        modifications: [],
      };

      currentMeal.count += 1;
      bucket.totalMealCount += 1;

      if (meal.instruction) {
        const modificationKey = `${mealKey}::${normalizeLabel(meal.instruction)}`;
        const existingModification = currentMeal.modifications.find(modification => modification.key === modificationKey);
        if (existingModification) {
          existingModification.count += 1;
        } else {
          currentMeal.modifications.push({
            key: modificationKey,
            label: `${currentMeal.label} - ${meal.instruction}`,
            instruction: meal.instruction,
            count: 1,
          });
        }
      }

      bucket.meals.set(mealKey, currentMeal);
    }

    bucketMap.set(brandKey, bucket);
  }

  const brandsSummary = [...bucketMap.entries()]
    .map(([key, bucket]) => ({
      key,
      brandId: bucket.brandId,
      brandName: bucket.brandName,
      orderCount: bucket.orderIds.size,
      totalMealCount: bucket.totalMealCount,
      meals: [...bucket.meals.values()]
        .map(meal => ({
          ...meal,
          modifications: [...meal.modifications].sort((left, right) => compareKitchenMealLabels(left.instruction, right.instruction)),
        }))
        .sort((left, right) => compareCategory(left.category, right.category) || compareKitchenMealLabels(left.label, right.label)),
    }))
    .sort((left, right) => left.brandName.localeCompare(right.brandName, 'ar'));

  return {
    date,
    isCombinedView,
    orderCount: filteredOrders.length,
    totalMealCount: brandsSummary.reduce((sum, brand) => sum + brand.totalMealCount, 0),
    totalDistinctMeals: brandsSummary.reduce((sum, brand) => sum + brand.meals.length, 0),
    brands: brandsSummary,
  };
}

export function aggregateDailyMealsByBrand({ orders, brands, meals, packages, date }: Omit<AggregateKitchenOrdersOptions, 'brandId'>): DailyMealAggregation {
  const summaries = brands
    .map(brand => ({ brand, summary: aggregateKitchenOrders({ orders, brands, meals, packages, date, brandId: brand.id }) }))
    .filter(item => item.summary.orderCount > 0);
  const rowMap = new Map<string, DailyMealAggregationRow>();

  for (const { brand, summary } of summaries) {
    for (const meal of summary.brands.flatMap(item => item.meals)) {
      const prepGroupKey = meal.category === 'frozen' ? 'frozen' : 'cooked';
      const key = `${prepGroupKey}::${normalizeLabel(meal.label)}`;
      const row = rowMap.get(key) ?? {
        key,
        label: meal.label,
        category: meal.category,
        countsByBrand: {},
        total: 0,
        modifications: [],
      };
      row.countsByBrand[brand.id] = (row.countsByBrand[brand.id] ?? 0) + meal.count;
      row.total += meal.count;
      for (const modification of meal.modifications) {
        const modKey = `${key}::${normalizeLabel(modification.instruction)}`;
        const existingMod = row.modifications.find(item => item.key === modKey);
        if (existingMod) {
          existingMod.count += modification.count;
        } else {
          row.modifications.push({
            key: modKey,
            label: `${row.label} - ${modification.instruction}`,
            instruction: modification.instruction,
            count: modification.count,
          });
        }
      }
      rowMap.set(key, row);
    }
  }

  const rows = [...rowMap.values()]
    .map(row => ({
      ...row,
      modifications: [...row.modifications].sort((left, right) => compareKitchenMealLabels(left.instruction, right.instruction)),
    }))
    .sort((left, right) =>
      compareCategory(left.category, right.category) || compareKitchenMealLabels(left.label, right.label),
    );

  return {
    brands: summaries
      .map(({ brand, summary }) => ({ key: brand.id, name: brand.name, orderCount: summary.orderCount }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ar')),
    rows,
    total: rows.reduce((sum, row) => sum + row.total, 0),
  };
}