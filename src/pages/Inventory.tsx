import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowUpFromLine, Boxes, Check, ClipboardCheck, Loader2, PackagePlus, Pencil, Plus, ShoppingCart, Trash2, WalletCards, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Brand } from '@/hooks/useBrands';
import { useAuth } from '@/hooks/useAuth';
import { useOperationalInventory } from '@/hooks/useOperationalInventory';
import { supabase } from '@/integrations/supabase/client';
import { hasPageAccess } from '@/lib/permissions';
import { formatEGPCurrency } from '@/lib/utils';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import PurchaseOrderBuilder, { type PurchaseOrderLine } from '@/components/PurchaseOrderBuilder';
import PurchaseReceiptPanel from '@/components/PurchaseReceiptPanel';
import { INVENTORY_UNIT_LABELS } from '@/types/inventory';
import type { InventoryBatch, InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';

type DialogMode = 'item' | 'editItem' | 'category' | 'location' | 'movement' | 'purchase' | 'withdrawal' | 'count' | 'directPurchase' | null;
type MovementAction = 'deposit' | 'withdraw' | 'waste';

type DraftLine = { itemId: string; quantity: string; unitCost?: string; locationName: string; reason: string; batchNo: string; expiryDate: string };
type ItemDraft = { name: string; code: string; category: string; purchaseUnit: string; usageUnit: string; conversionFactor: string; minStock: string; openingQuantity: string; openingCost: string; locationName: string; notes: string };
const categoryColors = ['#e0f2fe', '#ffedd5', '#ede9fe', '#d1fae5', '#ffe4e6', '#cffafe', '#fef3c7', '#fae8ff', '#dbeafe', '#dcfce7', '#fee2e2', '#e0e7ff'];
const emptyItemDraft: ItemDraft = { name: '', code: '', category: '', purchaseUnit: 'kg', usageUnit: 'kg', conversionFactor: '1', minStock: '0', openingQuantity: '0', openingCost: '0', locationName: 'main', notes: '' };

function number(value: string) { return Number(value || 0); }
function itemCode(name: string) { return `${name.trim().replace(/\s+/g, '-').slice(0, 10).toUpperCase()}-${Date.now().toString().slice(-5)}`; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function rpcNumber(result: unknown, key: string): number | null {
  if (!isRecord(result) || !(key in result)) return null;
  const parsed = Number(result[key]);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function Inventory({ brands, brandsLoading }: { brands: Brand[]; brandsLoading: boolean }) {
  const { role, isDemoMode, pagePermissions, user } = useAuth();
  const [brandId, setBrandId] = useState('');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<DialogMode>(null);
  const [openedCategory, setOpenedCategory] = useState<InventoryCategoryRecord | null>(null);
  const [consumptionDays, setConsumptionDays] = useState<7 | 30>(7);
  const [movementAction, setMovementAction] = useState<MovementAction>('deposit');
  const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft);
  const [editingItem, setEditingItem] = useState<OperationalInventoryItem | null>(null);
  const [categoryDraft, setCategoryDraft] = useState({ nameAr: '', nameEn: '', code: '' });
  const [locationDraft, setLocationDraft] = useState({ name: '', code: '' });
  const [line, setLine] = useState<DraftLine>({ itemId: '', quantity: '', unitCost: '', locationName: 'main', reason: '', batchNo: '', expiryDate: '' });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [purchaseItemId, setPurchaseItemId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { if (brands[0] && !brandId) setBrandId(brands[0].id); }, [brands, brandId]);
  const { items, categories, movements, purchaseRequests, withdrawals, batches, countApprovals, locations, itemRequests, notifications, alerts, inventoryValue, loading, invoke, refresh, markNotificationRead } = useOperationalInventory(brandId);
  const canManage = !isDemoMode && hasPageAccess(role, pagePermissions, 'inventory');
  const selectedItem = items.find((item) => item.id === line.itemId);

  const visibleItems = useMemo(() => items.filter((item) => !query.trim() || `${item.name} ${item.code}`.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);
  const categoryCards = useMemo(() => categories.map((entry) => ({ ...entry, items: visibleItems.filter((item) => item.category === entry.code) })).filter((entry) => entry.items.length > 0 || (entry.is_active && !query.trim())), [categories, query, visibleItems]);
  const todayWithdrawalValue = withdrawals.filter((entry) => entry.withdrawalDate === new Date().toISOString().slice(0, 10)).reduce((sum, entry) => sum + entry.totalValue, 0);
  const selectedCategory = categories.find((entry) => entry.code === category);
  const consumptionByItem = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - consumptionDays + 1);
    const totals = new Map<string, { quantity: number; value: number }>();
    withdrawals.filter((withdrawal) => new Date(`${withdrawal.withdrawalDate}T00:00:00`) >= since).forEach((withdrawal) => withdrawal.lines.forEach((line) => {
      const current = totals.get(line.itemId) ?? { quantity: 0, value: 0 };
      totals.set(line.itemId, { quantity: current.quantity + line.quantity, value: current.value + line.lineValue });
    }));
    return totals;
  }, [consumptionDays, withdrawals]);

  const reset = () => { setMode(null); setLine({ itemId: '', quantity: '', unitCost: '', locationName: 'main', reason: '', batchNo: '', expiryDate: '' }); setLines([]); setPurchaseItemId(''); setItemDraft(emptyItemDraft); setEditingItem(null); setLocationDraft({ name: '', code: '' }); setSupplierName(''); setPurchaserName(''); setNotes(''); };
  const addLine = () => {
    if (!line.itemId || !Number.isFinite(number(line.quantity)) || number(line.quantity) <= 0) { toast.error('اختر الصنف وأدخل كمية موجبة وصحيحة'); return; }
    setLines((current) => [...current, { ...line }]);
    setLine({ itemId: '', quantity: '', unitCost: '', locationName: 'main', reason: '', batchNo: '', expiryDate: '' });
  };
  const linesForSubmission = () => line.itemId && number(line.quantity) > 0 ? [...lines, line] : lines;

  const startPurchaseRequest = (item: OperationalInventoryItem) => {
    setPurchaseItemId(item.id);
    setMode('purchase');
  };

  const createItem = async () => {
    const conversionFactor = number(itemDraft.conversionFactor);
    if (!itemDraft.name.trim() || !itemDraft.category || !itemDraft.purchaseUnit || !itemDraft.usageUnit
      || !Number.isFinite(conversionFactor) || conversionFactor <= 0
      || !Number.isFinite(number(itemDraft.minStock)) || number(itemDraft.minStock) < 0
      || !Number.isFinite(number(itemDraft.openingQuantity)) || number(itemDraft.openingQuantity) < 0
      || !Number.isFinite(number(itemDraft.openingCost)) || number(itemDraft.openingCost) < 0
      || (itemDraft.purchaseUnit === itemDraft.usageUnit && conversionFactor !== 1)) {
      toast.error('أدخل الاسم والفئة ووحدتي الشراء والاستخدام ومعامل تحويل صحيحًا');
      return;
    }
    const result = await invoke('inventory_create_item_v2', {
      _brand_id: brandId, _item_code: itemDraft.code || itemCode(itemDraft.name), _name: itemDraft.name, _category: itemDraft.category,
      _purchase_unit: itemDraft.purchaseUnit, _usage_unit: itemDraft.usageUnit, _conversion_factor: conversionFactor,
      _min_stock: number(itemDraft.minStock), _location_name: itemDraft.locationName,
      _opening_quantity: number(itemDraft.openingQuantity), _opening_unit_cost: number(itemDraft.openingCost), _notes: itemDraft.notes,
    });
    if (result) { toast.success('تم إنشاء الصنف ورصيده الافتتاحي'); reset(); }
  };

  const startEditItem = (item: OperationalInventoryItem) => {
    setEditingItem(item);
    setItemDraft({
      name: item.name, code: item.code, category: item.category, purchaseUnit: item.purchaseUnit,
      usageUnit: item.unit, conversionFactor: String(item.conversionFactor), minStock: String(item.minStock),
      openingQuantity: '0', openingCost: '0', locationName: item.locationName, notes: item.notes,
    });
    setMode('editItem');
  };

  const updateItem = async () => {
    const conversionFactor = number(itemDraft.conversionFactor);
    if (!editingItem || !itemDraft.name.trim() || !itemDraft.category || !itemDraft.purchaseUnit || !itemDraft.usageUnit
      || !Number.isFinite(conversionFactor) || conversionFactor <= 0
      || !Number.isFinite(number(itemDraft.minStock)) || number(itemDraft.minStock) < 0
      || (itemDraft.purchaseUnit === itemDraft.usageUnit && conversionFactor !== 1)) {
      toast.error('تحقق من الاسم والفئة والوحدات ومعامل التحويل والحد الأدنى');
      return;
    }
    const result = await invoke('inventory_update_item', {
      _brand_id: brandId, _item_id: editingItem.id, _item_code: itemDraft.code || editingItem.code,
      _name: itemDraft.name, _category: itemDraft.category, _purchase_unit: itemDraft.purchaseUnit,
      _usage_unit: itemDraft.usageUnit, _conversion_factor: conversionFactor,
      _min_stock: number(itemDraft.minStock), _notes: itemDraft.notes,
    });
    if (result) { toast.success('تم تحديث بيانات الصنف'); reset(); }
  };

  const toggleItemStatus = async (item: OperationalInventoryItem) => {
    const nextStatus = item.status === 'active' ? 'inactive' : 'active';
    const result = await invoke('inventory_set_item_status', { _brand_id: brandId, _item_id: item.id, _status: nextStatus });
    if (result) toast.success(nextStatus === 'inactive' ? 'تمت أرشفة الصنف' : 'تم تفعيل الصنف');
  };

  const createCategory = async () => {
    if (!categoryDraft.nameAr || !categoryDraft.code) { toast.error('اسم الفئة والكود مطلوبان'); return; }
    const { error } = await asSupabaseLooseClient(supabase).from('inventory_categories').insert({ code: categoryDraft.code.trim().toLowerCase(), name_ar: categoryDraft.nameAr, name_en: categoryDraft.nameEn || categoryDraft.nameAr });
    if (error) { toast.error(error.message); return; }
    toast.success('تمت إضافة الفئة'); reset();
  };

  const createLocation = async () => {
    const code = locationDraft.code.trim().toLowerCase();
    if (!locationDraft.name.trim() || !/^[a-z0-9_-]+$/.test(code)) {
      toast.error('أدخل اسم الموقع وكودًا إنجليزيًا بلا مسافات');
      return;
    }
    const { data: existingLocations, error: lookupError } = await asSupabaseLooseClient(supabase)
      .from('warehouses').select('id').eq('brand_id', brandId).ilike('warehouse_code', code).limit(1);
    if (lookupError) { toast.error(lookupError.message || 'تعذر التحقق من كود الموقع'); return; }
    if (Array.isArray(existingLocations) && existingLocations.length > 0) {
      toast.error('كود الموقع مستخدم بالفعل لهذه العلامة التجارية');
      return;
    }
    const { error } = await asSupabaseLooseClient(supabase).from('warehouses').insert({
      brand_id: brandId, warehouse_code: code.toUpperCase(), name: locationDraft.name.trim(),
      warehouse_type: 'general', status: 'active',
    });
    if (error) { toast.error(error.message || 'تعذر إنشاء موقع المخزن'); return; }
    toast.success('تم إنشاء موقع المخزن');
    await refresh();
    reset();
  };

  const deleteCategory = async () => {
    if (category === 'all' || !selectedCategory || !window.confirm(`حذف فئة "${selectedCategory.name_ar}"؟ يمكن حذف الفئة الفارغة فقط.`)) return;
    const result = await invoke('inventory_delete_category', { _category_code: category });
    if (result) { toast.success('تم حذف الفئة'); setCategory('all'); }
  };

  const deleteItem = async (item: OperationalInventoryItem) => {
    if (!window.confirm(`حذف الصنف "${item.name}"؟ لا يمكن حذف صنف مرتبط بحركات أو مستندات سابقة.`)) return;
    const result = await invoke('inventory_delete_item', { _brand_id: brandId, _item_id: item.id });
    if (result) toast.success('تم حذف الصنف');
  };

  const postMovement = async () => {
    if (!line.itemId || !Number.isFinite(number(line.quantity)) || number(line.quantity) <= 0
      || (movementAction === 'deposit' && (!Number.isFinite(number(line.unitCost ?? '')) || number(line.unitCost ?? '') < 0))) {
      toast.error('اختر الصنف وأدخل كمية وتكلفة صحيحتين');
      return;
    }
    const mapping = { deposit: 'purchase_receipt', withdraw: 'production_consumption', waste: 'waste' } as const;
    const result = await invoke('inventory_record_manual_movement', {
      _brand_id: brandId, _item_id: line.itemId, _movement_type: mapping[movementAction], _quantity: number(line.quantity),
      _unit_cost: movementAction === 'deposit' ? number(line.unitCost || String(selectedItem?.averageCost ?? 0)) : null,
      _location_name: line.locationName, _notes: line.reason, _batch_no: line.batchNo, _expiry_date: line.expiryDate || null,
    });
    if (result) {
      const value = rpcNumber(result, 'movement_value');
      if (value === null) toast.error('تم تسجيل الحركة لكن تعذر قراءة قيمتها. راجع سجل الحركات.');
      else toast.success(`تم تسجيل ${movementAction === 'deposit' ? 'الإيداع' : movementAction === 'waste' ? 'الهالك' : 'السحب'} بقيمة ${formatEGPCurrency(value)}`);
      reset();
    }
  };

  const submitPurchase = async () => {
    const submissionLines = linesForSubmission();
    if (submissionLines.length === 0 || submissionLines.some((entry) => !Number.isFinite(number(entry.quantity)) || number(entry.quantity) <= 0 || !Number.isFinite(number(entry.unitCost ?? '0')) || number(entry.unitCost ?? '0') < 0)) { toast.error('أدخل كمية وسعرًا صحيحين لكل بند شراء'); return; }
    const result = await invoke('inventory_submit_purchase_request', { _brand_id: brandId, _supplier_name: supplierName, _lines: submissionLines.map((entry) => ({ item_id: entry.itemId, quantity: number(entry.quantity), unit_cost: number(entry.unitCost || '0'), location_name: entry.locationName, notes: entry.reason, batch_no: entry.batchNo, expiry_date: entry.expiryDate || null })), _notes: notes });
    if (result) { toast.success('تم إرسال إشعار لمدير المخزن. لن يزداد المخزون قبل الاعتماد.'); reset(); }
  };

  const submitStoreDirectPurchase = async () => {
    const submissionLines = linesForSubmission();
    if (submissionLines.length === 0 || !purchaserName.trim()
      || submissionLines.some((entry) => !Number.isFinite(number(entry.quantity)) || number(entry.quantity) <= 0 || !Number.isFinite(number(entry.unitCost ?? '0')) || number(entry.unitCost ?? '0') < 0)) { toast.error('أدخل اسم المشتري وكمية وسعرًا صحيحين لكل بند'); return; }
    const result = await invoke('inventory_record_store_purchase', { _brand_id: brandId, _supplier_name: supplierName, _purchaser_name: purchaserName, _lines: submissionLines.map((entry) => ({ item_id: entry.itemId, quantity: number(entry.quantity), unit_cost: number(entry.unitCost || '0'), location_name: entry.locationName, notes: entry.reason, batch_no: entry.batchNo, expiry_date: entry.expiryDate || null })), _notes: notes });
    if (result) { toast.success('تم توثيق الشراء في قسم المشتريات وإرساله للاستلام؛ لن يتغير رصيد المخزون قبل الاستلام'); reset(); }
  };

  const submitConsolidatedPurchase = async (orderLines: PurchaseOrderLine[], orderSupplier: string, orderNotes: string) => {
    const result = await invoke('inventory_submit_purchase_request', {
      _brand_id: brandId, _supplier_name: orderSupplier,
      _lines: orderLines.map((entry) => ({ item_id: entry.itemId, quantity: number(entry.quantity), unit_cost: number(entry.unitCost || '0'), location_name: entry.locationName, notes: entry.notes })),
      _notes: orderNotes,
    });
    if (result) { toast.success('تم إنشاء أمر الشراء المجمع وإرساله للاعتماد'); reset(); }
  };

  const createPurchaseItem = async (draft: { name: string; code: string; category: string; purchaseUnit: string; usageUnit: string; conversionFactor: string; minStock: string; unitCost: string }) => {
    const result = await invoke('inventory_create_item_v2', {
      _brand_id: brandId, _item_code: draft.code || itemCode(draft.name), _name: draft.name, _category: draft.category,
      _purchase_unit: draft.purchaseUnit, _usage_unit: draft.usageUnit, _conversion_factor: number(draft.conversionFactor),
      _min_stock: number(draft.minStock), _location_name: 'main', _opening_quantity: 0, _opening_unit_cost: 0, _notes: 'أُضيف من أمر شراء مجمع',
    });
    return result ? { id: String(result), code: draft.code || itemCode(draft.name) } : null;
  };

  const postWithdrawal = async () => {
    const submissionLines = linesForSubmission();
    if (submissionLines.length === 0 || submissionLines.some((entry) => !Number.isFinite(number(entry.quantity)) || number(entry.quantity) <= 0)) { toast.error('أدخل كمية موجبة وصحيحة لكل بند للمسحوبات'); return; }
    const result = await invoke('inventory_post_daily_withdrawal', { _brand_id: brandId, _lines: submissionLines.map((entry) => ({ item_id: entry.itemId, quantity: number(entry.quantity), location_name: entry.locationName, reason: entry.reason || 'تشغيل المطبخ' })), _notes: notes });
    if (result) {
      const value = rpcNumber(result, 'total_value');
      if (value === null) toast.error('تم تسجيل المسحوبات لكن تعذر قراءة إجماليها. راجع سجل المسحوبات.');
      else toast.success(`تم تسجيل مسحوبات اليوم. الإجمالي ${formatEGPCurrency(value)}`);
      reset();
    }
  };

  const postCount = async () => {
    if (!line.itemId || !Number.isFinite(number(line.quantity)) || number(line.quantity) < 0) { toast.error('اختر الصنف وأدخل رصيدًا فعليًا صحيحًا'); return; }
    const result = await invoke('inventory_post_count', { _brand_id: brandId, _item_id: line.itemId, _physical_quantity: number(line.quantity), _location_name: line.locationName, _reason: line.reason });
    if (result) {
      const variance = rpcNumber(result, 'variance_qty');
      if (variance === null) toast.error('تم إرسال الجرد لكن تعذر قراءة الفرق. راجع سجل الجرد.');
      else toast.success(`تم إرسال الجرد للمراجعة. الفرق المسجل: ${variance}`);
      reset();
    }
  };

  const reviewCount = async (countId: string, approve: boolean) => {
    const reviewNotes = approve ? '' : window.prompt('اكتب سبب رفض الجرد:')?.trim() ?? '';
    if (!approve && !reviewNotes) return;
    if (approve && !window.confirm('سيتم تطبيق فروق الجرد على الأرصدة والدفعات. هل تريد الاعتماد؟')) return;
    const result = await invoke('inventory_review_count', { _count_id: countId, _approve: approve, _review_notes: reviewNotes });
    if (result) toast.success(approve ? 'تم اعتماد الجرد وتطبيق التسوية' : 'تم رفض الجرد');
  };

  if (loading || brandsLoading) return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h1 className="text-3xl font-bold">المخزون</h1><p className="text-muted-foreground">أرصدة كل موقع، الحركات، المسحوبات اليومية، والجرد بمراجعة مستقلة.</p></div><div className="flex flex-wrap gap-2">{canManage && <><Button variant="outline" onClick={() => setMode('location')}><Plus className="ml-2 h-4 w-4" />إضافة موقع مخزن</Button><Button variant="outline" onClick={() => setMode('withdrawal')}><ArrowUpFromLine className="ml-2 h-4 w-4" />تسجيل مسحوبات اليوم</Button><Button variant="outline" onClick={() => setMode('directPurchase')}><WalletCards className="ml-2 h-4 w-4" />تسجيل شراء</Button><Button onClick={() => setMode('purchase')}><ShoppingCart className="ml-2 h-4 w-4" />إنشاء أمر شراء مجمع</Button></>}</div></header>

    {brands.length > 1 && <div className="flex flex-wrap items-center gap-2"><Label htmlFor="inventory-brand">العلامة التجارية</Label><select id="inventory-brand" className="h-10 rounded-md border bg-background px-3" value={brandId} onChange={(event) => { setBrandId(event.target.value); setCategory('all'); setOpenedCategory(null); }}><option value="">اختر العلامة التجارية</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div>}

    {mode === 'directPurchase' && <Card className="border-primary/40"><CardHeader><CardTitle>شراء مباشر سجله مدير المخزن</CardTitle><CardDescription>يُسجل في المشتريات وينتظر اعتماد الاستلام قبل تحديث المخزون.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label>الصنف</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={line.itemId} onChange={(event) => { const item = items.find((entry) => entry.id === event.target.value); setLine((current) => ({ ...current, itemId: event.target.value, unitCost: String(item?.lastPurchasePrice || (item ? item.averageCost * item.conversionFactor : 0)), locationName: item?.locationName || locations[0]?.code || 'main' })); }}><option value="">اختر الصنف</option>{items.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name} — {item.purchaseUnit}</option>)}</select></div><div className="space-y-1"><Label>اسم من قام بالشراء *</Label><Input value={purchaserName} onChange={(event) => setPurchaserName(event.target.value)} /></div><div className="space-y-1"><Label>الموقع</Label><LocationSelect locations={locations} value={line.locationName} onChange={(value) => setLine((current) => ({ ...current, locationName: value }))} /></div><div className="space-y-1"><Label>الكمية بوحدة الشراء</Label><Input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => setLine((current) => ({ ...current, quantity: event.target.value }))} /></div><div className="space-y-1"><Label>سعر وحدة الشراء</Label><Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setLine((current) => ({ ...current, unitCost: event.target.value }))} /></div><div className="space-y-1"><Label>المورد</Label><Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></div><div className="space-y-1"><Label>رقم الدفعة</Label><Input value={line.batchNo} onChange={(event) => setLine((current) => ({ ...current, batchNo: event.target.value }))} /></div></div><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات اختيارية" /><div className="flex gap-2"><Button onClick={() => void submitStoreDirectPurchase()}><WalletCards className="ml-2 h-4 w-4" />تسجيل الشراء</Button><Button variant="outline" onClick={reset}>إلغاء</Button></div></CardContent></Card>}

    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{locations.length ? `${locations.length} مواقع مخازن نشطة` : 'لا توجد مواقع مخازن نشطة'}</p><div className="flex flex-wrap gap-2"><select aria-label="تصفية حسب الفئة" className="h-10 rounded-md border bg-background px-3" value={category} onChange={(event) => { setCategory(event.target.value); setOpenedCategory(categories.find((entry) => entry.code === event.target.value) ?? null); }}><option value="all">كل الفئات</option>{categories.map((entry) => <option key={entry.id} value={entry.code}>{entry.name_ar}</option>)}</select>{canManage && category !== 'all' && selectedCategory && <Button variant="outline" className="text-destructive" onClick={() => void deleteCategory()}><Trash2 className="ml-1 h-4 w-4" />حذف الفئة</Button>}<Input className="max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث باسم الصنف أو الكود" /></div></div>
    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>قيمة البضاعة المتاحة</CardDescription><CardTitle>{formatEGPCurrency(inventoryValue)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">الكمية المتاحة × متوسط تكلفة كل صنف.</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>مسحوبات اليوم</CardDescription><CardTitle>{formatEGPCurrency(todayWithdrawalValue)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">تُحسب بمتوسط التكلفة وقت الصرف.</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>شراء تم تنفيذه بانتظار الاستلام</CardDescription><CardTitle>{purchaseRequests.filter((request) => request.status === 'purchased_pending_receipt').length}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">لا تضاف للمخزون قبل فحص الاستلام واعتماده.</CardContent></Card></div>

    {notifications.filter((notification) => !notification.isRead).length > 0 && <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-bold">إشعارات مدير المخزن</h2><p className="text-sm text-muted-foreground">طلبات الشراء القادمة من قسم المشتريات تظهر هنا فور تسجيلها.</p></div><Badge variant="destructive">{notifications.filter((notification) => !notification.isRead).length} جديد</Badge></div><div className="grid gap-3">{notifications.filter((notification) => !notification.isRead).map((notification) => <Card key={notification.id} className="border-amber-300"><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><strong>{notification.title}</strong><p className="mt-1 text-sm text-muted-foreground">{notification.message}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleString('ar-EG')}</p></div><Button variant="outline" onClick={() => void markNotificationRead(notification.id)}>تمت القراءة</Button></CardContent></Card>)}</div></section>}

    {canManage && countApprovals.length > 0 && <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-bold">جرد بانتظار اعتماد مستقل</h2><p className="text-sm text-muted-foreground">لا تتغير الأرصدة إلا بعد اعتماد مستخدم مختلف عن مُعدّ الجرد، ويُطلب إعادة العد إذا تحرك المخزون بعده.</p></div><Badge variant="secondary">{countApprovals.length}</Badge></div><div className="grid gap-3">{countApprovals.map((count) => <Card key={count.id} className="border-primary/20"><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{count.countNo}</strong><p className="text-sm text-muted-foreground">أُعد بواسطة {count.countedBy === user?.id ? 'أنت' : count.countedBy || 'مستخدم غير معروف'} — {new Date(count.countedAt).toLocaleString('ar-EG')}</p>{count.notes && <p className="text-sm">{count.notes}</p>}</div><div className="flex gap-2"><Button size="sm" onClick={() => void reviewCount(count.id, true)} disabled={count.countedBy === user?.id}><Check className="ml-1 h-4 w-4" />اعتماد</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => void reviewCount(count.id, false)} disabled={count.countedBy === user?.id}><X className="ml-1 h-4 w-4" />رفض</Button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-sm"><thead><tr className="border-b text-right text-muted-foreground"><th className="p-2">الصنف</th><th className="p-2">الموقع</th><th className="p-2">الرصيد الدفتري</th><th className="p-2">الفعلي</th><th className="p-2">الفرق</th></tr></thead><tbody>{count.lines.map((entry) => <tr key={entry.id} className="border-b last:border-0"><td className="p-2">{entry.itemName}</td><td className="p-2">{entry.locationName}</td><td className="p-2">{entry.bookQuantity}</td><td className="p-2">{entry.physicalQuantity}</td><td className="p-2 font-semibold">{entry.variance > 0 ? '+' : ''}{entry.variance}</td></tr>)}</tbody></table></div></CardContent></Card>)}</div></section>}

    {alerts.length > 0 && <Alert className="border-amber-300 bg-amber-50"><AlertTriangle className="h-4 w-4" /><AlertTitle>تنبيهات المخزون</AlertTitle><AlertDescription>{alerts.slice(0, 4).map((alert) => <p key={alert.id}>{alert.title}: {alert.description}</p>)}</AlertDescription></Alert>}

    <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-bold">الفئات</h2><p className="text-sm text-muted-foreground">اضغط على أي كارت لفتح الفئة.</p></div>{canManage && <div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" onClick={() => setMode('item')}><PackagePlus className="ml-1 h-4 w-4" />إضافة صنف</Button><Button variant="ghost" size="sm" onClick={() => setMode('category')}><Plus className="ml-1 h-4 w-4" />فئة جديدة</Button></div>}</div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{categoryCards.map((entry, index) => { const value = entry.items.reduce((sum, item) => sum + item.onHand * item.averageCost, 0); const low = entry.items.filter((item) => item.status === 'active' && item.minStock > 0 && item.availableQuantity <= item.minStock).length; const active = category === entry.code; const cardColor = categoryColors[index] ?? `hsl(${(index * 137.508) % 360} 80% 93%)`; return <button key={entry.id} onClick={() => { setCategory(entry.code); setOpenedCategory(entry); }} className={`group overflow-hidden rounded-2xl border border-slate-100 bg-card p-2 text-right shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? 'ring-2 ring-primary ring-offset-2' : ''}`}><div className="min-h-56 rounded-xl p-5" style={{ backgroundColor: cardColor }}><div className="flex items-start justify-between gap-2"><div><h3 className="text-2xl font-bold tracking-tight text-foreground">{entry.name_ar}</h3></div><Boxes className="h-5 w-5 text-foreground/65" /></div><div className="mt-12 flex flex-wrap gap-2"><span className="rounded-full bg-white/45 px-3 py-1 text-sm font-medium text-foreground/80">{entry.items.length} صنف</span><span className="rounded-full bg-white/45 px-3 py-1 text-sm font-medium text-foreground/80">{formatEGPCurrency(value)}</span>{low > 0 && <span className="rounded-full bg-amber-200/70 px-3 py-1 text-sm font-medium text-amber-950">{low} يحتاج شراء</span>}</div></div><div className="flex items-center justify-between px-3 py-4"><span className="text-lg font-bold">فتح الفئة</span><span className="grid h-10 w-10 place-items-center rounded-lg bg-muted transition group-hover:bg-primary group-hover:text-primary-foreground"><ArrowLeft className="h-5 w-5" /></span></div></button>; })}</div>{categoryCards.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">لا توجد فئات مطابقة لبحثك.</p>}</section>


    <Dialog open={openedCategory !== null} onOpenChange={(open) => !open && setOpenedCategory(null)}><DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>أصناف فئة {openedCategory?.name_ar}</DialogTitle><DialogDescription>الأرصدة ومتوسط الاستهلاك الفعلي لاختيار كميات الشراء المناسبة.</DialogDescription></DialogHeader><div className="flex items-center justify-between rounded-lg bg-muted p-3"><span className="text-sm font-medium">فترة متوسط الاستهلاك</span><div className="flex gap-2"><Button size="sm" variant={consumptionDays === 7 ? 'default' : 'outline'} onClick={() => setConsumptionDays(7)}>آخر 7 أيام</Button><Button size="sm" variant={consumptionDays === 30 ? 'default' : 'outline'} onClick={() => setConsumptionDays(30)}>آخر 30 يومًا</Button></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleItems.filter((item) => item.category === openedCategory?.code).map((item) => { const consumption = consumptionByItem.get(item.id) ?? { quantity: 0, value: 0 }; const currentLocationQuantity = item.balances.find((balance) => balance.locationName === item.locationName)?.onHand ?? 0; return <ItemCard key={item.id} item={item} batches={batches.filter((batch) => batch.itemId === item.id && batch.locationName === item.locationName && batch.status === 'available')} consumptionQuantity={consumption.quantity / consumptionDays} consumptionValue={consumption.value / consumptionDays} consumptionDays={consumptionDays} lastMovement={movements.find((movement) => movement.itemId === item.id)} canManage={canManage} onEdit={() => startEditItem(item)} onToggleStatus={() => void toggleItemStatus(item)} onDelete={() => void deleteItem(item)} onPurchase={() => startPurchaseRequest(item)} onAction={(action) => { setLine({ itemId: item.id, quantity: '', unitCost: String(item.averageCost), locationName: item.locationName, reason: '', batchNo: '', expiryDate: '' }); setMovementAction(action); setMode('movement'); }} onCount={() => { setLine({ itemId: item.id, quantity: String(currentLocationQuantity), unitCost: '', locationName: item.locationName, reason: '', batchNo: '', expiryDate: '' }); setMode('count'); }} />; })}</div></DialogContent></Dialog>

    {itemRequests.length > 0 && <section><h2 className="mb-3 text-xl font-bold">أصناف جديدة بانتظار قبول مدير المخزن</h2><div className="grid gap-3">{itemRequests.map((request) => <Card key={request.id}><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><strong>{request.itemName}{request.productBrand ? ` — ${request.productBrand}` : ''}</strong><p className="text-sm text-muted-foreground">{request.itemCode} • {request.unit} • حد أدنى {request.minStock}</p></div>{canManage && <div className="flex gap-2"><Button onClick={() => void invoke('inventory_review_item_request', { _request_id: request.id, _approve: true, _review_notes: '' })}>قبول وإضافة الصنف</Button><Button variant="outline" onClick={() => void invoke('inventory_review_item_request', { _request_id: request.id, _approve: false, _review_notes: 'مرفوض من مدير المخزن' })}>رفض</Button></div>}</CardContent></Card>)}</div></section>}

    <PurchaseReceiptPanel brandId={brandId} canManage={canManage} />

    {movements.length > 0 && <section><h2 className="mb-3 text-xl font-bold">آخر الحركات</h2><Card><CardContent className="divide-y p-0">{movements.slice(0, 10).map((movement) => <div key={movement.id} className="flex items-center justify-between p-3 text-sm"><span><strong>{movement.itemName}</strong> — {movement.type} — {movement.quantity}</span><span>{formatEGPCurrency(movement.value)}</span></div>)}</CardContent></Card></section>}

    <Dialog open={mode !== null} onOpenChange={(open) => !open && reset()}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{mode === 'item' ? 'إضافة صنف جديد' : mode === 'editItem' ? 'تعديل بيانات الصنف' : mode === 'category' ? 'إضافة فئة' : mode === 'location' ? 'إضافة موقع مخزن' : mode === 'purchase' ? 'أمر شراء مجمع' : mode === 'withdrawal' ? 'تسجيل مسحوبات اليوم' : mode === 'count' ? 'إرسال جرد للمراجعة' : movementAction === 'deposit' ? 'إيداع في المخزون' : movementAction === 'waste' ? 'تسجيل هالك' : 'سحب من المخزون'}</DialogTitle><DialogDescription>{mode === 'purchase' ? 'يشمل تلقائيًا الأصناف التي وصلت للحد الأدنى. الرصيد لا يزيد قبل اعتماد الاستلام.' : mode === 'count' ? 'سيُحفظ الجرد للمراجعة ولا يتغير الرصيد قبل اعتماد مستخدم آخر.' : mode === 'location' ? 'أضف مخزنًا أو موقعًا فعليًا لتوجيه الاستلام والحركات والجرد إليه.' : 'تُسجل الحركة بقيمتها وسجلها التدقيقي.'}</DialogDescription></DialogHeader>
      {(mode === 'item' || mode === 'editItem') && <ItemForm draft={itemDraft} setDraft={setItemDraft} categories={categories} locations={locations} allowOpeningStock={mode === 'item'} onSave={mode === 'item' ? createItem : updateItem} />}
      {mode === 'category' && <div className="space-y-3"><Field label="اسم الفئة بالعربية" value={categoryDraft.nameAr} onChange={(value) => setCategoryDraft((current) => ({ ...current, nameAr: value }))} /><Field label="الكود (إنجليزي بلا مسافات)" value={categoryDraft.code} onChange={(value) => setCategoryDraft((current) => ({ ...current, code: value }))} /><Field label="الاسم بالإنجليزية" value={categoryDraft.nameEn} onChange={(value) => setCategoryDraft((current) => ({ ...current, nameEn: value }))} /><Button className="w-full" onClick={() => void createCategory()}>حفظ الفئة</Button></div>}
      {mode === 'location' && <div className="space-y-3"><Field label="اسم الموقع" value={locationDraft.name} onChange={(value) => setLocationDraft((current) => ({ ...current, name: value }))} /><Field label="الكود (إنجليزي بلا مسافات)" value={locationDraft.code} onChange={(value) => setLocationDraft((current) => ({ ...current, code: value }))} /><Button className="w-full" onClick={() => void createLocation()}>حفظ الموقع</Button></div>}
      {mode === 'movement' && <div className="space-y-3"><LineEditor items={items} locations={locations} line={line} setLine={setLine} showCost={movementAction === 'deposit'} /><Button className="w-full" onClick={() => void postMovement()}>{movementAction === 'deposit' ? 'تأكيد الإيداع' : movementAction === 'waste' ? 'تأكيد الهالك' : 'تأكيد السحب'}</Button></div>}
      {mode === 'count' && <div className="space-y-3"><LineEditor items={items} locations={locations} line={line} setLine={setLine} quantityLabel="الرصيد الفعلي بعد الجرد" /><Button className="w-full" onClick={() => void postCount()}><ClipboardCheck className="ml-2 h-4 w-4" />إرسال للمراجعة</Button></div>}
      {mode === 'withdrawal' && <MultiLineForm items={items} locations={locations} lines={lines} line={line} setLine={setLine} addLine={addLine} removeLine={(index) => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} showCost={false} />}
      {mode === 'purchase' && <PurchaseOrderBuilder items={items} categories={categories} locations={locations} initialItemId={purchaseItemId} onSubmit={submitConsolidatedPurchase} onCreateNewItem={createPurchaseItem} />}
      {mode === 'withdrawal' && <div className="space-y-3"><Label>ملاحظات المسحوبات</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="مثال: تجهيز وردية الغداء" /><Button className="w-full" onClick={() => void postWithdrawal()}><WalletCards className="ml-2 h-4 w-4" />اعتماد مسحوبات اليوم</Button></div>}
    </DialogContent></Dialog>
  </div>;
}

function ItemCard({ item, batches, consumptionQuantity, consumptionValue, consumptionDays, lastMovement, canManage, onEdit, onToggleStatus, onDelete, onPurchase, onAction, onCount }: { item: OperationalInventoryItem; batches: InventoryBatch[]; consumptionQuantity: number; consumptionValue: number; consumptionDays: number; lastMovement?: import('@/types/operationalInventory').OperationalMovement; canManage: boolean; onEdit: () => void; onToggleStatus: () => void; onDelete: () => void; onPurchase: () => void; onAction: (action: MovementAction) => void; onCount: () => void }) {
  const value = item.onHand * item.averageCost;
  const low = item.status === 'active' && item.minStock > 0 && item.availableQuantity <= item.minStock;
  const suggestedPurchase = Math.max(item.minStock - item.availableQuantity, 0);

  return (
    <Card className={`${low ? 'border-amber-300' : ''} ${item.status === 'inactive' ? 'opacity-75' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div><CardTitle className="text-lg">{item.name}</CardTitle><CardDescription>{item.code} • الموقع: {item.locationName}</CardDescription></div>
          <Badge variant={item.status === 'inactive' ? 'outline' : low ? 'destructive' : 'secondary'}>{item.status === 'inactive' ? 'مؤرشف' : low ? 'وصل للحد الأدنى' : 'الرصيد آمن'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Metric label="المتاح" value={`${item.availableQuantity} ${item.unit}`} />
          <Metric label="محجوز" value={`${item.reservedQuantity} ${item.unit}`} />
          <Metric label="الحد الأدنى" value={`${item.minStock} ${item.unit}`} />
          <Metric label="قيمة الصنف" value={formatEGPCurrency(value)} />
        </div>
        {item.balances.length > 1 && <div className="flex flex-wrap gap-1.5">{item.balances.map((balance) => <Badge key={balance.locationName} variant="outline">{balance.locationName}: متاح {balance.availableQuantity} / إجمالي {balance.onHand} {item.unit}</Badge>)}</div>}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">متوسط تكلفة {item.unit}</p><p className="font-semibold">{formatEGPCurrency(item.averageCost)}</p></div>
          <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">آخر سعر شراء / {item.purchaseUnit}</p><p className="font-semibold">{formatEGPCurrency(item.lastPurchasePrice)}</p></div>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-sm">
          <p className="font-semibold">متوسط الاستهلاك اليومي — آخر {consumptionDays} يومًا</p>
          <div className="mt-1 flex justify-between"><span>{consumptionQuantity.toFixed(2)} {item.unit}</span><span>{formatEGPCurrency(consumptionValue)}</span></div>
        </div>
        {batches.length > 0 && <div className="rounded-lg border p-2 text-xs"><p className="mb-1 font-semibold">الدُفعات المتاحة</p>{batches.slice(0, 2).map((batch) => <p key={batch.id}>#{batch.batchNo} — متاح {Math.max(batch.quantityOnHand - batch.reservedQuantity, 0)} {item.unit}{batch.expiryDate ? ` — صلاحية ${batch.expiryDate}` : ''}</p>)}</div>}
        {low && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">الكمية الناقصة للحد الأدنى: <strong>{suggestedPurchase} {item.unit}</strong></div>}
        {item.notes && <p className="text-xs text-muted-foreground">ملاحظات: {item.notes}</p>}
        {lastMovement && <p className="text-xs text-muted-foreground">آخر حركة: {lastMovement.type} — {lastMovement.quantity} {item.unit}</p>}
        {canManage && <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="ml-1 h-3.5 w-3.5" />تعديل البيانات</Button>
          <Button size="sm" variant="outline" onClick={onToggleStatus}>{item.status === 'active' ? 'أرشفة' : 'إعادة تفعيل'}</Button>
          {item.status === 'active' && low && <Button size="sm" onClick={onPurchase}><ShoppingCart className="ml-1 h-3.5 w-3.5" />طلب شراء</Button>}
          {item.status === 'active' && <Button size="sm" variant="outline" onClick={() => onAction('deposit')}>إيداع</Button>}
          {item.status === 'active' && <Button size="sm" variant="outline" onClick={() => onAction('withdraw')}>سحب</Button>}
          {item.status === 'active' && <Button size="sm" variant="outline" className="text-destructive" onClick={() => onAction('waste')}><Trash2 className="ml-1 h-3.5 w-3.5" />هالك</Button>}
          {item.status === 'active' && <Button size="sm" variant="outline" onClick={onCount}>جرد</Button>}
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="ml-1 h-3.5 w-3.5" />حذف الصنف</Button>
        </div>}
      </CardContent>
    </Card>
  );
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-1"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function LineEditor({ items, locations, line, setLine, showCost = false, quantityLabel = 'الكمية' }: { items: OperationalInventoryItem[]; locations: { code: string; name: string }[]; line: DraftLine; setLine: React.Dispatch<React.SetStateAction<DraftLine>>; showCost?: boolean; quantityLabel?: string }) {
  const selectedItem = items.find((item) => item.id === line.itemId);
  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-1"><Label>الصنف</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={line.itemId} onChange={(event) => { const item = items.find((entry) => entry.id === event.target.value); setLine((current) => ({ ...current, itemId: event.target.value, locationName: item?.locationName ?? locations[0]?.code ?? 'main', unitCost: String(item?.averageCost ?? '') })); }}><option value="">اختر الصنف</option>{items.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name} — المتاح {item.availableQuantity} {item.unit}</option>)}</select></div>
    <div className="space-y-1"><Label>{selectedItem ? `${quantityLabel} بوحدة ${selectedItem.unit}` : quantityLabel}</Label><Input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => setLine((current) => ({ ...current, quantity: event.target.value }))} /></div>
    {showCost && <>
      <div className="space-y-1"><Label>تكلفة وحدة الاستخدام</Label><Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setLine((current) => ({ ...current, unitCost: event.target.value }))} /></div>
      <div className="space-y-1"><Label>رقم الدفعة</Label><Input value={line.batchNo} placeholder="اختياري" onChange={(event) => setLine((current) => ({ ...current, batchNo: event.target.value }))} /></div>
      <div className="space-y-1"><Label>تاريخ الصلاحية</Label><Input type="date" value={line.expiryDate} onChange={(event) => setLine((current) => ({ ...current, expiryDate: event.target.value }))} /></div>
    </>}
    <div className="space-y-1"><Label>الموقع</Label><LocationSelect locations={locations} value={line.locationName} onChange={(value) => setLine((current) => ({ ...current, locationName: value }))} /></div>
    <div className="space-y-1 sm:col-span-2"><Label>السبب / الملاحظات</Label><Input value={line.reason} onChange={(event) => setLine((current) => ({ ...current, reason: event.target.value }))} /></div>
  </div>;
}
function MultiLineForm({ items, locations, lines, line, setLine, addLine, removeLine, showCost }: { items: OperationalInventoryItem[]; locations: { code: string; name: string }[]; lines: DraftLine[]; line: DraftLine; setLine: React.Dispatch<React.SetStateAction<DraftLine>>; addLine: () => void; removeLine: (index: number) => void; showCost: boolean }) { return <div className="space-y-3"><LineEditor items={items} locations={locations} line={line} setLine={setLine} showCost={showCost} /><Button type="button" variant="outline" className="w-full" onClick={addLine}><Plus className="ml-2 h-4 w-4" />إضافة السطر</Button>{lines.length > 0 && <div className="space-y-2 rounded-xl border p-3">{lines.map((entry, index) => { const item = items.find((candidate) => candidate.id === entry.itemId); const cost = showCost ? number(entry.unitCost || '0') : item?.averageCost ?? 0; return <div className="flex items-center justify-between text-sm" key={`${entry.itemId}-${index}`}><span>{item?.name} — {entry.quantity} × {formatEGPCurrency(cost)} — {entry.locationName}</span><Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeLine(index)}>حذف</Button></div>; })}</div>}</div>; }
function ItemForm({ draft, setDraft, categories, locations, allowOpeningStock, onSave }: { draft: ItemDraft; setDraft: React.Dispatch<React.SetStateAction<ItemDraft>>; categories: { code: string; name_ar: string }[]; locations: { code: string; name: string }[]; allowOpeningStock: boolean; onSave: () => void }) {
  const update = (key: keyof ItemDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const updateUnit = (key: 'purchaseUnit' | 'usageUnit', value: string) => setDraft((current) => {
    const purchaseUnit = key === 'purchaseUnit' ? value : current.purchaseUnit;
    const usageUnit = key === 'usageUnit' ? value : current.usageUnit;
    return {
      ...current,
      [key]: value,
      conversionFactor: purchaseUnit === usageUnit ? '1' : current.purchaseUnit === current.usageUnit ? '' : current.conversionFactor,
    };
  });

  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="اسم الصنف" value={draft.name} onChange={(value) => update('name', value)} />
    <Field label="كود الصنف (اختياري)" value={draft.code} onChange={(value) => update('code', value)} />
    <div className="space-y-1"><Label>الفئة</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={draft.category} onChange={(event) => update('category', event.target.value)}><option value="">اختر الفئة</option>{categories.map((category) => <option key={category.code} value={category.code}>{category.name_ar}</option>)}</select></div>
    <UnitField label="وحدة الشراء" value={draft.purchaseUnit} onChange={(value) => updateUnit('purchaseUnit', value)} />
    <UnitField label="وحدة الاستخدام بالمخزون" value={draft.usageUnit} onChange={(value) => updateUnit('usageUnit', value)} />
    <div className="space-y-1"><Label>كمية الاستخدام في وحدة الشراء</Label><Input type="number" min="0.001" step="0.001" value={draft.conversionFactor} onChange={(event) => update('conversionFactor', event.target.value)} /></div>
    <Field label={`حد التنبيه بوحدة ${draft.usageUnit}`} value={draft.minStock} onChange={(value) => update('minStock', value)} />
    {allowOpeningStock && <div className="space-y-1"><Label>موقع الرصيد الافتتاحي</Label><LocationSelect locations={locations} value={draft.locationName} onChange={(value) => update('locationName', value)} /></div>}
    {allowOpeningStock && <Field label={`الرصيد الافتتاحي بوحدة ${draft.usageUnit}`} value={draft.openingQuantity} onChange={(value) => update('openingQuantity', value)} />}
    {allowOpeningStock && <Field label="متوسط تكلفة وحدة الاستخدام" value={draft.openingCost} onChange={(value) => update('openingCost', value)} />}
    <div className="space-y-1 sm:col-span-2"><Label>ملاحظات</Label><Textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} /></div>
    <Button className="sm:col-span-2" onClick={onSave}>حفظ الصنف</Button>
  </div>;
}
function LocationSelect({ locations, value, onChange }: { locations: { code: string; name: string }[]; value: string; onChange: (value: string) => void }) {
  const options = locations.some((location) => location.code === value) || !value
    ? locations
    : [...locations, { code: value, name: `${value} (غير مفعّل)` }];
  return <select className="h-10 w-full rounded-md border bg-background px-3" value={value} onChange={(event) => onChange(event.target.value)}>{options.length === 0 && <option value="">{value || 'لا توجد مواقع نشطة'}</option>}{options.map((location) => <option key={location.code} value={location.code}>{location.name}{!locations.some((entry) => entry.code === location.code) ? ' — غير مفعّل' : ''}</option>)}</select>;
}
function UnitField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1"><Label>{label}</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={value} onChange={(event) => onChange(event.target.value)}>{Object.entries(INVENTORY_UNIT_LABELS).map(([unit, unitLabel]) => <option value={unit} key={unit}>{unitLabel} ({unit})</option>)}</select></div>;
}
