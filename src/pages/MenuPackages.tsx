import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BarChart3,
  Building2,
  Check,
  Copy,
  DatabaseZap,
  Download,
  Eye,
  EyeOff,
  Flame,
  FolderKanban,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Salad,
  Scale,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import CompanyMenuImportDialog from '@/components/CompanyMenuImportDialog';
import {
  CategoriesManagerDialog,
  CrossBrandCloneDialog,
  CustomerMenuShowcaseDialog,
  IngredientsAndCostingDialog,
  MenuEngineeringPanel,
} from '@/components/menu/MenuHubDialogs';
import { useAuth } from '@/hooks/useAuth';
import type { Brand } from '@/hooks/useBrands';
import { useCompanyMenus } from '@/hooks/useCompanyMenus';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { hasPageAccess } from '@/lib/permissions';
import {
  buildMenuEngineeringReport,
  computeMealCostBreakdown,
  computePackageSavings,
  InventoryCostItem,
  isProteinIngredientName,
} from '@/lib/menuHub';
import { cn, compactWhitespace, formatEGPCurrency } from '@/lib/utils';
import {
  mapCustomCategoryToMenuCategory,
  Meal,
  MealIngredientSnapshot,
  MealInput,
  MenuCategory,
  MENU_CATEGORY_LABELS,
  MENU_CATEGORY_ORDER,
  PackagePlan,
  PackagePlanInput,
} from '@/types/menu';
import { MenuCompany } from '@/types/companyMenu';
import { Order } from '@/types/order';
import { DEMO_EXPECTED_COUNTS, isBrandCatalogComplete } from '@/store/menuCatalog';

function ConfirmDeleteButton({
  title,
  description,
  onConfirm,
  ariaLabel,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  ariaLabel?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          aria-label={ariaLabel}
          className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-rose-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            تأكيد الحذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type MealIngredientDraft = {
  ingredient_id?: string;
  name: string;
  weight_before_grams: string;
  weight_after_grams: string;
};

type MealFormState = {
  id?: string;
  name: string;
  description: string;
  category: MenuCategory;
  custom_category: string;
  price: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  calories: string;
  is_available: boolean;
  ingredients: MealIngredientDraft[];
};

type PackageFormState = {
  id?: string;
  name: string;
  days_count: string;
  price: string;
  selectedMealIds: string[];
  customMeals: string[];
};

type CompanyProfileFormState = {
  id?: string;
  brand_id: string;
  name: string;
  color: string;
  phone: string;
  phoneNumbersText: string;
  contact_person: string;
  notes: string;
  status: 'active' | 'inactive';
};

function createMealFormState(meal?: Meal): MealFormState {
  return {
    id: meal?.id,
    name: meal?.name ?? '',
    description: meal?.description ?? '',
    category: meal?.category ?? 'meat',
    custom_category: meal?.custom_category ?? '',
    price: meal?.price === null || meal?.price === undefined ? '' : String(meal.price),
    protein: String(meal?.protein ?? 0),
    carbs: String(meal?.carbs ?? 0),
    fat: String(meal?.fat ?? 0),
    fiber: meal?.fiber === null || meal?.fiber === undefined ? '' : String(meal.fiber),
    calories: String(meal?.calories ?? 0),
    is_available: meal?.is_available ?? true,
    ingredients: (meal?.ingredients ?? []).map((ing) => ({
      ingredient_id: ing.ingredient_id,
      name: ing.name,
      weight_before_grams: ing.weight_before_grams === null ? '' : String(ing.weight_before_grams),
      weight_after_grams: ing.weight_after_grams === null ? '' : String(ing.weight_after_grams),
    })),
  };
}

function createPackageFormState(pkg?: PackagePlan): PackageFormState {
  return {
    id: pkg?.id,
    name: pkg?.name ?? '',
    days_count: pkg ? String(pkg.days_count) : '',
    price: pkg ? String(pkg.price) : '',
    selectedMealIds:
      pkg?.items.filter((item) => item.menu_item_id).map((item) => item.menu_item_id as string) ?? [],
    customMeals:
      pkg?.items
        .filter((item) => item.source === 'custom')
        .map((item) => item.custom_meal_name ?? '')
        .filter(Boolean) ?? [],
  };
}

function applyProteinWeightDefaults(rows: MealIngredientDraft[]): MealIngredientDraft[] {
  const proteinIndexes = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => isProteinIngredientName(row.name))
    .map(({ idx }) => idx);

  if (proteinIndexes.length === 1) {
    const targetIdx = proteinIndexes[0];
    return rows.map((row, idx) =>
      idx === targetIdx
        ? {
            ...row,
            weight_before_grams: row.weight_before_grams || '200',
            weight_after_grams: row.weight_after_grams || '125',
          }
        : row,
    );
  }
  return rows;
}

interface Props {
  brands: Brand[];
  brandsLoading?: boolean;
  orders?: Order[];
  onRefreshBrands?: () => Promise<void> | void;
}

export default function MenuPackages({ brands, brandsLoading = false, orders = [], onRefreshBrands }: Props) {
  const { role, pagePermissions = [], isDemoMode } = useAuth();
  const {
    meals,
    packages,
    loading,
    storageMode,
    fallbackReason,
    loadError,
    refresh,
    saveMeal,
    bulkSyncMeals,
    deleteMeal,
    savePackage,
    deletePackage,
    loadDemoCatalog,
  } = useMenuCatalog();

  const {
    companies,
    categoriesByCompany,
    mealsByCategory: companyMealsByCategory,
    ingredientsByCompany,
    refresh: refreshCompanies,
    saveCompany,
    saveCategory,
    deleteCategory,
    reorderCategories,
    saveIngredient,
    deleteIngredient,
    saveMeal: saveCompanyMealRow,
  } = useCompanyMenus();

  const isOwner = role === 'owner' && !isDemoMode;
  const canManage =
    !isDemoMode &&
    (role === 'owner' ||
      hasPageAccess(role, pagePermissions, 'companies-menus'));

  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'catalog' | 'companies' | 'analytics'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [packageMealSearch, setPackageMealSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | MenuCategory | string>('all');

  const [mealDialogOpen, setMealDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);
  const [ingredientsDialogOpen, setIngredientsDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [showcaseDialogOpen, setShowcaseDialogOpen] = useState(false);
  const [syncingFromCompany, setSyncingFromCompany] = useState(false);

  const [mealForm, setMealForm] = useState<MealFormState>(() => createMealFormState());
  const [newMealIngredientName, setNewMealIngredientName] = useState('');
  const [packageForm, setPackageForm] = useState<PackageFormState>(() => createPackageFormState());
  const [companyForm, setCompanyForm] = useState<CompanyProfileFormState>({
    brand_id: '',
    name: '',
    color: '#10b981',
    phone: '',
    phoneNumbersText: '',
    contact_person: '',
    notes: '',
    status: 'active',
  });

  const [inventoryItems, setInventoryItems] = useState<InventoryCostItem[]>([]);
  const seededBrandIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (brands.length === 0) {
      setSelectedBrandId('');
      return;
    }
    if (!brands.some((brand) => brand.id === selectedBrandId)) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);

  // Load central inventory items for live recipe costing (fails silently in unit tests / offline)
  useEffect(() => {
    if (isSupabaseUnavailable()) return;
    let active = true;
    const loadInventoryCosts = async () => {
      try {
        const loose = asSupabaseLooseClient(supabase);
        if (typeof loose?.from !== 'function') return;
        const { data, error } = await loose
          .from('items_master')
          .select('id, name, usage_unit, avg_cost, last_purchase_price, conversion_factor')
          .eq('status', 'active')
          .limit(400);
        if (!active || error || !Array.isArray(data) || data.length === 0) return;
        setInventoryItems(
          data
            .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
            .map((r) => {
              const avg = Number(r.avg_cost ?? 0);
              const last = Number(r.last_purchase_price ?? 0);
              const conv = Math.max(1, Number(r.conversion_factor ?? 1));
              return {
                id: String(r.id ?? ''),
                name: String(r.name ?? ''),
                usageUnit: String(r.usage_unit ?? 'kg'),
                avgCostPerUsageUnit: avg > 0 ? avg : last > 0 ? last / conv : 0,
              };
            })
            .filter((x) => Boolean(x.id) && Boolean(x.name)),
        );
      } catch {
        // Non-critical enrichment
      }
    };
    void loadInventoryCosts();
    return () => {
      active = false;
    };
  }, []);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === selectedBrandId) ?? null,
    [brands, selectedBrandId],
  );

  // Match operational brand <-> MenuCompany record (by brand_id or normalized name)
  const linkedCompany = useMemo<MenuCompany | null>(() => {
    if (!selectedBrand) return null;
    return (
      companies.find((c) => c.brand_id === selectedBrand.id) ??
      companies.find(
        (c) => compactWhitespace(c.name).toLowerCase() === compactWhitespace(selectedBrand.name).toLowerCase(),
      ) ??
      null
    );
  }, [companies, selectedBrand]);

  const companyCategories = useMemo(
    () => (linkedCompany ? categoriesByCompany.get(linkedCompany.id) ?? [] : []),
    [categoriesByCompany, linkedCompany],
  );

  const companyIngredients = useMemo(
    () => (linkedCompany ? ingredientsByCompany.get(linkedCompany.id) ?? [] : []),
    [ingredientsByCompany, linkedCompany],
  );

  const companyMeals = useMemo(
    () => companyCategories.flatMap((cat) => companyMealsByCategory.get(cat.id) ?? []),
    [companyCategories, companyMealsByCategory],
  );

  const normalizedSearchQuery = useMemo(
    () => compactWhitespace(searchQuery).toLowerCase(),
    [searchQuery],
  );

  const filteredMeals = useMemo(() => {
    const brandList = meals.filter((meal) => meal.brand_id === selectedBrandId);
    // Enrich with ingredients/description/fiber from matching companyMeals when present
    if (companyMeals.length === 0) return brandList;

    const ingNameById = new Map(companyIngredients.map((i) => [i.id, i.name]));
    const companyMealByName = new Map(
      companyMeals.map((cm) => [compactWhitespace(cm.name).toLowerCase(), cm]),
    );
    const catNameById = new Map(companyCategories.map((c) => [c.id, c.name]));

    return brandList
      .map((meal) => {
        const cm = companyMealByName.get(compactWhitespace(meal.name).toLowerCase());
        if (!cm) return meal;
        const cmIngredients: MealIngredientSnapshot[] = cm.ingredients
          .map((link) => ({
            ingredient_id: link.ingredient_id,
            name: ingNameById.get(link.ingredient_id) ?? '',
            weight_before_grams: link.weight_before_grams,
            weight_after_grams: link.weight_after_grams,
          }))
          .filter((item) => Boolean(item.name));

        return {
          ...meal,
          description: meal.description || cm.description,
          fiber: meal.fiber ?? cm.fiber,
          custom_category: meal.custom_category || catNameById.get(cm.category_id) || '',
          ingredients: meal.ingredients && meal.ingredients.length > 0 ? meal.ingredients : cmIngredients,
        };
      })
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }, [meals, selectedBrandId, companyMeals, companyIngredients, companyCategories]);

  // Detect meals stored in legacy menu_company_meals that haven't been synced into operational menu_items yet
  const unsyncedCompanyMeals = useMemo(() => {
    if (companyMeals.length === 0) return [];
    const existingNames = new Set(
      filteredMeals.map((m) => compactWhitespace(m.name).toLowerCase()),
    );
    return companyMeals.filter(
      (cm) => !existingNames.has(compactWhitespace(cm.name).toLowerCase()),
    );
  }, [companyMeals, filteredMeals]);

  const syncLegacyCompanyMealsToCatalog = async () => {
    if (!selectedBrandId || unsyncedCompanyMeals.length === 0) return;
    setSyncingFromCompany(true);
    const catNameById = new Map(companyCategories.map((c) => [c.id, c.name]));
    const ingNameById = new Map(companyIngredients.map((i) => [i.id, i.name]));

    const batch: MealInput[] = unsyncedCompanyMeals.map((cm) => {
      const catName = catNameById.get(cm.category_id) ?? '';
      const stdCat = mapCustomCategoryToMenuCategory(catName, cm.name);
      return {
        brand_id: linkedCompany?.brand_id || selectedBrandId,
        name: cm.name,
        description: cm.description,
        category: stdCat,
        custom_category: catName,
        price: cm.price,
        calories: Math.round(cm.calories ?? 0),
        protein: Math.round(cm.protein ?? 0),
        carbs: Math.round(cm.carbs ?? 0),
        fat: Math.round(cm.fat ?? 0),
        fiber: cm.fiber,
        is_available: cm.is_available ?? true,
        display_order: cm.display_order,
        ingredients: cm.ingredients
          .map((link) => ({
            ingredient_id: link.ingredient_id,
            name: ingNameById.get(link.ingredient_id) ?? '',
            weight_before_grams: link.weight_before_grams,
            weight_after_grams: link.weight_after_grams,
          }))
          .filter((x) => Boolean(x.name)),
      };
    });

    const targetBrandName = selectedBrand?.name || linkedCompany?.name || '';

    if (typeof bulkSyncMeals === 'function') {
      const { synced, error } = await bulkSyncMeals(batch, targetBrandName);
      setSyncingFromCompany(false);
      if (error) {
        toast.error(error);
        return;
      }
      if (onRefreshBrands) {
        await onRefreshBrands();
      }
      toast.success(`تمت مزامنة ${synced.toLocaleString('en-US')} وجبة مع كتالوج الطلبات والمطبخ بنجاح`);
      return;
    }

    let okCount = 0;
    for (const item of batch) {
      const ok = await saveMeal(item);
      if (ok) okCount += 1;
    }
    setSyncingFromCompany(false);
    await refresh();
    if (okCount > 0) {
      toast.success(`تمت مزامنة ${okCount.toLocaleString('en-US')} وجبة مع كتالوج الطلبات والمطبخ`);
    }
  };

  const filteredPackages = useMemo(
    () => packages.filter((pkg) => pkg.brand_id === selectedBrandId),
    [packages, selectedBrandId],
  );

  const categoryCounts = useMemo(
    () => ({
      meat: filteredMeals.filter((meal) => meal.category === 'meat').length,
      chicken: filteredMeals.filter((meal) => meal.category === 'chicken').length,
      fish: filteredMeals.filter((meal) => meal.category === 'fish').length,
      mix: filteredMeals.filter((meal) => meal.category === 'mix').length,
      salad: filteredMeals.filter((meal) => meal.category === 'salad').length,
      snacks: filteredMeals.filter((meal) => meal.category === 'snacks').length,
    }),
    [filteredMeals],
  );

  const categoryStatCards = useMemo(
    () =>
      MENU_CATEGORY_ORDER.map((category) => ({
        category,
        label: MENU_CATEGORY_LABELS[category],
        count: categoryCounts[category],
        expectedCount: DEMO_EXPECTED_COUNTS.mealsByCategory[category],
      })),
    [categoryCounts],
  );

  const isSelectedBrandCatalogComplete = useMemo(
    () => isBrandCatalogComplete(filteredMeals, filteredPackages),
    [filteredMeals, filteredPackages],
  );

  useEffect(() => {
    if (storageMode !== 'local' || !selectedBrandId || !selectedBrand || !isOwner) {
      return;
    }
    if (seededBrandIdsRef.current.includes(selectedBrandId)) {
      return;
    }
    if (isSelectedBrandCatalogComplete) {
      seededBrandIdsRef.current.push(selectedBrandId);
      return;
    }
    seededBrandIdsRef.current.push(selectedBrandId);
    void loadDemoCatalog(selectedBrandId, selectedBrand.name);
  }, [isOwner, isSelectedBrandCatalogComplete, loadDemoCatalog, selectedBrand, selectedBrandId, storageMode]);

  const customCategoryTabs = useMemo(() => {
    const set = new Set<string>();
    companyCategories.forEach((c) => {
      if (compactWhitespace(c.name)) set.add(compactWhitespace(c.name));
    });
    filteredMeals.forEach((m) => {
      if (m.custom_category && compactWhitespace(m.custom_category)) {
        set.add(compactWhitespace(m.custom_category));
      }
    });
    return Array.from(set);
  }, [companyCategories, filteredMeals]);

  const visibleMeals = useMemo(() => {
    return filteredMeals.filter((meal) => {
      const matchesCategory =
        selectedCategory === 'all' ||
        meal.category === selectedCategory ||
        compactWhitespace(meal.custom_category ?? '') === selectedCategory;

      const matchesSearch =
        !normalizedSearchQuery ||
        meal.name.toLowerCase().includes(normalizedSearchQuery) ||
        (meal.description ?? '').toLowerCase().includes(normalizedSearchQuery) ||
        MENU_CATEGORY_LABELS[meal.category].toLowerCase().includes(normalizedSearchQuery) ||
        (meal.custom_category ?? '').toLowerCase().includes(normalizedSearchQuery) ||
        (meal.ingredients ?? []).some((ing) => ing.name.toLowerCase().includes(normalizedSearchQuery));

      return matchesCategory && matchesSearch;
    });
  }, [filteredMeals, normalizedSearchQuery, selectedCategory]);

  const visiblePackages = useMemo(() => {
    return filteredPackages.filter((pkg) => {
      if (!normalizedSearchQuery) {
        return true;
      }
      return (
        pkg.name.toLowerCase().includes(normalizedSearchQuery) ||
        pkg.items.some((item) => item.label.toLowerCase().includes(normalizedSearchQuery))
      );
    });
  }, [filteredPackages, normalizedSearchQuery]);

  const mealsByCategory = useMemo(() => {
    const next = new Map<MenuCategory, Meal[]>();
    for (const category of MENU_CATEGORY_ORDER) {
      next.set(
        category,
        visibleMeals.filter((meal) => meal.category === category),
      );
    }
    return next;
  }, [visibleMeals]);

  const catalogInsights = useMemo(() => {
    const totalCalories = visibleMeals.reduce((sum, meal) => sum + meal.calories, 0);
    const totalProtein = visibleMeals.reduce((sum, meal) => sum + meal.protein, 0);
    const averagePackagePrice =
      visiblePackages.length === 0
        ? 0
        : Math.round(visiblePackages.reduce((sum, pkg) => sum + pkg.price, 0) / visiblePackages.length);

    return {
      mealCount: visibleMeals.length,
      packageCount: visiblePackages.length,
      averageCalories: visibleMeals.length === 0 ? 0 : Math.round(totalCalories / visibleMeals.length),
      averageProtein: visibleMeals.length === 0 ? 0 : Math.round(totalProtein / visibleMeals.length),
      averagePackagePrice,
    };
  }, [visibleMeals, visiblePackages]);

  const engineeringReport = useMemo(
    () => buildMenuEngineeringReport(selectedBrandId, filteredMeals, filteredPackages, orders),
    [selectedBrandId, filteredMeals, filteredPackages, orders],
  );

  // --- Dialog & Action Handlers ---
  const resetMealDialog = () => {
    setMealForm(createMealFormState());
    setNewMealIngredientName('');
    setMealDialogOpen(false);
  };

  const resetPackageDialog = () => {
    setPackageForm(createPackageFormState());
    setPackageMealSearch('');
    setPackageDialogOpen(false);
  };

  const openMealDialog = (meal?: Meal) => {
    setMealForm(createMealFormState(meal));
    setNewMealIngredientName('');
    setMealDialogOpen(true);
  };

  const openPackageDialog = (pkg?: PackagePlan) => {
    setPackageForm(createPackageFormState(pkg));
    setPackageMealSearch('');
    setPackageDialogOpen(true);
  };

  const openCompanyProfileDialog = (company?: MenuCompany | null, brand?: Brand | null) => {
    const targetCompany = company ?? linkedCompany;
    const targetBrand = brand ?? selectedBrand;
    setCompanyForm({
      id: targetCompany?.id,
      brand_id: targetCompany?.brand_id ?? targetBrand?.id ?? '',
      name: targetCompany?.name ?? targetBrand?.name ?? '',
      color: targetCompany?.color ?? targetBrand?.color ?? '#10b981',
      phone: targetCompany?.phone ?? '',
      phoneNumbersText: targetCompany?.phone_numbers?.join('، ') ?? '',
      contact_person: targetCompany?.contact_person ?? '',
      notes: targetCompany?.notes ?? '',
      status: targetCompany?.status ?? 'active',
    });
    setCompanyDialogOpen(true);
  };

  const handleSaveCompanyProfile = async () => {
    if (!companyForm.name.trim()) {
      toast.error('اسم الشركة مطلوب');
      return;
    }
    const ok = await saveCompany({
      id: companyForm.id,
      brand_id: companyForm.brand_id || null,
      color: companyForm.color,
      name: companyForm.name,
      phone: companyForm.phone,
      phone_numbers: companyForm.phoneNumbersText
        .split(/[،,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      contact_person: companyForm.contact_person,
      notes: companyForm.notes,
      status: companyForm.status,
    });
    if (ok) {
      setCompanyDialogOpen(false);
    }
  };

  const addIngredientToMealDraft = async (nameRaw: string, existingId?: string) => {
    const cleanName = compactWhitespace(nameRaw);
    if (!cleanName) return;
    if (mealForm.ingredients.some((r) => compactWhitespace(r.name).toLowerCase() === cleanName.toLowerCase())) {
      return;
    }

    let resolvedId = existingId;
    if (!resolvedId && linkedCompany) {
      const created = await saveIngredient({ company_id: linkedCompany.id, name: cleanName });
      resolvedId = created?.id;
    }

    setMealForm((prev) => ({
      ...prev,
      ingredients: applyProteinWeightDefaults([
        ...prev.ingredients,
        {
          ingredient_id: resolvedId,
          name: cleanName,
          weight_before_grams: '',
          weight_after_grams: '',
        },
      ]),
    }));
    setNewMealIngredientName('');
  };

  const updateIngredientDraftWeight = (
    idx: number,
    field: 'weight_before_grams' | 'weight_after_grams',
    val: string,
  ) => {
    setMealForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((row, i) => (i === idx ? { ...row, [field]: val } : row)),
    }));
  };

  const removeIngredientFromMealDraft = (idx: number) => {
    setMealForm((prev) => ({
      ...prev,
      ingredients: applyProteinWeightDefaults(prev.ingredients.filter((_, i) => i !== idx)),
    }));
  };

  const handleMealSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBrandId) return;

    const ingredientsSnapshot: MealIngredientSnapshot[] = mealForm.ingredients.map((row) => ({
      ingredient_id: row.ingredient_id,
      name: compactWhitespace(row.name),
      weight_before_grams: row.weight_before_grams.trim() ? Number(row.weight_before_grams) : null,
      weight_after_grams: row.weight_after_grams.trim() ? Number(row.weight_after_grams) : null,
    }));

    const payload: MealInput = {
      id: mealForm.id,
      brand_id: selectedBrandId,
      name: mealForm.name,
      description: mealForm.description,
      category: mealForm.category,
      custom_category: mealForm.custom_category,
      price: mealForm.price.trim() ? Number(mealForm.price) : null,
      protein: Number(mealForm.protein || 0),
      carbs: Number(mealForm.carbs || 0),
      fat: Number(mealForm.fat || 0),
      fiber: mealForm.fiber.trim() ? Number(mealForm.fiber) : null,
      calories: Number(mealForm.calories || 0),
      is_available: mealForm.is_available,
      ingredients: ingredientsSnapshot,
    };

    const success = await saveMeal(payload);

    // Also mirror into menu_company_meals if linkedCompany & category exist
    if (success && linkedCompany && companyCategories.length > 0) {
      const targetCat =
        companyCategories.find(
          (c) =>
            compactWhitespace(c.name).toLowerCase() ===
            compactWhitespace(mealForm.custom_category || MENU_CATEGORY_LABELS[mealForm.category]).toLowerCase(),
        ) ?? companyCategories[0];

      const existingCm = companyMeals.find(
        (cm) => compactWhitespace(cm.name).toLowerCase() === compactWhitespace(mealForm.name).toLowerCase(),
      );

      await saveCompanyMealRow({
        id: existingCm?.id,
        company_id: linkedCompany.id,
        category_id: targetCat.id,
        name: mealForm.name,
        description: mealForm.description,
        calories: Number(mealForm.calories || 0),
        protein: Number(mealForm.protein || 0),
        carbs: Number(mealForm.carbs || 0),
        fat: Number(mealForm.fat || 0),
        fiber: mealForm.fiber.trim() ? Number(mealForm.fiber) : null,
        price: mealForm.price.trim() ? Number(mealForm.price) : null,
        is_available: mealForm.is_available,
        ingredients: ingredientsSnapshot
          .filter((i) => Boolean(i.ingredient_id))
          .map((i) => ({
            ingredient_id: i.ingredient_id as string,
            weight_before_grams: i.weight_before_grams,
            weight_after_grams: i.weight_after_grams,
          })),
      });
    }

    if (success) {
      resetMealDialog();
    }
  };

  const handleDuplicateMeal = async (meal: Meal) => {
    await saveMeal({
      brand_id: meal.brand_id,
      name: `${meal.name} (نسخة)`,
      description: meal.description,
      category: meal.category,
      custom_category: meal.custom_category,
      price: meal.price,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      fiber: meal.fiber,
      calories: meal.calories,
      is_available: meal.is_available ?? true,
      ingredients: meal.ingredients ?? [],
    });
  };

  const handleToggleMealAvailability = async (meal: Meal) => {
    const nextAvailable = meal.is_available === false;
    await saveMeal({
      id: meal.id,
      brand_id: meal.brand_id,
      name: meal.name,
      description: meal.description,
      category: meal.category,
      custom_category: meal.custom_category,
      price: meal.price,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      fiber: meal.fiber,
      calories: meal.calories,
      is_available: nextAvailable,
      display_order: meal.display_order,
      ingredients: meal.ingredients,
    });
  };

  const handleMoveMealOrder = async (categoryMeals: Meal[], index: number, direction: -1 | 1) => {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= categoryMeals.length) return;
    const currentMeal = categoryMeals[index];
    const targetMeal = categoryMeals[swapIdx];
    await Promise.all([
      saveMeal({ ...currentMeal, display_order: swapIdx }),
      saveMeal({ ...targetMeal, display_order: index }),
    ]);
  };

  const handleDuplicatePackage = async (pkg: PackagePlan) => {
    await savePackage({
      brand_id: pkg.brand_id,
      name: `${pkg.name} (نسخة)`,
      days_count: pkg.days_count,
      price: pkg.price,
      items: pkg.items.map((it) =>
        it.menu_item_id ? { menu_item_id: it.menu_item_id } : { custom_meal_name: it.label },
      ),
    });
  };

  const toggleMealSelection = (mealId: string) => {
    setPackageForm((current) => ({
      ...current,
      selectedMealIds: current.selectedMealIds.includes(mealId)
        ? current.selectedMealIds.filter((id) => id !== mealId)
        : [...current.selectedMealIds, mealId],
    }));
  };

  const updateCustomMeal = (index: number, value: string) => {
    setPackageForm((current) => ({
      ...current,
      customMeals: current.customMeals.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  };

  const addCustomMeal = () => {
    setPackageForm((current) => ({ ...current, customMeals: [...current.customMeals, ''] }));
  };

  const removeCustomMeal = (index: number) => {
    setPackageForm((current) => ({
      ...current,
      customMeals: current.customMeals.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handlePackageSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBrandId) return;

    const payload: PackagePlanInput = {
      id: packageForm.id,
      brand_id: selectedBrandId,
      name: packageForm.name,
      days_count: Number(packageForm.days_count || 0),
      price: Number(packageForm.price || 0),
      items: [
        ...packageForm.selectedMealIds.map((menu_item_id) => ({ menu_item_id })),
        ...packageForm.customMeals
          .map((custom_meal_name) => custom_meal_name.trim())
          .filter(Boolean)
          .map((custom_meal_name) => ({ custom_meal_name })),
      ],
    };

    const success = await savePackage(payload);
    if (success) {
      resetPackageDialog();
    }
  };

  const handleExportToExcel = async () => {
    if (!selectedBrand) return;
    const XLSX = await import('xlsx');
    const mealsSheetRows = filteredMeals.map((m) => {
      const cost = computeMealCostBreakdown(m, companyIngredients, inventoryItems);
      return {
        'اسم الوجبة': m.name,
        'القسم': MENU_CATEGORY_LABELS[m.category],
        'الفئة المخصصة': m.custom_category || '',
        'الوصف': m.description || '',
        'السعر': m.price ?? '',
        'التكلفة التقديرية': cost.estimatedCost ?? '',
        'Food Cost %': cost.foodCostPct !== null ? `${cost.foodCostPct.toFixed(1)}%` : '',
        'السعرات': m.calories,
        'بروتين': m.protein,
        'كارب': m.carbs,
        'دهون': m.fat,
        'ألياف': m.fiber ?? '',
        'الحالة': m.is_available === false ? 'متوقفة مؤقتاً' : 'متاحة',
        'المكونات (قبل->بعد جرام)': (m.ingredients ?? [])
          .map((ing) =>
            ing.weight_before_grams !== null || ing.weight_after_grams !== null
              ? `${ing.name} (${ing.weight_before_grams ?? ''}->${ing.weight_after_grams ?? ''})`
              : ing.name,
          )
          .join('، '),
      };
    });

    const packagesSheetRows = filteredPackages.map((pkg) => ({
      'اسم الباقة': pkg.name,
      'عدد الأيام': pkg.days_count,
      'السعر': pkg.price,
      'متوسط اليوم': pkg.days_count > 0 ? Math.round(pkg.price / pkg.days_count) : pkg.price,
      'وجبات الباقة': pkg.items.map((i) => i.label).join('، '),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mealsSheetRows), 'الوجبات');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(packagesSheetRows), 'الباقات');
    XLSX.writeFile(wb, `menu-${selectedBrand.name.replace(/\s+/g, '-')}.xlsx`);
  };

  if (brandsLoading || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="space-y-5">
        <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50 text-rose-800">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>لا توجد براندات متاحة</AlertTitle>
          <AlertDescription>
            تأكد من وجود بيانات داخل جدول العلامات التجارية وربط المستخدم بالبراندات المطلوبة.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const packagePickerMeals = filteredMeals.filter(
    (m) =>
      !packageMealSearch.trim() ||
      m.name.toLowerCase().includes(packageMealSearch.trim().toLowerCase()) ||
      MENU_CATEGORY_LABELS[m.category].toLowerCase().includes(packageMealSearch.trim().toLowerCase()),
  );

  return (
    <div className="space-y-5">
      {/* Header Actions */}
      <AppLayoutHeaderPortal>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="hidden xl:inline-flex text-[11px] tabular-nums">
            {catalogInsights.mealCount} وجبة ظاهرة
          </Badge>
          <Badge variant="outline" className="hidden xl:inline-flex text-[11px] tabular-nums">
            {catalogInsights.packageCount} باقة ظاهرة
          </Badge>
          {!canManage && (
            <Badge className="bg-sky-50 text-sky-700 border border-sky-200/80 hover:bg-sky-50 text-[11px]">
              عرض فقط
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
            onClick={() => setShowcaseDialogOpen(true)}
          >
            <Share2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>منيو العميل</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
            onClick={() => void handleExportToExcel()}
            disabled={filteredMeals.length === 0 && filteredPackages.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            <span>تصدير Excel</span>
          </Button>
          {canManage && (
            <CompanyMenuImportDialog
              companyId={linkedCompany?.id}
              brandId={selectedBrandId}
              categories={companyCategories}
              ingredients={companyIngredients}
              meals={companyMeals}
              catalogMeals={meals}
              onImported={() => {
                void refresh();
                void refreshCompanies();
              }}
            />
          )}
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
              onClick={() => selectedBrand && void loadDemoCatalog(selectedBrand.id, selectedBrand.name)}
              disabled={!selectedBrand}
            >
              <DatabaseZap className="h-3.5 w-3.5" /> تحميل نموذج كامل
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
            onClick={() => {
              if (onRefreshBrands) void onRefreshBrands();
              void refresh();
              void refreshCompanies();
            }}
          >
            <RefreshCcw className="h-3.5 w-3.5" /> تحديث
          </Button>
        </div>
      </AppLayoutHeaderPortal>

      {/* Local / Demo / Unsynced Alerts */}
      {storageMode === 'local' && fallbackReason && (
        <Alert className="rounded-xl border-amber-200 bg-amber-50/70 text-amber-950 [&>svg]:text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>القسم يعمل الآن في وضع محلي مؤقت</AlertTitle>
          <AlertDescription className="space-y-2 text-xs">
            <p>{fallbackReason}</p>
            <p>يمكنك إضافة وتعديل وحذف الوجبات والباقات الآن، وسيتم استخدامها داخل شاشة إنشاء الطلبات على نفس الجهاز.</p>
          </AlertDescription>
        </Alert>
      )}

      {isDemoMode ? (
        <Alert className="rounded-xl border-amber-200 bg-amber-50/70 text-amber-950 [&>svg]:text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>الوضع التجريبي غير إداري</AlertTitle>
          <AlertDescription className="text-xs">
            تم تعطيل إدارة الوجبات والباقات داخل الوضع التجريبي المحلي. استخدم جلسة مصادقة حقيقية لتنفيذ تعديلات تشغيلية.
          </AlertDescription>
        </Alert>
      ) : null}

      {canManage && unsyncedCompanyMeals.length > 0 && (
        <Card className="p-4 border-amber-200/90 bg-amber-50/40 border-r-4 border-r-amber-500 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-amber-950">
              يوجد {unsyncedCompanyMeals.length.toLocaleString('en-US')} وجبة في أرشيف الشركة لم تُربط بعد بكتالوج الطلبات!
            </p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              اضغط مزامنة الآن لتظهر هذه الوجبات ومكوناتها فوراً في شاشة الكول سنتر والمطبخ والباقات.
            </p>
          </div>
          <Button
            size="sm"
            disabled={syncingFromCompany}
            onClick={() => void syncLegacyCompanyMealsToCatalog()}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold h-8"
          >
            {syncingFromCompany ? 'جارٍ المزامنة...' : 'مزامنة الوجبات الآن'}
          </Button>
        </Card>
      )}

      {/* Brand Selector + Company Identity Bar + Sub-Workspace Tabs */}
      <Card className="p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">فلترة حسب الشركة:</span>
            {brands.map((brand) => {
              const active = brand.id === selectedBrandId;
              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => {
                    setSelectedBrandId(brand.id);
                    setSelectedCategory('all');
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                    active ? 'shadow-xs' : 'bg-white hover:bg-slate-50',
                  )}
                  style={{
                    borderColor: active ? brand.color : 'hsl(var(--border))',
                    backgroundColor: active ? `${brand.color}18` : undefined,
                    color: active ? brand.color : undefined,
                  }}
                >
                  {brand.name}
                </button>
              );
            })}
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => openCompanyProfileDialog(linkedCompany, selectedBrand)}
              >
                <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>بيانات الشركة</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setIngredientsDialogOpen(true)}
              >
                <Scale className="h-3.5 w-3.5 text-sky-600" />
                <span>المكونات والتكلفة ({companyIngredients.length.toLocaleString('en-US')})</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setCategoriesDialogOpen(true)}
              >
                <FolderKanban className="h-3.5 w-3.5 text-slate-600" />
                <span>الفئات</span>
              </Button>
              {brands.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setCloneDialogOpen(true)}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 text-amber-600" />
                  <span>نسخ لشركة أخرى</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Linked Company Quick Metadata */}
        {linkedCompany && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50/80 border border-slate-200/70 px-3 py-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-slate-900">{linkedCompany.name}</span>
              <Badge variant={linkedCompany.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                {linkedCompany.status === 'active' ? 'شركة مفعّلة' : 'معطّلة'}
              </Badge>
              {linkedCompany.phone && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Phone className="h-3 w-3 text-slate-400" />
                  {linkedCompany.phone}
                </span>
              )}
              {linkedCompany.contact_person && <span>المسؤول: {linkedCompany.contact_person}</span>}
            </div>
            {linkedCompany.notes && <span className="text-slate-500 truncate max-w-md">{linkedCompany.notes}</span>}
          </div>
        )}

        {/* Workspace Mode Tabs */}
        <Tabs
          value={activeWorkspaceTab}
          onValueChange={(v) => setActiveWorkspaceTab(v as typeof activeWorkspaceTab)}
          dir="rtl"
        >
          <TabsList className="h-auto bg-slate-100/80 p-1 rounded-lg">
            <TabsTrigger value="catalog" className="text-xs font-semibold rounded-md">
              المنيو والمكونات والباقات
            </TabsTrigger>
            <TabsTrigger value="companies" className="text-xs font-semibold rounded-md">
              دليل الشركات والبراندات ({Math.max(brands.length, companies.length).toLocaleString('en-US')})
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs font-semibold rounded-md gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              تحليلات هندسة المنيو
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Card>

      {/* TAB 2: Companies Directory */}
      {activeWorkspaceTab === 'companies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              ملفات الشركات والبراندات الموحدة — أرقام التواصل، المسؤول، وحالة التفعيل.
            </p>
            {canManage && (
              <Button
                size="sm"
                onClick={() => openCompanyProfileDialog(null, null)}
                className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة ملف شركة</span>
              </Button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-stretch">
            {brands.map((brand) => {
              const comp =
                companies.find((c) => c.brand_id === brand.id) ??
                companies.find((c) => compactWhitespace(c.name).toLowerCase() === compactWhitespace(brand.name).toLowerCase());
              const bMealsCount = meals.filter((m) => m.brand_id === brand.id).length;
              const bPkgsCount = packages.filter((p) => p.brand_id === brand.id).length;

              return (
                <Card key={brand.id} className="p-5 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: brand.color }} />
                        <h3 className="font-bold text-sm text-slate-900">{brand.name}</h3>
                      </div>
                      <Badge variant={comp?.status === 'inactive' ? 'secondary' : 'default'} className="text-[11px]">
                        {comp?.status === 'inactive' ? 'معطّلة' : 'مفعّلة'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {comp?.phone || 'بدون هاتف مسجل'}
                      {comp?.contact_person ? ` · ${comp.contact_person}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Badge variant="outline" className="text-[11px] tabular-nums">
                        {bMealsCount.toLocaleString('en-US')} وجبة
                      </Badge>
                      <Badge variant="outline" className="text-[11px] tabular-nums">
                        {bPkgsCount.toLocaleString('en-US')} باقة
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => {
                        setSelectedBrandId(brand.id);
                        setActiveWorkspaceTab('catalog');
                      }}
                    >
                      فتح المنيو والباقات
                    </Button>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => openCompanyProfileDialog(comp ?? null, brand)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>تعديل الملف</span>
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Menu Engineering Analytics */}
      {activeWorkspaceTab === 'analytics' && (
        <MenuEngineeringPanel
          report={engineeringReport}
          brandName={selectedBrand?.name ?? 'الشركة'}
        />
      )}

      {/* TAB 1: Unified Catalog (Meals + Ingredients + Costing + Packages) */}
      {activeWorkspaceTab === 'catalog' && (
        <>
          {/* Category Stat Strip */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7 items-stretch">
            {categoryStatCards.map((item) => (
              <Card key={item.category} className="p-3.5 flex flex-col justify-between text-center">
                <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                  {item.count.toLocaleString('en-US')}
                </p>
                <p className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                  من {item.expectedCount.toLocaleString('en-US')}
                </p>
              </Card>
            ))}
            <Card className="p-3.5 flex flex-col justify-between text-center border-t-2 border-t-emerald-500">
              <p className="text-[11px] font-medium text-slate-500">الباقات</p>
              <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums tracking-tight">
                {filteredPackages.length.toLocaleString('en-US')}
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                من {DEMO_EXPECTED_COUNTS.totalPackages.toLocaleString('en-US')}
              </p>
            </Card>
          </div>

          {loadError && (
            <Alert variant="destructive" className="rounded-xl border-rose-200 bg-rose-50 text-rose-900">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{loadError.title}</AlertTitle>
              <AlertDescription className="space-y-3 text-xs">
                <p>{loadError.description}</p>
                <div className="rounded-lg bg-white p-3 text-xs text-slate-600 border border-rose-200/60">
                  {loadError.details.map((detail) => (
                    <p key={detail}>{detail}</p>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Search & Category Pills */}
          <Card className="p-4 space-y-3">
            <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr] items-center">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pr-9 h-9 text-xs"
                  placeholder="ابحث باسم وجبة أو باقة أو مكون داخل الباقة"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  className="h-8 rounded-lg text-xs"
                  onClick={() => setSelectedCategory('all')}
                >
                  كل الأقسام
                </Button>
                {MENU_CATEGORY_ORDER.map((category) => (
                  <Button
                    key={category}
                    type="button"
                    size="sm"
                    variant={selectedCategory === category ? 'default' : 'outline'}
                    className="h-8 rounded-lg text-xs"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {MENU_CATEGORY_LABELS[category]}
                  </Button>
                ))}
              </div>
            </div>

            {customCategoryTabs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-400 font-medium">فئات الشركة المخصصة:</span>
                {customCategoryTabs.map((cName) => (
                  <button
                    key={cName}
                    type="button"
                    onClick={() => setSelectedCategory(selectedCategory === cName ? 'all' : cName)}
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer',
                      selectedCategory === cName
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    {cName}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Summary KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
            <Card className="p-5 flex flex-col justify-between">
              <p className="text-xs font-medium text-slate-500">الوجبات بعد الفلترة</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                {catalogInsights.mealCount.toLocaleString('en-US')}
              </p>
            </Card>
            <Card className="p-5 flex flex-col justify-between">
              <p className="text-xs font-medium text-slate-500">الباقات بعد الفلترة</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                {catalogInsights.packageCount.toLocaleString('en-US')}
              </p>
            </Card>
            <Card className="p-5 flex flex-col justify-between border-t-2 border-t-emerald-500">
              <p className="text-xs font-medium text-slate-500">متوسط سعر الباقة</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
                {catalogInsights.packageCount === 0
                  ? 'غير متاح'
                  : formatEGPCurrency(catalogInsights.averagePackagePrice)}
              </p>
            </Card>
            <Card className="p-5 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> متوسط القيم الغذائية
              </div>
              <p className="mt-2 text-sm font-bold text-slate-900 tabular-nums tracking-tight">
                {catalogInsights.averageProtein}g Protein · {catalogInsights.averageCalories} kcal
              </p>
            </Card>
          </div>

          {!loadError && (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_0.85fr] items-start">
              {/* Left Column: Meals Catalog */}
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      منيو {selectedBrand?.name ?? 'البراند'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      يشمل القيم الغذائية، المكونات وأوزان التسوية، وحاسبة تكلفة الوجبة.
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      className="h-9 rounded-lg gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                      onClick={() => openMealDialog()}
                      disabled={!selectedBrandId}
                    >
                      <Plus className="h-4 w-4" /> إضافة وجبة
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 items-start">
                  {MENU_CATEGORY_ORDER.filter(
                    (cat) =>
                      selectedCategory === 'all' ||
                      selectedCategory === cat ||
                      (mealsByCategory.get(cat)?.length ?? 0) > 0,
                  ).map((category) => {
                    const categoryMeals = mealsByCategory.get(category) ?? [];

                    return (
                      <Card key={category} className="overflow-hidden">
                        <CardHeader className="py-3.5 px-4 border-b border-slate-100 bg-slate-50/60">
                          <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-sm font-bold text-slate-900">
                              {MENU_CATEGORY_LABELS[category]}
                            </CardTitle>
                            <Badge variant="secondary" className="tabular-nums text-[11px]">
                              {categoryMeals.length.toLocaleString('en-US')}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3.5 space-y-2.5">
                          {categoryMeals.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">
                              لا توجد وجبات في هذا القسم حتى الآن.
                            </div>
                          ) : (
                            categoryMeals.map((meal, idx) => {
                              const costInfo = computeMealCostBreakdown(
                                meal,
                                companyIngredients,
                                inventoryItems,
                              );
                              const unavailable = meal.is_available === false;

                              return (
                                <div
                                  key={meal.id}
                                  className={cn(
                                    'rounded-xl border p-3.5 space-y-2 transition-colors',
                                    unavailable
                                      ? 'border-slate-200 bg-slate-50/70 opacity-75'
                                      : 'border-slate-200/80 bg-white hover:border-slate-300',
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="font-bold text-sm text-slate-900">{meal.name}</p>
                                        {meal.price !== null && (
                                          <span className="rounded-full bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 text-[11px] font-bold text-emerald-700 tabular-nums">
                                            {formatEGPCurrency(meal.price)}
                                          </span>
                                        )}
                                        {meal.custom_category && (
                                          <Badge variant="outline" className="text-[10px]">
                                            {meal.custom_category}
                                          </Badge>
                                        )}
                                        {unavailable && (
                                          <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                                            متوقفة مؤقتاً
                                          </span>
                                        )}
                                      </div>

                                      {meal.description && (
                                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                                          {meal.description}
                                        </p>
                                      )}
                                    </div>

                                    {canManage && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        {categoryMeals.length > 1 && (
                                          <div className="flex flex-col">
                                            <button
                                              type="button"
                                              onClick={() => void handleMoveMealOrder(categoryMeals, idx, -1)}
                                              className="p-0.5 text-slate-400 hover:text-slate-800"
                                              title="لأعلى"
                                            >
                                              <ArrowUp className="h-3 w-3" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => void handleMoveMealOrder(categoryMeals, idx, 1)}
                                              className="p-0.5 text-slate-400 hover:text-slate-800"
                                              title="لأسفل"
                                            >
                                              <ArrowDown className="h-3 w-3" />
                                            </button>
                                          </div>
                                        )}
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          title={unavailable ? 'تفعيل الوجبة للطلب' : 'إيقاف مؤقت للوجبة'}
                                          onClick={() => void handleToggleMealAvailability(meal)}
                                          className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900"
                                        >
                                          {unavailable ? (
                                            <EyeOff className="h-3.5 w-3.5 text-rose-500" />
                                          ) : (
                                            <Eye className="h-3.5 w-3.5 text-emerald-600" />
                                          )}
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          title="تكرار الوجبة"
                                          className="h-8 w-8 rounded-lg"
                                          onClick={() => void handleDuplicateMeal(meal)}
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          className="h-8 w-8 rounded-lg"
                                          onClick={() => openMealDialog(meal)}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <ConfirmDeleteButton
                                          title={`حذف وجبة "${meal.name}"؟`}
                                          description="سيتم حذف هذه الوجبة نهائيًا وإزالتها من أي باقات مرتبطة بها."
                                          ariaLabel={`حذف ${meal.name}`}
                                          onConfirm={() => void deleteMeal(meal.id)}
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {/* 5 Nutrition Macros */}
                                  <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600 tabular-nums">
                                    <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                                      {meal.calories} kcal
                                    </span>
                                    <span className="rounded bg-slate-100 px-2 py-0.5">
                                      P: {meal.protein}g
                                    </span>
                                    <span className="rounded bg-slate-100 px-2 py-0.5">
                                      C: {meal.carbs}g
                                    </span>
                                    <span className="rounded bg-slate-100 px-2 py-0.5">
                                      F: {meal.fat}g
                                    </span>
                                    {meal.fiber !== null && meal.fiber !== undefined && (
                                      <span className="rounded bg-slate-100 px-2 py-0.5">
                                        ألياف: {meal.fiber}g
                                      </span>
                                    )}
                                  </div>

                                  {/* Ingredients & Pre/Post Weights */}
                                  {meal.ingredients && meal.ingredients.length > 0 && (
                                    <div className="flex flex-wrap gap-1 text-[11px]">
                                      {meal.ingredients.map((ing, ingIdx) => (
                                        <span
                                          key={`${ing.name}-${ingIdx}`}
                                          className="rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-slate-700 tabular-nums"
                                        >
                                          {ing.name}
                                          {(ing.weight_before_grams !== null ||
                                            ing.weight_after_grams !== null) && (
                                            <span className="text-slate-400">
                                              {' '}
                                              ({ing.weight_before_grams ?? '—'}g→
                                              {ing.weight_after_grams ?? '—'}g)
                                            </span>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Live Recipe Costing & Food Cost % Badge */}
                                  {costInfo.estimatedCost !== null && (
                                    <div
                                      className={cn(
                                        'flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[11px] border tabular-nums',
                                        costInfo.isHighFoodCost
                                          ? 'bg-rose-50/70 border-rose-200 text-rose-800'
                                          : 'bg-emerald-50/50 border-emerald-200/70 text-emerald-800',
                                      )}
                                    >
                                      <span>
                                        تكلفة الوصفة: <strong>{formatEGPCurrency(costInfo.estimatedCost)}</strong>
                                      </span>
                                      {costInfo.foodCostPct !== null && (
                                        <span>
                                          Food Cost: <strong>{costInfo.foodCostPct.toFixed(0)}%</strong>
                                          {costInfo.grossProfit !== null &&
                                            ` · ربح ${formatEGPCurrency(costInfo.grossProfit)}`}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>

              {/* Right Column: Packages & Subscriptions */}
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">الباقات والاشتراكات</h2>
                    <p className="text-xs text-slate-500">
                      مرتبطة مباشرة بوجبات المنيو مع حساب سعر اليوم والوفر.
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-lg gap-1.5 text-xs font-semibold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => openPackageDialog()}
                      disabled={!selectedBrandId}
                    >
                      <Plus className="h-4 w-4" /> إنشاء باقة
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {filteredPackages.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center text-xs text-slate-500">
                        لا توجد باقات لهذا البراند بعد.
                      </CardContent>
                    </Card>
                  ) : (
                    visiblePackages.map((pkg) => {
                      const savings = computePackageSavings(pkg, filteredMeals);
                      return (
                        <Card key={pkg.id} className="p-4 space-y-3 hover:border-slate-300 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-900">{pkg.name}</p>
                                <Badge variant="outline" className="text-[11px] tabular-nums">
                                  {pkg.days_count.toLocaleString('en-US')} يوم
                                </Badge>
                                <span className="rounded-full bg-emerald-50 border border-emerald-200/70 px-2.5 py-0.5 text-xs font-bold text-emerald-700 tabular-nums">
                                  {formatEGPCurrency(pkg.price)}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                                <span>{pkg.items.length.toLocaleString('en-US')} عنصر</span>
                                <span>· متوسط اليوم: {formatEGPCurrency(savings.dailyRate)}</span>
                                {savings.savingsPct > 0 && (
                                  <span className="text-emerald-700 font-semibold">
                                    · توفير {savings.savingsPct}% ({formatEGPCurrency(savings.savingsAmount)})
                                  </span>
                                )}
                              </div>
                            </div>

                            {canManage && (
                              <div className="flex gap-1.5 shrink-0">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  title="تكرار الباقة"
                                  className="h-8 w-8 rounded-lg"
                                  onClick={() => void handleDuplicatePackage(pkg)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 rounded-lg"
                                  onClick={() => openPackageDialog(pkg)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <ConfirmDeleteButton
                                  title={`حذف باقة "${pkg.name}"؟`}
                                  description="سيتم حذف هذه الباقة ولن تظهر في الخيارات الجديدة. الطلبات السابقة لن تتأثر."
                                  ariaLabel={`حذف ${pkg.name}`}
                                  onConfirm={() => void deletePackage(pkg.id)}
                                />
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {pkg.items.map((item) => (
                              <Badge
                                key={item.id}
                                variant={item.source === 'menu' ? 'secondary' : 'outline'}
                                className="text-[11px]"
                              >
                                {item.label}
                              </Badge>
                            ))}
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {/* Unified Rich Meal Dialog */}
      <Dialog open={mealDialogOpen} onOpenChange={(open) => (open ? setMealDialogOpen(true) : resetMealDialog())}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mealForm.id ? 'تعديل الوجبة ومكوناتها' : 'إضافة وجبة جديدة شاملة'}</DialogTitle>
            <DialogDescription>
              أدخل بيانات الوجبة، القيم الغذائية الـ 5، والمكونات بأوزانها قبل وبعد التسوية لتغذي الطلبات والمطبخ معاً.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleMealSubmit} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">اسم الوجبة *</Label>
                <Input
                  value={mealForm.name}
                  onChange={(event) => setMealForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">القسم الرئيسي *</Label>
                <Select
                  value={mealForm.category}
                  onValueChange={(value) =>
                    setMealForm((current) => ({ ...current, category: value as MenuCategory }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MENU_CATEGORY_ORDER.map((category) => (
                      <SelectItem key={category} value={category}>
                        {MENU_CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">الفئة المخصصة للشركة (اختياري)</Label>
                <Input
                  list="company-custom-cats"
                  value={mealForm.custom_category}
                  onChange={(e) => setMealForm((c) => ({ ...c, custom_category: e.target.value }))}
                  placeholder="مثال: Keto / Breakfast / Beef"
                />
                <datalist id="company-custom-cats">
                  {customCategoryTabs.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">السعر الفردي (ج.م.)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mealForm.price}
                  onChange={(event) => setMealForm((current) => ({ ...current, price: event.target.value }))}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">وصف الوجبة</Label>
              <Textarea
                rows={2}
                value={mealForm.description}
                onChange={(e) => setMealForm((c) => ({ ...c, description: e.target.value }))}
                placeholder="مثال: صدور دجاج مشوية بالأعشاب مع أرز بسمتي وخضار سوتيه"
                className="text-xs"
              />
            </div>

            {/* 5 Macro Fields */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <div className="grid gap-1">
                <Label className="text-xs">Calories *</Label>
                <Input
                  type="number"
                  min="0"
                  value={mealForm.calories}
                  onChange={(event) => setMealForm((current) => ({ ...current, calories: event.target.value }))}
                  required
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Protein (g) *</Label>
                <Input
                  type="number"
                  min="0"
                  value={mealForm.protein}
                  onChange={(event) => setMealForm((current) => ({ ...current, protein: event.target.value }))}
                  required
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Carbs (g) *</Label>
                <Input
                  type="number"
                  min="0"
                  value={mealForm.carbs}
                  onChange={(event) => setMealForm((current) => ({ ...current, carbs: event.target.value }))}
                  required
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Fat (g) *</Label>
                <Input
                  type="number"
                  min="0"
                  value={mealForm.fat}
                  onChange={(event) => setMealForm((current) => ({ ...current, fat: event.target.value }))}
                  required
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">ألياف Fiber (g)</Label>
                <Input
                  type="number"
                  min="0"
                  value={mealForm.fiber}
                  onChange={(event) => setMealForm((current) => ({ ...current, fiber: event.target.value }))}
                  className="tabular-nums"
                />
              </div>
            </div>

            {/* Ingredients + Pre/Post Weights */}
            <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-900">
                  مكونات الوجبة (الوزن بالجرام قبل وبعد التسوية)
                </Label>
                <span className="text-[11px] text-slate-400">
                  البروتين المنفرد يأخذ تلقائياً 200g قبل / 125g بعد
                </span>
              </div>

              {mealForm.ingredients.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">لا توجد مكونات مضافة لهذه الوجبة بعد.</p>
              ) : (
                <div className="space-y-2">
                  {mealForm.ingredients.map((row, idx) => (
                    <div
                      key={`${row.name}-${idx}`}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                    >
                      <span className="min-w-24 flex-1 text-xs font-semibold text-slate-800">{row.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500">قبل (g)</span>
                        <Input
                          type="number"
                          className="h-8 w-20 text-xs tabular-nums"
                          value={row.weight_before_grams}
                          onChange={(e) => updateIngredientDraftWeight(idx, 'weight_before_grams', e.target.value)}
                          placeholder="200"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500">بعد (g)</span>
                        <Input
                          type="number"
                          className="h-8 w-20 text-xs tabular-nums"
                          value={row.weight_after_grams}
                          onChange={(e) => updateIngredientDraftWeight(idx, 'weight_after_grams', e.target.value)}
                          placeholder="125"
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-600"
                        onClick={() => removeIngredientFromMealDraft(idx)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {companyIngredients.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(ingId) => {
                      const found = companyIngredients.find((i) => i.id === ingId);
                      if (found) void addIngredientToMealDraft(found.name, found.id);
                    }}
                  >
                    <SelectTrigger className="h-9 w-48 text-xs bg-white">
                      <SelectValue placeholder="اختر من مكتبة المكونات" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyIngredients.map((ing) => (
                        <SelectItem key={ing.id} value={ing.id}>
                          {ing.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  value={newMealIngredientName}
                  onChange={(e) => setNewMealIngredientName(e.target.value)}
                  placeholder="أو اكتب اسم مكوّن (مثل: شرائح دجاج)"
                  className="h-9 flex-1 min-w-44 text-xs bg-white"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs"
                  onClick={() => void addIngredientToMealDraft(newMealIngredientName)}
                >
                  إضافة مكوّن
                </Button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <Checkbox
                checked={mealForm.is_available}
                onCheckedChange={(checked) =>
                  setMealForm((c) => ({ ...c, is_available: Boolean(checked) }))
                }
              />
              <span>الوجبة متاحة للطلب حالياً في شاشة الكول سنتر</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={resetMealDialog}>
                إلغاء
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {mealForm.id ? 'حفظ التعديل' : 'إضافة الوجبة'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Package Builder Dialog */}
      <Dialog open={packageDialogOpen} onOpenChange={(open) => (open ? setPackageDialogOpen(true) : resetPackageDialog())}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{packageForm.id ? 'تعديل الباقة' : 'إنشاء باقة جديدة'}</DialogTitle>
            <DialogDescription>
              أنشئ باقة جديدة من وجبات المنيو أو أضف وجبات مخصصة يدويًا.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePackageSubmit} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5 sm:col-span-1">
                <Label className="text-xs font-semibold">اسم الباقة</Label>
                <Input
                  value={packageForm.name}
                  onChange={(event) => setPackageForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">عدد الأيام</Label>
                <Input
                  type="number"
                  min="1"
                  value={packageForm.days_count}
                  onChange={(event) => setPackageForm((current) => ({ ...current, days_count: event.target.value }))}
                  required
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">السعر الإجمالي</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={packageForm.price}
                  onChange={(event) => setPackageForm((current) => ({ ...current, price: event.target.value }))}
                  required
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="grid gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-900">اختيار الوجبات من المنيو</p>
                  <p className="text-[11px] text-slate-500">يمكنك البحث واختيار أكثر من وجبة من منيو الشركة.</p>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {packageForm.selectedMealIds.length} مختارة
                </Badge>
              </div>
              {filteredMeals.length > 5 && (
                <Input
                  value={packageMealSearch}
                  onChange={(e) => setPackageMealSearch(e.target.value)}
                  placeholder="بحث سريع داخل وجبات المنيو..."
                  className="h-8 text-xs"
                />
              )}
              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2.5">
                {packagePickerMeals.map((meal) => (
                  <label
                    key={meal.id}
                    className="flex items-start gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 cursor-pointer hover:border-emerald-300"
                  >
                    <Checkbox
                      checked={packageForm.selectedMealIds.includes(meal.id)}
                      onCheckedChange={() => toggleMealSelection(meal.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-900">{meal.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {MENU_CATEGORY_LABELS[meal.category]}
                        </Badge>
                        {meal.price !== null && (
                          <Badge variant="outline" className="text-[10px] tabular-nums">
                            {formatEGPCurrency(meal.price)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                        Protein {meal.protein}g | Carbs {meal.carbs}g | Fat {meal.fat}g | Calories {meal.calories}
                      </p>
                    </div>
                  </label>
                ))}
                {filteredMeals.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-400">
                    أضف وجبات لهذا البراند أولًا حتى تظهر هنا.
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">وجبات خارج المنيو</p>
                  <p className="text-[11px] text-slate-500">أضف أسماء مخصصة يدويًا عند الحاجة.</p>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg gap-1.5 text-xs" onClick={addCustomMeal}>
                  <Plus className="h-3.5 w-3.5" /> إضافة اسم يدوي
                </Button>
              </div>
              <div className="grid gap-2">
                {packageForm.customMeals.map((mealName, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={mealName}
                      onChange={(event) => updateCustomMeal(index, event.target.value)}
                      placeholder="اسم وجبة خارج المنيو"
                      className="h-9 text-xs"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 rounded-lg text-destructive hover:text-destructive"
                      onClick={() => removeCustomMeal(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-xs text-slate-600">
              <div className="flex items-center gap-2 text-slate-900">
                <Salad className="h-4 w-4 text-emerald-600" />
                <span className="font-bold">ملخص الباقة</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {packageForm.selectedMealIds
                  .map((mealId) => filteredMeals.find((meal) => meal.id === mealId)?.name)
                  .filter(Boolean)
                  .map((mealName) => (
                    <Badge key={mealName} variant="secondary" className="text-[11px]">
                      {mealName}
                    </Badge>
                  ))}
                {packageForm.customMeals.filter(Boolean).map((mealName) => (
                  <Badge key={mealName} variant="outline" className="text-[11px]">
                    {mealName}
                  </Badge>
                ))}
                {packageForm.selectedMealIds.length === 0 &&
                  packageForm.customMeals.filter(Boolean).length === 0 && (
                    <span>اختر مكونات الباقة قبل الحفظ.</span>
                  )}
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-slate-900 font-semibold tabular-nums">
                <Flame className="h-4 w-4 text-amber-500" />
                <span>
                  سعر الباقة: {packageForm.price ? formatEGPCurrency(Number(packageForm.price)) : 'غير محدد'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetPackageDialog}>
                إلغاء
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {packageForm.id ? 'حفظ التعديل' : 'إنشاء الباقة'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Company Profile Dialog */}
      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {companyForm.id ? 'تعديل ملف الشركة' : 'إعداد ملف الشركة وربطه بالبراند'}
            </DialogTitle>
            <DialogDescription>
              بيانات التواصل والمسؤول وحالة التفعيل المرتبطة ببراند المطبخ.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">اسم الشركة</Label>
              <Input
                value={companyForm.name}
                onChange={(e) => setCompanyForm((c) => ({ ...c, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">الهاتف الرئيسي</Label>
                <Input
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm((c) => ({ ...c, phone: e.target.value }))}
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">اسم المسؤول</Label>
                <Input
                  value={companyForm.contact_person}
                  onChange={(e) => setCompanyForm((c) => ({ ...c, contact_person: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">أرقام إضافية (افصل بفاصلة)</Label>
              <Input
                value={companyForm.phoneNumbersText}
                onChange={(e) => setCompanyForm((c) => ({ ...c, phoneNumbersText: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">الحالة</Label>
              <Select
                value={companyForm.status}
                onValueChange={(v) => setCompanyForm((c) => ({ ...c, status: v as 'active' | 'inactive' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">مفعّلة</SelectItem>
                  <SelectItem value="inactive">معطّلة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">ملاحظات</Label>
              <Textarea
                rows={2}
                value={companyForm.notes}
                onChange={(e) => setCompanyForm((c) => ({ ...c, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => void handleSaveCompanyProfile()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              <Check className="h-4 w-4" />
              <span>حفظ بيانات الشركة</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auxiliary Hub Dialogs */}
      <IngredientsAndCostingDialog
        open={ingredientsDialogOpen}
        onOpenChange={setIngredientsDialogOpen}
        companyId={linkedCompany?.id ?? null}
        ingredients={companyIngredients}
        inventoryItems={inventoryItems}
        onSaveIngredient={saveIngredient}
        onDeleteIngredient={deleteIngredient}
      />

      <CategoriesManagerDialog
        open={categoriesDialogOpen}
        onOpenChange={setCategoriesDialogOpen}
        companyId={linkedCompany?.id ?? null}
        categories={companyCategories}
        onSaveCategory={saveCategory}
        onDeleteCategory={deleteCategory}
        onReorderCategories={reorderCategories}
      />

      <CrossBrandCloneDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        sourceBrand={selectedBrand}
        brands={brands}
        sourceMeals={filteredMeals}
        sourcePackages={filteredPackages}
        onSaveMeal={saveMeal}
        onSavePackage={savePackage}
      />

      <CustomerMenuShowcaseDialog
        open={showcaseDialogOpen}
        onOpenChange={setShowcaseDialogOpen}
        companyName={selectedBrand?.name ?? 'Cloud Kitchens'}
        phone={linkedCompany?.phone}
        meals={filteredMeals}
        packages={filteredPackages}
      />
    </div>
  );
}