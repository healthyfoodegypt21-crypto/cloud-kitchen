import { resolveOrderMeals } from '@/lib/orderMeals';
import { compactWhitespace, formatEGPCurrency } from '@/lib/utils';
import { MenuIngredient } from '@/types/companyMenu';
import { Meal, MealIngredientSnapshot, MENU_CATEGORY_LABELS, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

export const PROTEIN_INGREDIENT_NAMES = new Set([
  'شرائح دجاج',
  'مكعبات دجاج',
  'صدور دجاج كامله',
  'صدور دجاج محشية',
  'شرائح لحم',
  'مكعبات لحم',
  'استيك',
  'كفته',
  'ميتبول',
  'فيليه سمك',
  'جمبري',
  'كالماري',
  'أصابع كابوريا',
]);

export function isProteinIngredientName(name: string): boolean {
  return PROTEIN_INGREDIENT_NAMES.has(compactWhitespace(name));
}

export interface InventoryCostItem {
  id: string;
  name: string;
  usageUnit: string;
  avgCostPerUsageUnit: number;
}

export interface MealCostBreakdown {
  estimatedCost: number | null;
  pricedIngredientsCount: number;
  totalIngredientsCount: number;
  grossProfit: number | null;
  foodCostPct: number | null;
  isHighFoodCost: boolean;
}

/**
 * Computes live recipe food cost and margin from pre-cooking gram weights
 * matched against ingredient unit_cost_per_kg or linked central inventory items.
 */
export function computeMealCostBreakdown(
  meal: Pick<Meal, 'price' | 'ingredients'>,
  companyIngredients: MenuIngredient[] = [],
  inventoryItems: InventoryCostItem[] = [],
): MealCostBreakdown {
  const links = meal.ingredients ?? [];
  if (links.length === 0) {
    return {
      estimatedCost: null,
      pricedIngredientsCount: 0,
      totalIngredientsCount: 0,
      grossProfit: null,
      foodCostPct: null,
      isHighFoodCost: false,
    };
  }

  const ingredientByName = new Map(
    companyIngredients.map((ing) => [compactWhitespace(ing.name).toLowerCase(), ing]),
  );
  const ingredientById = new Map(companyIngredients.map((ing) => [ing.id, ing]));
  const invById = new Map(inventoryItems.map((inv) => [inv.id, inv]));
  const invByName = new Map(
    inventoryItems.map((inv) => [compactWhitespace(inv.name).toLowerCase(), inv]),
  );

  let totalCost = 0;
  let pricedCount = 0;

  for (const link of links) {
    const grams = link.weight_before_grams ?? link.weight_after_grams ?? null;
    if (!grams || grams <= 0) continue;

    const matchedIngredient =
      (link.ingredient_id ? ingredientById.get(link.ingredient_id) : undefined) ??
      ingredientByName.get(compactWhitespace(link.name).toLowerCase());

    let costPerKg: number | null = null;

    if (matchedIngredient?.unit_cost_per_kg && matchedIngredient.unit_cost_per_kg > 0) {
      costPerKg = matchedIngredient.unit_cost_per_kg;
    } else {
      const invItem =
        (matchedIngredient?.inventory_item_id
          ? invById.get(matchedIngredient.inventory_item_id)
          : undefined) ?? invByName.get(compactWhitespace(link.name).toLowerCase());

      if (invItem && invItem.avgCostPerUsageUnit > 0) {
        const unit = invItem.usageUnit.toLowerCase();
        if (unit === 'g' || unit === 'gram' || unit === 'جم' || unit === 'جرام') {
          costPerKg = invItem.avgCostPerUsageUnit * 1000;
        } else {
          // Default kg / unit assumption
          costPerKg = invItem.avgCostPerUsageUnit;
        }
      }
    }

    if (costPerKg !== null && costPerKg > 0) {
      totalCost += (grams / 1000) * costPerKg;
      pricedCount += 1;
    }
  }

  if (pricedCount === 0) {
    return {
      estimatedCost: null,
      pricedIngredientsCount: 0,
      totalIngredientsCount: links.length,
      grossProfit: null,
      foodCostPct: null,
      isHighFoodCost: false,
    };
  }

  const roundedCost = Math.round(totalCost * 100) / 100;
  const sellingPrice = meal.price ?? null;
  const grossProfit =
    sellingPrice !== null && sellingPrice > 0
      ? Math.round((sellingPrice - roundedCost) * 100) / 100
      : null;
  const foodCostPct =
    sellingPrice !== null && sellingPrice > 0 ? (roundedCost / sellingPrice) * 100 : null;

  return {
    estimatedCost: roundedCost,
    pricedIngredientsCount: pricedCount,
    totalIngredientsCount: links.length,
    grossProfit,
    foodCostPct,
    isHighFoodCost: foodCostPct !== null && foodCostPct > 35,
  };
}

export interface PackageSavingsBreakdown {
  dailyRate: number;
  standaloneValue: number;
  savingsAmount: number;
  savingsPct: number;
}

export function computePackageSavings(
  pkg: PackagePlan,
  meals: Meal[],
): PackageSavingsBreakdown {
  const mealById = new Map(meals.map((m) => [m.id, m]));
  const dailyRate = pkg.days_count > 0 ? Math.round(pkg.price / pkg.days_count) : pkg.price;

  let standaloneValue = 0;
  for (const item of pkg.items) {
    if (item.menu_item_id) {
      const m = mealById.get(item.menu_item_id);
      if (m?.price && m.price > 0) {
        standaloneValue += m.price;
      }
    }
  }

  const savingsAmount = standaloneValue > pkg.price ? standaloneValue - pkg.price : 0;
  const savingsPct =
    standaloneValue > 0 && savingsAmount > 0
      ? Math.round((savingsAmount / standaloneValue) * 100)
      : 0;

  return {
    dailyRate,
    standaloneValue,
    savingsAmount,
    savingsPct,
  };
}

export interface MenuEngineeringReport {
  topMeals: Array<{ name: string; count: number; revenueShare: number }>;
  topPackages: Array<{ name: string; count: number; revenue: number }>;
  dormantMeals: Meal[];
  totalBrandOrders30d: number;
  totalBrandRevenue30d: number;
}

export function buildMenuEngineeringReport(
  brandId: string,
  brandMeals: Meal[],
  brandPackages: PackagePlan[],
  allOrders: Order[],
  nowTimestamp = Date.now(),
): MenuEngineeringReport {
  const thirtyDaysAgo = nowTimestamp - 30 * 24 * 60 * 60 * 1000;
  const recentOrders = allOrders.filter(
    (o) =>
      o.brand_id === brandId &&
      o.status !== 'cancelled' &&
      new Date(o.created_at).getTime() >= thirtyDaysAgo,
  );

  const mealCounter = new Map<string, { name: string; count: number }>();
  const pkgCounter = new Map<string, { name: string; count: number; revenue: number }>();

  for (const order of recentOrders) {
    if (order.order_mode === 'package' && compactWhitespace(order.package)) {
      const key = compactWhitespace(order.package).toLowerCase();
      const existing = pkgCounter.get(key);
      pkgCounter.set(key, {
        name: existing?.name ?? compactWhitespace(order.package),
        count: (existing?.count ?? 0) + 1,
        revenue: (existing?.revenue ?? 0) + order.price,
      });
    }

    const resolved = resolveOrderMeals(order, brandMeals, brandPackages);
    for (const item of resolved) {
      const clean = compactWhitespace(item.label);
      if (!clean) continue;
      const key = clean.toLowerCase();
      const existing = mealCounter.get(key);
      mealCounter.set(key, {
        name: existing?.name ?? clean,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  const totalMealMentions = Math.max(
    1,
    Array.from(mealCounter.values()).reduce((sum, m) => sum + m.count, 0),
  );

  const topMeals = Array.from(mealCounter.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((m) => ({
      name: m.name,
      count: m.count,
      revenueShare: Math.round((m.count / totalMealMentions) * 100),
    }));

  const topPackages = Array.from(pkgCounter.values())
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, 5);

  const dormantMeals = brandMeals.filter(
    (meal) => !mealCounter.has(compactWhitespace(meal.name).toLowerCase()),
  );

  return {
    topMeals,
    topPackages,
    dormantMeals,
    totalBrandOrders30d: recentOrders.length,
    totalBrandRevenue30d: recentOrders.reduce((s, o) => s + o.price, 0),
  };
}

export function buildCustomerMenuShowcaseText(params: {
  companyName: string;
  phone?: string;
  meals: Meal[];
  packages: PackagePlan[];
}): string {
  const lines: string[] = [];
  lines.push(`🌿 *منيو وباقات ${params.companyName}* 🌿`);
  if (params.phone) {
    lines.push(`📞 للحجز والاستفسار: ${params.phone}`);
  }
  lines.push('');

  const availableMeals = params.meals.filter((m) => m.is_available !== false);

  if (params.packages.length > 0) {
    lines.push('📦 *الباقات والاشتراكات المتاحة:*');
    for (const pkg of params.packages) {
      const daily = pkg.days_count > 0 ? Math.round(pkg.price / pkg.days_count) : pkg.price;
      lines.push(
        `• *${pkg.name}* (${pkg.days_count.toLocaleString('en-US')} يوم) — ${formatEGPCurrency(pkg.price)} _(${formatEGPCurrency(daily)}/يوم)_`,
      );
    }
    lines.push('');
  }

  const grouped = new Map<string, Meal[]>();
  for (const meal of availableMeals) {
    const catLabel =
      compactWhitespace(meal.custom_category ?? '') || MENU_CATEGORY_LABELS[meal.category];
    const list = grouped.get(catLabel) ?? [];
    list.push(meal);
    grouped.set(catLabel, list);
  }

  for (const [catLabel, catMeals] of grouped.entries()) {
    lines.push(`🍽️ *قسم ${catLabel}:*`);
    for (const meal of catMeals) {
      const priceTag = meal.price !== null ? ` — ${formatEGPCurrency(meal.price)}` : '';
      const macros = `(${meal.calories} kcal | P:${meal.protein}g | C:${meal.carbs}g | F:${meal.fat}g${meal.fiber ? ` | Fiber:${meal.fiber}g` : ''})`;
      lines.push(`• *${meal.name}*${priceTag} ${macros}`);
      if (meal.description) {
        lines.push(`  _${meal.description}_`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Parses ingredient cell values that may include optional pre/post weights, e.g.:
 * "شرائح دجاج (200->125), أرز بسمتي (100->150)" or plain "شرائح دجاج، أرز"
 */
export function parseImportedIngredientsList(rawText: string): MealIngredientSnapshot[] {
  if (!rawText.trim()) return [];
  return rawText
    .split(/[,،|;\n]/)
    .map((segment) => compactWhitespace(segment))
    .filter(Boolean)
    .map((entry) => {
      const weightMatch = entry.match(/^(.*?)\s*\(\s*(\d+(?:\.\d+)?)?\s*g?\s*(?:->|→|-|\/)\s*(\d+(?:\.\d+)?)?\s*g?\s*\)$/u);
      if (weightMatch) {
        const name = compactWhitespace(weightMatch[1]);
        const before = weightMatch[2] ? Number(weightMatch[2]) : null;
        const after = weightMatch[3] ? Number(weightMatch[3]) : null;
        return {
          name,
          weight_before_grams: Number.isFinite(before) ? before : null,
          weight_after_grams: Number.isFinite(after) ? after : null,
        };
      }

      return {
        name: entry,
        weight_before_grams: isProteinIngredientName(entry) ? 200 : null,
        weight_after_grams: isProteinIngredientName(entry) ? 125 : null,
      };
    })
    .filter((item) => Boolean(item.name));
}
