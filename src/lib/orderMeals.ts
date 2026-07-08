import { buildDemoMealsForBrand, buildDemoPackagesForBrand } from '@/store/menuCatalog';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

const KNOWN_DEMO_BRANDS = ['Healthy Food', 'Healthy Station', 'Protein Box'];

export interface ResolvedOrderMealItem {
  id: string;
  label: string;
  customizationKey: string;
  category: Meal['category'] | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar');
}

function buildPackageLookup(packages: PackagePlan[]) {
  return new Map(packages.map(pkg => [`${pkg.brand_id}::${normalizeLabel(pkg.name)}`, pkg]));
}

function scorePackageNameMatch(targetPackageName: string, packageName: string) {
  if (targetPackageName === packageName) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (targetPackageName.includes(packageName) || packageName.includes(targetPackageName)) {
    return Math.min(targetPackageName.length, packageName.length);
  }

  return -1;
}

function scoreMealNameMatch(targetMealName: string, mealName: string) {
  if (targetMealName === mealName) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (targetMealName.includes(mealName) || mealName.includes(targetMealName)) {
    return Math.min(targetMealName.length, mealName.length);
  }

  return -1;
}

function inferCategoryFromMealLabel(mealLabel: string): Meal['category'] | null {
  const normalizedMealLabel = normalizeLabel(mealLabel);

  if (/(سلطة|سلطه|سالاد|سيزر|فتوش|تبولة|تبوله|كينوا جاردن)/.test(normalizedMealLabel)) {
    return 'salad';
  }

  if (/(سناكس|سناك|بار|راب|بايتس|ميني ساندوتش|تشيبس)/.test(normalizedMealLabel)) {
    return 'snacks';
  }

  if (/(لحم|بيف|ستيك|كفتة|ميداليون)/.test(normalizedMealLabel)) {
    return 'meat';
  }

  if (/(دجاج|تشيكن|فراخ)/.test(normalizedMealLabel)) {
    return 'chicken';
  }

  if (/(سمك|سالمون|فيش|تونة|سي باس)/.test(normalizedMealLabel)) {
    return 'fish';
  }

  if (/(ميكس|شاورما)/.test(normalizedMealLabel)) {
    return 'mix';
  }

  return null;
}

function findDemoMealByLabel(mealLabel: string) {
  const normalizedMealLabel = normalizeLabel(mealLabel);

  for (const brandName of KNOWN_DEMO_BRANDS) {
    const matchedMeal = buildDemoMealsForBrand(brandName)
      .map(meal => ({ meal, score: scoreMealNameMatch(normalizedMealLabel, normalizeLabel(meal.name)) }))
      .filter(match => match.score >= 0)
      .sort((left, right) => right.score - left.score)[0]?.meal;

    if (matchedMeal) {
      return matchedMeal;
    }
  }

  return null;
}

function findMealByLabel(mealLabel: string, brandId: string | null, meals: Meal[]) {
  const normalizedMealLabel = normalizeLabel(mealLabel);

  const sameBrandMatches = meals
    .filter(meal => meal.brand_id === brandId)
    .map(meal => ({ meal, score: scoreMealNameMatch(normalizedMealLabel, normalizeLabel(meal.name)) }))
    .filter(match => match.score >= 0)
    .sort((left, right) => right.score - left.score);

  if (sameBrandMatches.length > 0) {
    return sameBrandMatches[0].meal;
  }

  const globalMatches = meals
    .map(meal => ({ meal, score: scoreMealNameMatch(normalizedMealLabel, normalizeLabel(meal.name)) }))
    .filter(match => match.score >= 0)
    .sort((left, right) => right.score - left.score);

  if (globalMatches.length === 1) {
    return globalMatches[0].meal;
  }

  if (globalMatches.length > 1 && globalMatches[0].score > globalMatches[1].score) {
    return globalMatches[0].meal;
  }

  const matchedDemoMeal = findDemoMealByLabel(mealLabel);
  if (matchedDemoMeal) {
    return {
      id: `demo-${normalizeLabel(matchedDemoMeal.name)}`,
      brand_id: brandId ?? 'demo-brand',
      name: matchedDemoMeal.name,
      category: matchedDemoMeal.category,
      price: matchedDemoMeal.price,
      protein: matchedDemoMeal.protein,
      carbs: matchedDemoMeal.carbs,
      fat: matchedDemoMeal.fat,
      calories: matchedDemoMeal.calories,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    } satisfies Meal;
  }

  return null;
}

function findPackageByOrder(order: Order, packages: PackagePlan[]) {
  if (order.package_plan_id) {
    const packageById = packages.find(pkg => pkg.id === order.package_plan_id) ?? null;
    if (packageById) {
      return packageById;
    }
  }

  const normalizedPackageName = normalizeLabel(order.package);
  const sameBrandMatches = packages
    .filter(pkg => pkg.brand_id === order.brand_id)
    .map(pkg => ({ pkg, score: scorePackageNameMatch(normalizedPackageName, normalizeLabel(pkg.name)) }))
    .filter(match => match.score >= 0)
    .sort((left, right) => right.score - left.score);

  if (sameBrandMatches.length > 0) {
    return sameBrandMatches[0].pkg;
  }

  const globalMatches = packages
    .map(pkg => ({ pkg, score: scorePackageNameMatch(normalizedPackageName, normalizeLabel(pkg.name)) }))
    .filter(match => match.score >= 0)
    .sort((left, right) => right.score - left.score);

  if (globalMatches.length === 1) {
    return globalMatches[0].pkg;
  }

  if (globalMatches.length > 1 && globalMatches[0].score > globalMatches[1].score) {
    return globalMatches[0].pkg;
  }

  return null;
}

function findDemoPackageSnapshot(order: Order) {
  const normalizedPackageName = normalizeLabel(order.package);

  for (const brandName of KNOWN_DEMO_BRANDS) {
    const demoMeals = buildDemoMealsForBrand(brandName);
    const matchedDemoPackage = buildDemoPackagesForBrand(brandName)
      .map(pkg => ({ pkg, score: scorePackageNameMatch(normalizedPackageName, normalizeLabel(pkg.name)) }))
      .filter(match => match.score >= 0)
      .sort((left, right) => right.score - left.score)[0]?.pkg;

    if (matchedDemoPackage) {
      return matchedDemoPackage.mealNames.map((mealName, index) => ({
        key: `demo-snapshot-${index + 1}`,
        label: mealName,
        category: demoMeals.find(meal => meal.name === mealName)?.category ?? null,
      }));
    }
  }

  return [];
}

export function resolveOrderMeals(order: Order, meals: Meal[], packages: PackagePlan[]): ResolvedOrderMealItem[] {
  const mealsById = new Map(meals.map(meal => [meal.id, meal]));
  const packagesByBrandAndName = buildPackageLookup(packages);

  const mapSnapshotItem = (item: { key: string; label: string; category?: Meal['category'] | null }, index: number) => {
    const matchedMeal = findMealByLabel(item.label, order.brand_id, meals);

    return {
      id: matchedMeal?.id ?? item.key,
      label: matchedMeal?.name ?? item.label,
      customizationKey: item.key || `${order.id}-snapshot-${index + 1}`,
      category: matchedMeal?.category ?? item.category ?? inferCategoryFromMealLabel(item.label),
      calories: matchedMeal?.calories ?? null,
      protein: matchedMeal?.protein ?? null,
      carbs: matchedMeal?.carbs ?? null,
      fat: matchedMeal?.fat ?? null,
    } satisfies ResolvedOrderMealItem;
  };

  if (order.order_mode === 'meals') {
    const selectedMeals = order.selected_meal_ids
      .map(mealId => mealsById.get(mealId))
      .filter((meal): meal is Meal => Boolean(meal));

    if (selectedMeals.length > 0) {
      return selectedMeals.map(meal => ({
        id: meal.id,
        label: meal.name,
        customizationKey: meal.id,
        category: meal.category,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
      }));
    }

    return order.package
      .split('+')
      .map(part => part.trim())
      .filter(Boolean)
      .map((label, index) => {
        const matchedMeal = findMealByLabel(label, order.brand_id, meals);

        return {
          id: matchedMeal?.id ?? `${order.id}-meal-${index + 1}`,
          label: matchedMeal?.name ?? label,
          customizationKey: matchedMeal?.id ?? `${order.id}-meal-${index + 1}`,
          category: matchedMeal?.category ?? inferCategoryFromMealLabel(label),
          calories: matchedMeal?.calories ?? null,
          protein: matchedMeal?.protein ?? null,
          carbs: matchedMeal?.carbs ?? null,
          fat: matchedMeal?.fat ?? null,
        };
      });
  }

  if ((order.package_meal_snapshot ?? []).length > 0) {
    return (order.package_meal_snapshot ?? []).map((item, index) => mapSnapshotItem(item, index));
  }

  const demoPackageSnapshot = findDemoPackageSnapshot(order);
  if (demoPackageSnapshot.length > 0) {
    return demoPackageSnapshot.map((item, index) => mapSnapshotItem(item, index));
  }

  const matchedPackage = findPackageByOrder(order, packages)
    ?? packagesByBrandAndName.get(`${order.brand_id ?? 'unassigned'}::${normalizeLabel(order.package)}`)
    ?? null;

  if (!matchedPackage) {
    const selectedMeals = order.selected_meal_ids
      .map(mealId => mealsById.get(mealId))
      .filter((meal): meal is Meal => Boolean(meal));

    if (selectedMeals.length > 0) {
      return selectedMeals.map(meal => ({
        id: meal.id,
        label: meal.name,
        customizationKey: meal.id,
        category: meal.category,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
      }));
    }

    return order.package.includes('+')
      ? order.package
          .split('+')
          .map(part => part.trim())
          .filter(Boolean)
          .map((label, index) => {
            const matchedMeal = findMealByLabel(label, order.brand_id, meals);

            return {
              id: matchedMeal?.id ?? `${order.id}-package-fallback-${index + 1}`,
              label: matchedMeal?.name ?? label,
              customizationKey: matchedMeal?.id ?? `${order.id}-package-fallback-${index + 1}`,
              category: matchedMeal?.category ?? inferCategoryFromMealLabel(label),
              calories: matchedMeal?.calories ?? null,
              protein: matchedMeal?.protein ?? null,
              carbs: matchedMeal?.carbs ?? null,
              fat: matchedMeal?.fat ?? null,
            };
          })
      : [];
  }

  return matchedPackage.items.map((item, index) => {
    const meal = item.menu_item_id ? mealsById.get(item.menu_item_id) : findMealByLabel(item.label, order.brand_id, meals);

    return {
      id: item.id || `${order.id}-package-item-${index + 1}`,
      label: meal?.name ?? item.label,
      customizationKey: item.id || `${order.id}-package-item-${index + 1}`,
      category: meal?.category ?? inferCategoryFromMealLabel(item.label),
      calories: meal?.calories ?? null,
      protein: meal?.protein ?? null,
      carbs: meal?.carbs ?? null,
      fat: meal?.fat ?? null,
    } satisfies ResolvedOrderMealItem;
  });
}

export function getOrderMealCount(order: Order, meals: Meal[], packages: PackagePlan[]) {
  return resolveOrderMeals(order, meals, packages).length;
}

export function getOrdersMealCount(orders: Order[], meals: Meal[], packages: PackagePlan[]) {
  return orders.reduce((sum, order) => sum + getOrderMealCount(order, meals, packages), 0);
}