import { useMemo } from 'react';
import { useBrands } from '@/hooks/useBrands';
import { useCompanyMenus } from '@/hooks/useCompanyMenus';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import { useOrders } from '@/hooks/useOrders';
import { compactWhitespace } from '@/lib/utils';
import KitchenPage from '@/pages/Kitchen';
import { mapCustomCategoryToMenuCategory, Meal, MealIngredientSnapshot } from '@/types/menu';

export default function KitchenRoute() {
  const { brands, loading: brandsLoading } = useBrands();
  const { orders, loading: ordersLoading, seedDemoOrders } = useOrders();
  const { meals, packages, loading: catalogLoading } = useMenuCatalog();
  const {
    companies,
    categoriesByCompany,
    mealsByCategory: companyMealsByCategory,
    ingredientsByCompany,
  } = useCompanyMenus();

  const enrichedMeals = useMemo<Meal[]>(() => {
    if (companies.length === 0) return meals;

    const brandIdByCompanyId = new Map<string, string>();
    for (const company of companies) {
      if (company.brand_id) {
        brandIdByCompanyId.set(company.id, company.brand_id);
        continue;
      }
      const matchedBrand = brands.find(
        (b) => compactWhitespace(b.name).toLowerCase() === compactWhitespace(company.name).toLowerCase(),
      );
      if (matchedBrand) {
        brandIdByCompanyId.set(company.id, matchedBrand.id);
      }
    }

    type CompanyMealEntry = {
      brandId: string | null;
      categoryName: string;
      description: string;
      calories: number | null;
      protein: number | null;
      carbs: number | null;
      fat: number | null;
      fiber: number | null;
      price: number | null;
      name: string;
      id: string;
      created_at: string;
      updated_at: string;
      ingredients: MealIngredientSnapshot[];
    };

    const byBrandAndName = new Map<string, CompanyMealEntry>();
    const byNameFallback = new Map<string, CompanyMealEntry>();

    for (const company of companies) {
      const brandId = brandIdByCompanyId.get(company.id) ?? null;
      const cats = categoriesByCompany.get(company.id) ?? [];
      const ings = ingredientsByCompany.get(company.id) ?? [];
      const ingNameById = new Map(ings.map((i) => [i.id, i.name]));

      for (const cat of cats) {
        const catMeals = companyMealsByCategory.get(cat.id) ?? [];
        for (const cm of catMeals) {
          const normName = compactWhitespace(cm.name).toLowerCase();
          const entry: CompanyMealEntry = {
            id: cm.id,
            brandId,
            name: cm.name,
            categoryName: cat.name,
            description: cm.description,
            calories: cm.calories,
            protein: cm.protein,
            carbs: cm.carbs,
            fat: cm.fat,
            fiber: cm.fiber,
            price: cm.price,
            created_at: cm.created_at,
            updated_at: cm.updated_at,
            ingredients: cm.ingredients
              .map((link) => ({
                ingredient_id: link.ingredient_id,
                name: ingNameById.get(link.ingredient_id) ?? '',
                weight_before_grams: link.weight_before_grams,
                weight_after_grams: link.weight_after_grams,
              }))
              .filter((item) => Boolean(item.name)),
          };
          if (brandId) {
            byBrandAndName.set(`${brandId}::${normName}`, entry);
          }
          if (!byNameFallback.has(normName)) {
            byNameFallback.set(normName, entry);
          }
        }
      }
    }

    const existingKeys = new Set<string>();
    const merged: Meal[] = meals.map((meal) => {
      const normName = compactWhitespace(meal.name).toLowerCase();
      existingKeys.add(`${meal.brand_id}::${normName}`);
      const cm = byBrandAndName.get(`${meal.brand_id}::${normName}`) ?? byNameFallback.get(normName);
      if (!cm) return meal;

      return {
        ...meal,
        description: meal.description || cm.description,
        fiber: meal.fiber ?? cm.fiber,
        custom_category: meal.custom_category || cm.categoryName,
        ingredients: meal.ingredients && meal.ingredients.length > 0 ? meal.ingredients : cm.ingredients,
      };
    });

    for (const [brandKey, cm] of byBrandAndName.entries()) {
      if (existingKeys.has(brandKey) || !cm.brandId) continue;
      merged.push({
        id: cm.id,
        brand_id: cm.brandId,
        name: cm.name,
        description: cm.description,
        category: mapCustomCategoryToMenuCategory(cm.categoryName, cm.name),
        custom_category: cm.categoryName,
        price: cm.price,
        protein: cm.protein ?? 0,
        carbs: cm.carbs ?? 0,
        fat: cm.fat ?? 0,
        fiber: cm.fiber,
        calories: cm.calories ?? 0,
        ingredients: cm.ingredients,
        created_at: cm.created_at,
        updated_at: cm.updated_at,
      });
    }

    return merged;
  }, [brands, categoriesByCompany, companies, companyMealsByCategory, ingredientsByCompany, meals]);

  return (
    <KitchenPage
      brands={brands}
      brandsLoading={brandsLoading}
      orders={orders}
      ordersLoading={ordersLoading}
      meals={enrichedMeals}
      packages={packages}
      catalogLoading={catalogLoading}
      seedDemoOrders={seedDemoOrders}
    />
  );
}