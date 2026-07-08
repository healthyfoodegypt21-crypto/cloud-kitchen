import { compactWhitespace } from '@/lib/utils';
import { Meal, MealInput, MenuCategory, PackagePlan, PackagePlanInput } from '@/types/menu';

const STORAGE_KEY = 'cloud_kitchen_menu_catalog';

type LocalMenuCatalog = {
  meals: Meal[];
  packages: PackagePlan[];
};

type DemoMealBlueprint = {
  name: string;
  category: MealInput['category'];
  price: number;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
};

type DemoPackageBlueprint = {
  name: string;
  days_count: number;
  price: number;
  mealNames: string[];
};

type BrandDemoProfile = {
  mealTag: string;
  packageTag: string;
  priceOffset: number;
  proteinOffset: number;
  carbsOffset: number;
  fatOffset: number;
  caloriesOffset: number;
};

const DEFAULT_BRAND_PROFILE: BrandDemoProfile = {
  mealTag: 'سيجنتشر',
  packageTag: 'سيجنتشر',
  priceOffset: 0,
  proteinOffset: 0,
  carbsOffset: 0,
  fatOffset: 0,
  caloriesOffset: 0,
};

const BRAND_DEMO_PROFILES: Record<string, BrandDemoProfile> = {
  'healthy food': {
    mealTag: 'جرين',
    packageTag: 'جرين',
    priceOffset: 0,
    proteinOffset: 0,
    carbsOffset: -1,
    fatOffset: -1,
    caloriesOffset: -10,
  },
  'healthy station': {
    mealTag: 'ستيشن',
    packageTag: 'ستيشن',
    priceOffset: 12,
    proteinOffset: 1,
    carbsOffset: 1,
    fatOffset: 0,
    caloriesOffset: 8,
  },
  'protein box': {
    mealTag: 'بوكس',
    packageTag: 'بوكس',
    priceOffset: 20,
    proteinOffset: 3,
    carbsOffset: -2,
    fatOffset: 1,
    caloriesOffset: 15,
  },
};

const BASE_DEMO_MEAL_BLUEPRINT: DemoMealBlueprint[] = [
  { name: 'ستيك مشروم', category: 'meat', price: 265, protein: 42, carbs: 24, fat: 12, calories: 405 },
  { name: 'لحم بصل مشوي', category: 'meat', price: 255, protein: 40, carbs: 18, fat: 13, calories: 390 },
  { name: 'بيف باربكيو', category: 'meat', price: 275, protein: 43, carbs: 22, fat: 14, calories: 420 },
  { name: 'كفتة دايت', category: 'meat', price: 238, protein: 37, carbs: 17, fat: 10, calories: 342 },
  { name: 'شرائح لحم مكسيكي', category: 'meat', price: 282, protein: 44, carbs: 26, fat: 12, calories: 431 },
  { name: 'لحم روزماري', category: 'meat', price: 248, protein: 39, carbs: 21, fat: 11, calories: 366 },
  { name: 'بيف بيبر صوص', category: 'meat', price: 288, protein: 45, carbs: 19, fat: 15, calories: 426 },
  { name: 'فتة لحم صحية', category: 'meat', price: 252, protein: 38, carbs: 28, fat: 10, calories: 388 },
  { name: 'بيف ستريبس خضار', category: 'meat', price: 268, protein: 41, carbs: 20, fat: 12, calories: 399 },
  { name: 'ميداليون لحم', category: 'meat', price: 295, protein: 46, carbs: 16, fat: 14, calories: 414 },
  { name: 'دجاج هيربس', category: 'chicken', price: 215, protein: 38, carbs: 22, fat: 8, calories: 318 },
  { name: 'تشيكن ترياكي', category: 'chicken', price: 225, protein: 36, carbs: 29, fat: 7, calories: 334 },
  { name: 'دجاج مشوي خضار', category: 'chicken', price: 210, protein: 35, carbs: 19, fat: 8, calories: 301 },
  { name: 'دجاج كريمة لايت', category: 'chicken', price: 232, protein: 37, carbs: 23, fat: 10, calories: 347 },
  { name: 'تشيكن بابريكا', category: 'chicken', price: 218, protein: 34, carbs: 21, fat: 9, calories: 315 },
  { name: 'دجاج ثوم وليمون', category: 'chicken', price: 220, protein: 36, carbs: 18, fat: 8, calories: 304 },
  { name: 'تشيكن مكسيكان رايس', category: 'chicken', price: 228, protein: 39, carbs: 30, fat: 7, calories: 352 },
  { name: 'دجاج سبايسي', category: 'chicken', price: 214, protein: 35, carbs: 20, fat: 9, calories: 311 },
  { name: 'تشيكن بستو', category: 'chicken', price: 236, protein: 38, carbs: 17, fat: 11, calories: 339 },
  { name: 'دجاج مدخن أرز', category: 'chicken', price: 224, protein: 37, carbs: 24, fat: 8, calories: 326 },
  { name: 'فيليه ليمون', category: 'fish', price: 245, protein: 36, carbs: 20, fat: 11, calories: 332 },
  { name: 'سالمون شبت', category: 'fish', price: 315, protein: 39, carbs: 14, fat: 16, calories: 372 },
  { name: 'فيش كاري خفيف', category: 'fish', price: 252, protein: 34, carbs: 18, fat: 10, calories: 321 },
  { name: 'تونة ستيك', category: 'fish', price: 268, protein: 41, carbs: 12, fat: 9, calories: 298 },
  { name: 'سمك مشوي هربس', category: 'fish', price: 238, protein: 35, carbs: 17, fat: 9, calories: 309 },
  { name: 'فيليه حار', category: 'fish', price: 249, protein: 36, carbs: 19, fat: 10, calories: 327 },
  { name: 'سالمون سبانخ', category: 'fish', price: 324, protein: 40, carbs: 15, fat: 17, calories: 381 },
  { name: 'سمك ليمون زبدة لايت', category: 'fish', price: 258, protein: 37, carbs: 16, fat: 12, calories: 338 },
  { name: 'فيش رايس بول', category: 'fish', price: 242, protein: 33, carbs: 27, fat: 8, calories: 334 },
  { name: 'سي باس مشوي', category: 'fish', price: 298, protein: 38, carbs: 13, fat: 14, calories: 349 },
  { name: 'ميكس جريل رايس', category: 'mix', price: 235, protein: 40, carbs: 31, fat: 9, calories: 377 },
  { name: 'ميكس بروتين بول', category: 'mix', price: 248, protein: 42, carbs: 26, fat: 10, calories: 368 },
  { name: 'شاورما ميكس صحية', category: 'mix', price: 258, protein: 39, carbs: 28, fat: 11, calories: 379 },
  { name: 'ميكس فاهيتا', category: 'mix', price: 246, protein: 38, carbs: 24, fat: 10, calories: 351 },
  { name: 'ميكس مدخن', category: 'mix', price: 262, protein: 43, carbs: 20, fat: 12, calories: 364 },
  { name: 'ميكس كينوا', category: 'mix', price: 255, protein: 37, carbs: 29, fat: 9, calories: 359 },
  { name: 'ميكس مشروم كريم لايت', category: 'mix', price: 266, protein: 41, carbs: 22, fat: 12, calories: 372 },
  { name: 'ميكس سبايسي رايس', category: 'mix', price: 244, protein: 39, carbs: 30, fat: 8, calories: 361 },
  { name: 'ميكس بطاطس فرنش لايت', category: 'mix', price: 252, protein: 40, carbs: 27, fat: 10, calories: 374 },
  { name: 'ميكس تكا', category: 'mix', price: 260, protein: 42, carbs: 23, fat: 11, calories: 367 },
  { name: 'سلطة سيزر دايت', category: 'salad', price: 115, protein: 14, carbs: 11, fat: 8, calories: 172 },
  { name: 'سلطة كينوا جاردن', category: 'salad', price: 122, protein: 9, carbs: 18, fat: 6, calories: 161 },
  { name: 'سناكس بروتين بار', category: 'snacks', price: 78, protein: 12, carbs: 14, fat: 5, calories: 149 },
  { name: 'سناكس تشيكن راب لايت', category: 'snacks', price: 96, protein: 16, carbs: 17, fat: 4, calories: 168 },
];

const BASE_DEMO_PACKAGE_BLUEPRINT: DemoPackageBlueprint[] = [
  {
    name: 'باقة ستارت 5 أيام',
    days_count: 5,
    price: 1099,
    mealNames: ['ستيك مشروم', 'دجاج هيربس', 'فيليه ليمون', 'ميكس جريل رايس', 'تشيكن ترياكي'],
  },
  {
    name: 'باقة توازن أسبوعية',
    days_count: 7,
    price: 1499,
    mealNames: ['لحم بصل مشوي', 'دجاج مشوي خضار', 'سالمون شبت', 'ميكس بروتين بول', 'كفتة دايت', 'تشيكن بابريكا', 'فيش كاري خفيف'],
  },
  {
    name: 'باقة هاي بروتين 10 أيام',
    days_count: 10,
    price: 2099,
    mealNames: ['بيف باربكيو', 'شرائح لحم مكسيكي', 'دجاج كريمة لايت', 'تشيكن مكسيكان رايس', 'تونة ستيك', 'سالمون سبانخ', 'ميكس مدخن', 'ميكس كينوا', 'بيف ستريبس خضار', 'تشيكن بستو'],
  },
  {
    name: 'باقة فورمة 14 يوم',
    days_count: 14,
    price: 2799,
    mealNames: ['لحم روزماري', 'بيف بيبر صوص', 'فتة لحم صحية', 'دجاج ثوم وليمون', 'دجاج سبايسي', 'دجاج مدخن أرز', 'سمك مشوي هربس', 'فيليه حار', 'سمك ليمون زبدة لايت', 'فيش رايس بول', 'ميكس فاهيتا', 'ميكس مشروم كريم لايت', 'ميكس سبايسي رايس', 'ميكس تكا'],
  },
  {
    name: 'باقة التحدي 20 يوم',
    days_count: 20,
    price: 3899,
    mealNames: [
      'ميداليون لحم', 'ستيك مشروم', 'بيف باربكيو', 'كفتة دايت', 'شرائح لحم مكسيكي',
      'دجاج هيربس', 'تشيكن ترياكي', 'دجاج مشوي خضار', 'تشيكن بابريكا', 'تشيكن بستو',
      'فيليه ليمون', 'سالمون شبت', 'تونة ستيك', 'سمك مشوي هربس', 'سي باس مشوي',
      'ميكس جريل رايس', 'ميكس بروتين بول', 'ميكس مدخن', 'ميكس كينوا', 'ميكس تكا',
    ],
  },
];

export const DEMO_EXPECTED_COUNTS = {
  mealsByCategory: {
    meat: 10,
    chicken: 10,
    fish: 10,
    mix: 10,
    salad: 2,
    snacks: 2,
  } satisfies Record<MenuCategory, number>,
  totalMeals: 44,
  totalPackages: 5,
} as const;

function normalizeBrandName(brandName: string) {
  return compactWhitespace(brandName).toLowerCase();
}

function resolveBrandDemoProfile(brandName: string) {
  return BRAND_DEMO_PROFILES[normalizeBrandName(brandName)] ?? DEFAULT_BRAND_PROFILE;
}

export function buildDemoMealsForBrand(brandName: string): DemoMealBlueprint[] {
  const profile = resolveBrandDemoProfile(brandName);

  return BASE_DEMO_MEAL_BLUEPRINT.map((meal) => ({
    ...meal,
    name: `${meal.name} ${profile.mealTag}`,
    price: meal.price + profile.priceOffset,
    protein: meal.protein + profile.proteinOffset,
    carbs: Math.max(0, meal.carbs + profile.carbsOffset),
    fat: Math.max(0, meal.fat + profile.fatOffset),
    calories: Math.max(0, meal.calories + profile.caloriesOffset),
  }));
}

export function buildDemoPackagesForBrand(brandName: string): DemoPackageBlueprint[] {
  const profile = resolveBrandDemoProfile(brandName);

  return BASE_DEMO_PACKAGE_BLUEPRINT.map((pkg) => ({
    ...pkg,
    name: `${pkg.name} ${profile.packageTag}`,
    price: pkg.price + (profile.priceOffset * pkg.days_count),
    mealNames: pkg.mealNames.map((mealName) => `${mealName} ${profile.mealTag}`),
  }));
}

function getLegacyDemoMealNamesForBrand(brandName: string) {
  return new Set([
    ...BASE_DEMO_MEAL_BLUEPRINT.map((meal) => meal.name),
    ...buildDemoMealsForBrand(brandName).map((meal) => meal.name),
  ]);
}

function getLegacyDemoPackageNamesForBrand(brandName: string) {
  return new Set([
    ...BASE_DEMO_PACKAGE_BLUEPRINT.map((pkg) => pkg.name),
    ...buildDemoPackagesForBrand(brandName).map((pkg) => pkg.name),
    `باقة تجربة ${compactWhitespace(brandName)}`,
  ]);
}

export function isBrandCatalogComplete(meals: Meal[], packages: PackagePlan[]) {
  const counts = meals.reduce((accumulator, meal) => {
    accumulator[meal.category] += 1;
    return accumulator;
  }, {
    meat: 0,
    chicken: 0,
    fish: 0,
    mix: 0,
    salad: 0,
    snacks: 0,
  } satisfies Record<MenuCategory, number>);

  return Object.entries(DEMO_EXPECTED_COUNTS.mealsByCategory).every(([category, expectedCount]) => {
    return counts[category as MenuCategory] >= expectedCount;
  }) && packages.length >= DEMO_EXPECTED_COUNTS.totalPackages;
}

function generateLocalId(prefix: 'meal' | 'pkg' | 'pkg-item') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortMeals(meals: Meal[]) {
  return [...meals].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function sortPackages(packages: PackagePlan[]) {
  return [...packages].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function saveCatalog(catalog: LocalMenuCatalog) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
}

export function getLocalMenuCatalog(): LocalMenuCatalog {
  const rawValue = localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return { meals: [], packages: [] };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<LocalMenuCatalog>;
    return {
      meals: Array.isArray(parsed.meals) ? parsed.meals : [],
      packages: Array.isArray(parsed.packages) ? parsed.packages : [],
    };
  } catch {
    return { meals: [], packages: [] };
  }
}

export function upsertLocalMeal(input: MealInput) {
  const catalog = getLocalMenuCatalog();
  const now = new Date().toISOString();
  const existing = input.id ? catalog.meals.find((meal) => meal.id === input.id) : null;
  const meal: Meal = {
    id: input.id ?? generateLocalId('meal'),
    brand_id: input.brand_id,
    name: compactWhitespace(input.name),
    category: input.category,
    price: input.price,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    calories: input.calories,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  const meals = sortMeals([...catalog.meals.filter((item) => item.id !== meal.id), meal]);
  const packages = sortPackages(catalog.packages.map((pkg) => ({
    ...pkg,
    items: pkg.items.map((item) => item.menu_item_id === meal.id
      ? { ...item, label: meal.name, source: 'menu' as const }
      : item),
  })));

  saveCatalog({ meals, packages });
  return { meal, meals, packages };
}

export function deleteLocalMeal(mealId: string) {
  const catalog = getLocalMenuCatalog();
  const meals = sortMeals(catalog.meals.filter((meal) => meal.id !== mealId));
  const packages = sortPackages(catalog.packages.map((pkg) => ({
    ...pkg,
    items: pkg.items
      .filter((item) => item.menu_item_id !== mealId)
      .map((item, index) => ({ ...item, display_order: index })),
  })));

  saveCatalog({ meals, packages });
  return { meals, packages };
}

export function upsertLocalPackage(input: PackagePlanInput, meals: Meal[]) {
  const catalog = getLocalMenuCatalog();
  const now = new Date().toISOString();
  const existing = input.id ? catalog.packages.find((pkg) => pkg.id === input.id) : null;
  const mealMap = new Map(meals.map((meal) => [meal.id, meal]));

  const nextPackage: PackagePlan = {
    id: input.id ?? generateLocalId('pkg'),
    brand_id: input.brand_id,
    name: compactWhitespace(input.name),
    days_count: input.days_count,
    price: input.price,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    items: input.items.map((item, index) => {
      const linkedMeal = item.menu_item_id ? mealMap.get(item.menu_item_id) : null;
      const customMealName = item.custom_meal_name ? compactWhitespace(item.custom_meal_name) : null;

      return {
        id: existing?.items[index]?.id ?? generateLocalId('pkg-item'),
        menu_item_id: item.menu_item_id ?? null,
        custom_meal_name: linkedMeal ? null : customMealName,
        display_order: index,
        label: linkedMeal?.name ?? customMealName ?? 'وجبة',
        source: linkedMeal ? 'menu' as const : 'custom' as const,
      };
    }),
  };

  const packages = sortPackages([...catalog.packages.filter((pkg) => pkg.id !== nextPackage.id), nextPackage]);
  saveCatalog({ meals: catalog.meals, packages });
  return { pkg: nextPackage, meals: catalog.meals, packages };
}

export function deleteLocalPackage(packageId: string) {
  const catalog = getLocalMenuCatalog();
  const packages = sortPackages(catalog.packages.filter((pkg) => pkg.id !== packageId));
  saveCatalog({ meals: catalog.meals, packages });
  return { meals: catalog.meals, packages };
}

export function seedLocalDemoCatalog(brandId: string, brandName: string) {
  const catalog = getLocalMenuCatalog();
  const now = new Date().toISOString();
  const demoMealsBlueprint = buildDemoMealsForBrand(brandName);
  const demoPackagesBlueprint = buildDemoPackagesForBrand(brandName);
  const mealNames = getLegacyDemoMealNamesForBrand(brandName);
  const packageNames = getLegacyDemoPackageNamesForBrand(brandName);

  const nextMeals = catalog.meals.filter((meal) => {
    return !(meal.brand_id === brandId && mealNames.has(meal.name));
  });

  const createdMeals: Meal[] = demoMealsBlueprint.map((item) => ({
    id: generateLocalId('meal'),
    brand_id: brandId,
    name: item.name,
    category: item.category,
    price: item.price,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    calories: item.calories,
    created_at: now,
    updated_at: now,
  }));

  const meals = sortMeals([...nextMeals, ...createdMeals]);
  const mealMap = new Map(createdMeals.map((meal) => [meal.name, meal]));
  const packages = sortPackages([
    ...catalog.packages.filter((pkg) => !(pkg.brand_id === brandId && packageNames.has(pkg.name))),
    ...demoPackagesBlueprint.map((pkg) => ({
      id: generateLocalId('pkg'),
      brand_id: brandId,
      name: pkg.name,
      days_count: pkg.days_count,
      price: pkg.price,
      created_at: now,
      updated_at: now,
      items: pkg.mealNames
        .map((mealName, index) => {
          const meal = mealMap.get(mealName);
          if (!meal) {
            return null;
          }

          return {
            id: generateLocalId('pkg-item'),
            menu_item_id: meal.id,
            custom_meal_name: null,
            display_order: index,
            label: meal.name,
            source: 'menu' as const,
          };
        })
        .filter(Boolean) as PackagePlan['items'],
    })),
  ]);

  saveCatalog({ meals, packages });
  return { meals, packages, createdMealsCount: createdMeals.length, createdPackagesCount: demoPackagesBlueprint.length };
}