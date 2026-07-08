import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { Brand } from '@/hooks/useBrands';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import { cn, compactWhitespace, formatEGPCurrency } from '@/lib/utils';
import { Meal, MealInput, MenuCategory, MENU_CATEGORY_LABELS, MENU_CATEGORY_ORDER, PackagePlan, PackagePlanInput } from '@/types/menu';
import { DEMO_EXPECTED_COUNTS, isBrandCatalogComplete } from '@/store/menuCatalog';
import { AlertCircle, DatabaseZap, Flame, Loader2, Pencil, Plus, RefreshCcw, Salad, Search, Sparkles, Trash2 } from 'lucide-react';

type MealFormState = {
  id?: string;
  name: string;
  category: MenuCategory;
  price: string;
  protein: string;
  carbs: string;
  fat: string;
  calories: string;
};

type PackageFormState = {
  id?: string;
  name: string;
  days_count: string;
  price: string;
  selectedMealIds: string[];
  customMeals: string[];
};

function createMealFormState(meal?: Meal): MealFormState {
  return {
    id: meal?.id,
    name: meal?.name ?? '',
    category: meal?.category ?? 'meat',
    price: meal?.price === null || meal?.price === undefined ? '' : String(meal.price),
    protein: String(meal?.protein ?? 0),
    carbs: String(meal?.carbs ?? 0),
    fat: String(meal?.fat ?? 0),
    calories: String(meal?.calories ?? 0),
  };
}

function createPackageFormState(pkg?: PackagePlan): PackageFormState {
  return {
    id: pkg?.id,
    name: pkg?.name ?? '',
    days_count: pkg ? String(pkg.days_count) : '',
    price: pkg ? String(pkg.price) : '',
    selectedMealIds: pkg?.items.filter(item => item.menu_item_id).map(item => item.menu_item_id as string) ?? [],
    customMeals: pkg?.items.filter(item => item.source === 'custom').map(item => item.custom_meal_name ?? '').filter(Boolean) ?? [],
  };
}

interface Props {
  brands: Brand[];
  brandsLoading?: boolean;
}

export default function MenuPackages({ brands, brandsLoading = false }: Props) {
  const { role, isDemoMode } = useAuth();
  const { meals, packages, loading, storageMode, fallbackReason, loadError, refresh, saveMeal, deleteMeal, savePackage, deletePackage, loadDemoCatalog } = useMenuCatalog();
  const isOwner = role === 'owner' && !isDemoMode;
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | MenuCategory>('all');
  const [mealDialogOpen, setMealDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [mealForm, setMealForm] = useState<MealFormState>(() => createMealFormState());
  const [packageForm, setPackageForm] = useState<PackageFormState>(() => createPackageFormState());
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

  const normalizedSearchQuery = useMemo(
    () => compactWhitespace(searchQuery).toLowerCase(),
    [searchQuery],
  );

  const selectedBrand = useMemo(
    () => brands.find(brand => brand.id === selectedBrandId) ?? null,
    [brands, selectedBrandId],
  );

  const filteredMeals = useMemo(
    () => meals.filter(meal => meal.brand_id === selectedBrandId),
    [meals, selectedBrandId],
  );

  const filteredPackages = useMemo(
    () => packages.filter(pkg => pkg.brand_id === selectedBrandId),
    [packages, selectedBrandId],
  );

  const categoryCounts = useMemo(() => ({
    meat: filteredMeals.filter((meal) => meal.category === 'meat').length,
    chicken: filteredMeals.filter((meal) => meal.category === 'chicken').length,
    fish: filteredMeals.filter((meal) => meal.category === 'fish').length,
    mix: filteredMeals.filter((meal) => meal.category === 'mix').length,
    salad: filteredMeals.filter((meal) => meal.category === 'salad').length,
    snacks: filteredMeals.filter((meal) => meal.category === 'snacks').length,
  }), [filteredMeals]);

  const categoryStatCards = useMemo(
    () => MENU_CATEGORY_ORDER.map((category) => ({
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

  const visibleMeals = useMemo(() => {
    return filteredMeals.filter((meal) => {
      const matchesCategory = selectedCategory === 'all' || meal.category === selectedCategory;
      const matchesSearch = !normalizedSearchQuery
        || meal.name.toLowerCase().includes(normalizedSearchQuery)
        || MENU_CATEGORY_LABELS[meal.category].toLowerCase().includes(normalizedSearchQuery);

      return matchesCategory && matchesSearch;
    });
  }, [filteredMeals, normalizedSearchQuery, selectedCategory]);

  const visiblePackages = useMemo(() => {
    return filteredPackages.filter((pkg) => {
      if (!normalizedSearchQuery) {
        return true;
      }

      return pkg.name.toLowerCase().includes(normalizedSearchQuery)
        || pkg.items.some((item) => item.label.toLowerCase().includes(normalizedSearchQuery));
    });
  }, [filteredPackages, normalizedSearchQuery]);

  const mealsByCategory = useMemo(() => {
    const next = new Map<MenuCategory, Meal[]>();

    for (const category of MENU_CATEGORY_ORDER) {
      next.set(category, visibleMeals.filter(meal => meal.category === category));
    }

    return next;
  }, [visibleMeals]);

  const catalogInsights = useMemo(() => {
    const totalCalories = visibleMeals.reduce((sum, meal) => sum + meal.calories, 0);
    const totalProtein = visibleMeals.reduce((sum, meal) => sum + meal.protein, 0);
    const averagePackagePrice = visiblePackages.length === 0
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

  const resetMealDialog = () => {
    setMealForm(createMealFormState());
    setMealDialogOpen(false);
  };

  const resetPackageDialog = () => {
    setPackageForm(createPackageFormState());
    setPackageDialogOpen(false);
  };

  const openMealDialog = (meal?: Meal) => {
    setMealForm(createMealFormState(meal));
    setMealDialogOpen(true);
  };

  const openPackageDialog = (pkg?: PackagePlan) => {
    setPackageForm(createPackageFormState(pkg));
    setPackageDialogOpen(true);
  };

  const toggleMealSelection = (mealId: string) => {
    setPackageForm(current => ({
      ...current,
      selectedMealIds: current.selectedMealIds.includes(mealId)
        ? current.selectedMealIds.filter(id => id !== mealId)
        : [...current.selectedMealIds, mealId],
    }));
  };

  const updateCustomMeal = (index: number, value: string) => {
    setPackageForm(current => ({
      ...current,
      customMeals: current.customMeals.map((item, itemIndex) => itemIndex === index ? value : item),
    }));
  };

  const addCustomMeal = () => {
    setPackageForm(current => ({ ...current, customMeals: [...current.customMeals, ''] }));
  };

  const removeCustomMeal = (index: number) => {
    setPackageForm(current => ({
      ...current,
      customMeals: current.customMeals.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleMealSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBrandId) {
      return;
    }

    const payload: MealInput = {
      id: mealForm.id,
      brand_id: selectedBrandId,
      name: mealForm.name,
      category: mealForm.category,
      price: mealForm.price.trim() ? Number(mealForm.price) : null,
      protein: Number(mealForm.protein || 0),
      carbs: Number(mealForm.carbs || 0),
      fat: Number(mealForm.fat || 0),
      calories: Number(mealForm.calories || 0),
    };

    const success = await saveMeal(payload);
    if (success) {
      resetMealDialog();
    }
  };

  const handlePackageSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBrandId) {
      return;
    }

    const payload: PackagePlanInput = {
      id: packageForm.id,
      brand_id: selectedBrandId,
      name: packageForm.name,
      days_count: Number(packageForm.days_count || 0),
      price: Number(packageForm.price || 0),
      items: [
        ...packageForm.selectedMealIds.map(menu_item_id => ({ menu_item_id })),
        ...packageForm.customMeals
          .map(custom_meal_name => custom_meal_name.trim())
          .filter(Boolean)
          .map(custom_meal_name => ({ custom_meal_name })),
      ],
    };

    const success = await savePackage(payload);
    if (success) {
      resetPackageDialog();
    }
  };

  if (brandsLoading || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المنيو والباقات</h1>
          <p className="mt-1 text-sm text-muted-foreground">لا يمكن إدارة المنيو والباقات بدون علامات تجارية متاحة لهذا المستخدم.</p>
        </div>
        <Alert variant="destructive" className="rounded-3xl border-destructive/20 bg-destructive/5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>لا توجد براندات متاحة</AlertTitle>
          <AlertDescription>
            تأكد من وجود بيانات داخل جدول العلامات التجارية وربط المستخدم بالبراندات المطلوبة.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المنيو والباقات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة احترافية للوجبات والباقات لكل براند، مع نفس البيانات المستخدمة أثناء تسجيل الأوردرات.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{catalogInsights.mealCount} وجبة ظاهرة</Badge>
          <Badge variant="outline">{catalogInsights.packageCount} باقة ظاهرة</Badge>
          <Badge variant={storageMode === 'database' ? 'default' : 'outline'}>
            {storageMode === 'database' ? 'متصل بقاعدة البيانات' : 'حفظ محلي مؤقت'}
          </Badge>
          {!isOwner && <Badge className="bg-info/10 text-info hover:bg-info/10">عرض فقط</Badge>}
          {isOwner && (
            <Button
              variant="outline"
              className="rounded-2xl gap-2"
              onClick={() => selectedBrand && void loadDemoCatalog(selectedBrand.id, selectedBrand.name)}
              disabled={!selectedBrand}
            >
              <DatabaseZap className="h-4 w-4" /> تحميل نموذج كامل
            </Button>
          )}
          <Button variant="outline" className="rounded-2xl gap-2" onClick={() => void refresh()}>
            <RefreshCcw className="h-4 w-4" /> تحديث
          </Button>
        </div>
      </div>

      {storageMode === 'local' && fallbackReason && (
        <Alert className="rounded-[28px] border-amber-200 bg-amber-50 text-amber-950 [&>svg]:text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>القسم يعمل الآن في وضع محلي مؤقت</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{fallbackReason}</p>
            <p>يمكنك إضافة وتعديل وحذف الوجبات والباقات الآن، وسيتم استخدامها داخل شاشة إنشاء الطلبات على نفس الجهاز.</p>
            <p>تم تجهيز زر لتحميل 44 وجبة تجريبية و5 باقات، منها 10 وجبات في الأقسام الأساسية وصنفان في السلطات وصنفان في السناكس.</p>
            {!isSelectedBrandCatalogComplete && (
              <p>تم اكتشاف بيانات محلية قديمة أو ناقصة لهذا البراند، وسيتم ترقيتها تلقائيًا إلى 44 وجبة و5 باقات.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isDemoMode ? (
        <Alert className="rounded-[28px] border-amber-200 bg-amber-50 text-amber-950 [&>svg]:text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>الوضع التجريبي غير إداري</AlertTitle>
          <AlertDescription>
            تم تعطيل إدارة الوجبات والباقات داخل الوضع التجريبي المحلي. استخدم جلسة مصادقة حقيقية لتنفيذ تعديلات تشغيلية.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="rounded-[24px] border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(248,250,252,1))] shadow-sm">
        <CardContent className="grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-7">
          {categoryStatCards.map((item) => (
            <div key={item.category} className="rounded-2xl border bg-background px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{item.count}</p>
              <p className="text-xs text-muted-foreground">من {item.expectedCount}</p>
            </div>
          ))}
          <div className="rounded-2xl border bg-background px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">الباقات</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{filteredPackages.length}</p>
            <p className="text-xs text-muted-foreground">من {DEMO_EXPECTED_COUNTS.totalPackages}</p>
          </div>
        </CardContent>
      </Card>

      {loadError && (
        <Alert variant="destructive" className="rounded-[28px] border-destructive/20 bg-destructive/5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{loadError.title}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{loadError.description}</p>
            <div className="rounded-2xl bg-background/80 p-4 text-xs text-muted-foreground">
              {loadError.details.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-2xl gap-2" onClick={() => void refresh()}>
                <RefreshCcw className="h-4 w-4" /> إعادة المحاولة
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="rounded-[28px] border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(245,247,250,1))] shadow-sm">
        <CardContent className="grid gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-foreground">فلترة حسب الشركة</span>
            {brands.map((brand) => {
              const active = brand.id === selectedBrandId;

              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => setSelectedBrandId(brand.id)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition-all',
                    active ? 'shadow-md' : 'bg-background hover:-translate-y-0.5 hover:shadow-sm',
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

          <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pr-9"
                placeholder="ابحث باسم وجبة أو باقة أو مكون داخل الباقة"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                className="rounded-2xl"
                onClick={() => setSelectedCategory('all')}
              >
                كل الأقسام
              </Button>
              {MENU_CATEGORY_ORDER.map((category) => (
                <Button
                  key={category}
                  type="button"
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  className="rounded-2xl"
                  onClick={() => setSelectedCategory(category)}
                >
                  {MENU_CATEGORY_LABELS[category]}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[24px] border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(240,253,244,1))] shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">الوجبات بعد الفلترة</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{catalogInsights.mealCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(239,246,255,1))] shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">الباقات بعد الفلترة</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{catalogInsights.packageCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(255,247,237,1))] shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">متوسط السعر</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {catalogInsights.packageCount === 0 ? 'غير متاح' : formatEGPCurrency(catalogInsights.averagePackagePrice)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-0 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(254,242,242,1))] shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> متوسط القيم الغذائية
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">
              {catalogInsights.averageProtein}g Protein • {catalogInsights.averageCalories} Calories
            </p>
          </CardContent>
        </Card>
      </div>

      {loadError ? null : (

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">منيو {selectedBrand?.name ?? 'البراند'}</h2>
              <p className="text-sm text-muted-foreground">مقسم حسب الأقسام لتسهيل القراءة والاختيار السريع.</p>
            </div>
            {isOwner && (
              <Button className="rounded-2xl gap-2" onClick={() => openMealDialog()} disabled={!selectedBrandId}>
                <Plus className="h-4 w-4" /> إضافة وجبة
              </Button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {MENU_CATEGORY_ORDER.map((category) => {
              const categoryMeals = mealsByCategory.get(category) ?? [];

              return (
                <Card key={category} className="rounded-[24px] border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-lg">{MENU_CATEGORY_LABELS[category]}</CardTitle>
                      <Badge variant="secondary">{categoryMeals.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {categoryMeals.length === 0 ? (
                      <div className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                        لا توجد وجبات في هذا القسم حتى الآن.
                      </div>
                    ) : categoryMeals.map((meal) => (
                      <div key={meal.id} className="rounded-2xl border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-foreground">{meal.name}</p>
                              {meal.price !== null && <Badge variant="outline">{formatEGPCurrency(meal.price)}</Badge>}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Protein: {meal.protein}g | Carbs: {meal.carbs}g | Fat: {meal.fat}g | Calories: {meal.calories}
                            </p>
                          </div>
                          {isOwner && (
                            <div className="flex gap-2">
                              <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={() => openMealDialog(meal)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl text-destructive hover:text-destructive" onClick={() => void deleteMeal(meal.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">الباقات</h2>
              <p className="text-sm text-muted-foreground">عرض واضح للمحتويات وعدد الأيام والسعر لكل براند.</p>
            </div>
            {isOwner && (
              <Button variant="outline" className="rounded-2xl gap-2" onClick={() => openPackageDialog()} disabled={!selectedBrandId}>
                <Plus className="h-4 w-4" /> إنشاء باقة
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {filteredPackages.length === 0 ? (
              <Card className="rounded-[24px] border-dashed">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  لا توجد باقات لهذا البراند بعد.
                </CardContent>
              </Card>
            ) : visiblePackages.map((pkg) => (
              <Card key={pkg.id} className="rounded-[24px] border-0 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,1))] shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-lg font-bold text-foreground">{pkg.name}</p>
                        <Badge variant="outline">{pkg.days_count} يوم</Badge>
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">{formatEGPCurrency(pkg.price)}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{pkg.items.length} عنصر داخل الباقة</p>
                    </div>
                    {isOwner && (
                      <div className="flex gap-2">
                        <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={() => openPackageDialog(pkg)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl text-destructive hover:text-destructive" onClick={() => void deletePackage(pkg.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {pkg.items.map((item) => (
                      <Badge key={item.id} variant={item.source === 'menu' ? 'secondary' : 'outline'}>
                        {item.label}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
      )}

      <Dialog open={mealDialogOpen} onOpenChange={(open) => open ? setMealDialogOpen(true) : resetMealDialog()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{mealForm.id ? 'تعديل وجبة' : 'إضافة وجبة جديدة'}</DialogTitle>
            <DialogDescription>أدخل بيانات الوجبة والقيم الغذائية الخاصة بها لهذا البراند.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMealSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>اسم الوجبة</Label>
              <Input value={mealForm.name} onChange={(event) => setMealForm(current => ({ ...current, name: event.target.value }))} required />
            </div>
            <div className="grid gap-1.5">
              <Label>القسم</Label>
              <Select value={mealForm.category} onValueChange={(value) => setMealForm(current => ({ ...current, category: value as MenuCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MENU_CATEGORY_ORDER.map((category) => (
                    <SelectItem key={category} value={category}>{MENU_CATEGORY_LABELS[category]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>السعر</Label>
                <Input type="number" min="0" step="0.01" value={mealForm.price} onChange={(event) => setMealForm(current => ({ ...current, price: event.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Calories</Label>
                <Input type="number" min="0" value={mealForm.calories} onChange={(event) => setMealForm(current => ({ ...current, calories: event.target.value }))} required />
              </div>
              <div className="grid gap-1.5">
                <Label>Protein</Label>
                <Input type="number" min="0" value={mealForm.protein} onChange={(event) => setMealForm(current => ({ ...current, protein: event.target.value }))} required />
              </div>
              <div className="grid gap-1.5">
                <Label>Carbs</Label>
                <Input type="number" min="0" value={mealForm.carbs} onChange={(event) => setMealForm(current => ({ ...current, carbs: event.target.value }))} required />
              </div>
              <div className="grid gap-1.5">
                <Label>Fat</Label>
                <Input type="number" min="0" value={mealForm.fat} onChange={(event) => setMealForm(current => ({ ...current, fat: event.target.value }))} required />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetMealDialog}>إلغاء</Button>
              <Button type="submit">{mealForm.id ? 'حفظ التعديل' : 'إضافة الوجبة'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={packageDialogOpen} onOpenChange={(open) => open ? setPackageDialogOpen(true) : resetPackageDialog()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{packageForm.id ? 'تعديل الباقة' : 'إنشاء باقة جديدة'}</DialogTitle>
            <DialogDescription>أنشئ باقة جديدة من وجبات المنيو أو أضف وجبات مخصصة يدويًا.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePackageSubmit} className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>اسم الباقة</Label>
                <Input value={packageForm.name} onChange={(event) => setPackageForm(current => ({ ...current, name: event.target.value }))} required />
              </div>
              <div className="grid gap-1.5">
                <Label>عدد الأيام</Label>
                <Input type="number" min="1" value={packageForm.days_count} onChange={(event) => setPackageForm(current => ({ ...current, days_count: event.target.value }))} required />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>السعر</Label>
                <Input type="number" min="0" step="0.01" value={packageForm.price} onChange={(event) => setPackageForm(current => ({ ...current, price: event.target.value }))} required />
              </div>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">اختيار الوجبات من المنيو</p>
                  <p className="text-sm text-muted-foreground">يمكنك اختيار أكثر من وجبة من نفس منيو البراند.</p>
                </div>
                <Badge variant="outline">{packageForm.selectedMealIds.length} مختارة</Badge>
              </div>
              <div className="grid max-h-64 gap-2 overflow-y-auto rounded-2xl border p-3">
                {filteredMeals.map((meal) => (
                  <label key={meal.id} className="flex items-start gap-3 rounded-2xl border bg-background px-3 py-3 cursor-pointer">
                    <Checkbox checked={packageForm.selectedMealIds.includes(meal.id)} onCheckedChange={() => toggleMealSelection(meal.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{meal.name}</span>
                        <Badge variant="secondary">{MENU_CATEGORY_LABELS[meal.category]}</Badge>
                        {meal.price !== null && <Badge variant="outline">{formatEGPCurrency(meal.price)}</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Protein {meal.protein}g | Carbs {meal.carbs}g | Fat {meal.fat}g | Calories {meal.calories}</p>
                    </div>
                  </label>
                ))}
                {filteredMeals.length === 0 && (
                  <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                    أضف وجبات لهذا البراند أولًا حتى تظهر هنا.
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">وجبات خارج المنيو</p>
                  <p className="text-sm text-muted-foreground">أضف أسماء مخصصة يدويًا عند الحاجة.</p>
                </div>
                <Button type="button" variant="outline" className="rounded-2xl gap-2" onClick={addCustomMeal}>
                  <Plus className="h-4 w-4" /> إضافة اسم يدوي
                </Button>
              </div>
              <div className="grid gap-2">
                {packageForm.customMeals.map((mealName, index) => (
                  <div key={`${index}-${mealName}`} className="flex items-center gap-2">
                    <Input value={mealName} onChange={(event) => updateCustomMeal(index, event.target.value)} placeholder="اسم وجبة خارج المنيو" />
                    <Button type="button" size="icon" variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => removeCustomMeal(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground">
                <Salad className="h-4 w-4 text-primary" />
                <span className="font-semibold">ملخص الباقة</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {packageForm.selectedMealIds.map((mealId) => filteredMeals.find((meal) => meal.id === mealId)?.name).filter(Boolean).map((mealName) => (
                  <Badge key={mealName} variant="secondary">{mealName}</Badge>
                ))}
                {packageForm.customMeals.filter(Boolean).map((mealName) => (
                  <Badge key={mealName} variant="outline">{mealName}</Badge>
                ))}
                {packageForm.selectedMealIds.length === 0 && packageForm.customMeals.filter(Boolean).length === 0 && (
                  <span>اختر مكونات الباقة قبل الحفظ.</span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 text-foreground">
                <Flame className="h-4 w-4 text-warning" />
                <span>سعر الباقة: {packageForm.price ? formatEGPCurrency(Number(packageForm.price)) : 'غير محدد'}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={resetPackageDialog}>إلغاء</Button>
              <Button type="submit">{packageForm.id ? 'حفظ التعديل' : 'إنشاء الباقة'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}