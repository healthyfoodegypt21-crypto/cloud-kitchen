import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { Brand } from '@/hooks/useBrands';
import { useInventory } from '@/hooks/useInventory';
import { cn, compactWhitespace, formatEGPCurrency } from '@/lib/utils';
import { getInventoryStatus, getNearExpiryItems, summarizeInventoryByCategory, summarizeInventoryByLocation } from '@/store/inventory';
import {
  InventoryCategory,
  InventoryItem,
  InventoryItemInput,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_CATEGORY_ORDER,
  INVENTORY_STATUS_LABELS,
  INVENTORY_UNIT_LABELS,
  INVENTORY_UNIT_ORDER,
} from '@/types/inventory';
import { AlertTriangle, Boxes, Loader2, PackagePlus, Pencil, RefreshCcw, Search, Trash2 } from 'lucide-react';

type InventoryFormState = {
  id?: string;
  name: string;
  sku: string;
  category: InventoryCategory;
  barcode: string;
  english_name: string;
  subcategory: string;
  base_unit: keyof typeof INVENTORY_UNIT_LABELS;
  purchase_unit: keyof typeof INVENTORY_UNIT_LABELS;
  issue_unit: keyof typeof INVENTORY_UNIT_LABELS;
  conversion_factor: string;
  unit: keyof typeof INVENTORY_UNIT_LABELS;
  quantity: string;
  reorder_point: string;
  cost_per_unit: string;
  last_purchase_price: string;
  avg_cost: string;
  min_purchase_price: string;
  max_purchase_price: string;
  sale_price: string;
  min_stock: string;
  max_stock: string;
  shelf_life_days: string;
  expiry_date: string;
  lead_time_days: string;
  supplier_name: string;
  alternate_supplier_name: string;
  storage_location: string;
  warehouse_location: string;
  image_url: string;
  weight: string;
  volume: string;
  is_active: boolean;
  notes: string;
};

interface Props {
  brands: Brand[];
  brandsLoading?: boolean;
}

function createFormState(item?: InventoryItem): InventoryFormState {
  return {
    id: item?.id,
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    category: item?.category ?? 'protein',
    barcode: item?.barcode ?? '',
    english_name: item?.english_name ?? '',
    subcategory: item?.subcategory ?? '',
    base_unit: item?.base_unit ?? item?.unit ?? 'kg',
    purchase_unit: item?.purchase_unit ?? item?.unit ?? 'kg',
    issue_unit: item?.issue_unit ?? item?.unit ?? 'kg',
    conversion_factor: item?.conversion_factor ? String(item.conversion_factor) : '1',
    unit: item?.unit ?? 'kg',
    quantity: item ? String(item.quantity) : '',
    reorder_point: item ? String(item.reorder_point) : '',
    cost_per_unit: item?.cost_per_unit === null || item?.cost_per_unit === undefined ? '' : String(item.cost_per_unit),
    last_purchase_price: item?.last_purchase_price === null || item?.last_purchase_price === undefined ? '' : String(item.last_purchase_price),
    avg_cost: item?.avg_cost === null || item?.avg_cost === undefined ? '' : String(item.avg_cost),
    min_purchase_price: item?.min_purchase_price === null || item?.min_purchase_price === undefined ? '' : String(item.min_purchase_price),
    max_purchase_price: item?.max_purchase_price === null || item?.max_purchase_price === undefined ? '' : String(item.max_purchase_price),
    sale_price: item?.sale_price === null || item?.sale_price === undefined ? '' : String(item.sale_price),
    min_stock: item?.min_stock === null || item?.min_stock === undefined ? '' : String(item.min_stock),
    max_stock: item?.max_stock === null || item?.max_stock === undefined ? '' : String(item.max_stock),
    shelf_life_days: item?.shelf_life_days === null || item?.shelf_life_days === undefined ? '' : String(item.shelf_life_days),
    expiry_date: item?.expiry_date ?? '',
    lead_time_days: item?.lead_time_days === null || item?.lead_time_days === undefined ? '' : String(item.lead_time_days),
    supplier_name: item?.supplier_name ?? '',
    alternate_supplier_name: item?.alternate_supplier_name ?? '',
    storage_location: item?.storage_location ?? '',
    warehouse_location: item?.warehouse_location ?? item?.storage_location ?? '',
    image_url: item?.image_url ?? '',
    weight: item?.weight === null || item?.weight === undefined ? '' : String(item.weight),
    volume: item?.volume === null || item?.volume === undefined ? '' : String(item.volume),
    is_active: item?.is_active ?? true,
    notes: item?.notes ?? '',
  };
}

export default function Inventory({ brands, brandsLoading = false }: Props) {
  const { role, isDemoMode } = useAuth();
  const { items, movements, batches, counts, transfers, reorderSuggestions, activitySummary, inventoryValue, loading, storageMode, fallbackReason, refresh, saveItem, deleteItem, loadDemoInventory } = useInventory();
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | InventoryCategory>('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formState, setFormState] = useState<InventoryFormState>(() => createFormState());

  const canManage = role === 'owner' && !isDemoMode;

  useEffect(() => {
    if (brands.length === 0) {
      setSelectedBrandId('');
      return;
    }

    if (!brands.some((brand) => brand.id === selectedBrandId)) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);

  const filteredBrandItems = useMemo(
    () => items.filter((item) => item.brand_id === selectedBrandId),
    [items, selectedBrandId],
  );

  useEffect(() => {
    if (!selectedBrandId || loading || filteredBrandItems.length > 0) {
      return;
    }

    void loadDemoInventory(selectedBrandId);
  }, [filteredBrandItems.length, loadDemoInventory, loading, selectedBrandId]);

  const normalizedSearch = useMemo(
    () => compactWhitespace(searchQuery).toLowerCase(),
    [searchQuery],
  );

  const visibleItems = useMemo(() => {
    return filteredBrandItems.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const itemLocation = item.warehouse_location || item.storage_location || 'غير محدد';
      const matchesLocation = selectedLocation === 'all' || itemLocation === selectedLocation;
      const statusLabel = INVENTORY_STATUS_LABELS[getInventoryStatus(item)].toLowerCase();
      const matchesSearch = !normalizedSearch
        || item.name.toLowerCase().includes(normalizedSearch)
        || item.sku.toLowerCase().includes(normalizedSearch)
        || item.supplier_name.toLowerCase().includes(normalizedSearch)
        || (item.alternate_supplier_name ?? '').toLowerCase().includes(normalizedSearch)
        || item.storage_location.toLowerCase().includes(normalizedSearch)
        || itemLocation.toLowerCase().includes(normalizedSearch)
        || statusLabel.includes(normalizedSearch);

      return matchesCategory && matchesLocation && matchesSearch;
    });
  }, [filteredBrandItems, normalizedSearch, selectedCategory, selectedLocation]);

  const warehouseSummary = useMemo(() => summarizeInventoryByLocation(filteredBrandItems), [filteredBrandItems]);

  const nearExpiryItems = useMemo(() => getNearExpiryItems(filteredBrandItems, 30), [filteredBrandItems]);

  const recentMovements = movements.slice(0, 6);
  const prioritySuggestions = reorderSuggestions.slice(0, 6).filter((suggestion) => filteredBrandItems.some((item) => item.id === suggestion.item_id));

  const summary = useMemo(() => {
    const categoryCounts = summarizeInventoryByCategory(filteredBrandItems);
    const lowItems = filteredBrandItems.filter((item) => {
      const status = getInventoryStatus(item);
      return status === 'low' || status === 'critical' || status === 'out';
    });

    const outItems = filteredBrandItems.filter((item) => getInventoryStatus(item) === 'out');

    const totalValue = filteredBrandItems.reduce((sum, item) => {
      if (item.cost_per_unit === null) {
        return sum;
      }

      return sum + (item.cost_per_unit * item.quantity);
    }, 0);

    return {
      totalItems: filteredBrandItems.length,
      lowItems,
      outItems,
      nearExpiryItems,
      totalValue,
      categoryCounts,
    };
  }, [filteredBrandItems, nearExpiryItems]);

  const openDialog = (item?: InventoryItem) => {
    setFormState(createFormState(item));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setFormState(createFormState());
    setDialogOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBrandId) {
      return;
    }

    const payload: InventoryItemInput = {
      id: formState.id,
      brand_id: selectedBrandId,
      name: formState.name,
      sku: formState.sku,
      category: formState.category,
      barcode: formState.barcode,
      english_name: formState.english_name,
      subcategory: formState.subcategory,
      base_unit: formState.base_unit,
      purchase_unit: formState.purchase_unit,
      issue_unit: formState.issue_unit,
      conversion_factor: Number(formState.conversion_factor || 1),
      unit: formState.unit,
      quantity: Number(formState.quantity || 0),
      reorder_point: Number(formState.reorder_point || 0),
      cost_per_unit: formState.cost_per_unit.trim() ? Number(formState.cost_per_unit) : null,
      last_purchase_price: formState.last_purchase_price.trim() ? Number(formState.last_purchase_price) : null,
      avg_cost: formState.avg_cost.trim() ? Number(formState.avg_cost) : null,
      min_purchase_price: formState.min_purchase_price.trim() ? Number(formState.min_purchase_price) : null,
      max_purchase_price: formState.max_purchase_price.trim() ? Number(formState.max_purchase_price) : null,
      sale_price: formState.sale_price.trim() ? Number(formState.sale_price) : null,
      min_stock: formState.min_stock.trim() ? Number(formState.min_stock) : null,
      max_stock: formState.max_stock.trim() ? Number(formState.max_stock) : null,
      shelf_life_days: formState.shelf_life_days.trim() ? Number(formState.shelf_life_days) : null,
      expiry_date: formState.expiry_date || null,
      lead_time_days: formState.lead_time_days.trim() ? Number(formState.lead_time_days) : null,
      supplier_name: formState.supplier_name,
      alternate_supplier_name: formState.alternate_supplier_name,
      storage_location: formState.storage_location,
      warehouse_location: formState.warehouse_location,
      image_url: formState.image_url,
      weight: formState.weight.trim() ? Number(formState.weight) : null,
      volume: formState.volume.trim() ? Number(formState.volume) : null,
      is_active: formState.is_active,
      notes: formState.notes,
    };

    const success = await saveItem(payload);
    if (success) {
      closeDialog();
    }
  };

  if (loading || brandsLoading) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">إدارة المخزون</h1>
          <p className="text-muted-foreground">متابعة المواد الخام والتغليف والنواقص حسب البراند مع تنبيه مباشر لنقاط إعادة الطلب.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            تحديث
          </Button>
          {canManage ? (
            <Button onClick={() => openDialog()} className="gap-2">
              <PackagePlus className="h-4 w-4" />
              إضافة صنف
            </Button>
          ) : null}
        </div>
      </div>

      <Alert>
        <Boxes className="h-4 w-4" />
        <AlertTitle>مرحلة التنفيذ الأولى للمخزون</AlertTitle>
        <AlertDescription>
          {storageMode === 'local' ? fallbackReason : 'إدارة المخزون متصلة بمصدر البيانات الرئيسي.'}
        </AlertDescription>
      </Alert>

      {isDemoMode ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>وضع تجريبي</AlertTitle>
          <AlertDescription>
            تم تعطيل تعديل المخزون داخل الوضع التجريبي المحلي. استخدم تسجيل دخول حقيقي لتنفيذ أي تغيير تشغيلي.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>إجمالي الأصناف</CardDescription>
            <CardTitle className="text-3xl">{summary.totalItems}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">كل المواد المرتبطة بالبراند المحدد.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>أصناف تحتاج إجراء</CardDescription>
            <CardTitle className="text-3xl text-amber-600">{summary.lowItems.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">تشمل المنخفض والحرج والنفاد الكامل.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>قيمة المخزون الظاهر</CardDescription>
            <CardTitle className="text-3xl">{formatEGPCurrency(inventoryValue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">تقدير مباشر اعتمادًا على تكلفة الوحدة والكميات الحالية.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>الصنف المنتهي</CardDescription>
            <CardTitle className="text-3xl text-rose-600">{summary.outItems.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">الأصناف التي تحتاج شراء أو نقل فوري.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>أصناف ستنتهي قريبًا</CardDescription>
            <CardTitle className="text-3xl text-orange-600">{summary.nearExpiryItems.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">خلال 30 يومًا أو أقل.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>عدد المخازن/المواقع</CardDescription>
            <CardTitle className="text-3xl">{Object.keys(warehouseSummary).length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">مواقع تخزينية تظهر من بيانات الأصناف الحالية.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>مخزون نشط</CardDescription>
            <CardTitle className="text-3xl">{activitySummary.active}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">الأصناف الموقوفة لا تدخل في الحسابات التشغيلية.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>سجلات الحركة</CardDescription>
            <CardTitle className="text-xl">
              {movements.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">مُسجّل تلقائيًا للحركة، التحويل، والجرد.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>حركات اليوم</CardDescription>
            <CardTitle className="text-3xl">{recentMovements.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">آخر سطور الحركة المسجلة محليًا.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>الدفعات (Batches)</CardDescription>
            <CardTitle className="text-3xl">{batches.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">لتنفيذ FEFO وتتبع الصلاحية.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>عمليات الجرد</CardDescription>
            <CardTitle className="text-3xl">{counts.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">يومي، أسبوعي، شهري، ومفاجئ.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>طلبات التحويل</CardDescription>
            <CardTitle className="text-3xl">{transfers.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">طلب، اعتماد، واستلام بين المخازن.</p>
          </CardContent>
        </Card>
      </div>

      {nearExpiryItems.length > 0 ? (
        <Alert className="border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>تنبيه صلاحية</AlertTitle>
          <AlertDescription>
            {nearExpiryItems.slice(0, 3).map((item) => item.name).join('، ')}
            {nearExpiryItems.length > 3 ? ` +${nearExpiryItems.length - 3} أصناف أخرى ستنتهي قريبًا.` : ' تحتاج متابعة FEFO الآن.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {prioritySuggestions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>اقتراحات الشراء التلقائية</CardTitle>
            <CardDescription>العناصر التي وصلت نقطة إعادة الطلب مع كمية مقترحة ومورد مفضل.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {prioritySuggestions.map((suggestion) => (
              <div key={suggestion.item_id} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{suggestion.item_name}</p>
                  <Badge variant="secondary">{suggestion.suggested_quantity} {suggestion.warehouse_location}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">المورد:</span> {suggestion.supplier_name}</div>
                  <div><span className="text-muted-foreground">آخر سعر:</span> {suggestion.last_purchase_price === null ? 'غير محدد' : formatEGPCurrency(suggestion.last_purchase_price)}</div>
                  <div><span className="text-muted-foreground">متوسط:</span> {suggestion.avg_cost === null ? 'غير محدد' : formatEGPCurrency(suggestion.avg_cost)}</div>
                  <div><span className="text-muted-foreground">Lead Time:</span> {suggestion.lead_time_days ?? '—'} يوم</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {recentMovements.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>آخر حركات المخزون</CardTitle>
            <CardDescription>تأكيد للحركة الآلية على مستوى شراء / بيع / تحويل / هالك.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentMovements.map((movement) => {
              const movementItem = filteredBrandItems.find((item) => item.id === movement.item_id);
              return (
                <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                  <div>
                    <p className="font-semibold">{movementItem?.name ?? movement.item_id}</p>
                    <p className="text-sm text-muted-foreground">{movement.movement_type} • {movement.quantity}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{new Date(movement.occurred_at).toLocaleString('ar-EG')}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 lg:grid-cols-[220px,220px,220px,1fr]">
            <div className="space-y-2">
              <Label>البراند</Label>
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر البراند" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الفئة</Label>
              <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as 'all' | InventoryCategory)}>
                <SelectTrigger>
                  <SelectValue placeholder="كل الفئات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفئات</SelectItem>
                  {INVENTORY_CATEGORY_ORDER.map((category) => (
                    <SelectItem key={category} value={category}>{INVENTORY_CATEGORY_LABELS[category]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الموقع التخزيني</Label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="كل المواقع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المواقع</SelectItem>
                  {Object.keys(warehouseSummary).sort().map((location) => (
                    <SelectItem key={location} value={location}>{location}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>بحث</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pr-9" placeholder="اسم الصنف أو SKU أو المورد أو الموقع" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {summary.lowItems.length > 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>تنبيه مخزون</AlertTitle>
          <AlertDescription>
            {summary.lowItems.slice(0, 3).map((item) => item.name).join('، ')}
            {summary.lowItems.length > 3 ? ` +${summary.lowItems.length - 3} أصناف أخرى تحتاج متابعة.` : ' تحتاج مراجعة الآن.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleItems.map((item) => {
          const status = getInventoryStatus(item);
          return (
            <Card key={item.id} className="border-border/70">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{item.name}</CardTitle>
                    <CardDescription>{item.sku} • {INVENTORY_CATEGORY_LABELS[item.category]}</CardDescription>
                  </div>

                  <Badge
                    className={cn(
                      status === 'healthy' && 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
                      status === 'low' && 'bg-amber-100 text-amber-800 hover:bg-amber-100',
                      status === 'critical' && 'bg-orange-100 text-orange-800 hover:bg-orange-100',
                      status === 'out' && 'bg-rose-100 text-rose-800 hover:bg-rose-100',
                    )}
                    variant="secondary"
                  >
                    {INVENTORY_STATUS_LABELS[status]}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">الكمية الحالية</p>
                    <p className="text-lg font-semibold">{item.quantity} {INVENTORY_UNIT_LABELS[item.unit]}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">حد إعادة الطلب</p>
                    <p className="text-lg font-semibold">{item.reorder_point} {INVENTORY_UNIT_LABELS[item.unit]}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">المورد</p>
                    <p className="text-sm font-medium">{item.supplier_name || 'غير محدد'}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">الموقع التخزيني</p>
                    <p className="text-sm font-medium">{item.warehouse_location || item.storage_location || 'غير محدد'}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">باركود</p>
                    <p className="text-sm font-medium">{item.barcode || 'غير متوفر'}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">وحدة الشراء / الصرف</p>
                    <p className="text-sm font-medium">{INVENTORY_UNIT_LABELS[item.purchase_unit ?? item.unit]} / {INVENTORY_UNIT_LABELS[item.issue_unit ?? item.unit]}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">معامل التحويل</p>
                    <p className="text-sm font-medium">{item.conversion_factor ?? 1}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">آخر سعر شراء</p>
                    <p className="text-sm font-medium">{item.last_purchase_price === null || item.last_purchase_price === undefined ? 'غير محدد' : formatEGPCurrency(item.last_purchase_price)}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">متوسط التكلفة</p>
                    <p className="text-sm font-medium">{item.avg_cost === null || item.avg_cost === undefined ? 'غير محدد' : formatEGPCurrency(item.avg_cost)}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">الحد الأدنى / الأقصى</p>
                    <p className="text-sm font-medium">{item.min_stock ?? item.reorder_point} / {item.max_stock ?? '—'}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">الصلاحية</p>
                    <p className="text-sm font-medium">{item.expiry_date || `${item.shelf_life_days ?? 'غير محدد'} يوم`}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">مدة التوريد</p>
                    <p className="text-sm font-medium">{item.lead_time_days ?? 'غير محدد'} يوم</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">الحالة التشغيلية</p>
                    <p className="text-sm font-medium">{item.is_active === false ? 'موقوف' : 'نشط'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">قيمة الصنف الحالية</p>
                    <p className="font-semibold">{item.cost_per_unit === null ? 'غير محددة' : formatEGPCurrency(item.cost_per_unit * item.quantity)}</p>
                  </div>

                  {canManage ? (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openDialog(item)} className="gap-2">
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void deleteItem(item.id)} className="gap-2 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                    </div>
                  ) : null}
                </div>

                {item.notes ? <p className="text-sm text-muted-foreground">{item.notes}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {visibleItems.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
            <Boxes className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-lg font-semibold">لا توجد أصناف مطابقة</p>
              <p className="text-sm text-muted-foreground">غيّر البراند أو الفئة أو عبارة البحث، أو أضف صنفًا جديدًا لبدء إدارة المخزون.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{formState.id ? 'تعديل صنف مخزني' : 'إضافة صنف مخزني'}</DialogTitle>
            <DialogDescription>أدخل بيانات الصنف الأساسية وحدد نقطة إعادة الطلب لضبط التنبيهات.</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-name">اسم الصنف</Label>
                <Input id="inventory-name" value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-sku">SKU / الكود</Label>
                <Input id="inventory-sku" value={formState.sku} onChange={(event) => setFormState((current) => ({ ...current, sku: event.target.value }))} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-barcode">الباركود</Label>
                <Input id="inventory-barcode" value={formState.barcode} onChange={(event) => setFormState((current) => ({ ...current, barcode: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-english-name">الاسم الإنجليزي</Label>
                <Input id="inventory-english-name" value={formState.english_name} onChange={(event) => setFormState((current) => ({ ...current, english_name: event.target.value }))} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="inventory-subcategory">التصنيف الفرعي</Label>
                <Input id="inventory-subcategory" value={formState.subcategory} onChange={(event) => setFormState((current) => ({ ...current, subcategory: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label>الفئة</Label>
                <Select value={formState.category} onValueChange={(value) => setFormState((current) => ({ ...current, category: value as InventoryCategory }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_CATEGORY_ORDER.map((category) => (
                      <SelectItem key={category} value={category}>{INVENTORY_CATEGORY_LABELS[category]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

                <div className="space-y-2">
                  <Label>الوحدة الأساسية</Label>
                  <Select value={formState.base_unit} onValueChange={(value) => setFormState((current) => ({ ...current, base_unit: value as InventoryFormState['base_unit'] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVENTORY_UNIT_ORDER.map((unit) => (
                        <SelectItem key={unit} value={unit}>{INVENTORY_UNIT_LABELS[unit]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              <div className="space-y-2">
                  <Label>وحدة الشراء</Label>
                  <Select value={formState.purchase_unit} onValueChange={(value) => setFormState((current) => ({ ...current, purchase_unit: value as InventoryFormState['purchase_unit'] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_UNIT_ORDER.map((unit) => (
                      <SelectItem key={unit} value={unit}>{INVENTORY_UNIT_LABELS[unit]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>وحدة الصرف</Label>
                <Select value={formState.issue_unit} onValueChange={(value) => setFormState((current) => ({ ...current, issue_unit: value as InventoryFormState['issue_unit'] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_UNIT_ORDER.map((unit) => (
                      <SelectItem key={unit} value={unit}>{INVENTORY_UNIT_LABELS[unit]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-conversion">معامل التحويل</Label>
                <Input id="inventory-conversion" type="number" min="0" step="0.0001" value={formState.conversion_factor} onChange={(event) => setFormState((current) => ({ ...current, conversion_factor: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-quantity">الكمية الحالية</Label>
                <Input id="inventory-quantity" type="number" min="0" step="0.01" value={formState.quantity} onChange={(event) => setFormState((current) => ({ ...current, quantity: event.target.value }))} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-reorder">حد إعادة الطلب</Label>
                <Input id="inventory-reorder" type="number" min="0" step="0.01" value={formState.reorder_point} onChange={(event) => setFormState((current) => ({ ...current, reorder_point: event.target.value }))} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-cost">تكلفة الوحدة</Label>
                <Input id="inventory-cost" type="number" min="0" step="0.01" value={formState.cost_per_unit} onChange={(event) => setFormState((current) => ({ ...current, cost_per_unit: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-last-price">آخر سعر شراء</Label>
                <Input id="inventory-last-price" type="number" min="0" step="0.01" value={formState.last_purchase_price} onChange={(event) => setFormState((current) => ({ ...current, last_purchase_price: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-avg-cost">متوسط التكلفة</Label>
                <Input id="inventory-avg-cost" type="number" min="0" step="0.01" value={formState.avg_cost} onChange={(event) => setFormState((current) => ({ ...current, avg_cost: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-min-purchase">أقل سعر شراء</Label>
                <Input id="inventory-min-purchase" type="number" min="0" step="0.01" value={formState.min_purchase_price} onChange={(event) => setFormState((current) => ({ ...current, min_purchase_price: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-max-purchase">أعلى سعر شراء</Label>
                <Input id="inventory-max-purchase" type="number" min="0" step="0.01" value={formState.max_purchase_price} onChange={(event) => setFormState((current) => ({ ...current, max_purchase_price: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-sale-price">سعر البيع</Label>
                <Input id="inventory-sale-price" type="number" min="0" step="0.01" value={formState.sale_price} onChange={(event) => setFormState((current) => ({ ...current, sale_price: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-min-stock">الحد الأدنى للمخزون</Label>
                <Input id="inventory-min-stock" type="number" min="0" step="0.01" value={formState.min_stock} onChange={(event) => setFormState((current) => ({ ...current, min_stock: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-max-stock">الحد الأقصى للمخزون</Label>
                <Input id="inventory-max-stock" type="number" min="0" step="0.01" value={formState.max_stock} onChange={(event) => setFormState((current) => ({ ...current, max_stock: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-shelf-life">مدة الصلاحية بالأيام</Label>
                <Input id="inventory-shelf-life" type="number" min="0" step="1" value={formState.shelf_life_days} onChange={(event) => setFormState((current) => ({ ...current, shelf_life_days: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-expiry">تاريخ الانتهاء</Label>
                <Input id="inventory-expiry" type="date" value={formState.expiry_date} onChange={(event) => setFormState((current) => ({ ...current, expiry_date: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-lead-time">مدة التوريد بالأيام</Label>
                <Input id="inventory-lead-time" type="number" min="0" step="1" value={formState.lead_time_days} onChange={(event) => setFormState((current) => ({ ...current, lead_time_days: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-supplier">المورد</Label>
                <Input id="inventory-supplier" value={formState.supplier_name} onChange={(event) => setFormState((current) => ({ ...current, supplier_name: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-alt-supplier">المورد البديل</Label>
                <Input id="inventory-alt-supplier" value={formState.alternate_supplier_name} onChange={(event) => setFormState((current) => ({ ...current, alternate_supplier_name: event.target.value }))} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="inventory-location">الموقع التخزيني</Label>
                <Input id="inventory-location" value={formState.storage_location} onChange={(event) => setFormState((current) => ({ ...current, storage_location: event.target.value }))} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="inventory-warehouse">المخزن</Label>
                <Input id="inventory-warehouse" value={formState.warehouse_location} onChange={(event) => setFormState((current) => ({ ...current, warehouse_location: event.target.value }))} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="inventory-image">رابط الصورة</Label>
                <Input id="inventory-image" value={formState.image_url} onChange={(event) => setFormState((current) => ({ ...current, image_url: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-weight">الوزن</Label>
                <Input id="inventory-weight" type="number" min="0" step="0.001" value={formState.weight} onChange={(event) => setFormState((current) => ({ ...current, weight: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-volume">الحجم</Label>
                <Input id="inventory-volume" type="number" min="0" step="0.001" value={formState.volume} onChange={(event) => setFormState((current) => ({ ...current, volume: event.target.value }))} />
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <input id="inventory-active" type="checkbox" checked={formState.is_active} onChange={(event) => setFormState((current) => ({ ...current, is_active: event.target.checked }))} />
                <Label htmlFor="inventory-active">الصنف نشط</Label>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="inventory-notes">ملاحظات</Label>
                <Textarea id="inventory-notes" rows={4} value={formState.notes} onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
              <Button type="submit">حفظ</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
