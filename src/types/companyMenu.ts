export type CompanyStatus = 'active' | 'inactive';

export interface MenuCompany {
  id: string;
  name: string;
  phone: string;
  phone_numbers: string[];
  contact_person: string;
  notes: string;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

export interface MenuCompanyInput {
  id?: string;
  name: string;
  phone: string;
  phone_numbers: string[];
  contact_person: string;
  notes: string;
  status: CompanyStatus;
}

export interface MenuCompanyCategory {
  id: string;
  company_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface MenuIngredient {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface MenuMealIngredientLink {
  ingredient_id: string;
  weight_before_grams: number | null;
  weight_after_grams: number | null;
}

export interface MenuCompanyMeal {
  id: string;
  company_id: string;
  category_id: string;
  name: string;
  description: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  price: number | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  ingredients: MenuMealIngredientLink[];
}

export interface MenuCompanyMealInput {
  id?: string;
  company_id: string;
  category_id: string;
  name: string;
  description: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  price: number | null;
  ingredients: MenuMealIngredientLink[];
}
