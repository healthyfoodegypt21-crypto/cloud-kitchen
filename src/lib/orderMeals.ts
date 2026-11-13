import { buildDemoMealsForBrand, buildDemoPackagesForBrand } from '@/store/menuCatalog';
import { Meal, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

const KNOWN_DEMO_BRANDS = ['Healthy Food', 'Healthy Station', 'Protein Box'];

export interface ResolvedOrderMealItem {
  id: string;
  label: string;
  customizationKey: string;
  instruction?: string;
  category: Meal['category'] | null;
  customCategory?: string;
  description?: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

function normalizeLabel(value: string) {
  return value
    .replace(/^\*+\s*/u, '')
    .replace(/\(\s+/gu, '(')
    .replace(/\s+\)/gu, ')')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ar');
}

function normalizeOrderPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const localDigits = digits.startsWith('0020')
    ? digits.slice(4)
    : digits.startsWith('20') && digits.length === 12
      ? digits.slice(2)
      : digits;
  return /^1\d{9}$/.test(localDigits) ? `0${localDigits}` : localDigits;
}

export function parseMealLabelAndInstruction(rawLabel: string): { label: string; instruction?: string } {
  const trimmed = rawLabel.trim();
  if (!trimmed) {
    return { label: '' };
  }

  if (/\r?\n/u.test(trimmed)) {
    const lines = trimmed
      .split(/\r?\n/u)
      .map(line => line.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    const label = (lines[0] ?? '').replace(/^\*+\s*/u, '').trim();
    const instruction = lines.slice(1).join(' - ').trim();
    return { label, ...(instruction ? { instruction } : {}) };
  }

  const separatorMatch = trimmed.match(/^(.*?)\s+—\s+(.+)$/u);
  if (separatorMatch) {
    const label = separatorMatch[1].replace(/^\*+\s*/u, '').trim().replace(/\s+/g, ' ');
    const instruction = separatorMatch[2].trim().replace(/\s+/g, ' ');
    return { label, ...(instruction ? { instruction } : {}) };
  }

  return { label: trimmed.replace(/^\*+\s*/u, '').trim().replace(/\s+/g, ' ') };
}

const RECOVERED_SHEET_MEALS_BY_PHONE: Record<string, string[]> = {
  '01091440346': [
    'Marbella meatballs — تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة',
    'كبدة مكرونة صوص أحمر — تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة',
    'كبدة مكرونة صوص أحمر — تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة',
    'Chicken lemon sauce — تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة',
    'Chicken lemon sauce — تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة',
    'Shawarma chicken — تقليل الزيت - الخضار السوتيه في طبق منفرد خارج الوجبة',
  ],
  '01111011894': [
    'Grilled chicken',
    'oats . nuts . yogurt. honey',
    'cup cake',
    'Fruit Salad',
    'tuna salad',
  ],
  '01288979597': [
    'Russian beef',
    'chicken shish taouk',
  ],
  '01066612162': [
    'Beef shawarma',
    'Russian beef',
    'chicken piccata',
    'chicken shish taouk',
    'Grilled chicken',
    'chicken veggie',
    'Fruit Salad',
  ],
  '01151869330': [
    'Beef shawarma',
    'Russian beef',
    'chicken piccata',
    'chicken shish taouk',
    'Grilled chicken',
    'chicken veggie',
    'Fruit Salad',
  ],
  '01155581855': [
    'Beef shawarma',
    'Russian beef',
    'chicken piccata',
    'chicken shish taouk',
    'Grilled chicken',
    'chicken veggie',
    'Fruit Salad',
  ],
  '01097092441': [
    'Beef shawarma',
    'Russian beef',
    'chicken piccata',
    'chicken shish taouk',
    'Grilled chicken',
    'chicken veggie',
    'Fruit Salad',
  ],
  '01008546572': [
    'Shish kabab',
    'Shish kabab',
    'Oriental kofta',
    'Oriental kofta',
    'Beef chipotle',
    'Beef chipotle',
    'Beef stroganoff',
    'Beef stroganoff',
    'Chicken cashew',
    'Chicken cashew',
    'Almond teriyaki chicken',
    'Almond teriyaki chicken',
    'Mexican chicken',
    'Mexican chicken',
    'Stuffed grilled chicken',
    'Stuffed grilled chicken',
    'Four beans salad ( L )',
  ],
  '01005073772': [
    'Almond teriyaki chicken',
    'Chicken Alfredo',
    'Chicken Alfredo',
    'Herb grilled chicken',
    'Almond meat ball',
    'Beef and vegetable',
    'Beef chipotle',
    'Beef stroganoff',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
  ],
  '01097660718': [
    'Stuffed grilled chicken',
    'Hawaiian Chicken',
    'Almond Teriyaki Chicken',
    'Chicken Alfredo',
    'Chicken Blackend',
    'Blue Cheese Salad ( S )',
  ],
  '01050404294': [
    'Grilled calamari',
    'Shrimp and carb',
    'Grilled seafood',
    'Shish kabab',
    'Oriental kofta',
    'Chicken Alfredo',
    'Almond teriyaki chicken',
    'Chocolate cupcakes',
    'Chocolate cupcakes',
    'Chocolate cupcakes',
    'Chocolate cupcakes',
    'Chocolate cupcakes',
    'Chocolate cupcakes',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
    'Chicken mini pizza',
  ],
  '01142659047': [
    'Shish kabab',
    'Chicken alfredo',
    'Chicken shish taouk',
    'Cashew chicken',
    'Dill lemon fish',
    'Chicken piccata',
    'Mix grilled',
    'Protein Box',
    'Mexican Chicken',
    'Beef and vegetables',
    'chicken caeser salad ( S )',
    'chicken caeser salad ( S )',
    'Green salad ( S )',
    'Greek Salad ( S )',
    'Four beans salad ( L )',
  ],
  '01016592603': [
    'Shish kabab',
    'Chicken alfredo',
    'Chicken shish taouk',
    'Cashew chicken',
    'Dill lemon fish',
    'Chicken piccata',
    'Mix grilled',
    'chicken caeser salad ( S )',
    'Green salad ( S )',
    'Greek Salad ( S )',
    'Mexican Chicken — ( protein box plus )',
    'Beef Steak — ( protein box plus )',
    'Stuffed grilled chicken — ( protein box plus )',
    'Mix Sea Food — ( protein box plus )',
    'Chicken Shawarma — ( protein box plus )',
  ],
  '01240911908': [
    'Mexican Chicken — ( protein box plus )',
    'Beef Steak — ( protein box plus )',
    'Stuffed grilled chicken — ( protein box plus )',
    'Mix Sea Food — ( protein box plus )',
    'Chicken Shawarma — ( protein box plus )',
  ],
  '01286500789': [
    'Mexican Chicken — ( protein box plus )',
    'Beef Steak — ( protein box plus )',
    'Stuffed grilled chicken — ( protein box plus )',
    'Mix Sea Food — ( protein box plus )',
    'Chicken Shawarma — ( protein box plus )',
  ],
  '01299982637': [
    'Chicken tandoori — Raw and frozen',
    'Chicken shish tawook — Raw and frozen',
    'Chicken shawarma — Raw and frozen',
    'Chicken Burger — Raw and frozen',
    'Chicken herb — Raw and frozen',
    'Mexican chicken — Raw and frozen',
    'Sweet and sour chicken — Raw and frozen',
    'Steak with herbs — Raw and frozen',
    'Kofta — Raw and frozen',
    'Beef shawarma — Raw and frozen',
    'Beef Burger — Raw and frozen',
    'Beef kebab — Raw and frozen',
    'Beef BBQ — Raw and frozen',
    'Beef sriracha — Raw and frozen',
  ],
  '01126818256': [
    'Mexican Chicken — ( protein box plus )',
    'Beef Steak — ( protein box plus )',
    'Beef Steak — ( protein box plus )',
    'Stuffed grilled chicken — ( protein box plus )',
    'Chicken Shawarma — ( protein box plus )',
  ],
  '01222217139': [
    'Mexican Chicken — ( protein box plus )',
    'Mexican Chicken — ( protein box plus )',
    'Mexican Chicken — ( protein box plus )',
    'Beef Steak — ( protein box plus )',
    'Beef Steak — ( protein box plus )',
  ],
  '01112004754': [
    'Shish kabab',
    'Chicken alfredo',
    'Chicken shish taouk',
    'Cashew chicken',
    'Dill lemon fish',
    'Chicken piccata',
    'Mix grilled',
    'chicken caeser salad ( S )',
    'Green salad ( S )',
    'Greek Salad ( S )',
  ],
  '01007560984': [
    'Chicken tandoori — Raw and frozen',
    'Chicken shish tawook — Raw and frozen',
    'Chicken shawarma — Raw and frozen',
    'Chicken Burger — Raw and frozen',
    'Chicken herb — Raw and frozen',
    'Mexican chicken — Raw and frozen',
    'Sweet and sour chicken — Raw and frozen',
    'Steak with herbs — Raw and frozen',
    'Kofta — Raw and frozen',
    'Beef shawarma — Raw and frozen',
    'Beef Burger — Raw and frozen',
    'Beef kebab — Raw and frozen',
    'Beef BBQ — Raw and frozen',
    'Beef sriracha — Raw and frozen',
  ],
  '01096072216': [
    'Shish kabab — كل حاجه تكون منفصله الكارب منفصل لوحده والخضار منفصل لوحده والبروتين منفصل لوحده - الخضار يكون جزر فقط',
    'Chicken alfredo — كل حاجه تكون منفصله الكارب منفصل لوحده والخضار منفصل لوحده والبروتين منفصل لوحده - الخضار يكون جزر فقط',
    'Chicken shish taouk — كل حاجه تكون منفصله الكارب منفصل لوحده والخضار منفصل لوحده والبروتين منفصل لوحده - الخضار يكون جزر فقط',
    'Cashew chicken — كل حاجه تكون منفصله الكارب منفصل لوحده والخضار منفصل لوحده والبروتين منفصل لوحده - الخضار يكون جزر فقط',
    'Dill lemon fish — كل حاجه تكون منفصله الكارب منفصل لوحده والخضار منفصل لوحده والبروتين منفصل لوحده - الخضار يكون جزر فقط',
    'Chicken piccata — كل حاجه تكون منفصله الكارب منفصل لوحده والخضار منفصل لوحده والبروتين منفصل لوحده - الخضار يكون جزر فقط',
    'Mix grilled — كل حاجه تكون منفصله الكارب منفصل لوحده والخضار منفصل لوحده والبروتين منفصل لوحده - الخضار يكون جزر فقط',
    'chicken caeser salad ( S )',
    'Green salad ( S )',
    'Greek Salad ( S )',
  ],
  '01221973925': [
    'Shish kabab',
    'Chicken alfredo',
    'Chicken shish taouk',
    'Cashew chicken',
    'Dill lemon fish',
    'Chicken piccata',
    'Mix grilled',
    'chicken caeser salad ( S )',
    'Green salad ( S )',
    'Greek Salad ( S )',
  ],
  '01106206727': [
    'meatball+125g protein — بروتين 84,5 جم بروتين . كارب 66جم . دهون 67,5 جم سعر حراري 375 وحبه اساسيه',
    'Greek salad ( L )',
    'Chicken mini pizza',
  ],
  '01000252654': [
    'الواجبه الاولى ( عبارة عن ١٠٠جرام رز بسمتى صافى بعد التسوية +٢٠٠جرام استيك مشوى )',
    'chicken ceasar salad',
  ],
  '01271320535': [
    'Beef shawarma',
    'Russian beef',
    'chicken piccata',
    'chicken shish taouk',
    'Grilled chicken',
    'chicken veggie',
    'fruit salad',
  ],
  '01095868305': [
    'Beef shawarma',
    'Russian beef',
    'Grilled chicken',
    'chicken veggie',
    'fruit salad',
  ],
  '01003574100': [
    'chicken fettuccine',
    'italian chicken',
    'BBQ',
    'steak tejano',
    'shish kebab',
    'chicken shawarma',
    'fruit salad',
  ],
  '01007247405': [
    'Beef shawarma',
    'Russian beef',
    'chicken piccata',
    'chicken shish taouk',
    'Grilled chicken',
    'chicken veggie',
    'fruit salad',
  ],
};

function isOrderTypeOrPackageLabel(detail: string, orderPackage: string) {
  const normalized = normalizeLabel(detail);
  if (!normalized) return true;
  if (normalized === normalizeLabel(orderPackage)) return true;
  return /^(?:weekly|week|monthly|daily|وجبات من المنيو|باكدج.*|باقة.*|package.*)$/iu.test(normalized);
}

export function getRecoveredSheetMealsForPhone(phone: string): string[] | null {
  const normalized = normalizeOrderPhone(phone);
  return RECOVERED_SHEET_MEALS_BY_PHONE[normalized] ?? null;
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

  if (/(سلطة|سلطه|سالاد|سيزر|فتوش|تبولة|تبوله|كينوا جاردن|salad|caesar|caeser)/i.test(normalizedMealLabel)) {
    return 'salad';
  }

  if (/(سناكس|سناك|بار|راب|بايتس|ميني ساندوتش|تشيبس|cup\s*cake|cupcake|oats|mini\s*pizza)/i.test(normalizedMealLabel)) {
    return 'snacks';
  }

  if (/(سمك|سالمون|فيش|تونة|سي باس|fish|salmon|tuna|shrimp|calamari|seafood|sea\s*food)/i.test(normalizedMealLabel)) {
    return 'fish';
  }

  if (/(دجاج|تشيكن|فراخ|chicken|shish\s*taouk|shish\s*tawook|piccata|fettuccine|teriyaki|alfredo|tandoori)/i.test(normalizedMealLabel)) {
    return 'chicken';
  }

  if (/(لحم|بيف|ستيك|استيك|كفتة|كفته|كبدة|كبده|ميداليون|beef|steak|kofta|meat\s*ball|meatball|kabab|kebab)/i.test(normalizedMealLabel)) {
    return 'meat';
  }

  if (/(ميكس|شاورما|mix|bbq|protein\s*box)/i.test(normalizedMealLabel)) {
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

export function getImportedMealDetails(order: Order) {
  if ((order.imported_meal_details ?? []).length > 0) {
    return order.imported_meal_details ?? [];
  }

  const detailsLine = order.notes.match(/(?:^|\n| - )تفاصيل(?:\s+الطلب\s+المستوردة|\s*الشيت)\s*:\s*(.*?)(?=\s+-\s+رسوم التوصيل\s*:|\n|$)/u)?.[1] ?? '';
  if (!detailsLine) return [];

  if (detailsLine.includes('|')) {
    return detailsLine.split(/\s*\|\s*/u).map(item => item.trim()).filter(Boolean);
  }

  return detailsLine.split(/\s*،\s*/u).map(item => item.trim()).filter(Boolean);
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
      ...(matchedMeal?.custom_category ? { customCategory: matchedMeal.custom_category } : {}),
      ...(matchedMeal?.description ? { description: matchedMeal.description } : {}),
      calories: matchedMeal?.calories ?? null,
      protein: matchedMeal?.protein ?? null,
      carbs: matchedMeal?.carbs ?? null,
      fat: matchedMeal?.fat ?? null,
    } satisfies ResolvedOrderMealItem;
  };

  const importedMealDetails = getImportedMealDetails(order);
  const mapImportedMeal = (rawLabel: string, index: number) => {
    const parsed = parseMealLabelAndInstruction(rawLabel);
    const label = parsed.label || rawLabel.trim();
    const exactMealMatch = meals.find(
      meal => (meal.brand_id === order.brand_id || !order.brand_id) && normalizeLabel(meal.name) === normalizeLabel(label),
    ) ?? meals.find(meal => normalizeLabel(meal.name) === normalizeLabel(label)) ?? null;

    return {
      id: exactMealMatch?.id ?? `${order.id}-imported-meal-${index + 1}`,
      label: exactMealMatch?.name ?? label,
      customizationKey: exactMealMatch?.id ?? `${order.id}-imported-meal-${index + 1}`,
      ...(parsed.instruction ? { instruction: parsed.instruction } : {}),
      category: exactMealMatch?.category ?? inferCategoryFromMealLabel(label),
      ...(exactMealMatch?.custom_category ? { customCategory: exactMealMatch.custom_category } : {}),
      ...(exactMealMatch?.description ? { description: exactMealMatch.description } : {}),
      calories: exactMealMatch?.calories ?? null,
      protein: exactMealMatch?.protein ?? null,
      carbs: exactMealMatch?.carbs ?? null,
      fat: exactMealMatch?.fat ?? null,
    } satisfies ResolvedOrderMealItem;
  };

  // Some import sheets repeat the package name itself in the meals column; that
  // value is not a dish, so resolve the package's actual meals instead.
  const actualImportedMeals = importedMealDetails.filter(
    detail => !isOrderTypeOrPackageLabel(detail, order.package),
  );

  if (actualImportedMeals.length > 0) {
    return actualImportedMeals.map(mapImportedMeal);
  }

  const recoveredSheetMeals = getRecoveredSheetMealsForPhone(order.phone);
  if (recoveredSheetMeals && recoveredSheetMeals.length > 0) {
    return recoveredSheetMeals.map(mapImportedMeal);
  }

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
        ...(meal.custom_category ? { customCategory: meal.custom_category } : {}),
        ...(meal.description ? { description: meal.description } : {}),
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
          ...(matchedMeal?.custom_category ? { customCategory: matchedMeal.custom_category } : {}),
          ...(matchedMeal?.description ? { description: matchedMeal.description } : {}),
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
        ...(meal.custom_category ? { customCategory: meal.custom_category } : {}),
        ...(meal.description ? { description: meal.description } : {}),
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
      }));
    }

    if (order.package.includes('+')) {
      return order.package
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
            ...(matchedMeal?.custom_category ? { customCategory: matchedMeal.custom_category } : {}),
            ...(matchedMeal?.description ? { description: matchedMeal.description } : {}),
            calories: matchedMeal?.calories ?? null,
            protein: matchedMeal?.protein ?? null,
            carbs: matchedMeal?.carbs ?? null,
            fat: matchedMeal?.fat ?? null,
          };
        });
    }

    // No catalog package matched: keep the raw imported details (even when they
    // only name the package) so the kitchen still sees the required quantity.
    return importedMealDetails.map(mapImportedMeal);
  }

  return matchedPackage.items.map((item, index) => {
    const meal = item.menu_item_id ? mealsById.get(item.menu_item_id) : findMealByLabel(item.label, order.brand_id, meals);

    return {
      id: item.id || `${order.id}-package-item-${index + 1}`,
      label: meal?.name ?? item.label,
      customizationKey: item.id || `${order.id}-package-item-${index + 1}`,
      category: meal?.category ?? inferCategoryFromMealLabel(item.label),
      ...(meal?.custom_category ? { customCategory: meal.custom_category } : {}),
      ...(meal?.description ? { description: meal.description } : {}),
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