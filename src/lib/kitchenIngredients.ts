import { Brand } from '@/hooks/useBrands';
import { getRecoveredSheetMealsForPhone, resolveOrderMeals } from '@/lib/orderMeals';
import {
  compareKitchenMealLabels,
  KITCHEN_CATEGORY_LABELS,
  KitchenCategory,
  resolveKitchenMealCategory,
} from '@/lib/kitchen';
import { compactWhitespace } from '@/lib/utils';
import { Meal, MealIngredientSnapshot, PackagePlan } from '@/types/menu';
import { Order } from '@/types/order';

export type IngredientStation = 'carb' | 'protein' | 'vegetable' | 'other';

export const INGREDIENT_STATION_LABELS: Record<IngredientStation, string> = {
  carb: 'النشويات والكارب',
  protein: 'البروتينات',
  vegetable: 'الخضراوات والسلطات',
  other: 'مكونات أخرى',
};

export const INGREDIENT_STATION_ORDER: IngredientStation[] = [
  'carb',
  'protein',
  'vegetable',
  'other',
];

export interface StandardIngredientWeight {
  beforeGrams: number;
  afterGrams: number;
  station: IngredientStation;
}

export type CustomPortionWeightsMap = Record<
  string,
  { beforeGrams: number; afterGrams: number }
>;

export type SmartAdjustmentKind = 'exclude' | 'substitute' | 'multiply' | 'add' | 'override_grams';

export interface AppliedSmartAdjustment {
  id: string;
  kind: SmartAdjustmentKind;
  brandId: string | null;
  brandName: string;
  orderNumber: string;
  customerName: string;
  mealLabel: string;
  rawInstruction: string;
  summary: string;
  removedIngredientKey?: string;
  removedIngredientName?: string;
  addedIngredientKey?: string;
  addedIngredientName?: string;
  multiplier?: number;
}

export interface IngredientBrandBreakdown {
  brandId: string;
  brandName: string;
  portionCount: number;
  orderCount: number;
  weightBeforeGrams: number;
  weightAfterGrams: number;
}

export interface IngredientMealContribution {
  mealKey: string;
  mealLabel: string;
  category: KitchenCategory;
  portionCount: number;
  weightBeforeGrams: number;
  weightAfterGrams: number;
}

export interface AggregatedIngredientItem {
  key: string;
  name: string;
  station: IngredientStation;
  portionCount: number;
  basePortionCount: number;
  removedPortionCount: number;
  addedBySubstitutionCount: number;
  extraPortionCount: number;
  orderCount: number;
  weightBeforeGrams: number;
  weightAfterGrams: number;
  unitBeforeGrams: number;
  unitAfterGrams: number;
  usesDefaultWeights: boolean;
  byBrand: Record<string, IngredientBrandBreakdown>;
  meals: IngredientMealContribution[];
  adjustments: AppliedSmartAdjustment[];
}

export interface BrandIngredientsSummary {
  brandKey: string;
  brandId: string | null;
  brandName: string;
  orderCount: number;
  cookedMealCount: number;
  frozenExcludedMealCount: number;
  totalWeightBeforeGrams: number;
  totalWeightAfterGrams: number;
  items: AggregatedIngredientItem[];
  adjustments: AppliedSmartAdjustment[];
}

export interface KitchenIngredientsReport {
  date: string;
  brands: Array<{ id: string; name: string; orderCount: number; cookedMealCount: number }>;
  combined: BrandIngredientsSummary;
  byBrand: Record<string, BrandIngredientsSummary>;
}

const PORTION_WEIGHTS_STORAGE_KEY = 'cloud_kitchen_standard_portion_weights_v1';

export function loadCustomPortionWeights(): CustomPortionWeightsMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PORTION_WEIGHTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: CustomPortionWeightsMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (val && typeof val === 'object') {
        const rec = val as Record<string, unknown>;
        const beforeGrams = Number(rec.beforeGrams);
        const afterGrams = Number(rec.afterGrams);
        if (Number.isFinite(beforeGrams) && beforeGrams >= 0 && Number.isFinite(afterGrams) && afterGrams >= 0) {
          result[key] = { beforeGrams, afterGrams };
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveCustomPortionWeights(weights: CustomPortionWeightsMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PORTION_WEIGHTS_STORAGE_KEY, JSON.stringify(weights));
  } catch {
    // Ignore storage quota errors
  }
}

function normalizeArabicText(value: string): string {
  return compactWhitespace(
    value
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/gu, '')
      .replace(/[أإآٱ]/gu, 'ا')
      .replace(/ة/gu, 'ه')
      .replace(/ى/gu, 'ي')
      .replace(/ؤ/gu, 'و')
      .replace(/ئ/gu, 'ي'),
  );
}

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩]/gu, (ch) => String(ARABIC_INDIC_DIGITS.indexOf(ch)));
}

type CanonicalIngredientProfile = {
  key: string;
  displayName: string;
  station: IngredientStation;
  beforeGrams: number;
  afterGrams: number;
  aliases: RegExp[];
};

const CANONICAL_INGREDIENT_PROFILES: CanonicalIngredientProfile[] = [
  // Carbs
  {
    key: 'rice',
    displayName: 'أرز بسمتي',
    station: 'carb',
    beforeGrams: 60,
    afterGrams: 150,
    aliases: [
      /^(?:ال)?(?:ارز|رز)(?:\s+(?:ال)?(?:بسمتي|ابيض|مسلوق|مبهر|مكسيكي))?$/u,
      /^(?:basmati\s+)?rice$/iu,
      /^white\s+rice$/iu,
    ],
  },
  {
    key: 'potato_wedges',
    displayName: 'بطاطس ويدجيز',
    station: 'carb',
    beforeGrams: 180,
    afterGrams: 150,
    aliases: [
      /^(?:ال)?بطاطس\s*(?:ال)?(?:ويدجيز|ويدجز|ودجز|ودجيز|فرن|مشويه|صحيه)$/u,
      /^(?:ال)?(?:ويدجيز|ويدجز|ودجز)$/u,
      /^(?:potato\s+)?wedges$/iu,
    ],
  },
  {
    key: 'potato',
    displayName: 'بطاطس',
    station: 'carb',
    beforeGrams: 180,
    afterGrams: 150,
    aliases: [
      /^(?:ال)?بطاطس(?:\s+(?:ال)?(?:مسلوقه|مهروسه|بيوريه|ماش))?$/u,
      /^(?:mashed\s+|baked\s+|boiled\s+)?potato(?:es)?$/iu,
    ],
  },
  {
    key: 'pasta_fettuccine',
    displayName: 'مكرونة فيتوتشيني',
    station: 'carb',
    beforeGrams: 65,
    afterGrams: 150,
    aliases: [
      /^(?:ال)?(?:مكرونه\s+)?(?:ال)?فيتوتشيني$/u,
      /^fettuccine(?:\s+pasta)?$/iu,
    ],
  },
  {
    key: 'pasta_fusilli',
    displayName: 'مكرونة فيوزلي',
    station: 'carb',
    beforeGrams: 65,
    afterGrams: 150,
    aliases: [
      /^(?:ال)?(?:مكرونه\s+)?(?:ال)?(?:فيوزلي|فوزيلي)$/u,
      /^fusilli(?:\s+pasta)?$/iu,
    ],
  },
  {
    key: 'pasta_shells',
    displayName: 'مكرونة قواقع',
    station: 'carb',
    beforeGrams: 65,
    afterGrams: 150,
    aliases: [/^(?:ال)?(?:مكرونه\s+)?قواقع$/u, /^shell(?:s)?\s+pasta$/iu],
  },
  {
    key: 'pasta',
    displayName: 'مكرونة / باستا',
    station: 'carb',
    beforeGrams: 65,
    afterGrams: 150,
    aliases: [
      /^(?:ال)?(?:مكرونه|معكرونه|باستا|اسباجتي|بيني)(?:\s+بني|\s+شوفان)?$/u,
      /^(?:pasta|spaghetti|penne|macaroni)$/iu,
    ],
  },
  {
    key: 'noodles',
    displayName: 'نودلز',
    station: 'carb',
    beforeGrams: 65,
    afterGrams: 150,
    aliases: [/^(?:ال)?نودلز$/u, /^noodles$/iu],
  },
  {
    key: 'orzo',
    displayName: 'لسان عصفور',
    station: 'carb',
    beforeGrams: 55,
    afterGrams: 130,
    aliases: [/^(?:ال)?لسان\s*عصفور$/u, /^orzo$/iu],
  },
  {
    key: 'oats',
    displayName: 'شوفان',
    station: 'carb',
    beforeGrams: 50,
    afterGrams: 120,
    aliases: [/^(?:ال)?شوفان$/u, /^oats?$/iu],
  },
  {
    key: 'quinoa',
    displayName: 'كينوا',
    station: 'carb',
    beforeGrams: 55,
    afterGrams: 130,
    aliases: [/^(?:ال)?كينوا$/u, /^quinoa$/iu],
  },
  {
    key: 'freekeh',
    displayName: 'فريك',
    station: 'carb',
    beforeGrams: 65,
    afterGrams: 150,
    aliases: [/^(?:ال)?فريك$/u, /^freekeh$/iu],
  },
  {
    key: 'bread_toast',
    displayName: 'توست / خبز صحي',
    station: 'carb',
    beforeGrams: 60,
    afterGrams: 60,
    aliases: [/^(?:ال)?(?:توست|توست\s+بني|خبز|عيش)(?:\s+صاج|\s+بني|\s+تورتيلا)?$/u, /^(?:brown\s+)?(?:toast|bread|tortilla)$/iu],
  },

  // Vegetables
  {
    key: 'vegetables',
    displayName: 'خضار سوتيه / مشوي',
    station: 'vegetable',
    beforeGrams: 130,
    afterGrams: 100,
    aliases: [
      /^(?:ال)?(?:خضار|خضراوات|خضروات)(?:\s+(?:ال)?(?:سوتيه|مشوي|طازج|فريش|مسلوق))?$/u,
      /^(?:ال)?سوتيه$/u,
      /^(?:sauteed\s+|grilled\s+|fresh\s+|steamed\s+|mixed\s+)?(?:vegetables?|veggies?|vigge)$/iu,
    ],
  },
  {
    key: 'carrots',
    displayName: 'جزر',
    station: 'vegetable',
    beforeGrams: 125,
    afterGrams: 100,
    aliases: [/^(?:ال)?جزر$/u, /^carrots?$/iu],
  },
  {
    key: 'broccoli',
    displayName: 'بروكلي',
    station: 'vegetable',
    beforeGrams: 125,
    afterGrams: 100,
    aliases: [/^(?:ال)?بروكلي$/u, /^broccoli$/iu],
  },
  {
    key: 'mushroom',
    displayName: 'مشروم فريش',
    station: 'vegetable',
    beforeGrams: 80,
    afterGrams: 60,
    aliases: [/^(?:ال)?مشروم(?:\s+فريش)?$/u, /^(?:fresh\s+)?mushrooms?$/iu],
  },
  {
    key: 'green_beans',
    displayName: 'فاصوليا خضراء',
    station: 'vegetable',
    beforeGrams: 125,
    afterGrams: 100,
    aliases: [/^(?:ال)?فاصوليا\s*خضراء$/u, /^green\s+beans?$/iu],
  },
  {
    key: 'sweet_corn',
    displayName: 'ذرة حلوة',
    station: 'vegetable',
    beforeGrams: 70,
    afterGrams: 70,
    aliases: [/^(?:ال)?ذره(?:\s+حلوه)?$/u, /^(?:sweet\s+)?corn$/iu],
  },
  {
    key: 'bell_peppers',
    displayName: 'فلفل ألوان',
    station: 'vegetable',
    beforeGrams: 80,
    afterGrams: 65,
    aliases: [/^(?:ال)?فلفل(?:\s+الوان|\s+رومي|\s+احمر|\s+اخضر)?$/u, /^(?:bell\s+|colored\s+)?peppers?$/iu],
  },
  {
    key: 'lettuce_salad',
    displayName: 'كابوتشا / خس',
    station: 'vegetable',
    beforeGrams: 90,
    afterGrams: 90,
    aliases: [/^(?:ال)?(?:كابوتشا|كبوتشا|كابوتشي|خس)$/u, /^(?:iceberg\s+)?lettuce$/iu],
  },

  // Proteins
  {
    key: 'chicken_strips',
    displayName: 'شرائح دجاج',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?شرايح\s*(?:ال)?(?:دجاج|فراخ)$/u, /^chicken\s+strips?$/iu],
  },
  {
    key: 'chicken_cubes',
    displayName: 'مكعبات دجاج',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?(?:مكعبات|قطع)\s*(?:ال)?(?:دجاج|فراخ)$/u, /^chicken\s+cubes?$/iu],
  },
  {
    key: 'chicken_breast',
    displayName: 'صدور دجاج كاملة',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [
      /^(?:ال)?صدور\s*(?:ال)?(?:دجاج|فراخ)(?:\s+كامله|\s+مشويه)?$/u,
      /^(?:ال)?(?:دجاج|فراخ)(?:\s+مشوي|\s+فيليه)?$/u,
      /^(?:grilled\s+)?chicken(?:\s+breast)?$/iu,
    ],
  },
  {
    key: 'stuffed_chicken_breast',
    displayName: 'صدور دجاج محشية',
    station: 'protein',
    beforeGrams: 220,
    afterGrams: 145,
    aliases: [/^(?:ال)?صدور\s*(?:ال)?(?:دجاج|فراخ)\s+محشيه$/u, /^stuffed\s+chicken(?:\s+breast)?$/iu],
  },
  {
    key: 'beef_steak',
    displayName: 'استيك لحم',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?(?:استيك|ستيك)(?:\s+لحم|\s+بقري|\s+مشوي)?$/u, /^(?:beef\s+)?steak$/iu],
  },
  {
    key: 'beef_strips',
    displayName: 'شرائح لحم',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?شرايح\s*(?:ال)?(?:لحم|بيف|استيك)$/u, /^beef\s+strips?$/iu],
  },
  {
    key: 'beef_cubes',
    displayName: 'مكعبات لحم',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?(?:مكعبات|قطع)\s*(?:ال)?(?:لحم|بيف)$/u, /^beef\s+cubes?$/iu],
  },
  {
    key: 'kofta',
    displayName: 'كفتة لحم',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?كفته(?:\s+لحم|\s+مشويه|\s+دايت)?$/u, /^kofta$/iu],
  },
  {
    key: 'meatballs',
    displayName: 'ميتبول (كرات لحم)',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?(?:ميتبول|ميت\s*بول|كرات\s*لحم|لحم\s*مفروم)$/u, /^meat\s*balls?$/iu],
  },
  {
    key: 'beef_liver',
    displayName: 'كبدة',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?كبده$/u, /^(?:beef\s+)?liver$/iu],
  },
  {
    key: 'fish_fillet',
    displayName: 'فيليه سمك',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?(?:فيليه\s*سمك|سمك\s*فيليه|سمك)$/u, /^fish(?:\s+fillet)?$/iu],
  },
  {
    key: 'salmon',
    displayName: 'سالمون',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 135,
    aliases: [/^(?:ال)?(?:سالمون|سلمون)$/u, /^salmon(?:\s+fillet)?$/iu],
  },
  {
    key: 'shrimp',
    displayName: 'جمبري',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?جمبري$/u, /^(?:shrimp|prawns?)$/iu],
  },
  {
    key: 'calamari',
    displayName: 'كالماري',
    station: 'protein',
    beforeGrams: 200,
    afterGrams: 125,
    aliases: [/^(?:ال)?(?:كالماري|كليماري|سبيط)$/u, /^calamari$/iu],
  },
  {
    key: 'crab_sticks',
    displayName: 'أصابع كابوريا',
    station: 'protein',
    beforeGrams: 150,
    afterGrams: 125,
    aliases: [/^(?:ال)?(?:اصابع\s*)?كابوريا$/u, /^crab(?:\s+sticks?)?$/iu],
  },
  {
    key: 'tuna',
    displayName: 'تونة',
    station: 'protein',
    beforeGrams: 140,
    afterGrams: 140,
    aliases: [/^(?:ال)?تونه(?:\s+لايت)?$/u, /^tuna$/iu],
  },
  {
    key: 'eggs',
    displayName: 'بيض',
    station: 'protein',
    beforeGrams: 110,
    afterGrams: 100,
    aliases: [/^(?:ال)?بيض(?:\s+مسلوق|\s+اومليت)?$/u, /^(?:boiled\s+)?eggs?$/iu],
  },
];

export function resolveCanonicalIngredient(rawName: string): {
  key: string;
  displayName: string;
  station: IngredientStation;
  defaultBeforeGrams: number;
  defaultAfterGrams: number;
} {
  const cleaned = compactWhitespace(rawName.replace(/^[\s•*\-–—()]+|[\s()]+$/gu, ''));
  const normalized = normalizeArabicText(cleaned);

  for (const profile of CANONICAL_INGREDIENT_PROFILES) {
    if (profile.aliases.some((regex) => regex.test(normalized))) {
      return {
        key: profile.key,
        displayName: profile.displayName,
        station: profile.station,
        defaultBeforeGrams: profile.beforeGrams,
        defaultAfterGrams: profile.afterGrams,
      };
    }
  }

  // Broad fallback classification by keywords when custom ingredient names exist
  if (/(ارز|رز|مكرون|باستا|بطاطس|نودلز|شوفان|كينوا|فريك|توست|خبز|عيش|لسان عصفور|rice|pasta|potato|oats|noodle|bread)/iu.test(normalized)) {
    const isPotato = /(بطاطس|potato|wedges)/iu.test(normalized);
    return {
      key: `custom::${normalized}`,
      displayName: cleaned,
      station: 'carb',
      defaultBeforeGrams: isPotato ? 180 : 65,
      defaultAfterGrams: 150,
    };
  }

  if (/(دجاج|فراخ|لحم|بيف|استيك|ستيك|كفت|ميتبول|كبد|سمك|سالمون|جمبري|كالماري|كابوريا|تونه|تركي|بيض|chicken|beef|steak|meat|fish|salmon|shrimp|tuna|turkey|egg)/iu.test(normalized)) {
    return {
      key: `custom::${normalized}`,
      displayName: cleaned,
      station: 'protein',
      defaultBeforeGrams: 200,
      defaultAfterGrams: 125,
    };
  }

  if (/(خضار|خضراوات|سلط|جزر|بروكلي|مشروم|فاصوليا|ذره|فلفل|كابوتش|خس|سبانخ|كوسه|باذنجان|بنجر|جرجير|خيار|طماطم|بصل|veg|salad|broccoli|carrot|mushroom|spinach)/iu.test(normalized)) {
    return {
      key: `custom::${normalized}`,
      displayName: cleaned,
      station: 'vegetable',
      defaultBeforeGrams: 120,
      defaultAfterGrams: 100,
    };
  }

  return {
    key: `custom::${normalized}`,
    displayName: cleaned,
    station: 'other',
    defaultBeforeGrams: 50,
    defaultAfterGrams: 50,
  };
}

function getStationYieldRatioBeforeOverAfter(station: IngredientStation, ingredientKey: string): number {
  if (ingredientKey === 'potato' || ingredientKey === 'potato_wedges') return 180 / 150;
  if (ingredientKey === 'bread_toast' || ingredientKey === 'tuna' || ingredientKey === 'sweet_corn') return 1;
  if (station === 'carb') return 60 / 150;
  if (station === 'protein') return 200 / 125;
  if (station === 'vegetable') return 130 / 100;
  return 1;
}

type WorkingIngredient = {
  key: string;
  name: string;
  station: IngredientStation;
  beforeGrams: number;
  afterGrams: number;
  usesDefaultWeights: boolean;
  portionMultiplier: number;
  addedBySubstitution?: boolean;
};

type LearnedWeightMap = Map<string, { beforeGrams: number; afterGrams: number }>;

function buildLearnedCatalogWeights(meals: Meal[]): LearnedWeightMap {
  const acc = new Map<string, { beforeSum: number; beforeCount: number; afterSum: number; afterCount: number }>();

  for (const meal of meals) {
    for (const ing of meal.ingredients ?? []) {
      const canonical = resolveCanonicalIngredient(ing.name);
      const entry = acc.get(canonical.key) ?? { beforeSum: 0, beforeCount: 0, afterSum: 0, afterCount: 0 };
      if (ing.weight_before_grams && ing.weight_before_grams > 0) {
        entry.beforeSum += ing.weight_before_grams;
        entry.beforeCount += 1;
      }
      if (ing.weight_after_grams && ing.weight_after_grams > 0) {
        entry.afterSum += ing.weight_after_grams;
        entry.afterCount += 1;
      }
      acc.set(canonical.key, entry);
    }
  }

  const learned: LearnedWeightMap = new Map();
  for (const [key, entry] of acc.entries()) {
    if (entry.beforeCount === 0 && entry.afterCount === 0) continue;
    const canonicalSample = CANONICAL_INGREDIENT_PROFILES.find((p) => p.key === key);
    const station = canonicalSample?.station ?? 'other';
    const ratio = getStationYieldRatioBeforeOverAfter(station, key);
    const avgBefore = entry.beforeCount > 0 ? Math.round(entry.beforeSum / entry.beforeCount) : null;
    const avgAfter = entry.afterCount > 0 ? Math.round(entry.afterSum / entry.afterCount) : null;

    if (avgBefore !== null && avgAfter !== null) {
      learned.set(key, { beforeGrams: avgBefore, afterGrams: avgAfter });
    } else if (avgBefore !== null) {
      learned.set(key, { beforeGrams: avgBefore, afterGrams: Math.round(avgBefore / ratio) });
    } else if (avgAfter !== null) {
      learned.set(key, { beforeGrams: Math.round(avgAfter * ratio), afterGrams: avgAfter });
    }
  }
  return learned;
}

function resolveWeightsForSnapshot(
  snapshot: MealIngredientSnapshot,
  learnedWeights: LearnedWeightMap,
  customPortionWeights: CustomPortionWeightsMap,
): WorkingIngredient {
  const canonical = resolveCanonicalIngredient(snapshot.name);
  const ratio = getStationYieldRatioBeforeOverAfter(canonical.station, canonical.key);

  const explicitBefore =
    snapshot.weight_before_grams !== null &&
    snapshot.weight_before_grams !== undefined &&
    snapshot.weight_before_grams > 0
      ? Number(snapshot.weight_before_grams)
      : null;

  const explicitAfter =
    snapshot.weight_after_grams !== null &&
    snapshot.weight_after_grams !== undefined &&
    snapshot.weight_after_grams > 0
      ? Number(snapshot.weight_after_grams)
      : null;

  if (explicitBefore !== null && explicitAfter !== null) {
    return {
      key: canonical.key,
      name: canonical.displayName,
      station: canonical.station,
      beforeGrams: explicitBefore,
      afterGrams: explicitAfter,
      usesDefaultWeights: false,
      portionMultiplier: 1,
    };
  }

  if (explicitBefore !== null) {
    return {
      key: canonical.key,
      name: canonical.displayName,
      station: canonical.station,
      beforeGrams: explicitBefore,
      afterGrams: Math.round(explicitBefore / ratio),
      usesDefaultWeights: false,
      portionMultiplier: 1,
    };
  }

  if (explicitAfter !== null) {
    return {
      key: canonical.key,
      name: canonical.displayName,
      station: canonical.station,
      beforeGrams: Math.round(explicitAfter * ratio),
      afterGrams: explicitAfter,
      usesDefaultWeights: false,
      portionMultiplier: 1,
    };
  }

  const customOverride = customPortionWeights[canonical.key];
  if (customOverride) {
    return {
      key: canonical.key,
      name: canonical.displayName,
      station: canonical.station,
      beforeGrams: customOverride.beforeGrams,
      afterGrams: customOverride.afterGrams,
      usesDefaultWeights: false,
      portionMultiplier: 1,
    };
  }

  const learned = learnedWeights.get(canonical.key);
  if (learned) {
    return {
      key: canonical.key,
      name: canonical.displayName,
      station: canonical.station,
      beforeGrams: learned.beforeGrams,
      afterGrams: learned.afterGrams,
      usesDefaultWeights: false,
      portionMultiplier: 1,
    };
  }

  return {
    key: canonical.key,
    name: canonical.displayName,
    station: canonical.station,
    beforeGrams: canonical.defaultBeforeGrams,
    afterGrams: canonical.defaultAfterGrams,
    usesDefaultWeights: true,
    portionMultiplier: 1,
  };
}

/**
 * Infers base ingredients ONLY when a meal has no recipe ingredients in the catalog,
 * including parsing explicit gram specs like "100 جرام رز بسمتي صافي بعد التسوية + 200 جرام استيك مشوي".
 */
function inferFallbackMealIngredients(
  label: string,
  description: string | undefined,
  category: KitchenCategory,
): MealIngredientSnapshot[] {
  const asciiLabel = toAsciiDigits(label);
  const explicitGramMatches = [
    ...asciiLabel.matchAll(
      /(\d+(?:\.\d+)?)\s*(?:جرام|جم|g|gm|grams?)\s+([^+،,()]+?)(?=\s*(?:\+|،|,|\)|$))/giu,
    ),
  ];

  if (explicitGramMatches.length > 0) {
    return explicitGramMatches.map((match) => {
      const grams = Number(match[1]);
      const rawPhrase = compactWhitespace(match[2]);
      const normPhrase = normalizeArabicText(rawPhrase);
      const isAfterCooking = /(بعد\s*التسويه|صافي|مستوي|مطبوخ|cooked)/iu.test(normPhrase);
      const cleanedName = compactWhitespace(
        rawPhrase
          .replace(/(?:صافي|صافى)?\s*(?:بعد|قبل)\s*التسوي[ةه]/gu, '')
          .replace(/\b(?:مشوي|مشوى|مسلوق|بسمتي|بسمتى)\b/gu, '')
          .trim(),
      ) || rawPhrase;

      return {
        name: cleanedName,
        weight_before_grams: isAfterCooking ? null : grams,
        weight_after_grams: isAfterCooking ? grams : null,
      };
    });
  }

  if (category === 'snacks' || category === 'salad' || category === 'breakfast_dinner') {
    return [];
  }

  const combined = normalizeArabicText(`${label} ${description ?? ''}`);
  const results: MealIngredientSnapshot[] = [];

  // Protein inference
  if (/(سالمون|سلمون|salmon)/iu.test(combined)) {
    results.push({ name: 'سالمون', weight_before_grams: 200, weight_after_grams: 135 });
  } else if (/(جمبري|shrimp|prawn)/iu.test(combined)) {
    results.push({ name: 'جمبري', weight_before_grams: 200, weight_after_grams: 125 });
  } else if (/(كالماري|كليماري|calamari)/iu.test(combined)) {
    results.push({ name: 'كالماري', weight_before_grams: 200, weight_after_grams: 125 });
  } else if (/(تونه|tuna)/iu.test(combined)) {
    results.push({ name: 'تونة', weight_before_grams: 140, weight_after_grams: 140 });
  } else if (category === 'fish' || /(سمك|فيليه|سي باس|fish|seafood|sea\s*food)/iu.test(combined)) {
    results.push({ name: 'فيليه سمك', weight_before_grams: 200, weight_after_grams: 125 });
  } else if (/(كفته|kofta)/iu.test(combined)) {
    results.push({ name: 'كفته', weight_before_grams: 200, weight_after_grams: 125 });
  } else if (/(ميتبول|ميت بول|كرات لحم|meatball|meat ball)/iu.test(combined)) {
    results.push({ name: 'ميتبول', weight_before_grams: 200, weight_after_grams: 125 });
  } else if (/(كبده|liver)/iu.test(combined)) {
    results.push({ name: 'كبدة', weight_before_grams: 200, weight_after_grams: 125 });
  } else if (category === 'meat' || /(بيف|لحم|ستيك|استيك|كباب|beef|steak|kabab|kebab)/iu.test(combined)) {
    results.push({ name: 'استيك', weight_before_grams: 200, weight_after_grams: 125 });
  } else if (category === 'chicken' || /(دجاج|فراخ|تشيكن|شيش|chicken|taouk|tawook|piccata|alfredo|teriyaki)/iu.test(combined)) {
    results.push({ name: 'صدور دجاج كامله', weight_before_grams: 200, weight_after_grams: 125 });
  } else if (category === 'mix') {
    results.push({ name: 'شرائح دجاج', weight_before_grams: 100, weight_after_grams: 65 });
    results.push({ name: 'شرائح لحم', weight_before_grams: 100, weight_after_grams: 65 });
  }

  // Carb inference
  if (/(فيتوتشيني|fettuccine)/iu.test(combined)) {
    results.push({ name: 'مكرونة فيتوتشيني', weight_before_grams: 65, weight_after_grams: 150 });
  } else if (/(فيوزلي|fusilli)/iu.test(combined)) {
    results.push({ name: 'مكرونة فيوزلي', weight_before_grams: 65, weight_after_grams: 150 });
  } else if (/(نودلز|noodle)/iu.test(combined)) {
    results.push({ name: 'نودلز', weight_before_grams: 65, weight_after_grams: 150 });
  } else if (/(مكرونه|باستا|pasta|alfredo)/iu.test(combined)) {
    results.push({ name: 'مكرونة', weight_before_grams: 65, weight_after_grams: 150 });
  } else if (/(بطاطس ويدج|ويدجيز|ويدجز|wedges)/iu.test(combined)) {
    results.push({ name: 'بطاطس ويدجيز', weight_before_grams: 180, weight_after_grams: 150 });
  } else if (/(كينوا|quinoa)/iu.test(combined)) {
    results.push({ name: 'كينوا', weight_before_grams: 55, weight_after_grams: 130 });
  } else if (results.length > 0) {
    results.push({ name: 'ارز', weight_before_grams: 60, weight_after_grams: 150 });
  }

  // Vegetable inference for standard hot meals
  if (results.length > 0 && !/(بدون خضار)/iu.test(combined)) {
    results.push({ name: 'خضار', weight_before_grams: 130, weight_after_grams: 100 });
  }

  return results;
}

// ============================================================================
// Smart Natural-Language Note Parser (Arabic + English)
// ============================================================================

const IGNORED_PACKAGING_CLAUSE_PATTERN =
  /(?:منفصل(?:ه)?|لوحده(?:ا)?|في\s*طبق\s*منفرد|خارج\s*الوجب[ةه]|علب[ةه]\s*لوحدها|علي\s*جنب|على\s*جنب|separate(?:ly|d)?|on\s+the\s+side)/iu;

const NON_INGREDIENT_MODIFIER_PREFIX =
  /^(?:ال)?(?:صوص|زيت|ملح|توابل|بهارات|شطه|فلفل\s*اسود|ثوميه|توميه|مايونيز|كاتشب|مسترده|دريسنج|ليمون|بصل|ثوم|توم|sauce|oil|salt|spices?|pepper|garlic|onion|dressing|mayo)\b/iu;

function stripAttachedArabicPreposition(rawTarget: string): string {
  const trimmed = compactWhitespace(rawTarget.replace(/^[+\-–—:،,()]+|[()،,.]+$/gu, ''));
  if (!trimmed) return '';

  // Handle "بالبطاطس" / "بالمكرونة" / "للبطاطس"
  if (/^(?:بال|لل)\S+/u.test(trimmed)) {
    return compactWhitespace(trimmed.slice(1));
  }

  // Handle attached "بـ" or "لـ" on known ingredient starters: "ببطاطس ويدجيز" -> "بطاطس ويدجيز", "بمكرونة" -> "مكرونة", "بارز" / "بأرز" -> "أرز"
  const norm = normalizeArabicText(trimmed);
  const withoutFirstChar = compactWhitespace(trimmed.slice(1));
  const normRest = normalizeArabicText(withoutFirstChar);

  if (/^[بل]/u.test(norm) && withoutFirstChar.length >= 2) {
    const knownRest = CANONICAL_INGREDIENT_PROFILES.some((p) =>
      p.aliases.some((alias) => alias.test(normRest) || alias.test(normRest.split(' ')[0] ?? '')),
    );
    if (
      knownRest ||
      /^(?:بطاطس|مكرون|باستا|ارز|رز|خضار|جزر|بروكلي|كينوا|شوفان|فريك|نودلز|لسان|توست|عيش|خبز|سلط|مشروم|فاصوليا|ذره|دجاج|فراخ|لحم|استيك|ستيك|كفت|سمك|جمبري)/u.test(
        normRest,
      )
    ) {
      return withoutFirstChar;
    }
  }

  return trimmed;
}

const KNOWN_INGREDIENT_ROOT_PATTERN =
  /^(?:ال)?(?:بطاطس|ويدجيز|ويدجز|ودجز|مكرون|معكرون|باستا|فيتوتشيني|فيوزلي|ارز|رز|خضار|خضراوات|خضروات|سوتيه|جزر|بروكلي|كينوا|شوفان|فريك|نودلز|لسان|توست|عيش|خبز|سلط|مشروم|فاصوليا|ذره|فلفل|كابوتش|خس|دجاج|فراخ|شرايح|مكعبات|صدور|لحم|بيف|استيك|ستيك|كفت|ميتبول|كبد|سمك|فيليه|سالمون|سلمون|جمبري|كالماري|كابوريا|تونه|بيض)/u;

function isAttachedPrepositionIngredientToken(token: string): boolean {
  const cleaned = token.replace(/^[+\-–—:،,()]+|[()،,.]+$/gu, '');
  if (/^(?:بال|لل)\S{2,}/u.test(cleaned)) return true;
  const norm = normalizeArabicText(cleaned);
  if (!/^[بل]/u.test(norm) || norm.length < 3) return false;
  const rest = norm.slice(1);
  return KNOWN_INGREDIENT_ROOT_PATTERN.test(rest);
}

function splitArabicSubstitutionRest(restText: string): { fromTarget: string; toTarget: string } | null {
  // First check explicit standalone prepositions: "ب ", "بـ", "إلى ", "الى ", "لـ", "ل "
  const spacedPrepMatch = restText.match(/^(.+?)\s+(?:بـ|ب|إلى|الى|لـ|ل)\s+(.+)$/iu);
  if (spacedPrepMatch) {
    return {
      fromTarget: compactWhitespace(spacedPrepMatch[1]),
      toTarget: stripAttachedArabicPreposition(spacedPrepMatch[2]),
    };
  }

  // Also check attached tatweel e.g. "بـبطاطس" / "لـمكرونة"
  const tatweelMatch = restText.match(/^(.+?)\s+(?:بـ|لـ)(\S+(?:\s+\S+)*)$/iu);
  if (tatweelMatch) {
    return {
      fromTarget: compactWhitespace(tatweelMatch[1]),
      toTarget: stripAttachedArabicPreposition(tatweelMatch[2]),
    };
  }

  // Token scan for attached Arabic preposition "ب..." / "ل..." on an actual ingredient word (skips adjectives like "بسمتي")
  const tokens = compactWhitespace(restText).split(' ');
  for (let i = 1; i < tokens.length; i += 1) {
    if (isAttachedPrepositionIngredientToken(tokens[i])) {
      return {
        fromTarget: tokens.slice(0, i).join(' '),
        toTarget: stripAttachedArabicPreposition(tokens.slice(i).join(' ')),
      };
    }
  }

  return null;
}

function matchesExistingIngredient(
  targetPhrase: string,
  item: WorkingIngredient,
): boolean {
  const cleaned = stripAttachedArabicPreposition(targetPhrase);
  const normTarget = normalizeArabicText(cleaned);
  if (!normTarget || NON_INGREDIENT_MODIFIER_PREFIX.test(normTarget)) {
    return false;
  }

  // Macro/station-wide aliases: "كارب" / "نشويات" / "carbs"
  if (/^(?:ال)?(?:كارب|كربوهيدرات|نشويات|carbs?|starch(?:es)?)$/iu.test(normTarget)) {
    return item.station === 'carb';
  }
  if (/^(?:ال)?(?:خضار|خضراوات|خضروات|سوتيه|vegetables?|veggies?)$/iu.test(normTarget)) {
    return item.key === 'vegetables' || item.station === 'vegetable';
  }
  if (/^(?:ال)?(?:بروتين|protein)$/iu.test(normTarget)) {
    return item.station === 'protein';
  }

  const targetCanonical = resolveCanonicalIngredient(cleaned);
  if (targetCanonical.key === item.key) {
    return true;
  }

  // Family matching: e.g. "بدون بطاطس" matches "بطاطس ويدجيز"; "بدون مكرونة" matches "مكرونة فيتوتشيني"; "بدون رز" matches "أرز بسمتي"
  if (
    (targetCanonical.key === 'potato' && item.key === 'potato_wedges') ||
    (targetCanonical.key === 'potato_wedges' && item.key === 'potato')
  ) {
    return true;
  }

  if (
    targetCanonical.key === 'pasta' &&
    (item.key === 'pasta_fettuccine' || item.key === 'pasta_fusilli' || item.key === 'pasta_shells')
  ) {
    return true;
  }

  const normItemName = normalizeArabicText(item.name);
  return normItemName.includes(normTarget) || normTarget.includes(normItemName);
}

export interface ParsedClauseAction {
  kind: SmartAdjustmentKind;
  fromTarget?: string;
  toTarget?: string;
  multiplier?: number;
  grams?: number;
  rawClause: string;
}

export function parseSmartInstructionClauses(instruction: string): ParsedClauseAction[] {
  if (!instruction || !instruction.trim()) return [];

  const ascii = toAsciiDigits(instruction);
  const rawClauses = ascii
    .split(/\s*(?:\||—|–|\n|[،,;]|(?:\s+-\s+))\s*/u)
    .map((c) => compactWhitespace(c))
    .filter(Boolean);

  const actions: ParsedClauseAction[] = [];

  for (const clause of rawClauses) {
    const normClause = normalizeArabicText(clause);

    // Skip pure packaging / container separation instructions unless they specify a concrete replacement
    if (IGNORED_PACKAGING_CLAUSE_PATTERN.test(normClause) && !/(استبدال|تبديل|بدل|مكان|بدون|من غير)/u.test(normClause)) {
      continue;
    }

    // 1. Explicit substitution Pattern A:
    // "استبدال الخضار ببطاطس ويدجيز" / "استبدال ارز بسمتي ببطاطس ويدجيز" / "تغيير الارز لمكرونة" / "تبديل الكارب ب بطاطس"
    const subVerbPrefixMatch = clause.match(
      /^(?:يرجى\s+|ممكن\s+)?(?:استبدال|إستبدال|تبديل|تغيير|تغير|غير)\s+(.+)$/iu,
    );
    if (subVerbPrefixMatch) {
      const splitSub = splitArabicSubstitutionRest(subVerbPrefixMatch[1]);
      if (splitSub && splitSub.fromTarget && splitSub.toTarget) {
        actions.push({
          kind: 'substitute',
          fromTarget: splitSub.fromTarget,
          toTarget: splitSub.toTarget,
          rawClause: clause,
        });
        continue;
      }
    }

    // 2. Substitution Pattern B (English):
    // "replace vegetables with potato wedges" / "swap rice for pasta"
    const engReplaceMatch = clause.match(
      /^(?:please\s+)?(?:replace|swap|substitute|change)\s+(.+?)\s+(?:with|for|to)\s+(.+)$/iu,
    );
    if (engReplaceMatch) {
      actions.push({
        kind: 'substitute',
        fromTarget: compactWhitespace(engReplaceMatch[1]),
        toTarget: compactWhitespace(engReplaceMatch[2]),
        rawClause: clause,
      });
      continue;
    }

    // "potato wedges instead of vegetables"
    const engInsteadMatch = clause.match(/^(.+?)\s+instead\s+of\s+(.+)$/iu);
    if (engInsteadMatch) {
      actions.push({
        kind: 'substitute',
        fromTarget: compactWhitespace(engInsteadMatch[2]),
        toTarget: compactWhitespace(engInsteadMatch[1]),
        rawClause: clause,
      });
      continue;
    }

    // 3. Substitution Pattern C (Arabic leading "بدل X Y" or "مكان X Y"):
    // e.g. "بدل الخضار بطاطس ويدجيز", "بدل الرز مكرونة", "مكان الارز بطاطس"
    const leadingBadalMatch = clause.match(
      /^(?:بدل|مكان|بدلاً?\s*من|بدلا\s*من|عوضاً?\s*عن)\s+(?<from>(?:ال)?(?:خضار\s*سوتيه|خضار\s*مشوي|بطاطس\s*ويدجيز|بطاطس\s*ويدجز|مكرون[ةه]\s*\S+|ارز\s*بسمتي|رز\s*بسمتي|\S+))\s+(?:حط|ضع|يكون|تكون|خلي|خلّي)?\s*(?<to>.+)$/iu,
    );
    if (leadingBadalMatch?.groups?.from && leadingBadalMatch?.groups?.to) {
      const fromTarget = compactWhitespace(leadingBadalMatch.groups.from);
      const toTarget = stripAttachedArabicPreposition(leadingBadalMatch.groups.to);
      if (fromTarget && toTarget) {
        actions.push({ kind: 'substitute', fromTarget, toTarget, rawClause: clause });
        continue;
      }
    }

    // 4. Substitution Pattern D (Arabic infix "Y بدل X" / "Y مكان X" / "Y بدلا من X"):
    // e.g. "بطاطس ويدجيز بدل الخضار", "مكرونة بدلاً من الأرز"
    const infixBadalMatch = clause.match(
      /^(?<to>.+?)\s+(?:بدل|بدلاً?\s*من|بدلا\s*من|مكان|عوضاً?\s*عن)\s+(?<from>.+)$/iu,
    );
    if (infixBadalMatch?.groups?.from && infixBadalMatch?.groups?.to) {
      const fromTarget = compactWhitespace(infixBadalMatch.groups.from);
      const toTarget = stripAttachedArabicPreposition(infixBadalMatch.groups.to);
      if (fromTarget && toTarget && !/^(?:بدون|من\s*غير)/iu.test(toTarget)) {
        actions.push({ kind: 'substitute', fromTarget, toTarget, rawClause: clause });
        continue;
      }
    }

    // 5. Substitution Pattern E ("الخضار يكون جزر فقط" / "خلي الكارب بطاطس ويدجيز"):
    const slotOverrideMatch =
      clause.match(
        /^(?<from>(?:ال)?(?:خضار|خضراوات|كارب|نشويات|ارز|رز|مكرون[ةه]))\s+(?:يكون|تكون|يبقي|يبقى)\s+(?<to>.+?)(?:\s+فقط)?$/iu,
      ) ??
      clause.match(
        /^(?:خلي|خلّي|اجعل)\s+(?<from>(?:ال)?(?:خضار|خضراوات|كارب|نشويات|ارز|رز|مكرون[ةه]|بطاطس))\s+(?<to>.+?)(?:\s+فقط)?$/iu,
      );
    if (slotOverrideMatch?.groups?.from && slotOverrideMatch?.groups?.to) {
      const fromTarget = compactWhitespace(slotOverrideMatch.groups.from);
      const toTarget = stripAttachedArabicPreposition(slotOverrideMatch.groups.to);
      if (fromTarget && toTarget && !IGNORED_PACKAGING_CLAUSE_PATTERN.test(normalizeArabicText(toTarget))) {
        actions.push({ kind: 'substitute', fromTarget, toTarget, rawClause: clause });
        continue;
      }
    }

    // 6. Zero/No Carb shorthand: "زيرو كارب" / "zero carb" / "keto بدون كارب"
    if (/(?:زيرو\s*كارب|كارب\s*زيرو|zero\s*carbs?|no\s*carbs?)/iu.test(normClause)) {
      actions.push({ kind: 'exclude', fromTarget: 'كارب', rawClause: clause });
      continue;
    }

    // 7. Exclusion Pattern (Arabic & English):
    // Supports compound exclusions like "بدون ارز وخضار" or "بدون رز أو بطاطس"
    const arExcludeMatch = clause.match(
      /^(?:بدون|من\s*غير|بلاش|الغي|إلغاء|الغاء|حذف|شيل|عدم\s*وضع|لا\s*تضع|مفيش|مافيش)\s+(.+)$/iu,
    );
    if (arExcludeMatch) {
      const remainder = compactWhitespace(arExcludeMatch[1]);
      // Check if remainder also embeds "وبداله بطاطس" / "وحط بطاطس"
      const embeddedReplace = remainder.match(/^(.+?)\s+(?:و\s*(?:بداله|بدالها|مكانه|مكانها|حط|ضع|زود|اضف|أضف))\s+(.+)$/iu);
      if (embeddedReplace) {
        actions.push({
          kind: 'substitute',
          fromTarget: compactWhitespace(embeddedReplace[1]),
          toTarget: stripAttachedArabicPreposition(embeddedReplace[2]),
          rawClause: clause,
        });
        continue;
      }

      const subTargets = remainder
        .split(/\s+(?:و\s*(?:بدون|من\s*غير)?|أو|او|&)\s+/iu)
        .map((s) => compactWhitespace(s.replace(/^(?:بدون|من\s*غير)\s+/iu, '')))
        .filter(Boolean);

      for (const target of subTargets) {
        actions.push({ kind: 'exclude', fromTarget: target, rawClause: clause });
      }
      continue;
    }

    const engExcludeMatch = clause.match(
      /^(?:no|without|hold(?:\s+the)?|skip|remove|exclude)\s+(.+)$/iu,
    );
    if (engExcludeMatch) {
      const subTargets = engExcludeMatch[1]
        .split(/\s+(?:and|or|&)\s+/iu)
        .map((s) => compactWhitespace(s.replace(/^(?:no|without)\s+/iu, '')))
        .filter(Boolean);
      for (const target of subTargets) {
        actions.push({ kind: 'exclude', fromTarget: target, rawClause: clause });
      }
      continue;
    }

    // 8. Double / Half / Extra Portion Rules:
    const doubleMatch =
      clause.match(/^(?:دبل|ضعف|مضاعف[ةه]?|زود|اكسترا|إكسترا|double)\s+(.+)$/iu) ??
      clause.match(/^(.+?)\s+(?:مضاعف[ةه]?|دبل|اكسترا|double)$/iu);
    if (doubleMatch) {
      actions.push({
        kind: 'multiply',
        fromTarget: compactWhitespace(doubleMatch[1]),
        multiplier: 2,
        rawClause: clause,
      });
      continue;
    }

    const halfMatch =
      clause.match(/^(?:نصف|نص|half)\s+(?:كمي[ةه]\s+)?(.+)$/iu);
    if (halfMatch) {
      actions.push({
        kind: 'multiply',
        fromTarget: compactWhitespace(halfMatch[1]),
        multiplier: 0.5,
        rawClause: clause,
      });
      continue;
    }

    // "+125g protein" or "اضافة بطاطس ويدجيز"
    const extraGramMatch = clause.match(/^\+?\s*(\d+(?:\.\d+)?)\s*(?:g|gm|grams?|جرام|جم)\s+(.+)$/iu);
    if (extraGramMatch) {
      const grams = Number(extraGramMatch[1]);
      if (Number.isFinite(grams) && grams > 0 && grams <= 1000) {
        actions.push({
          kind: 'override_grams',
          toTarget: compactWhitespace(extraGramMatch[2]),
          grams,
          rawClause: clause,
        });
        continue;
      }
    }

    const addMatch = clause.match(/^(?:إضاف[ةه]|اضاف[ةه]|زودلي|حط|أضف|اضف|add|extra)\s+(.+)$/iu);
    if (addMatch) {
      actions.push({
        kind: 'add',
        toTarget: stripAttachedArabicPreposition(addMatch[1]),
        rawClause: clause,
      });
    }
  }

  return actions;
}

const IMPORTED_DETAILS_NOTE_PATTERN = /^تفاصيل\s*(?:الطلب\s*المستوردة|الشيت)\s*:/u;
const NON_COOKING_NOTE_SEGMENT_PATTERN =
  /^(?:رسوم التوصيل\s*:|حساب العميل\s*:|حساب التوصيل\s*:|مدفوع\b|دفع\b|دفعت\b|فودافون كاش|انستا\s*باي|انستاباي)/iu;

function stripNonCookingMetadata(notes: string): string {
  return notes
    .replace(/(?:^|\n|\s+-\s+)تفاصيل(?:\s+الطلب\s+المستوردة|\s*الشيت)\s*:\s*.*?(?=\s+-\s+رسوم التوصيل\s*:|\n|$)/gu, '')
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
    .join('\n');
}

function cleanInstructionText(notes: string): string {
  const value = compactWhitespace(stripNonCookingMetadata(notes));
  if (!value || /^\[demo-orders/i.test(value) || /^طلب تجريبي/i.test(value)) {
    return '';
  }
  return value;
}

type AggregateIngredientsParams = {
  orders: Order[];
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
  date: string;
  customPortionWeights?: CustomPortionWeightsMap;
};

interface MutableIngredientAccumulator {
  key: string;
  name: string;
  station: IngredientStation;
  portionCount: number;
  basePortionCount: number;
  removedPortionCount: number;
  addedBySubstitutionCount: number;
  extraPortionCount: number;
  orderIds: Set<string>;
  weightBeforeGrams: number;
  weightAfterGrams: number;
  unitBeforeGrams: number;
  unitAfterGrams: number;
  usesDefaultWeights: boolean;
  byBrand: Map<
    string,
    {
      brandId: string;
      brandName: string;
      portionCount: number;
      orderIds: Set<string>;
      weightBeforeGrams: number;
      weightAfterGrams: number;
    }
  >;
  meals: Map<string, IngredientMealContribution>;
  adjustments: AppliedSmartAdjustment[];
}

function createEmptySummary(brandKey: string, brandId: string | null, brandName: string): BrandIngredientsSummary {
  return {
    brandKey,
    brandId,
    brandName,
    orderCount: 0,
    cookedMealCount: 0,
    frozenExcludedMealCount: 0,
    totalWeightBeforeGrams: 0,
    totalWeightAfterGrams: 0,
    items: [],
    adjustments: [],
  };
}

function compareIngredients(left: AggregatedIngredientItem, right: AggregatedIngredientItem): number {
  const stationDiff =
    INGREDIENT_STATION_ORDER.indexOf(left.station) - INGREDIENT_STATION_ORDER.indexOf(right.station);
  if (stationDiff !== 0) return stationDiff;
  if (right.portionCount !== left.portionCount) return right.portionCount - left.portionCount;
  return compareKitchenMealLabels(left.name, right.name);
}

export function aggregateKitchenIngredients({
  orders,
  brands,
  meals,
  packages,
  date,
  customPortionWeights = {},
}: AggregateIngredientsParams): KitchenIngredientsReport {
  const brandNameById = new Map(brands.map((b) => [b.id, b.name]));
  const learnedWeights = buildLearnedCatalogWeights(meals);

  // Build fast meal lookup (brand-exact first, then cross-brand name fallback)
  const mealByBrandAndName = new Map<string, Meal>();
  const mealByNameFallback = new Map<string, Meal>();
  for (const meal of meals) {
    const norm = normalizeArabicText(meal.name);
    mealByBrandAndName.set(`${meal.brand_id}::${norm}`, meal);
    if (!mealByNameFallback.has(norm) || (meal.ingredients?.length ?? 0) > 0) {
      mealByNameFallback.set(norm, meal);
    }
  }

  const dayOrders = orders.filter(
    (order) => order.execution_date === date && order.status !== 'cancelled',
  );

  // wait: let's check how Kitchen.tsx filters orders!
  // Note: aggregateKitchenOrders in kitchen.ts includes all orders on execution_date (let's match kitchen.ts behavior or check!)
  const targetOrders = orders.filter((order) => order.execution_date === date);

  const combinedAccMap = new Map<string, MutableIngredientAccumulator>();
  const brandAccMaps = new Map<string, Map<string, MutableIngredientAccumulator>>();
  const brandMeta = new Map<
    string,
    {
      brandId: string | null;
      brandName: string;
      orderIds: Set<string>;
      cookedMealCount: number;
      frozenExcludedMealCount: number;
      adjustments: AppliedSmartAdjustment[];
    }
  >();

  const combinedOrderIds = new Set<string>();
  let combinedCookedMeals = 0;
  let combinedFrozenMeals = 0;
  const combinedAdjustments: AppliedSmartAdjustment[] = [];
  let adjustmentCounter = 0;

  const ensureAccumulator = (
    map: Map<string, MutableIngredientAccumulator>,
    ing: Pick<WorkingIngredient, 'key' | 'name' | 'station' | 'beforeGrams' | 'afterGrams' | 'usesDefaultWeights'>,
  ): MutableIngredientAccumulator => {
    const existing = map.get(ing.key);
    if (existing) {
      if (!ing.usesDefaultWeights) {
        existing.usesDefaultWeights = false;
      }
      return existing;
    }
    const created: MutableIngredientAccumulator = {
      key: ing.key,
      name: ing.name,
      station: ing.station,
      portionCount: 0,
      basePortionCount: 0,
      removedPortionCount: 0,
      addedBySubstitutionCount: 0,
      extraPortionCount: 0,
      orderIds: new Set<string>(),
      weightBeforeGrams: 0,
      weightAfterGrams: 0,
      unitBeforeGrams: ing.beforeGrams,
      unitAfterGrams: ing.afterGrams,
      usesDefaultWeights: ing.usesDefaultWeights,
      byBrand: new Map(),
      meals: new Map(),
      adjustments: [],
    };
    map.set(ing.key, created);
    return created;
  };

  for (const order of targetOrders) {
    const brandKey = order.brand_id ?? 'unassigned';
    const brandName = order.brand_id
      ? brandNameById.get(order.brand_id) ?? 'براند غير معروف'
      : 'بدون براند';

    const meta = brandMeta.get(brandKey) ?? {
      brandId: order.brand_id,
      brandName,
      orderIds: new Set<string>(),
      cookedMealCount: 0,
      frozenExcludedMealCount: 0,
      adjustments: [],
    };
    meta.orderIds.add(order.id);
    brandMeta.set(brandKey, meta);
    combinedOrderIds.add(order.id);

    const brandMap = brandAccMaps.get(brandKey) ?? new Map<string, MutableIngredientAccumulator>();
    brandAccMaps.set(brandKey, brandMap);

    const isImportedOrder =
      (order.imported_meal_details ?? []).length > 0 ||
      /تفاصيل\s*(?:الطلب\s*المستوردة|الشيت)\s*:/u.test(order.notes) ||
      Boolean(getRecoveredSheetMealsForPhone(order.phone));

    const cleanedOrderNote = cleanInstructionText(order.notes);
    const generalInstruction = isImportedOrder
      ? resolveKitchenMealCategory({
          label: '',
          baseCategory: null,
          instruction: cleanedOrderNote,
        }) === 'frozen'
        ? cleanedOrderNote
        : ''
      : cleanedOrderNote;
    const customizationMap = new Map(
      (order.meal_customizations ?? []).map((item) => [item.key, cleanInstructionText(item.notes)]),
    );

    const resolvedMeals = resolveOrderMeals(order, meals, packages);

    for (const resolvedMeal of resolvedMeals) {
      const labelInstruction = cleanInstructionText(resolvedMeal.instruction ?? '');
      const customNote = customizationMap.get(resolvedMeal.customizationKey) ?? '';
      const combinedInstruction = [generalInstruction, labelInstruction, customNote]
        .filter(Boolean)
        .join(' | ');

      // Match catalog meal for ingredients + category enrichment
      const normMealName = normalizeArabicText(resolvedMeal.label);
      const matchedCatalogMeal =
        (order.brand_id ? mealByBrandAndName.get(`${order.brand_id}::${normMealName}`) : undefined) ??
        mealByNameFallback.get(normMealName) ??
        null;

      // Also check if label itself had "+125g protein" style suffix
      let inlineLabelExtraClause = '';
      const plusExtraInLabel = resolvedMeal.label.match(/\+\s*(\d+\s*(?:g|gm|جرام|جم)\s*.+)$/iu);
      if (plusExtraInLabel) {
        inlineLabelExtraClause = `+${plusExtraInLabel[1]}`;
      }

      const fullInstruction = [combinedInstruction, inlineLabelExtraClause].filter(Boolean).join(' | ');

      const kitchenCategory = resolveKitchenMealCategory({
        label: resolvedMeal.label,
        baseCategory: resolvedMeal.category ?? matchedCatalogMeal?.category,
        customCategory: resolvedMeal.customCategory ?? matchedCatalogMeal?.custom_category,
        description: resolvedMeal.description ?? matchedCatalogMeal?.description,
        instruction: fullInstruction,
        packageLabel: order.package,
      });

      // Frozen / Ready-to-Cook items are not cooked on the hot line
      if (kitchenCategory === 'frozen') {
        meta.frozenExcludedMealCount += 1;
        combinedFrozenMeals += 1;
        continue;
      }

      meta.cookedMealCount += 1;
      combinedCookedMeals += 1;

      const rawSnapshots: MealIngredientSnapshot[] =
        matchedCatalogMeal?.ingredients && matchedCatalogMeal.ingredients.length > 0
          ? matchedCatalogMeal.ingredients
          : inferFallbackMealIngredients(
              resolvedMeal.label,
              matchedCatalogMeal?.description ?? resolvedMeal.description,
              kitchenCategory,
            );

      const baseIngredients = rawSnapshots.map((snap) =>
        resolveWeightsForSnapshot(snap, learnedWeights, customPortionWeights),
      );

      // Record baseline portion counts before smart note modifications
      for (const baseIng of baseIngredients) {
        ensureAccumulator(combinedAccMap, baseIng).basePortionCount += 1;
        ensureAccumulator(brandMap, baseIng).basePortionCount += 1;
      }

      let activeIngredients: WorkingIngredient[] = baseIngredients.map((item) => ({ ...item }));
      const clauses = parseSmartInstructionClauses(fullInstruction);

      for (const action of clauses) {
        if (action.kind === 'exclude' && action.fromTarget) {
          const matchedTargets = activeIngredients.filter((ing) =>
            matchesExistingIngredient(action.fromTarget!, ing),
          );
          if (matchedTargets.length > 0) {
            activeIngredients = activeIngredients.filter(
              (ing) => !matchesExistingIngredient(action.fromTarget!, ing),
            );
            for (const removed of matchedTargets) {
              adjustmentCounter += 1;
              const adj: AppliedSmartAdjustment = {
                id: `adj-${adjustmentCounter}`,
                kind: 'exclude',
                brandId: order.brand_id,
                brandName,
                orderNumber: order.order_number,
                customerName: order.customer_name,
                mealLabel: resolvedMeal.label,
                rawInstruction: action.rawClause,
                summary: `استبعاد «${removed.name}» من «${resolvedMeal.label}»`,
                removedIngredientKey: removed.key,
                removedIngredientName: removed.name,
              };
              combinedAdjustments.push(adj);
              meta.adjustments.push(adj);

              const cAcc = ensureAccumulator(combinedAccMap, removed);
              cAcc.removedPortionCount += removed.portionMultiplier;
              cAcc.adjustments.push(adj);

              const bAcc = ensureAccumulator(brandMap, removed);
              bAcc.removedPortionCount += removed.portionMultiplier;
              bAcc.adjustments.push(adj);
            }
          }
        } else if (action.kind === 'substitute' && action.fromTarget && action.toTarget) {
          if (NON_INGREDIENT_MODIFIER_PREFIX.test(normalizeArabicText(action.toTarget))) {
            continue;
          }

          // Smart swap: if the user wrote "بدل البطاطس ويدجيز الخضار" in reverse order, verify which side is actually in the meal
          let matchedFrom = activeIngredients.filter((ing) =>
            matchesExistingIngredient(action.fromTarget!, ing),
          );
          let effectiveToPhrase = action.toTarget;

          if (matchedFrom.length === 0) {
            const reverseMatched = activeIngredients.filter((ing) =>
              matchesExistingIngredient(action.toTarget!, ing),
            );
            if (reverseMatched.length > 0) {
              matchedFrom = reverseMatched;
              effectiveToPhrase = action.fromTarget;
            }
          }

          if (matchedFrom.length > 0) {
            activeIngredients = activeIngredients.filter(
              (ing) => !matchedFrom.some((m) => m.key === ing.key),
            );

            const replacementIng = resolveWeightsForSnapshot(
              { name: effectiveToPhrase, weight_before_grams: null, weight_after_grams: null },
              learnedWeights,
              customPortionWeights,
            );

            const existingTarget = activeIngredients.find((ing) => ing.key === replacementIng.key);
            if (existingTarget) {
              existingTarget.portionMultiplier += 1;
              existingTarget.beforeGrams += replacementIng.beforeGrams;
              existingTarget.afterGrams += replacementIng.afterGrams;
            } else {
              activeIngredients.push({
                ...replacementIng,
                addedBySubstitution: true,
              });
            }

            adjustmentCounter += 1;
            const removedNames = matchedFrom.map((m) => m.name).join(' + ');
            const adj: AppliedSmartAdjustment = {
              id: `adj-${adjustmentCounter}`,
              kind: 'substitute',
              brandId: order.brand_id,
              brandName,
              orderNumber: order.order_number,
              customerName: order.customer_name,
              mealLabel: resolvedMeal.label,
              rawInstruction: action.rawClause,
              summary: `استبدال «${removedNames}» بـ «${replacementIng.name}» في «${resolvedMeal.label}»`,
              removedIngredientKey: matchedFrom[0].key,
              removedIngredientName: removedNames,
              addedIngredientKey: replacementIng.key,
              addedIngredientName: replacementIng.name,
            };
            combinedAdjustments.push(adj);
            meta.adjustments.push(adj);

            for (const removed of matchedFrom) {
              const cRemoved = ensureAccumulator(combinedAccMap, removed);
              cRemoved.removedPortionCount += removed.portionMultiplier;
              cRemoved.adjustments.push(adj);

              const bRemoved = ensureAccumulator(brandMap, removed);
              bRemoved.removedPortionCount += removed.portionMultiplier;
              bRemoved.adjustments.push(adj);
            }

            const cAdded = ensureAccumulator(combinedAccMap, replacementIng);
            cAdded.addedBySubstitutionCount += 1;
            cAdded.adjustments.push(adj);

            const bAdded = ensureAccumulator(brandMap, replacementIng);
            bAdded.addedBySubstitutionCount += 1;
            bAdded.adjustments.push(adj);
          }
        } else if (action.kind === 'multiply' && action.fromTarget && action.multiplier) {
          const matchedTargets = activeIngredients.filter((ing) =>
            matchesExistingIngredient(action.fromTarget!, ing),
          );
          for (const target of matchedTargets) {
            const delta = action.multiplier - 1;
            target.beforeGrams = Math.round(target.beforeGrams * action.multiplier);
            target.afterGrams = Math.round(target.afterGrams * action.multiplier);
            target.portionMultiplier = Number((target.portionMultiplier * action.multiplier).toFixed(2));

            adjustmentCounter += 1;
            const adj: AppliedSmartAdjustment = {
              id: `adj-${adjustmentCounter}`,
              kind: 'multiply',
              brandId: order.brand_id,
              brandName,
              orderNumber: order.order_number,
              customerName: order.customer_name,
              mealLabel: resolvedMeal.label,
              rawInstruction: action.rawClause,
              summary:
                action.multiplier > 1
                  ? `مضاعفة «${target.name}» (×${action.multiplier}) في «${resolvedMeal.label}»`
                  : `تقليل «${target.name}» إلى النصف في «${resolvedMeal.label}»`,
              addedIngredientKey: target.key,
              addedIngredientName: target.name,
              multiplier: action.multiplier,
            };
            combinedAdjustments.push(adj);
            meta.adjustments.push(adj);

            const cAcc = ensureAccumulator(combinedAccMap, target);
            if (delta > 0) cAcc.extraPortionCount += delta;
            else cAcc.removedPortionCount += Math.abs(delta);
            cAcc.adjustments.push(adj);

            const bAcc = ensureAccumulator(brandMap, target);
            if (delta > 0) bAcc.extraPortionCount += delta;
            else bAcc.removedPortionCount += Math.abs(delta);
            bAcc.adjustments.push(adj);
          }
        } else if (action.kind === 'add' && action.toTarget) {
          if (NON_INGREDIENT_MODIFIER_PREFIX.test(normalizeArabicText(action.toTarget))) {
            continue;
          }
          const addedIng = resolveWeightsForSnapshot(
            { name: action.toTarget, weight_before_grams: null, weight_after_grams: null },
            learnedWeights,
            customPortionWeights,
          );
          const existing = activeIngredients.find((ing) => ing.key === addedIng.key);
          if (existing) {
            existing.portionMultiplier += 1;
            existing.beforeGrams += addedIng.beforeGrams;
            existing.afterGrams += addedIng.afterGrams;
          } else {
            activeIngredients.push(addedIng);
          }

          adjustmentCounter += 1;
          const adj: AppliedSmartAdjustment = {
            id: `adj-${adjustmentCounter}`,
            kind: 'add',
            brandId: order.brand_id,
            brandName,
            orderNumber: order.order_number,
            customerName: order.customer_name,
            mealLabel: resolvedMeal.label,
            rawInstruction: action.rawClause,
            summary: `إضافة «${addedIng.name}» إلى «${resolvedMeal.label}»`,
            addedIngredientKey: addedIng.key,
            addedIngredientName: addedIng.name,
          };
          combinedAdjustments.push(adj);
          meta.adjustments.push(adj);

          const cAcc = ensureAccumulator(combinedAccMap, addedIng);
          cAcc.extraPortionCount += 1;
          cAcc.adjustments.push(adj);

          const bAcc = ensureAccumulator(brandMap, addedIng);
          bAcc.extraPortionCount += 1;
          bAcc.adjustments.push(adj);
        } else if (action.kind === 'override_grams' && action.toTarget && action.grams) {
          const matchedTargets = activeIngredients.filter((ing) =>
            matchesExistingIngredient(action.toTarget!, ing),
          );
          if (matchedTargets.length > 0) {
            const target = matchedTargets[0];
            const ratio = getStationYieldRatioBeforeOverAfter(target.station, target.key);
            // Extra cooked protein grams e.g. "+125g protein"
            const extraAfter = action.grams;
            const extraBefore = Math.round(extraAfter * ratio);
            const extraPortions = Number((extraAfter / Math.max(1, target.afterGrams)).toFixed(2));
            target.afterGrams += extraAfter;
            target.beforeGrams += extraBefore;
            target.portionMultiplier = Number((target.portionMultiplier + extraPortions).toFixed(2));

            adjustmentCounter += 1;
            const adj: AppliedSmartAdjustment = {
              id: `adj-${adjustmentCounter}`,
              kind: 'override_grams',
              brandId: order.brand_id,
              brandName,
              orderNumber: order.order_number,
              customerName: order.customer_name,
              mealLabel: resolvedMeal.label,
              rawInstruction: action.rawClause,
              summary: `زيادة «${target.name}» بمقدار ${extraAfter}g بعد التسوية (${extraBefore}g قبل التسوية)`,
              addedIngredientKey: target.key,
              addedIngredientName: target.name,
            };
            combinedAdjustments.push(adj);
            meta.adjustments.push(adj);

            const cAcc = ensureAccumulator(combinedAccMap, target);
            cAcc.extraPortionCount = Number((cAcc.extraPortionCount + extraPortions).toFixed(2));
            cAcc.adjustments.push(adj);

            const bAcc = ensureAccumulator(brandMap, target);
            bAcc.extraPortionCount = Number((bAcc.extraPortionCount + extraPortions).toFixed(2));
            bAcc.adjustments.push(adj);
          }
        }
      }

      // Accumulate resulting active ingredients into both Combined and Per-Brand buckets
      for (const finalIng of activeIngredients) {
        const mealContribKey = `${kitchenCategory}::${normalizeArabicText(resolvedMeal.label)}`;

        const recordInto = (acc: MutableIngredientAccumulator) => {
          acc.portionCount = Number((acc.portionCount + finalIng.portionMultiplier).toFixed(2));
          acc.orderIds.add(order.id);
          acc.weightBeforeGrams = Math.round(acc.weightBeforeGrams + finalIng.beforeGrams);
          acc.weightAfterGrams = Math.round(acc.weightAfterGrams + finalIng.afterGrams);

          const brandSplit = acc.byBrand.get(brandKey) ?? {
            brandId: brandKey,
            brandName,
            portionCount: 0,
            orderIds: new Set<string>(),
            weightBeforeGrams: 0,
            weightAfterGrams: 0,
          };
          brandSplit.portionCount = Number((brandSplit.portionCount + finalIng.portionMultiplier).toFixed(2));
          brandSplit.orderIds.add(order.id);
          brandSplit.weightBeforeGrams = Math.round(brandSplit.weightBeforeGrams + finalIng.beforeGrams);
          brandSplit.weightAfterGrams = Math.round(brandSplit.weightAfterGrams + finalIng.afterGrams);
          acc.byBrand.set(brandKey, brandSplit);

          const existingMeal = acc.meals.get(mealContribKey) ?? {
            mealKey: mealContribKey,
            mealLabel: resolvedMeal.label,
            category: kitchenCategory,
            portionCount: 0,
            weightBeforeGrams: 0,
            weightAfterGrams: 0,
          };
          existingMeal.portionCount = Number((existingMeal.portionCount + finalIng.portionMultiplier).toFixed(2));
          existingMeal.weightBeforeGrams = Math.round(existingMeal.weightBeforeGrams + finalIng.beforeGrams);
          existingMeal.weightAfterGrams = Math.round(existingMeal.weightAfterGrams + finalIng.afterGrams);
          acc.meals.set(mealContribKey, existingMeal);
        };

        recordInto(ensureAccumulator(combinedAccMap, finalIng));
        recordInto(ensureAccumulator(brandMap, finalIng));
      }
    }
  }

  // Silence unused dayOrders lint if not needed
  void dayOrders;

  const finalizeItems = (map: Map<string, MutableIngredientAccumulator>): AggregatedIngredientItem[] =>
    [...map.values()]
      .filter((acc) => acc.portionCount > 0 || acc.removedPortionCount > 0)
      .map((acc) => {
        const byBrandObj: Record<string, IngredientBrandBreakdown> = {};
        for (const [bKey, split] of acc.byBrand.entries()) {
          byBrandObj[bKey] = {
            brandId: split.brandId,
            brandName: split.brandName,
            portionCount: split.portionCount,
            orderCount: split.orderIds.size,
            weightBeforeGrams: split.weightBeforeGrams,
            weightAfterGrams: split.weightAfterGrams,
          };
        }

        return {
          key: acc.key,
          name: acc.name,
          station: acc.station,
          portionCount: acc.portionCount,
          basePortionCount: acc.basePortionCount,
          removedPortionCount: Number(acc.removedPortionCount.toFixed(2)),
          addedBySubstitutionCount: Number(acc.addedBySubstitutionCount.toFixed(2)),
          extraPortionCount: Number(acc.extraPortionCount.toFixed(2)),
          orderCount: acc.orderIds.size,
          weightBeforeGrams: acc.weightBeforeGrams,
          weightAfterGrams: acc.weightAfterGrams,
          unitBeforeGrams: acc.unitBeforeGrams,
          unitAfterGrams: acc.unitAfterGrams,
          usesDefaultWeights: acc.usesDefaultWeights,
          byBrand: byBrandObj,
          meals: [...acc.meals.values()].sort((a, b) =>
            compareKitchenMealLabels(a.mealLabel, b.mealLabel),
          ),
          adjustments: acc.adjustments,
        };
      })
      .sort(compareIngredients);

  const combinedItems = finalizeItems(combinedAccMap);
  const combinedSummary: BrandIngredientsSummary = {
    brandKey: 'all',
    brandId: null,
    brandName: 'مجمع كل الشركات',
    orderCount: combinedOrderIds.size,
    cookedMealCount: combinedCookedMeals,
    frozenExcludedMealCount: combinedFrozenMeals,
    totalWeightBeforeGrams: combinedItems.reduce((sum, item) => sum + item.weightBeforeGrams, 0),
    totalWeightAfterGrams: combinedItems.reduce((sum, item) => sum + item.weightAfterGrams, 0),
    items: combinedItems,
    adjustments: combinedAdjustments,
  };

  const byBrand: Record<string, BrandIngredientsSummary> = {};
  for (const brand of brands) {
    byBrand[brand.id] = createEmptySummary(brand.id, brand.id, brand.name);
  }

  for (const [bKey, meta] of brandMeta.entries()) {
    const items = finalizeItems(brandAccMaps.get(bKey) ?? new Map());
    byBrand[bKey] = {
      brandKey: bKey,
      brandId: meta.brandId,
      brandName: meta.brandName,
      orderCount: meta.orderIds.size,
      cookedMealCount: meta.cookedMealCount,
      frozenExcludedMealCount: meta.frozenExcludedMealCount,
      totalWeightBeforeGrams: items.reduce((sum, item) => sum + item.weightBeforeGrams, 0),
      totalWeightAfterGrams: items.reduce((sum, item) => sum + item.weightAfterGrams, 0),
      items,
      adjustments: meta.adjustments,
    };
  }

  const activeBrandColumns = [...brandMeta.entries()]
    .map(([bKey, meta]) => ({
      id: bKey,
      name: meta.brandName,
      orderCount: meta.orderIds.size,
      cookedMealCount: meta.cookedMealCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  return {
    date,
    brands: activeBrandColumns,
    combined: combinedSummary,
    byBrand,
  };
}

export function formatKitchenWeight(grams: number): {
  primary: string;
  secondary?: string;
} {
  const rounded = Math.round(grams);
  if (rounded >= 1000) {
    const kg = (rounded / 1000).toFixed(2);
    return {
      primary: `${kg} كجم`,
      secondary: `${rounded.toLocaleString('en-US')} جم`,
    };
  }
  return {
    primary: `${rounded.toLocaleString('en-US')} جم`,
  };
}

export function describeMealCategoryLabel(category: KitchenCategory): string {
  return KITCHEN_CATEGORY_LABELS[category] ?? category;
}
