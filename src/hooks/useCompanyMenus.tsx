import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrationssupabase/types';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import { compactWhitespace } from '@/lib/utils';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import {
  MenuCompany,
  MenuCompanyCategory,
  MenuCompanyInput,
  MenuCompanyMeal,
  MenuCompanyMealInput,
  MenuIngredient,
  MenuMealIngredientLink,
} from '@/types/companyMenu';

type CompanyRow = Database['public']['Tables']['menu_companies']['Row'] & {
  brand_id?: string | null;
  color?: string | null;
};
type CategoryRow = Database['public']['Tables']['menu_company_categories']['Row'];
type IngredientRow = Database['public']['Tables']['menu_ingredients']['Row'] & {
  inventory_item_id?: string | null;
  unit_cost_per_kg?: number | null;
};
type MealRow = Database['public']['Tables']['menu_company_meals']['Row'] & {
  is_available?: boolean | null;
};
type MealIngredientRow = Database['public']['Tables']['menu_meal_ingredients']['Row'];

function mapCompany(row: CompanyRow): MenuCompany {
  return {
    id: row.id,
    brand_id: row.brand_id ?? null,
    color: row.color ?? '#10b981',
    name: row.name,
    phone: row.phone,
    phone_numbers: row.phone_numbers ?? [],
    contact_person: row.contact_person,
    notes: row.notes,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCategory(row: CategoryRow): MenuCompanyCategory {
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    display_order: row.display_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapIngredient(row: IngredientRow): MenuIngredient {
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    inventory_item_id: row.inventory_item_id ?? null,
    unit_cost_per_kg: row.unit_cost_per_kg === null || row.unit_cost_per_kg === undefined ? null : Number(row.unit_cost_per_kg),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMeal(row: MealRow, ingredients: MenuMealIngredientLink[]): MenuCompanyMeal {
  return {
    id: row.id,
    company_id: row.company_id,
    category_id: row.category_id,
    name: row.name,
    description: row.description ?? '',
    calories: row.calories === null ? null : Number(row.calories),
    protein: row.protein === null ? null : Number(row.protein),
    carbs: row.carbs === null ? null : Number(row.carbs),
    fat: row.fat === null ? null : Number(row.fat),
    fiber: row.fiber === null ? null : Number(row.fiber),
    price: row.price === null ? null : Number(row.price),
    is_available: row.is_available ?? true,
    display_order: row.display_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ingredients,
  };
}

export function useCompanyMenus() {
  const [companies, setCompanies] = useState<MenuCompany[]>([]);
  const [categories, setCategories] = useState<MenuCompanyCategory[]>([]);
  const [ingredients, setIngredients] = useState<MenuIngredient[]>([]);
  const [meals, setMeals] = useState<MenuCompanyMeal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (isSupabaseUnavailable()) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [companiesRes, categoriesRes, ingredientsRes, mealsRes, mealIngredientsRes] = await Promise.all([
      supabase.from('menu_companies').select('*').order('name'),
      supabase.from('menu_company_categories').select('*').order('display_order'),
      supabase.from('menu_ingredients').select('*').order('name'),
      supabase.from('menu_company_meals').select('*').order('display_order'),
      supabase.from('menu_meal_ingredients').select('*').order('display_order'),
    ]);

    const responses = [companiesRes, categoriesRes, ingredientsRes, mealsRes, mealIngredientsRes];
    const networkError = responses.find(response => isSupabaseNetworkError(response.error));
    if (networkError) {
      markSupabaseUnavailable();
      setLoading(false);
      return;
    }

    const firstError = responses.find(response => response.error);
    if (firstError?.error) {
      // Fail softly when RLS or optional tables aren't present yet so unified hub keeps working
      console.warn('Company menus query notice:', firstError.error);
      setLoading(false);
      return;
    }

    markSupabaseAvailable();
    const mealIngredientRows = (mealIngredientsRes.data ?? []) as MealIngredientRow[];
    const ingredientsByMeal = new Map<string, MenuMealIngredientLink[]>();
    mealIngredientRows.forEach(row => {
      const existing = ingredientsByMeal.get(row.meal_id) ?? [];
      existing.push({
        ingredient_id: row.ingredient_id,
        weight_before_grams: row.weight_before_grams === null ? null : Number(row.weight_before_grams),
        weight_after_grams: row.weight_after_grams === null ? null : Number(row.weight_after_grams),
      });
      ingredientsByMeal.set(row.meal_id, existing);
    });

    setCompanies(((companiesRes.data ?? []) as CompanyRow[]).map(mapCompany));
    setCategories(((categoriesRes.data ?? []) as CategoryRow[]).map(mapCategory));
    setIngredients(((ingredientsRes.data ?? []) as IngredientRow[]).map(mapIngredient));
    setMeals(((mealsRes.data ?? []) as MealRow[]).map(row => mapMeal(row, ingredientsByMeal.get(row.id) ?? [])));
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useSupabaseReconnect(() => { void refresh(); });

  useSupabaseRealtimeRefresh({
    channelName: 'companies-menus-realtime',
    tables: [
      { table: 'menu_companies' },
      { table: 'menu_company_categories' },
      { table: 'menu_company_meals' },
      { table: 'menu_ingredients' },
      { table: 'menu_meal_ingredients' },
    ],
    onRefresh: refresh,
  });

  const categoriesByCompany = useMemo(() => {
    const map = new Map<string, MenuCompanyCategory[]>();
    categories.forEach(category => {
      const existing = map.get(category.company_id) ?? [];
      existing.push(category);
      map.set(category.company_id, existing);
    });
    return map;
  }, [categories]);

  const mealsByCategory = useMemo(() => {
    const map = new Map<string, MenuCompanyMeal[]>();
    meals.forEach(meal => {
      const existing = map.get(meal.category_id) ?? [];
      existing.push(meal);
      map.set(meal.category_id, existing);
    });
    return map;
  }, [meals]);

  const ingredientsByCompany = useMemo(() => {
    const map = new Map<string, MenuIngredient[]>();
    ingredients.forEach(ingredient => {
      const existing = map.get(ingredient.company_id) ?? [];
      existing.push(ingredient);
      map.set(ingredient.company_id, existing);
    });
    return map;
  }, [ingredients]);

  const saveCompany = async (input: MenuCompanyInput) => {
    const basePayload = {
      name: compactWhitespace(input.name),
      phone: compactWhitespace(input.phone),
      phone_numbers: input.phone_numbers.map(compactWhitespace).filter(Boolean),
      contact_person: compactWhitespace(input.contact_person),
      notes: compactWhitespace(input.notes),
      status: input.status,
    };

    const extendedPayload: Record<string, unknown> = {
      ...basePayload,
      ...(input.brand_id !== undefined ? { brand_id: input.brand_id } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    };

    const loose = asSupabaseLooseClient(supabase);
    let response = input.id
      ? await loose.from('menu_companies').update(extendedPayload).eq('id', input.id)
      : await loose.from('menu_companies').insert(extendedPayload);

    if (response.error && /(column|schema cache)/i.test(response.error.message ?? '')) {
      response = input.id
        ? await supabase.from('menu_companies').update(basePayload).eq('id', input.id)
        : await supabase.from('menu_companies').insert(basePayload);
    }

    if (response.error) {
      toast.error(response.error.message || 'تعذر حفظ بيانات الشركة');
      return false;
    }

    toast.success(input.id ? 'تم تحديث بيانات الشركة' : 'تم إضافة الشركة');
    await refresh();
    return true;
  };

  const deleteCompany = async (companyId: string) => {
    const { error } = await supabase.from('menu_companies').delete().eq('id', companyId);
    if (error) {
      toast.error(error.message || 'تعذر حذف الشركة');
      return false;
    }
    toast.success('تم حذف الشركة');
    await refresh();
    return true;
  };

  const saveCategory = async (input: { id?: string; company_id: string; name: string }) => {
    const name = compactWhitespace(input.name);
    if (!name) {
      toast.error('اسم الفئة مطلوب');
      return false;
    }

    if (input.id) {
      const { error } = await supabase.from('menu_company_categories').update({ name }).eq('id', input.id);
      if (error) { toast.error(error.message || 'تعذر تحديث الفئة'); return false; }
    } else {
      const existingCount = categoriesByCompany.get(input.company_id)?.length ?? 0;
      const { error } = await supabase.from('menu_company_categories').insert({ company_id: input.company_id, name, display_order: existingCount });
      if (error) { toast.error(error.message || 'تعذر إضافة الفئة'); return false; }
    }

    await refresh();
    return true;
  };

  const deleteCategory = async (categoryId: string) => {
    const { error } = await supabase.from('menu_company_categories').delete().eq('id', categoryId);
    if (error) {
      toast.error(error.message || 'تعذر حذف الفئة. تأكد من عدم وجود وجبات بداخلها.');
      return false;
    }
    toast.success('تم حذف الفئة');
    await refresh();
    return true;
  };

  const reorderCategories = async (orderedIds: string[]) => {
    const results = await Promise.all(orderedIds.map((id, index) =>
      supabase.from('menu_company_categories').update({ display_order: index }).eq('id', id),
    ));
    const failed = results.find(result => result.error);
    if (failed?.error) {
      toast.error(failed.error.message || 'تعذر إعادة ترتيب الفئات');
      return false;
    }
    await refresh();
    return true;
  };

  const saveIngredient = async (input: {
    id?: string;
    company_id: string;
    name: string;
    inventory_item_id?: string | null;
    unit_cost_per_kg?: number | null;
  }) => {
    const name = compactWhitespace(input.name);
    if (!name) {
      toast.error('اسم المكوّن مطلوب');
      return null;
    }

    const extendedPayload: Record<string, unknown> = {
      name,
      ...(input.id ? {} : { company_id: input.company_id }),
      ...(input.inventory_item_id !== undefined ? { inventory_item_id: input.inventory_item_id } : {}),
      ...(input.unit_cost_per_kg !== undefined ? { unit_cost_per_kg: input.unit_cost_per_kg } : {}),
    };

    const loose = asSupabaseLooseClient(supabase);
    let response = input.id
      ? await loose.from('menu_ingredients').update(extendedPayload).eq('id', input.id).select('*').single()
      : await loose.from('menu_ingredients').insert(extendedPayload).select('*').single();

    if (response.error && /(column|schema cache)/i.test(response.error.message ?? '')) {
      response = input.id
        ? await supabase.from('menu_ingredients').update({ name }).eq('id', input.id).select('*').single()
        : await supabase.from('menu_ingredients').insert({ company_id: input.company_id, name }).select('*').single();
    }

    if (response.error || !response.data) {
      toast.error(response.error?.message || 'تعذر حفظ المكوّن');
      return null;
    }

    await refresh();
    return mapIngredient(response.data as IngredientRow);
  };

  const deleteIngredient = async (ingredientId: string) => {
    const { error } = await supabase.from('menu_ingredients').delete().eq('id', ingredientId);
    if (error) {
      toast.error(error.message || 'تعذر حذف المكوّن. قد يكون مستخدمًا في وجبة حالية.');
      return false;
    }
    toast.success('تم حذف المكوّن');
    await refresh();
    return true;
  };

  const syncMealIngredients = async (mealId: string, links: MenuMealIngredientLink[]) => {
    await supabase.from('menu_meal_ingredients').delete().eq('meal_id', mealId);
    if (links.length === 0) return true;
    const { error } = await supabase.from('menu_meal_ingredients').insert(
      links.map((link, index) => ({ meal_id: mealId, ingredient_id: link.ingredient_id, weight_before_grams: link.weight_before_grams, weight_after_grams: link.weight_after_grams, display_order: index })),
    );
    if (error) {
      toast.error(error.message || 'تعذر حفظ مكونات الوجبة');
      return false;
    }
    return true;
  };

  const saveMeal = async (input: MenuCompanyMealInput) => {
    const name = compactWhitespace(input.name);
    if (!name || !input.category_id) {
      toast.error('اسم الوجبة والفئة مطلوبان');
      return false;
    }

    const basePayload = {
      company_id: input.company_id,
      category_id: input.category_id,
      name,
      description: compactWhitespace(input.description),
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      fiber: input.fiber,
      price: input.price,
    };

    const extendedPayload: Record<string, unknown> = {
      ...basePayload,
      ...(input.is_available !== undefined ? { is_available: input.is_available } : {}),
    };

    const loose = asSupabaseLooseClient(supabase);

    if (input.id) {
      let { error } = await loose.from('menu_company_meals').update(extendedPayload).eq('id', input.id);
      if (error && /(column|schema cache)/i.test(error.message ?? '')) {
        const retry = await supabase.from('menu_company_meals').update(basePayload).eq('id', input.id);
        error = retry.error;
      }
      if (error) { toast.error(error.message || 'تعذر تحديث الوجبة'); return false; }
      const synced = await syncMealIngredients(input.id, input.ingredients);
      if (!synced) return false;
    } else {
      const existingCount = meals.filter(meal => meal.category_id === input.category_id).length;
      let { data, error } = await loose.from('menu_company_meals').insert({ ...extendedPayload, display_order: existingCount }).select('id').single();
      if (error && /(column|schema cache)/i.test(error.message ?? '')) {
        const retry = await supabase.from('menu_company_meals').insert({ ...basePayload, display_order: existingCount }).select('id').single();
        data = retry.data;
        error = retry.error;
      }
      if (error || !data) { toast.error(error?.message || 'تعذر إضافة الوجبة'); return false; }
      const insertedId = String((data as { id: string }).id);
      const synced = await syncMealIngredients(insertedId, input.ingredients);
      if (!synced) return false;
    }

    toast.success(input.id ? 'تم تحديث الوجبة' : 'تمت إضافة الوجبة');
    await refresh();
    return true;
  };

  const deleteMeal = async (mealId: string) => {
    const { error } = await supabase.from('menu_company_meals').delete().eq('id', mealId);
    if (error) {
      toast.error(error.message || 'تعذر حذف الوجبة');
      return false;
    }
    toast.success('تم حذف الوجبة');
    await refresh();
    return true;
  };

  const duplicateMeal = async (mealId: string) => {
    const source = meals.find(meal => meal.id === mealId);
    if (!source) return false;

    const existingCount = meals.filter(meal => meal.category_id === source.category_id).length;
    const { data, error } = await supabase.from('menu_company_meals').insert({
      company_id: source.company_id,
      category_id: source.category_id,
      name: `${source.name} (نسخة)`,
      description: source.description,
      calories: source.calories,
      protein: source.protein,
      carbs: source.carbs,
      fat: source.fat,
      fiber: source.fiber,
      price: source.price,
      display_order: existingCount,
    }).select('id').single();

    if (error || !data) {
      toast.error(error?.message || 'تعذر تكرار الوجبة');
      return false;
    }

    await syncMealIngredients(data.id, source.ingredients);
    toast.success('تم تكرار الوجبة');
    await refresh();
    return true;
  };

  const moveMeal = async (mealId: string, targetCategoryId: string) => {
    const existingCount = meals.filter(meal => meal.category_id === targetCategoryId).length;
    const { error } = await supabase.from('menu_company_meals').update({ category_id: targetCategoryId, display_order: existingCount }).eq('id', mealId);
    if (error) {
      toast.error(error.message || 'تعذر نقل الوجبة');
      return false;
    }
    toast.success('تم نقل الوجبة إلى الفئة الجديدة');
    await refresh();
    return true;
  };

  const reorderMeals = async (orderedIds: string[]) => {
    const results = await Promise.all(orderedIds.map((id, index) =>
      supabase.from('menu_company_meals').update({ display_order: index }).eq('id', id),
    ));
    const failed = results.find(result => result.error);
    if (failed?.error) {
      toast.error(failed.error.message || 'تعذر إعادة ترتيب الوجبات');
      return false;
    }
    await refresh();
    return true;
  };

  return {
    companies,
    categories,
    ingredients,
    meals,
    loading,
    categoriesByCompany,
    mealsByCategory,
    ingredientsByCompany,
    refresh,
    saveCompany,
    deleteCompany,
    saveCategory,
    deleteCategory,
    reorderCategories,
    saveIngredient,
    deleteIngredient,
    saveMeal,
    deleteMeal,
    duplicateMeal,
    moveMeal,
    reorderMeals,
  };
}
