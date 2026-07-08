import { Brand } from '@/hooks/useBrands';
import { resolveOrderMeals } from '@/lib/orderMeals';
import { compactWhitespace } from '@/lib/utils';
import { Meal, MenuCategory, PackagePlan, MENU_CATEGORY_ORDER, MENU_CATEGORY_LABELS } from '@/types/menu';
import { Order } from '@/types/order';

export type KitchenCategory = MenuCategory | 'uncategorized';

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

export interface KitchenSticker {
  key: string;
  label: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
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

export const KITCHEN_CATEGORY_LABELS: Record<KitchenCategory, string> = {
  ...MENU_CATEGORY_LABELS,
  uncategorized: 'غير مصنف',
};

function normalizeLabel(value: string) {
  return compactWhitespace(value).toLocaleLowerCase('ar');
}

function normalizeInstruction(notes: string) {
  const value = compactWhitespace(notes);
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
  const leftIndex = left === 'uncategorized' ? MENU_CATEGORY_ORDER.length : MENU_CATEGORY_ORDER.indexOf(left);
  const rightIndex = right === 'uncategorized' ? MENU_CATEGORY_ORDER.length : MENU_CATEGORY_ORDER.indexOf(right);
  return leftIndex - rightIndex;
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

    const generalInstruction = normalizeInstruction(order.notes);
    const mealCustomizationMap = new Map(
      (order.meal_customizations ?? []).map(item => [item.key, normalizeInstruction(item.notes)]),
    );
    const resolvedMeals = resolveOrderMeals(order, meals, packages).map(meal => ({
      label: meal.label,
      category: meal.category ?? 'uncategorized' as const,
      instruction: combineInstructions(generalInstruction, mealCustomizationMap.get(meal.customizationKey)),
    }));

    for (const meal of resolvedMeals) {
      const mealKey = isCombinedView ? normalizeLabel(meal.label) : `${brandKey}::${normalizeLabel(meal.label)}`;
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
          modifications: [...meal.modifications].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ar')),
        }))
        .sort((left, right) => compareCategory(left.category, right.category) || right.count - left.count || left.label.localeCompare(right.label, 'ar')),
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