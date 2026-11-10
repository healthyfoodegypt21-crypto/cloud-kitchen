import { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, ArrowUpFromLine, Check, ClipboardCheck, FileSpreadsheet, Loader2, PackagePlus, Pencil, Plus, Printer, Search, ShoppingCart, Trash2, WalletCards, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Brand } from '@/hooks/useBrands';
import { useAuth } from '@/hooks/useAuth';
import { useOperationalInventory } from '@/hooks/useOperationalInventory';
import { supabase } from '@/integrations/supabase/client';
import { hasPageAccess } from '@/lib/permissions';
import { formatEGPCurrency } from '@/lib/utils';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import PurchaseOrderBuilder, { type PurchaseOrderLine } from '@/components/PurchaseOrderBuilder';
import PurchaseReceiptPanel from '@/components/PurchaseReceiptPanel';
import FefoPanel from '@/components/inventory/FefoPanel';
import InventoryAuditLog from '@/components/inventory/InventoryAuditLog';
import InventoryReports from '@/components/inventory/InventoryReports';
import BarcodeInput from '@/components/inventory/BarcodeInput';
import WithdrawalQuickEntry, { type WithdrawalPlan } from '@/components/inventory/WithdrawalQuickEntry';
import WithdrawalSheetPrintSheet from '@/components/inventory/WithdrawalSheetPrintSheet';
import WithdrawalSheetDialog from '@/components/inventory/WithdrawalSheetDialog';
import { INVENTORY_UNIT_LABELS } from '@/types/inventory';
import type { OperationalInventoryItem } from '@/types/operationalInventory';

type DialogMode = 'item' | 'editItem' | 'category' | 'movement' | 'purchase' | 'withdrawal' | 'count' | 'directPurchase' | null;
type MovementAction = 'deposit' | 'waste';

type DraftLine = { itemId: string; quantity: string; unitCost?: string; locationName: string; reason: string; batchNo: string; expiryDate: string };
type ItemDraft = { name: string; code: string; category: string; purchaseUnit: string; usageUnit: string; conversionFactor: string; minStock: string; openingQuantity: string; openingCost: string; locationName: string; notes: string };
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

export default function Inventory({ brands, brandsLoading, hub }: { brands: Brand[]; brandsLoading: boolean; hub: { id: string; name: string; stockBrandId: string; brandIds: string[] } }) {
  const { role, isDemoMode, pagePermissions, user } = useAuth();
  const brandId = hub.stockBrandId;
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<DialogMode>(null);
  const [movementAction, setMovementAction] = useState<MovementAction>('deposit');
  const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft);
  const [editingItem, setEditingItem] = useState<OperationalInventoryItem | null>(null);
  const [categoryDraft, setCategoryDraft] = useState({ nameAr: '', nameEn: '', code: '' });
  const [line, setLine] = useState<DraftLine>({ itemId: '', quantity: '', unitCost: '', locationName: 'main', reason: '', batchNo: '', expiryDate: '' });
  const [purchaseItemId, setPurchaseItemId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [printSheet, setPrintSheet] = useState(false);
  const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
  const [withdrawalInitialMethod, setWithdrawalInitialMethod] = useState<'manual' | 'text' | 'image'>('manual');

  useEffect(() => {
    if (!printSheet) return;
    const timeoutId = window.setTimeout(() => window.print(), 60);
    return () => window.clearTimeout(timeoutId);
  }, [printSheet]);

  useEffect(() => {
    const resetPrint = () => setPrintSheet(false);
    window.addEventListener('afterprint', resetPrint);
    return () => window.removeEventListener('afterprint', resetPrint);
  }, []);

  const { items, categories, movements, purchaseRequests, withdrawals, batches, countApprovals, locations, itemRequests, notifications, alerts, inventoryValue, loading, partialError, offline, offlineSnapshotAt, hasMoreMovements, loadMoreMovements, invoke, markNotificationRead } = useOperationalInventory(brandId, hub.brandIds);
  const canManage = !isDemoMode && hasPageAccess(role, pagePermissions, 'inventory');
  const selectedItem = items.find((item) => item.id === line.itemId);

  // Guards every mutating action so a slow RPC can never be submitted twice.
  const runSubmit = async (action: () => Promise<void> | void) => {
    if (submitting) return;
    setSubmitting(true);
    try { await action(); } finally { setSubmitting(false); }
  };

  const isKnownLocation = (code: string) => locations.some((location) => location.code === code);
  const requireValidLocations = (codes: string[]) => {
    if (locations.length === 0) {
      toast.error('لا يوجد مستودع نشط لهذا المخزن. راجع إعدادات المستودعات أولًا.');
      return false;
    }
    if (codes.some((code) => !isKnownLocation(code))) {
      toast.error('اختر موقعًا صالحًا من قائمة المستودعات النشطة.');
      return false;
    }
    return true;
  };

  const visibleItems = useMemo(() => items.filter((item) =>
    (category === 'all' || item.category === category)
      && (!query.trim() || `${item.name} ${item.code}`.toLowerCase().includes(query.trim().toLowerCase())),
  ), [category, items, query]);
  const lowStockCount = items.filter((item) => item.status === 'active' && item.minStock > 0 && item.availableQuantity <= item.minStock).length;
  const todayWithdrawalValue = withdrawals.filter((entry) => entry.withdrawalDate === new Date().toISOString().slice(0, 10)).reduce((sum, entry) => sum + entry.totalValue, 0);

  const reset = () => { setMode(null); setLine({ itemId: '', quantity: '', unitCost: '', locationName: 'main', reason: '', batchNo: '', expiryDate: '' }); setPurchaseItemId(''); setItemDraft(emptyItemDraft); setEditingItem(null); setSupplierName(''); setPurchaserName(''); setNotes(''); };
  const linesForSubmission = () => (line.itemId && number(line.quantity) > 0 ? [line] : []);

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
    if (!requireValidLocations([line.locationName])) return;
    const mapping = { deposit: 'purchase_receipt', waste: 'waste' } as const;
    const result = await invoke('inventory_record_manual_movement', {
      _brand_id: brandId, _item_id: line.itemId, _movement_type: mapping[movementAction], _quantity: number(line.quantity),
      _unit_cost: movementAction === 'deposit' ? number(line.unitCost || String(selectedItem?.averageCost ?? 0)) : null,
      _location_name: line.locationName, _notes: line.reason, _batch_no: line.batchNo, _expiry_date: line.expiryDate || null,
    });
    if (result) {
      const value = rpcNumber(result, 'movement_value');
      if (value === null) toast.error('تم تسجيل الحركة لكن تعذر قراءة قيمتها. راجع سجل الحركات.');
      else toast.success(`تم تسجيل ${movementAction === 'deposit' ? 'الإيداع' : 'الهالك'} بقيمة ${formatEGPCurrency(value)}`);
      reset();
    }
  };

  const submitStoreDirectPurchase = async () => {
    const submissionLines = linesForSubmission();
    if (submissionLines.length === 0 || !purchaserName.trim()
      || submissionLines.some((entry) => !Number.isFinite(number(entry.quantity)) || number(entry.quantity) <= 0 || !Number.isFinite(number(entry.unitCost ?? '0')) || number(entry.unitCost ?? '0') < 0)) { toast.error('أدخل اسم المشتري وكمية وسعرًا صحيحين لكل بند'); return; }
    if (!requireValidLocations(submissionLines.map((entry) => entry.locationName))) return;
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
      _min_stock: number(draft.minStock), _location_name: 'main', _opening_quantity: 0,
      _opening_unit_cost: number(draft.conversionFactor) > 0 ? Math.round((number(draft.unitCost) / number(draft.conversionFactor)) * 100) / 100 : 0,
      _notes: 'أُضيف من أمر شراء مجمع',
    });
    return result ? { id: String(result), code: draft.code || itemCode(draft.name) } : null;
  };

  const postWithdrawal = async () => {
    const submissionLines = linesForSubmission();
    if (submissionLines.length === 0 || submissionLines.some((entry) => !Number.isFinite(number(entry.quantity)) || number(entry.quantity) <= 0)) { toast.error('أدخل كمية موجبة وصحيحة لكل بند'); return; }
    if (!requireValidLocations(submissionLines.map((entry) => entry.locationName))) return;
    const result = await invoke('inventory_post_shared_daily_withdrawal', { _hub_id: hub.id, _consumer_brand_id: brandId, _lines: submissionLines.map((entry) => ({ item_id: entry.itemId, quantity: number(entry.quantity), location_name: entry.locationName, reason: entry.reason || 'تشغيل المطبخ' })), _notes: notes });
    if (result) {
      const value = rpcNumber(result, 'total_value');
      if (value === null) toast.error('تم تسجيل المسحوبات لكن تعذر قراءة إجماليها. راجع سجل المسحوبات.');
      else toast.success(`تم تسجيل مسحوبات اليوم. الإجمالي ${formatEGPCurrency(value)}`);
      reset();
    }
  };

  // Executes the quick-entry plan in order: opening balances for first-time
  // items, the shared withdrawal itself, then waste/count adjustments for any
  // reviewed discrepancies between the sheet and the system balance.
  const submitQuickWithdrawal = async (plan: WithdrawalPlan) => {
    for (const opening of plan.openings) {
      const result = await invoke('inventory_record_manual_movement', {
        _brand_id: brandId, _item_id: opening.itemId, _movement_type: 'purchase_receipt',
        _quantity: opening.quantity, _unit_cost: 0, _location_name: opening.locationName,
        _notes: opening.reason, _batch_no: '', _expiry_date: null,
      });
      if (!result) return false;
    }

    if (plan.withdrawals.length > 0) {
      const result = await invoke('inventory_post_shared_daily_withdrawal', {
        _hub_id: hub.id, _consumer_brand_id: brandId,
        _lines: plan.withdrawals.map((entry) => ({ item_id: entry.itemId, quantity: entry.quantity, location_name: entry.locationName, reason: entry.reason })),
        _notes: plan.notes,
      });
      if (!result) return false;
    }

    for (const waste of plan.waste) {
      const result = await invoke('inventory_record_manual_movement', {
        _brand_id: brandId, _item_id: waste.itemId, _movement_type: 'waste',
        _quantity: waste.quantity, _unit_cost: null, _location_name: waste.locationName,
        _notes: waste.reason, _batch_no: '', _expiry_date: null,
      });
      if (!result) return false;
    }

    for (const count of plan.counts) {
      const result = await invoke('inventory_post_count', {
        _brand_id: brandId, _item_id: count.itemId, _physical_quantity: count.physicalQuantity,
        _location_name: count.locationName, _reason: count.reason,
      });
      if (!result) return false;
    }

    const extras = plan.openings.length + plan.waste.length + plan.counts.length;
    toast.success(extras > 0
      ? `تم تسجيل ${plan.withdrawals.length} سطر سحب مع ${extras} حركة مرتبطة (رصيد أول مدة/هالك/تسوية)`
      : `تم تسجيل ${plan.withdrawals.length} سطر سحب من المخزن`);
    reset();
    return true;
  };

  const postCount = async () => {
    if (!line.itemId || !Number.isFinite(number(line.quantity)) || number(line.quantity) < 0) { toast.error('اختر الصنف وأدخل رصيدًا فعليًا صحيحًا'); return; }
    if (!requireValidLocations([line.locationName])) return;
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

  // Generates server-side notifications for low stock, expiring batches,
  // due invoices, and late receipts (one per entity per day).
  const generateAlerts = async () => {
    const result = await invoke('inventory_generate_alerts', { _brand_id: brandId });
    if (result !== null) {
      const created = typeof result === 'number' ? result : 0;
      toast.success(created > 0 ? `تم توليد ${created} تنبيه جديد` : 'لا توجد تنبيهات جديدة حاليًا');
    }
  };

  if (loading || brandsLoading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const pendingReceipts = purchaseRequests.filter((request) => request.status === 'purchased_pending_receipt').length;
  const unreadNotifications = notifications.filter((notification) => !notification.isRead);

  return <div dir="rtl" className={printSheet ? 'space-y-5 print:hidden' : 'space-y-5'}>
    <header className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-primary">{hub.name} · يخدم {hub.brandIds.length} علامات تجارية</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">إدارة المخزون</h1>
        <p className="mt-1 text-sm text-muted-foreground">رصيد واحد مشترك للعلامات، مع تسجيل سحب الوجبات المشتركة من المخزن.</p>
      </div>
      {canManage && <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setSheetDialogOpen(true)}><Printer className="ml-2 h-4 w-4" />ورقة مسحوبات</Button>
        <Button variant="outline" onClick={() => void runSubmit(generateAlerts)} disabled={submitting}><AlertTriangle className="ml-2 h-4 w-4" />توليد التنبيهات</Button>
        <Button variant="outline" onClick={() => { setWithdrawalInitialMethod('manual'); setMode('withdrawal'); }}><ArrowUpFromLine className="ml-2 h-4 w-4" />سحب من المخزن</Button>
        <Button variant="outline" onClick={() => setMode('movement')}><Plus className="ml-2 h-4 w-4" />حركة مخزون</Button>
        <Button variant="outline" onClick={() => setMode('directPurchase')}><WalletCards className="ml-2 h-4 w-4" />شراء مباشر</Button>
        <Button onClick={() => setMode('purchase')}><ShoppingCart className="ml-2 h-4 w-4" />طلب شراء</Button>
      </div>}
    </header>

    {hub.brandIds.length > 1 && <div className="flex flex-wrap gap-2">{hub.brandIds.map((id) => <Badge key={id} variant="secondary">{brands.find((brand) => brand.id === id)?.name ?? 'علامة مرتبطة بالمخزن'}</Badge>)}</div>}

    {partialError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>بعض البيانات غير مكتملة</AlertTitle><AlertDescription>تعذر تحميل بعض القوائم الثانوية ({partialError}). البيانات الأساسية للمخزون ظاهرة بشكل صحيح — أعد تحميل الصفحة لاستكمال الباقي.</AlertDescription></Alert>}

    {offline && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>وضع عدم الاتصال</AlertTitle><AlertDescription>يتم عرض آخر نسخة محفوظة من بيانات المخزون{offlineSnapshotAt ? ` (محفوظة في ${new Date(offlineSnapshotAt).toLocaleString('ar-EG')})` : ''}. لا يمكن تنفيذ عمليات حتى يعود الاتصال.</AlertDescription></Alert>}

    {mode === 'directPurchase' && <Card className="border-primary/40"><CardHeader><CardTitle>شراء مباشر سجله مدير المخزن</CardTitle><CardDescription>يُسجل في المشتريات وينتظر اعتماد الاستلام قبل تحديث المخزون.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label>الصنف</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={line.itemId} onChange={(event) => { const item = items.find((entry) => entry.id === event.target.value); setLine((current) => ({ ...current, itemId: event.target.value, unitCost: String(item?.lastPurchasePrice || (item ? item.averageCost * item.conversionFactor : 0)), locationName: item?.locationName || locations[0]?.code || 'main' })); }}><option value="">اختر الصنف</option>{items.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name} — {item.purchaseUnit}</option>)}</select></div><div className="space-y-1"><Label>اسم من قام بالشراء *</Label><Input value={purchaserName} onChange={(event) => setPurchaserName(event.target.value)} /></div><div className="space-y-1"><Label>الموقع</Label><LocationSelect locations={locations} value={line.locationName} onChange={(value) => setLine((current) => ({ ...current, locationName: value }))} /></div><div className="space-y-1"><Label>الكمية بوحدة الشراء</Label><Input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => setLine((current) => ({ ...current, quantity: event.target.value }))} /></div><div className="space-y-1"><Label>سعر وحدة الشراء</Label><Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setLine((current) => ({ ...current, unitCost: event.target.value }))} /></div><div className="space-y-1"><Label>المورد</Label><Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></div><div className="space-y-1"><Label>رقم الدفعة</Label><Input value={line.batchNo} onChange={(event) => setLine((current) => ({ ...current, batchNo: event.target.value }))} /></div></div><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات اختيارية" /><div className="flex gap-2"><Button onClick={() => void runSubmit(submitStoreDirectPurchase)} disabled={submitting}>{submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <WalletCards className="ml-2 h-4 w-4" />}تسجيل الشراء</Button><Button variant="outline" onClick={reset} disabled={submitting}>إلغاء</Button></div></CardContent></Card>}

    <Tabs defaultValue="overview" dir="rtl" className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl p-1 sm:w-fit sm:grid-cols-6">
        <TabsTrigger value="overview" className="rounded-lg py-2.5">نظرة عامة</TabsTrigger>
        <TabsTrigger value="items" className="rounded-lg py-2.5">الأصناف ({items.length})</TabsTrigger>
        <TabsTrigger value="activity" className="rounded-lg py-2.5">الحركات والجرد</TabsTrigger>
        <TabsTrigger value="fefo" className="rounded-lg py-2.5">الصلاحية (FEFO)</TabsTrigger>
        <TabsTrigger value="reports" className="rounded-lg py-2.5">التقارير</TabsTrigger>
        <TabsTrigger value="audit" className="rounded-lg py-2.5">سجل التدقيق</TabsTrigger>
      </TabsList>
    <TabsContent value="overview" className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard title="أصناف نشطة" value={String(items.filter((item) => item.status === 'active').length)} detail="كتالوج المخزن الموحد" />
      <SummaryCard title="تحتاج إعادة طلب" value={String(lowStockCount)} detail="وصلت إلى حد إعادة الطلب" emphasis={lowStockCount > 0} />
      <SummaryCard title="قيمة الرصيد" value={formatEGPCurrency(inventoryValue)} detail="إجمالي الرصيد × متوسط التكلفة" />
      <SummaryCard title="صرف اليوم" value={formatEGPCurrency(todayWithdrawalValue)} detail={`${pendingReceipts} مشتريات تنتظر الاستلام`} />
    </div>

    {unreadNotifications.length > 0 && <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-bold">إشعارات مدير المخزن</h2><p className="text-sm text-muted-foreground">طلبات الشراء الجديدة تظهر هنا فور تسجيلها.</p></div><Badge variant="destructive">{unreadNotifications.length} جديد</Badge></div><div className="grid gap-3">{unreadNotifications.map((notification) => <Card key={notification.id} className="border-amber-300"><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><strong>{notification.title}</strong><p className="mt-1 text-sm text-muted-foreground">{notification.message}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleString('ar-EG')}</p></div><Button variant="outline" onClick={() => void markNotificationRead(notification.id)}>تمت القراءة</Button></CardContent></Card>)}</div></section>}

    {canManage && countApprovals.length > 0 && <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-bold">جرد بانتظار اعتماد مستقل</h2><p className="text-sm text-muted-foreground">لا تتغير الأرصدة إلا بعد اعتماد مستخدم مختلف عن مُعدّ الجرد، ويُطلب إعادة العد إذا تحرك المخزون بعده.</p></div><Badge variant="secondary">{countApprovals.length}</Badge></div><div className="grid gap-3">{countApprovals.map((count) => <Card key={count.id} className="border-primary/20"><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{count.countNo}</strong><p className="text-sm text-muted-foreground">أُعد بواسطة {count.countedBy === user?.id ? 'أنت' : count.countedBy || 'مستخدم غير معروف'} — {new Date(count.countedAt).toLocaleString('ar-EG')}</p>{count.notes && <p className="text-sm">{count.notes}</p>}</div><div className="flex gap-2"><Button size="sm" onClick={() => void runSubmit(() => reviewCount(count.id, true))} disabled={submitting || count.countedBy === user?.id}><Check className="ml-1 h-4 w-4" />اعتماد</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => void runSubmit(() => reviewCount(count.id, false))} disabled={submitting || count.countedBy === user?.id}><X className="ml-1 h-4 w-4" />رفض</Button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-sm"><thead><tr className="border-b text-right text-muted-foreground"><th className="p-2">الصنف</th><th className="p-2">الموقع</th><th className="p-2">الرصيد الدفتري</th><th className="p-2">الفعلي</th><th className="p-2">الفرق</th></tr></thead><tbody>{count.lines.map((entry) => <tr key={entry.id} className="border-b last:border-0"><td className="p-2">{entry.itemName}</td><td className="p-2">{entry.locationName}</td><td className="p-2">{entry.bookQuantity}</td><td className="p-2">{entry.physicalQuantity}</td><td className="p-2 font-semibold">{entry.variance > 0 ? '+' : ''}{entry.variance}</td></tr>)}</tbody></table></div></CardContent></Card>)}</div></section>}

    {alerts.length > 0 && <Alert className="border-amber-300 bg-amber-50"><AlertTriangle className="h-4 w-4" /><AlertTitle>تنبيهات المخزون</AlertTitle><AlertDescription>{alerts.slice(0, 4).map((alert) => <p key={alert.id}>{alert.title}: {alert.description}</p>)}</AlertDescription></Alert>}
    </TabsContent>

    <TabsContent value="items" className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الصنف أو الكود" aria-label="بحث الأصناف" /></div>
      <BarcodeInput onScan={(code) => setQuery(code)} placeholder="امسح الباركود لاختيار الصنف" />
      <div className="flex flex-wrap gap-2"><select aria-label="تصفية حسب الفئة" className="h-10 rounded-md border bg-background px-3" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">كل الفئات</option>{categories.map((entry) => <option key={entry.id} value={entry.code}>{entry.name_ar}</option>)}</select>{canManage && <><Button variant="outline" onClick={() => setSheetDialogOpen(true)}><Printer className="ml-2 h-4 w-4" />ورقة مسحوبات</Button><Button variant="outline" onClick={() => setMode('category')}><Plus className="ml-2 h-4 w-4" />فئة جديدة</Button><Button onClick={() => setMode('item')}><PackagePlus className="ml-2 h-4 w-4" />إضافة صنف</Button></>}</div>
    </div>
    <Card className="overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm">
        <thead className="bg-muted/50 text-right text-muted-foreground"><tr><th className="p-3 font-medium">الصنف</th><th className="p-3 font-medium">المتاح / الرصيد</th><th className="p-3 font-medium">حد الطلب</th><th className="p-3 font-medium">متوسط التكلفة</th><th className="p-3 font-medium">الحالة</th><th className="p-3 font-medium">الإجراءات</th></tr></thead>
        <tbody className="divide-y">{visibleItems.map((item) => {
          const low = item.status === 'active' && item.minStock > 0 && item.availableQuantity <= item.minStock;
          return <tr key={item.id} className="transition-colors hover:bg-muted/30">
            <td className="p-3"><div className="font-semibold">{item.name}</div><div className="text-xs text-muted-foreground">{item.code} · {categories.find((entry) => entry.code === item.category)?.name_ar ?? item.category}</div></td>
            <td className="p-3"><div className="font-semibold tabular-nums">{item.availableQuantity} {item.unit}</div><div className="text-xs text-muted-foreground">الإجمالي {item.onHand} · محجوز {item.reservedQuantity}</div></td>
            <td className="p-3 tabular-nums">{item.minStock} {item.unit}</td><td className="p-3 tabular-nums">{formatEGPCurrency(item.averageCost)}</td>
            <td className="p-3"><Badge variant={item.status === 'inactive' ? 'outline' : low ? 'destructive' : 'secondary'}>{item.status === 'inactive' ? 'مؤرشف' : low ? 'إعادة طلب' : 'متاح'}</Badge></td>
            <td className="p-3"><div className="flex items-center gap-1">{canManage && <>
              <Button size="icon" variant="ghost" aria-label={`تعديل ${item.name}`} title="تعديل" onClick={() => startEditItem(item)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={`سحب ${item.name} من المخزن`} title="سحب من المخزن" onClick={() => { setLine({ itemId: item.id, quantity: '', unitCost: '', locationName: item.locationName, reason: '', batchNo: '', expiryDate: '' }); setMode('withdrawal'); }}><ArrowUpFromLine className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={`طلب ${item.name}`} title="طلب شراء" onClick={() => startPurchaseRequest(item)}><ShoppingCart className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={`جرد ${item.name}`} title="بدء جرد" onClick={() => { const balance = item.balances.find((entry) => entry.locationName === item.locationName); setLine({ itemId: item.id, quantity: String(balance?.onHand ?? item.onHand), unitCost: '', locationName: item.locationName, reason: '', batchNo: '', expiryDate: '' }); setMode('count'); }}><ClipboardCheck className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={`${item.status === 'active' ? 'أرشفة' : 'تفعيل'} ${item.name}`} title={item.status === 'active' ? 'أرشفة' : 'تفعيل'} disabled={submitting} onClick={() => void runSubmit(() => toggleItemStatus(item))}><span className="text-xs">{item.status === 'active' ? 'أر' : 'فع'}</span></Button>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={`حذف ${item.name}`} title="حذف" disabled={submitting} onClick={() => void runSubmit(() => deleteItem(item))}><Trash2 className="h-4 w-4" /></Button>
            </>}</div></td>
          </tr>;
        })}</tbody>
      </table></div>
      {visibleItems.length === 0 && <div className="p-10 text-center"><p className="font-medium">لا توجد أصناف مطابقة</p><p className="mt-1 text-sm text-muted-foreground">غيّر البحث أو الفئة، أو أضف صنفًا جديدًا.</p></div>}
      <div className="border-t px-3 py-2 text-xs text-muted-foreground">عرض {visibleItems.length} من {items.length} صنف في المخزن المركزي</div>
    </Card>

    </TabsContent>

    <TabsContent value="activity" className="space-y-4">
    {itemRequests.length > 0 && <section><h2 className="mb-3 text-xl font-bold">أصناف جديدة بانتظار قبول مدير المخزن</h2><div className="grid gap-3">{itemRequests.map((request) => <Card key={request.id}><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><strong>{request.itemName}{request.productBrand ? ` — ${request.productBrand}` : ''}</strong><p className="text-sm text-muted-foreground">{request.itemCode} • {request.unit} • حد أدنى {request.minStock}</p></div>{canManage && <div className="flex gap-2"><Button onClick={() => void runSubmit(() => invoke('inventory_review_item_request', { _request_id: request.id, _approve: true, _review_notes: '' }).then(() => undefined))} disabled={submitting}>قبول وإضافة الصنف</Button><Button variant="outline" onClick={() => void runSubmit(() => invoke('inventory_review_item_request', { _request_id: request.id, _approve: false, _review_notes: 'مرفوض من مدير المخزن' }).then(() => undefined))} disabled={submitting}>رفض</Button></div>}</CardContent></Card>)}</div></section>}

    <PurchaseReceiptPanel brandId={brandId} canManage={canManage} />

    <Card><CardHeader><CardTitle className="text-base">سحوبات المخزن</CardTitle><CardDescription>السحب للوجبات المشتركة يُخصم من الرصيد المركزي دون نسبته لعلامة بعينها.</CardDescription></CardHeader><CardContent className="divide-y p-0">{withdrawals.length === 0 ? <p className="p-5 text-sm text-muted-foreground">لا توجد مسحوبات مسجلة.</p> : withdrawals.slice(0, 15).map((withdrawal) => <div key={withdrawal.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><div><strong>{withdrawal.withdrawalNo}</strong><span className="mx-2 text-muted-foreground">{withdrawal.isShared ? 'سحب مشترك' : brands.find((brand) => brand.id === withdrawal.brandId)?.name ?? 'علامة مرتبطة بالمخزن'}</span><p className="text-xs text-muted-foreground">{withdrawal.withdrawalDate} · {withdrawal.lines.length} أصناف</p></div><span className="font-medium tabular-nums">{formatEGPCurrency(withdrawal.totalValue)}</span></div>)}</CardContent></Card>

    {movements.length > 0 && <section><h2 className="mb-3 text-xl font-bold">آخر الحركات</h2><Card><CardContent className="divide-y p-0">{movements.map((movement) => <div key={movement.id} className="flex items-center justify-between p-3 text-sm"><span><strong>{movement.itemName}</strong> — {movement.type} — {movement.quantity}</span><span>{formatEGPCurrency(movement.value)}</span></div>)}</CardContent></Card>{hasMoreMovements && <Button variant="outline" className="mt-3" onClick={loadMoreMovements}>تحميل حركات أقدم</Button>}</section>}

    </TabsContent>

    <TabsContent value="fefo" className="space-y-4">
      <FefoPanel batches={batches} items={items} onRecordWaste={(batch) => {
        setMovementAction('waste');
        setLine({ itemId: batch.itemId, quantity: String(Math.max(batch.quantityOnHand - batch.reservedQuantity, 0)), unitCost: '', locationName: batch.locationName, reason: `هالك دفعة ${batch.batchNo} منتهية الصلاحية`, batchNo: batch.batchNo, expiryDate: batch.expiryDate ?? '' });
        setMode('movement');
      }} />
    </TabsContent>

    <TabsContent value="reports" className="space-y-4">
      <InventoryReports items={items} movements={movements} withdrawals={withdrawals} batches={batches} />
    </TabsContent>

    <TabsContent value="audit" className="space-y-4">
      <InventoryAuditLog brandId={brandId} />
    </TabsContent>
    </Tabs>

    <Dialog open={mode !== null && mode !== 'directPurchase'} onOpenChange={(open) => !open && reset()}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{mode === 'item' ? 'إضافة صنف جديد' : mode === 'editItem' ? 'تعديل بيانات الصنف' : mode === 'category' ? 'إضافة فئة' : mode === 'purchase' ? 'طلب شراء للمخزن المركزي' : mode === 'withdrawal' ? 'سحب من المخزن' : mode === 'count' ? 'إرسال جرد للمراجعة' : movementAction === 'deposit' ? 'إيداع في المخزون' : 'تسجيل هالك'}</DialogTitle><DialogDescription>{mode === 'purchase' ? 'لا يتغير الرصيد حتى يتم الاستلام الفعلي.' : mode === 'count' ? 'سيُحفظ الجرد للمراجعة ولا يتغير الرصيد قبل اعتماده من مستخدم آخر.' : mode === 'withdrawal' ? 'يُخصم السحب من المخزن المركزي دون تحديد علامة، لأنه قد يُستخدم في وجبات مشتركة.' : 'هذا المخزن يخدم العلامات المرتبطة به دون فصل الأرصدة.'}</DialogDescription></DialogHeader>
      {(mode === 'item' || mode === 'editItem') && <ItemForm draft={itemDraft} setDraft={setItemDraft} categories={categories} locations={locations} allowOpeningStock={mode === 'item'} onSave={() => void runSubmit(mode === 'item' ? createItem : updateItem)} submitting={submitting} />}
      {mode === 'category' && <div className="space-y-3"><Field label="اسم الفئة بالعربية" value={categoryDraft.nameAr} onChange={(value) => setCategoryDraft((current) => ({ ...current, nameAr: value }))} /><Field label="الكود (إنجليزي بلا مسافات)" value={categoryDraft.code} onChange={(value) => setCategoryDraft((current) => ({ ...current, code: value }))} /><Field label="الاسم بالإنجليزية" value={categoryDraft.nameEn} onChange={(value) => setCategoryDraft((current) => ({ ...current, nameEn: value }))} /><Button className="w-full" onClick={() => void runSubmit(createCategory)} disabled={submitting}>{submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}حفظ الفئة</Button></div>}
      {mode === 'movement' && <div className="space-y-3"><div className="space-y-1"><Label htmlFor="movement-action">نوع الحركة</Label><select id="movement-action" className="h-10 w-full rounded-md border bg-background px-3" value={movementAction} onChange={(event) => { if (event.target.value === 'deposit' || event.target.value === 'waste') setMovementAction(event.target.value); }}><option value="deposit">إضافة رصيد</option><option value="waste">تسجيل هالك</option></select></div><LineEditor items={items} locations={locations} line={line} setLine={setLine} showCost={movementAction === 'deposit'} /><Button className="w-full" onClick={() => void runSubmit(postMovement)} disabled={submitting}>{submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}{movementAction === 'deposit' ? 'تأكيد الإيداع' : 'تأكيد الهالك'}</Button></div>}
      {mode === 'count' && <div className="space-y-3"><LineEditor items={items} locations={locations} line={line} setLine={setLine} quantityLabel="الرصيد الفعلي بعد الجرد" /><Button className="w-full" onClick={() => void runSubmit(postCount)} disabled={submitting}>{submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="ml-2 h-4 w-4" />}إرسال للمراجعة</Button></div>}
      {mode === 'withdrawal' && <WithdrawalQuickEntry items={items} locations={locations} defaultLocation={locations[0]?.code ?? 'main'} submitting={submitting} initialMethod={withdrawalInitialMethod} onOpenPrintSheet={() => setSheetDialogOpen(true)} onSubmit={submitQuickWithdrawal} onCancel={reset} />}
      {mode === 'purchase' && <PurchaseOrderBuilder items={items} categories={categories} locations={locations} initialItemId={purchaseItemId} onSubmit={(orderLines, orderSupplier, orderNotes) => runSubmit(() => submitConsolidatedPurchase(orderLines, orderSupplier, orderNotes))} onCreateNewItem={createPurchaseItem} />}
    </DialogContent></Dialog>
    {printSheet && <WithdrawalSheetPrintSheet hubName={hub.name} items={items} categories={categories} />}
    <WithdrawalSheetDialog
      open={sheetDialogOpen}
      onOpenChange={setSheetDialogOpen}
      hubName={hub.name}
      items={items}
      categories={categories}
    />
  </div>;
}

function SummaryCard({ title, value, detail, emphasis = false }: { title: string; value: string; detail: string; emphasis?: boolean }) {
  return <Card className={emphasis ? 'border-amber-300 bg-amber-50/40' : undefined}><CardHeader className="space-y-1 p-4"><CardDescription>{title}</CardDescription><CardTitle className="text-xl tabular-nums">{value}</CardTitle></CardHeader><CardContent className="px-4 pb-4 pt-0 text-xs text-muted-foreground">{detail}</CardContent></Card>;
}
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
function ItemForm({ draft, setDraft, categories, locations, allowOpeningStock, onSave, submitting = false }: { draft: ItemDraft; setDraft: React.Dispatch<React.SetStateAction<ItemDraft>>; categories: { code: string; name_ar: string }[]; locations: { code: string; name: string }[]; allowOpeningStock: boolean; onSave: () => void; submitting?: boolean }) {
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
    <Button className="sm:col-span-2" onClick={onSave} disabled={submitting}>{submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}حفظ الصنف</Button>
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
