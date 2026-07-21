import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrationssupabase/types';
import { getSupabaseOfflineReason, isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import { compactWhitespace } from '@/lib/utils';
import { buildDemoMealsForBrand, buildDemoPackagesForBrand, deleteLocalMeal, deleteLocalPackage, getLocalMenuCatalog, seedLocalDemoCatalog, upsertLocalMeal, upsertLocalPackage } from '@/store/menuCatalog';
import { Meal, MealInput, PackagePlan, PackagePlanInput } from '@/types/menu';
import { LOCAL_DEMO_BRANDS } from '@/hooks/useBrands';

type MenuItemRow = Database['public']['Tables']['menu_items']['Row'];
type MenuItemInsert = Database['public']['Tables']['menu_items']['Insert'];
type PackagePlanRow = Database['public']['Tables']['package_plans']['Row'];
type PackagePlanInsert = Database['public']['Tables']['package_plans']['Insert'];
type PackagePlanItemRow = Database['public']['Tables']['package_plan_items']['Row'];
type PackagePlanItemInsert = Database['public']['Tables']['package_plan_items']['Insert'];
type CatalogTable = 'menu_items' | 'package_plans' | 'package_plan_items';
type MenuCatalogStorageMode = 'database' | 'local';

export type CatalogLoadErrorKind = 'missing_tables' | 'access_denied' | 'unknown';

export interface CatalogLoadError {
  kind: CatalogLoadErrorKind;
  title: string;
  description: string;
  details: string[];
  missingTables: CatalogTable[];
}

type CatalogQueryResult<TData> = {
  table: CatalogTable;
  data: TData[] | null;
  error: {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  } | null;
};

const CATALOG_TABLE_LABELS: Record<CatalogTable, string> = {
  menu_items: 'الوجبات',
  package_plans: 'الباقات',
  package_plan_items: 'مكونات الباقات',
};

function formatCatalogErrorDetails(result: CatalogQueryResult<unknown>) {
  const parts = [result.error?.message, result.error?.details, result.error?.hint].filter(Boolean);
  return `${CATALOG_TABLE_LABELS[result.table]}: ${parts.join(' - ') || 'خطأ غير معروف'}`;
}

function isMissingTableError(result: CatalogQueryResult<unknown>) {
  return result.error?.code === 'PGRST205'
    || result.error?.message?.includes("Could not find the table")
    || result.error?.message?.includes('schema cache')
    || result.error?.message?.includes(`'public.${result.table}'`)
    || result.error?.message?.includes(`public.${result.table}`)
    || false;
}

function isAccessDeniedError(result: CatalogQueryResult<unknown>) {
  return result.error?.code === '42501'
    || result.error?.message?.toLowerCase().includes('permission denied')
    || false;
}

function isNetworkErrorResult(result: CatalogQueryResult<unknown>) {
  return isSupabaseNetworkError(result.error);
}

function buildCatalogLoadError(results: CatalogQueryResult<unknown>[]): CatalogLoadError | null {
  const failed = results.filter(result => result.error);
  if (failed.length === 0) {
    return null;
  }

  const missingTables = failed.filter(isMissingTableError).map(result => result.table);
  if (missingTables.length > 0) {
    return {
      kind: 'missing_tables',
      title: 'جداول المنيو والباقات غير مفعلة',
      description: 'يلزم تطبيق migration الخاصة بقسم المنيو والباقات على مشروع Supabase الحالي قبل عرض أو إدارة البيانات.',
      details: [
        `الجداول غير المتاحة: ${missingTables.map(table => CATALOG_TABLE_LABELS[table]).join('، ')}`,
        'شغّل ملف migration: supabase/migrations/20260320223000_create_menu_and_packages.sql',
        ...failed.map(formatCatalogErrorDetails),
      ],
      missingTables,
    };
  }

  if (failed.every(isAccessDeniedError)) {
    return {
      kind: 'access_denied',
      title: 'ليس لديك صلاحية للوصول إلى بيانات المنيو والباقات',
      description: 'تأكد من صلاحيات الحساب أو سياسات RLS الخاصة بالجداول الجديدة.',
      details: failed.map(formatCatalogErrorDetails),
      missingTables: [],
    };
  }

  return {
    kind: 'unknown',
    title: 'تعذر تحميل بيانات المنيو والباقات',
    description: 'حدث خطأ أثناء قراءة بيانات الوجبات أو الباقات. يمكنك إعادة المحاولة، وإذا استمر الخطأ فراجع إعدادات Supabase والمهاجرات.',
    details: failed.map(formatCatalogErrorDetails),
    missingTables: [],
  };
}

function mapMeal(row: MenuItemRow): Meal {
  return {
    id: row.id,
    brand_id: row.brand_id,
    name: row.name,
    category: row.category as Meal['category'],
    price: row.price === null ? null : Number(row.price),
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    calories: row.calories,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildPackages(packageRows: PackagePlanRow[], packageItemRows: PackagePlanItemRow[], meals: Meal[]) {
  const mealMap = new Map(meals.map(meal => [meal.id, meal]));
  const itemsByPackageId = new Map<string, PackagePlanItemRow[]>();

  for (const item of packageItemRows) {
    const current = itemsByPackageId.get(item.package_plan_id) ?? [];
    current.push(item);
    itemsByPackageId.set(item.package_plan_id, current);
  }

  return packageRows.map((pkg) => ({
    id: pkg.id,
    brand_id: pkg.brand_id,
    name: pkg.name,
    days_count: pkg.days_count,
    price: Number(pkg.price),
    created_at: pkg.created_at,
    updated_at: pkg.updated_at,
    items: (itemsByPackageId.get(pkg.id) ?? [])
      .sort((left, right) => left.display_order - right.display_order)
      .map((item) => {
        const meal = item.menu_item_id ? mealMap.get(item.menu_item_id) : null;
        const label = meal?.name ?? item.custom_meal_name ?? 'وجبة';

        return {
          id: item.id,
          menu_item_id: item.menu_item_id,
          custom_meal_name: item.custom_meal_name,
          display_order: item.display_order,
          label,
          source: meal ? 'menu' as const : 'custom' as const,
        };
      }),
  } satisfies PackagePlan));
}

export function useMenuCatalog() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [packages, setPackages] = useState<PackagePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<CatalogLoadError | null>(null);
  const [storageMode, setStorageMode] = useState<MenuCatalogStorageMode>('database');
  const [fallbackReason, setFallbackReason] = useState('');

  const activateLocalMode = useCallback((reason: string) => {
    let localCatalog = getLocalMenuCatalog();

    if (localCatalog.meals.length === 0 && localCatalog.packages.length === 0) {
      for (const brand of LOCAL_DEMO_BRANDS) {
        const nextState = seedLocalDemoCatalog(brand.id, brand.name);
        localCatalog = { meals: nextState.meals, packages: nextState.packages };
      }
    }

    setMeals(localCatalog.meals);
    setPackages(localCatalog.packages);
    setStorageMode('local');
    setFallbackReason(reason);
    setLoadError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);

    if (isSupabaseUnavailable()) {
      activateLocalMode(getSupabaseOfflineReason('قسم المنيو والباقات'));
      setLoading(false);
      return true;
    }

    const results = await Promise.all([
      supabase.from('menu_items').select('*').order('created_at', { ascending: false }).then((response) => ({ table: 'menu_items' as const, ...response })),
      supabase.from('package_plans').select('*').order('created_at', { ascending: false }).then((response) => ({ table: 'package_plans' as const, ...response })),
      supabase.from('package_plan_items').select('*').order('display_order', { ascending: true }).then((response) => ({ table: 'package_plan_items' as const, ...response })),
    ]);

    if (results.some(isNetworkErrorResult)) {
      markSupabaseUnavailable();
      activateLocalMode(getSupabaseOfflineReason('قسم المنيو والباقات'));
      setLoading(false);
      return true;
    }

    const nextError = buildCatalogLoadError(results);
    if (nextError) {
      if (nextError.kind === 'missing_tables') {
        activateLocalMode('يتم تشغيل القسم بحفظ محلي مؤقت لحين تطبيق migration الخاصة بالمنيو والباقات على Supabase.');
        setLoading(false);
        return true;
      }

      setLoadError(nextError);
      toast.error(nextError.title);
      results.filter(result => result.error).forEach(result => console.error(result.error));
      setLoading(false);
      return false;
    }

    markSupabaseAvailable();

    const mealsResponse = results.find(result => result.table === 'menu_items') as CatalogQueryResult<MenuItemRow>;
    const packagesResponse = results.find(result => result.table === 'package_plans') as CatalogQueryResult<PackagePlanRow>;
    const packageItemsResponse = results.find(result => result.table === 'package_plan_items') as CatalogQueryResult<PackagePlanItemRow>;

    const nextMeals = (mealsResponse.data ?? []).map(mapMeal);
    const nextPackages = buildPackages(packagesResponse.data ?? [], packageItemsResponse.data ?? [], nextMeals);

    setMeals(nextMeals);
    setPackages(nextPackages);
    setLoadError(null);
    setStorageMode('database');
    setFallbackReason('');
    setLoading(false);
    return true;
  }, [activateLocalMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useSupabaseReconnect(() => {
    void refresh();
  });

  useSupabaseRealtimeRefresh({
    channelName: 'menu-catalog-realtime',
    tables: [{ table: 'menu_items' }, { table: 'package_plans' }, { table: 'package_plan_items' }],
    onRefresh: refresh,
  });

  const saveMeal = async (input: MealInput) => {
    if (storageMode === 'local') {
      const nextState = upsertLocalMeal(input);
      setMeals(nextState.meals);
      setPackages(nextState.packages);
      toast.success(input.id ? 'تم تعديل الوجبة محليًا' : 'تمت إضافة الوجبة محليًا');
      return true;
    }

    const payload: MenuItemInsert = {
      id: input.id,
      brand_id: input.brand_id,
      name: compactWhitespace(input.name),
      category: input.category,
      price: input.price,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      calories: input.calories,
    };

    const query = input.id
      ? supabase.from('menu_items').update(payload).eq('id', input.id)
      : supabase.from('menu_items').insert(payload);

    const { error } = await query;
    if (error) {
      if (isMissingTableError({ table: 'menu_items', data: null, error }) || isSupabaseNetworkError(error)) {
        if (isSupabaseNetworkError(error)) {
          markSupabaseUnavailable();
        }

        activateLocalMode(isSupabaseNetworkError(error)
          ? getSupabaseOfflineReason('قسم المنيو والباقات')
          : 'يتم تشغيل القسم بحفظ محلي مؤقت لحين تطبيق migration الخاصة بالمنيو والباقات على Supabase.');
        const nextState = upsertLocalMeal(input);
        setMeals(nextState.meals);
        setPackages(nextState.packages);
        toast.success(input.id ? 'تم تعديل الوجبة محليًا' : 'تمت إضافة الوجبة محليًا');
        return true;
      }

      toast.error(input.id ? 'تعذر تعديل الوجبة' : 'تعذر إضافة الوجبة');
      console.error(error);
      return false;
    }

    await refresh();
    toast.success(input.id ? 'تم تعديل الوجبة' : 'تمت إضافة الوجبة');
    return true;
  };

  const deleteMeal = async (mealId: string) => {
    if (storageMode === 'local') {
      const nextState = deleteLocalMeal(mealId);
      setMeals(nextState.meals);
      setPackages(nextState.packages);
      toast.success('تم حذف الوجبة محليًا');
      return true;
    }

    const { error } = await supabase.from('menu_items').delete().eq('id', mealId);
    if (error) {
      if (isMissingTableError({ table: 'menu_items', data: null, error }) || isSupabaseNetworkError(error)) {
        if (isSupabaseNetworkError(error)) {
          markSupabaseUnavailable();
        }

        activateLocalMode(isSupabaseNetworkError(error)
          ? getSupabaseOfflineReason('قسم المنيو والباقات')
          : 'يتم تشغيل القسم بحفظ محلي مؤقت لحين تطبيق migration الخاصة بالمنيو والباقات على Supabase.');
        const nextState = deleteLocalMeal(mealId);
        setMeals(nextState.meals);
        setPackages(nextState.packages);
        toast.success('تم حذف الوجبة محليًا');
        return true;
      }

      toast.error('تعذر حذف الوجبة');
      console.error(error);
      return false;
    }

    await refresh();
    toast.success('تم حذف الوجبة');
    return true;
  };

  const savePackage = async (input: PackagePlanInput) => {
    if (storageMode === 'local') {
      const nextState = upsertLocalPackage(input, meals);
      setMeals(nextState.meals);
      setPackages(nextState.packages);
      toast.success(input.id ? 'تم تعديل الباقة محليًا' : 'تم إنشاء الباقة محليًا');
      return true;
    }

    const packagePayload: PackagePlanInsert = {
      id: input.id,
      brand_id: input.brand_id,
      name: compactWhitespace(input.name),
      days_count: input.days_count,
      price: input.price,
    };

    const packageResponse = input.id
      ? await supabase.from('package_plans').update(packagePayload).eq('id', input.id).select('*').single()
      : await supabase.from('package_plans').insert(packagePayload).select('*').single();

    if (packageResponse.error || !packageResponse.data) {
      if (isMissingTableError({ table: 'package_plans', data: null, error: packageResponse.error }) || isSupabaseNetworkError(packageResponse.error)) {
        if (isSupabaseNetworkError(packageResponse.error)) {
          markSupabaseUnavailable();
        }

        activateLocalMode(isSupabaseNetworkError(packageResponse.error)
          ? getSupabaseOfflineReason('قسم المنيو والباقات')
          : 'يتم تشغيل القسم بحفظ محلي مؤقت لحين تطبيق migration الخاصة بالمنيو والباقات على Supabase.');
        const nextState = upsertLocalPackage(input, meals);
        setMeals(nextState.meals);
        setPackages(nextState.packages);
        toast.success(input.id ? 'تم تعديل الباقة محليًا' : 'تم إنشاء الباقة محليًا');
        return true;
      }

      toast.error(input.id ? 'تعذر تعديل الباقة' : 'تعذر إنشاء الباقة');
      console.error(packageResponse.error);
      return false;
    }

    const packageId = packageResponse.data.id;

    const deleteResponse = await supabase.from('package_plan_items').delete().eq('package_plan_id', packageId);
    if (deleteResponse.error) {
      toast.error('تعذر تحديث مكونات الباقة');
      console.error(deleteResponse.error);
      return false;
    }

    const itemPayload: PackagePlanItemInsert[] = input.items.map((item, index) => ({
      package_plan_id: packageId,
      menu_item_id: item.menu_item_id ?? null,
      custom_meal_name: item.menu_item_id ? null : compactWhitespace(item.custom_meal_name ?? ''),
      display_order: index,
    }));

    if (itemPayload.length > 0) {
      const insertResponse = await supabase.from('package_plan_items').insert(itemPayload);
      if (insertResponse.error) {
        toast.error('تعذر حفظ مكونات الباقة');
        console.error(insertResponse.error);
        return false;
      }
    }

    await refresh();
    toast.success(input.id ? 'تم تعديل الباقة' : 'تم إنشاء الباقة');
    return true;
  };

  const deletePackage = async (packageId: string) => {
    if (storageMode === 'local') {
      const nextState = deleteLocalPackage(packageId);
      setMeals(nextState.meals);
      setPackages(nextState.packages);
      toast.success('تم حذف الباقة محليًا');
      return true;
    }

    const { error } = await supabase.from('package_plans').delete().eq('id', packageId);
    if (error) {
      if (isMissingTableError({ table: 'package_plans', data: null, error }) || isSupabaseNetworkError(error)) {
        if (isSupabaseNetworkError(error)) {
          markSupabaseUnavailable();
        }

        activateLocalMode(isSupabaseNetworkError(error)
          ? getSupabaseOfflineReason('قسم المنيو والباقات')
          : 'يتم تشغيل القسم بحفظ محلي مؤقت لحين تطبيق migration الخاصة بالمنيو والباقات على Supabase.');
        const nextState = deleteLocalPackage(packageId);
        setMeals(nextState.meals);
        setPackages(nextState.packages);
        toast.success('تم حذف الباقة محليًا');
        return true;
      }

      toast.error('تعذر حذف الباقة');
      console.error(error);
      return false;
    }

    await refresh();
    toast.success('تم حذف الباقة');
    return true;
  };

  const loadDemoCatalog = async (brandId: string, brandName: string) => {
    const normalizedBrandName = compactWhitespace(brandName);
    if (!brandId || !normalizedBrandName) {
      return false;
    }

    if (storageMode === 'local') {
      const nextState = seedLocalDemoCatalog(brandId, normalizedBrandName);
      setMeals(nextState.meals);
      setPackages(nextState.packages);
      toast.success(`تم تحميل ${nextState.createdMealsCount} وجبة و${nextState.createdPackagesCount} باقات تجريبية للبراند ${normalizedBrandName}`);
      return true;
    }

    const demoMealsBlueprint = buildDemoMealsForBrand(normalizedBrandName);
    const demoPackagesBlueprint = buildDemoPackagesForBrand(normalizedBrandName);

    const demoMeals: MealInput[] = demoMealsBlueprint.map((meal) => ({
      brand_id: brandId,
      name: meal.name,
      category: meal.category,
      price: meal.price,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      calories: meal.calories,
    }));

    const createdMealIdsByName = new Map<string, string>();
    for (const meal of demoMeals) {
      const payload: MenuItemInsert = {
        brand_id: meal.brand_id,
        name: compactWhitespace(meal.name),
        category: meal.category,
        price: meal.price,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        calories: meal.calories,
      };

      const response = await supabase
        .from('menu_items')
        .upsert(payload, { onConflict: 'brand_id,name' })
        .select('id, name')
        .single();

      if (response.error || !response.data?.id) {
        if (isMissingTableError({ table: 'menu_items', data: null, error: response.error }) || isSupabaseNetworkError(response.error)) {
          if (isSupabaseNetworkError(response.error)) {
            markSupabaseUnavailable();
          }

          activateLocalMode(isSupabaseNetworkError(response.error)
            ? getSupabaseOfflineReason('قسم المنيو والباقات')
            : 'يتم تشغيل القسم بحفظ محلي مؤقت لحين تطبيق migration الخاصة بالمنيو والباقات على Supabase.');
          const nextState = seedLocalDemoCatalog(brandId, normalizedBrandName);
          setMeals(nextState.meals);
          setPackages(nextState.packages);
          toast.success(`تم تحميل ${nextState.createdMealsCount} وجبة و${nextState.createdPackagesCount} باقات تجريبية للبراند ${normalizedBrandName}`);
          return true;
        }

        toast.error('تعذر تحميل الوجبات التجريبية');
        console.error(response.error);
        return false;
      }

      createdMealIdsByName.set(response.data.name, response.data.id);
    }

    for (const pkg of demoPackagesBlueprint) {
      const packagePayload: PackagePlanInsert = {
        brand_id: brandId,
        name: pkg.name,
        days_count: pkg.days_count,
        price: pkg.price,
      };

      const packageResponse = await supabase
        .from('package_plans')
        .upsert(packagePayload, { onConflict: 'brand_id,name' })
        .select('id')
        .single();

      if (packageResponse.error || !packageResponse.data?.id) {
        toast.error('تعذر تحميل الباقات التجريبية');
        console.error(packageResponse.error);
        return false;
      }

      const packageId = packageResponse.data.id;
      const deleteResponse = await supabase.from('package_plan_items').delete().eq('package_plan_id', packageId);
      if (deleteResponse.error) {
        toast.error('تعذر تحديث مكونات الباقات التجريبية');
        console.error(deleteResponse.error);
        return false;
      }

      const itemPayload: PackagePlanItemInsert[] = pkg.mealNames
        .map((mealName, index) => {
          const mealId = createdMealIdsByName.get(mealName);
          if (!mealId) {
            return null;
          }

          return {
            package_plan_id: packageId,
            menu_item_id: mealId,
            custom_meal_name: null,
            display_order: index,
          };
        })
        .filter(Boolean) as PackagePlanItemInsert[];

      if (itemPayload.length > 0) {
        const insertResponse = await supabase.from('package_plan_items').insert(itemPayload);
        if (insertResponse.error) {
          toast.error('تعذر حفظ مكونات الباقات التجريبية');
          console.error(insertResponse.error);
          return false;
        }
      }
    }

    await refresh();
    toast.success(`تم تحميل ${demoMeals.length} وجبة و${demoPackagesBlueprint.length} باقات تجريبية للبراند ${normalizedBrandName}`);
    return true;
  };

  return {
    meals,
    packages,
    loading,
    storageMode,
    fallbackReason,
    loadError,
    refresh,
    saveMeal,
    deleteMeal,
    savePackage,
    deletePackage,
    loadDemoCatalog,
  };
}