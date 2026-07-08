export type MenuCategory = 'meat' | 'chicken' | 'fish' | 'mix' | 'salad' | 'snacks';

export interface Meal {
  id: string;
  brand_id: string;
  name: string;
  category: MenuCategory;
  price: number | null;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
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
  category: MenuCategory;
  price: number | null;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
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