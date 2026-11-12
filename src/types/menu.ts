export type MenuCategory = 'meat' | 'chicken' | 'fish' | 'mix' | 'salad' | 'snacks';

export interface MealIngredientSnapshot {
  ingredient_id?: string;
  name: string;
  weight_before_grams: number | null;
  weight_after_grams: number | null;
}

export interface Meal {
  id: string;
  brand_id: string;
  name: string;
  description?: string;
  category: MenuCategory;
  custom_category?: string;
  price: number | null;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  calories: number;
  is_available?: boolean;
  display_order?: number;
  ingredients?: MealIngredientSnapshot[];
  created_at: string;
  updated_at: string;
}

export interface PackagePlanMealItem {
  id: string;
  menu_item_id: string | null;
  custom_meal_name: string | null;
  display_order: number;
  label: string;
  source: 'menu' | 'custom';
}

export interface PackagePlan {
  id: string;
  brand_id: string;
  name: string;
  days_count: number;
  price: number;
  created_at: string;
  updated_at: string;
  items: PackagePlanMealItem[];
}

export interface MealInput {
  id?: string;
  brand_id: string;
  name: string;
  description?: string;
  category: MenuCategory;
  custom_category?: string;
  price: number | null;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  calories: number;
  is_available?: boolean;
  display_order?: number;
  ingredients?: MealIngredientSnapshot[];
}

export interface PackagePlanInputItem {
  menu_item_id?: string;
  custom_meal_name?: string;
}

export interface PackagePlanInput {
  id?: string;
  brand_id: string;
  name: string;
  days_count: number;
  price: number;
  items: PackagePlanInputItem[];
}

export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  meat: 'لحوم',
  chicken: 'دجاج',
  fish: 'أسماك',
  mix: 'ميكس',
  salad: 'سلطات',
  snacks: 'سناكس',
};

export const MENU_CATEGORY_ORDER: MenuCategory[] = ['meat', 'chicken', 'fish', 'mix', 'salad', 'snacks'];

export function mapCustomCategoryToMenuCategory(categoryName: string, mealName = ''): MenuCategory {
  const combined = `${categoryName} ${mealName}`.toLowerCase();
  if (/(salad|سلط|سيزر|فتوش|تبول|كينوا جاردن)/u.test(combined)) return 'salad';
  if (/(snack|dessert|breakfast|فطار|سناك|حلو|شوفان|oats|pancake|بان كيك|وافل|ميني|بار)/u.test(combined)) return 'snacks';
  if (/(fish|seafood|sea\s*food|salmon|tuna|shrimp|أسماك|اسماك|سمك|سالمون|جمبري|تونة|سي فود)/u.test(combined)) return 'fish';
  if (/(chicken|poultry|دجاج|فراخ|تشيكن|شيش طاووق|بيكاتا|فهيتا دجاج)/u.test(combined)) return 'chicken';
  if (/(beef|meat|steak|kofta|veal|لحوم|لحم|بيف|ستيك|استيك|كفتة|كفته|كبدة|ميتبول)/u.test(combined)) return 'meat';
  if (/(mix|ميكس|مشكل|كومبو)/u.test(combined)) return 'mix';
  return 'mix';
}