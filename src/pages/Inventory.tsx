import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Boxes, ClipboardCheck, Loader2, PackagePlus, Plus, ShoppingCart, Trash2, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useBrands } from '@/hooks/useBrands';
import { useAuth } from '@/hooks/useAuth';
import { useOperationalInventory } from '@/hooks/useOperationalInventory';
import { supabase } from '@/integrations/supabase/client';
import { hasPageAccess } from '@/lib/permissions';
import { formatEGPCurrency } from '@/lib/utils';
import type { InventoryBatch, InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';

type DialogMode = 'item' | 'category' | 'movement' | 'purchase' | 'withdrawal' | 'count' | null;
type MovementAction = 'deposit' | 'withdraw' | 'waste';

type DraftLine = { itemId: string; quantity: string; unitCost?: string; locationName: string; reason: string; batchNo: string; expiryDate: string };
const categoryColors = ['#e0f2fe', '#ffedd5', '#ede9fe', '#d1fae5', '#ffe4e6', '#cffafe', '#fef3c7', '#fae8ff', '#dbeafe', '#dcfce7', '#fee2e2', '#e0e7ff'];

function number(value: string) { return Number(value || 0); }
function itemCode(name: string) { return `${name.trim().replace(/\s+/g, '-').slice(0, 10).toUpperCase()}-${Date.now().toString().slice(-5)}`; }

export default function Inventory() {
  const { brands, loading: brandsLoading } = useBrands();
  const { role, isDemoMode, pagePermissions } = useAuth();
  const [brandId, setBrandId] = useState('');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<DialogMode>(null);
  const [openedCategory, setOpenedCategory] = useState<InventoryCategoryRecord | null>(null);
  const [consumptionDays, setConsumptionDays] = useState<7 | 30>(7);
  const [movementAction, setMovementAction] = useState<MovementAction>('deposit');
  const [itemDraft, setItemDraft] = useState({ name: '', code: '', category: '', unit: 'kg', minStock: '0', openingQuantity: '0', openingCost: '0', locationName: 'main', notes: '' });
  const [categoryDraft, setCategoryDraft] = useState({ nameAr: '', nameEn: '', code: '' });
  const [line, setLine] = useState<DraftLine>({ itemId: '', quantity: '', unitCost: '', locationName: 'main', reason: '', batchNo: '', expiryDate: '' });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { if (brands[0] && !brandId) setBrandId(brands[0].id); }, [brands, brandId]);
  const { items, categories, movements, purchaseRequests, withdrawals, batches, itemRequests, alerts, inventoryValue, loading, invoke } = useOperationalInventory(brandId);
  const canManage = !isDemoMode && hasPageAccess(role, pagePermissions, 'inventory');
  const selectedItem = items.find((item) => item.id === line.itemId);

  const visibleItems = useMemo(() => items.filter((item) => !query.trim() || `${item.name} ${item.code}`.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);
  const categoryCards = useMemo(() => categories.map((entry) => ({ ...entry, items: items.filter((item) => item.category === entry.code) })).filter((entry) => entry.items.length > 0 || entry.is_active), [categories, items]);
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

  const reset = () => { setMode(null); setLine({ itemId: '', quantity: '', unitCost: '', locationName: 'main', reason: '', batchNo: '', expiryDate: '' }); setLines([]); setSupplierName(''); setNotes(''); };
  const addLine = () => {
    if (!line.itemId || number(line.quantity) <= 0) { toast.error('اختر صنفًا وأدخل كمية صحيحة'); return; }
    setLines((current) => [...current, { ...line }]);
    setLine({ itemId: '', quantity: '', unitCost: '', locationName: 'main', reason: '', batchNo: '', expiryDate: '' });
  };
  const linesForSubmission = () => line.itemId && number(line.quantity) > 0 ? [...lines, line] : lines;

  const startPurchaseRequest = (item: OperationalInventoryItem) => {
    const suggestedQuantity = Math.max(item.minStock - item.onHand, 1);
    setLines([{ itemId: item.id, quantity: String(suggestedQuantity), unitCost: String(item.lastPurchasePrice || item.averageCost || 0), locationName: item.locationName, reason: 'إعادة طلب عند الحد الأدنى', batchNo: '', expiryDate: '' }]);
    setMode('purchase');
  };

  const createItem = async () => {
    if (!itemDraft.name || !itemDraft.category || !itemDraft.unit) { toast.error('الاسم والفئة والوحدة حقول مطلوبة'); return; }
    const result = await invoke('inventory_create_item', {
      _brand_id: brandId, _item_code: itemDraft.code || itemCode(itemDraft.name), _name: itemDraft.name, _category: itemDraft.category,
      _unit: itemDraft.unit, _min_stock: number(itemDraft.minStock), _location_name: itemDraft.locationName,
      _opening_quantity: number(itemDraft.openingQuantity), _opening_unit_cost: number(itemDraft.openingCost), _notes: itemDraft.notes,
    });
    if (result) { toast.success('تم إنشاء الصنف ورصيده الافتتاحي'); reset(); }
  };

  const createCategory = async () => {
    if (!categoryDraft.nameAr || !categoryDraft.code) { toast.error('اسم الفئة والكود مطلوبان'); return; }
    const { error } = await (supabase as any).from('inventory_categories').insert({ code: categoryDraft.code.trim().toLowerCase(), name_ar: categoryDraft.nameAr, name_en: categoryDraft.nameEn || categoryDraft.nameAr });
    if (error) { toast.error(error.message); return; }
    toast.success('تمت إضافة الفئة'); reset();
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
    if (!line.itemId || number(line.quantity) <= 0) { toast.error('اختر الصنف وأدخل كمية صحيحة'); return; }
    const mapping = { deposit: 'purchase_receipt', withdraw: 'production_consumption', waste: 'waste' } as const;
    const result = await invoke('inventory_apply_movement', {
      _brand_id: brandId, _item_id: line.itemId, _movement_type: mapping[movementAction], _quantity: number(line.quantity),
      _unit_cost: movementAction === 'deposit' ? number(line.unitCost || String(selectedItem?.averageCost ?? 0)) : null,
      _location_name: line.locationName, _notes: line.reason, _reference_table: 'manual_inventory_operation', _reference_id: '',
    });
    if (result) { toast.success(`تم تسجيل ${movementAction === 'deposit' ? 'الإيداع' : movementAction === 'waste' ? 'الهالك' : 'السحب'} بقيمة ${formatEGPCurrency(Number(result.movement_value))}`); reset(); }
  };

  const submitPurchase = async () => {
    const submissionLines = linesForSubmission();
    if (submissionLines.length === 0) { toast.error('اختر صنفًا وأدخل كمية صحيحة للشراء'); return; }
    const result = await invoke('inventory_submit_purchase_request', { _brand_id: brandId, _supplier_name: supplierName, _lines: submissionLines.map((entry) => ({ item_id: entry.itemId, quantity: number(entry.quantity), unit_cost: number(entry.unitCost || '0'), location_name: entry.locationName, notes: entry.reason, batch_no: entry.batchNo, expiry_date: entry.expiryDate || null })), _notes: notes });
    if (result) { toast.success('تم إرسال إشعار لمدير المخزن. لن يزداد المخزون قبل الاعتماد.'); reset(); }
  };

  const postWithdrawal = async () => {
    const submissionLines = linesForSubmission();
    if (submissionLines.length === 0) { toast.error('اختر صنفًا وأدخل كمية صحيحة للمسحوبات'); return; }
    const result = await invoke('inventory_post_daily_withdrawal', { _brand_id: brandId, _lines: submissionLines.map((entry) => ({ item_id: entry.itemId, quantity: number(entry.quantity), location_name: entry.locationName, reason: entry.reason || 'تشغيل المطبخ' })), _notes: notes });
    if (result) { toast.success(`تم تسجيل مسحوبات اليوم. الإجمالي ${formatEGPCurrency(Number(result.total_value))}`); reset(); }
  };

  const postCount = async () => {
    if (!line.itemId || number(line.quantity) < 0) { toast.error('اختر الصنف وأدخل الرصيد الفعلي'); return; }
    const result = await invoke('inventory_post_count', { _brand_id: brandId, _item_id: line.itemId, _physical_quantity: number(line.quantity), _location_name: line.locationName, _reason: line.reason });
    if (result) { toast.success(`تم اعتماد الجرد. فرق الجرد: ${Number(result.variance_qty)}`); reset(); }
  };

  if (loading || brandsLoading) return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h1 className="text-3xl font-bold">المخزون</h1><p className="text-muted-foreground">رصيد وقيمة كل صنف، الحركات، المسحوبات اليومية، واعتماد استلام المشتريات.</p></div><div className="flex flex-wrap gap-2">{canManage && <><Button variant="outline" onClick={() => setMode('withdrawal')}><ArrowUpFromLine className="ml-2 h-4 w-4" />تسجيل مسحوبات اليوم</Button><Button variant="outline" onClick={() => setMode('purchase')}><ShoppingCart className="ml-2 h-4 w-4" />شراء بانتظار الاعتماد</Button></>}</div></header>

    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">المخزن الرئيسي الموحد</p><Input className="max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث باسم الصنف أو الكود" /></div>
    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>قيمة البضاعة المتاحة</CardDescription><CardTitle>{formatEGPCurrency(inventoryValue)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">الكمية المتاحة × متوسط تكلفة كل صنف.</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>مسحوبات اليوم</CardDescription><CardTitle>{formatEGPCurrency(todayWithdrawalValue)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">تُحسب بمتوسط التكلفة وقت الصرف.</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>طلبات شراء تنتظر مدير المخزن</CardDescription><CardTitle>{purchaseRequests.filter((request) => request.status === 'pending_store_approval').length}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">لا تضاف للمخزون قبل اعتمادها.</CardContent></Card></div>

    {alerts.length > 0 && <Alert className="border-amber-300 bg-amber-50"><AlertTriangle className="h-4 w-4" /><AlertTitle>تنبيهات المخزون</AlertTitle><AlertDescription>{alerts.slice(0, 4).map((alert) => <p key={alert.id}>{alert.title}: {alert.description}</p>)}</AlertDescription></Alert>}

    <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-bold">الفئات</h2><p className="text-sm text-muted-foreground">اضغط على أي كارت لفتح الفئة.</p></div>{canManage && <div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" onClick={() => setMode('item')}><PackagePlus className="ml-1 h-4 w-4" />إضافة صنف</Button><Button variant="ghost" size="sm" onClick={() => setMode('category')}><Plus className="ml-1 h-4 w-4" />فئة جديدة</Button>{category !== 'all' && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void deleteCategory()}><Trash2 className="ml-1 h-4 w-4" />حذف الفئة</Button>}</div>}</div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{categoryCards.map((entry, index) => { const value = entry.items.reduce((sum, item) => sum + item.onHand * item.averageCost, 0); const low = entry.items.filter((item) => item.onHand <= item.minStock).length; const active = category === entry.code; const cardColor = categoryColors[index] ?? `hsl(${(index * 137.508) % 360} 80% 93%)`; return <button key={entry.id} onClick={() => { setCategory(entry.code); setOpenedCategory(entry); }} className={`group overflow-hidden rounded-2xl border border-slate-100 bg-card p-2 text-right shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? 'ring-2 ring-primary ring-offset-2' : ''}`}><div className="min-h-56 rounded-xl p-5" style={{ backgroundColor: cardColor }}><div className="flex items-start justify-between gap-2"><div><h3 className="text-2xl font-bold tracking-tight text-foreground">{entry.name_ar}</h3></div><Boxes className="h-5 w-5 text-foreground/65" /></div><div className="mt-12 flex flex-wrap gap-2"><span className="rounded-full bg-white/45 px-3 py-1 text-sm font-medium text-foreground/80">{entry.items.length} صنف</span><span className="rounded-full bg-white/45 px-3 py-1 text-sm font-medium text-foreground/80">{formatEGPCurrency(value)}</span>{low > 0 && <span className="rounded-full bg-amber-200/70 px-3 py-1 text-sm font-medium text-amber-950">{low} يحتاج شراء</span>}</div></div><div className="flex items-center justify-between px-3 py-4"><span className="text-lg font-bold">فتح الفئة</span><span className="grid h-10 w-10 place-items-center rounded-lg bg-muted transition group-hover:bg-primary group-hover:text-primary-foreground"><ArrowLeft className="h-5 w-5" /></span></div></button>; })}</div></section>


    <Dialog open={openedCategory !== null} onOpenChange={(open) => !open && setOpenedCategory(null)}><DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>أصناف فئة {openedCategory?.name_ar}</DialogTitle><DialogDescription>الأرصدة ومتوسط الاستهلاك الفعلي لاختيار كميات الشراء المناسبة.</DialogDescription></DialogHeader><div className="flex items-center justify-between rounded-lg bg-muted p-3"><span className="text-sm font-medium">فترة متوسط الاستهلاك</span><div className="flex gap-2"><Button size="sm" variant={consumptionDays === 7 ? 'default' : 'outline'} onClick={() => setConsumptionDays(7)}>آخر 7 أيام</Button><Button size="sm" variant={consumptionDays === 30 ? 'default' : 'outline'} onClick={() => setConsumptionDays(30)}>آخر 30 يومًا</Button></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.filter((item) => item.category === openedCategory?.code).map((item) => { const consumption = consumptionByItem.get(item.id) ?? { quantity: 0, value: 0 }; return <ItemCard key={item.id} item={item} batches={batches.filter((batch) => batch.itemId === item.id)} consumptionQuantity={consumption.quantity / consumptionDays} consumptionValue={consumption.value / consumptionDays} consumptionDays={consumptionDays} lastMovement={movements.find((movement) => movement.itemId === item.id)} canManage={canManage} onDelete={() => void deleteItem(item)} onPurchase={() => startPurchaseRequest(item)} onAction={(action) => { setLine({ itemId: item.id, quantity: '', unitCost: String(item.averageCost), locationName: item.locationName, reason: '', batchNo: '', expiryDate: '' }); setMovementAction(action); setMode('movement'); }} onCount={() => { setLine({ itemId: item.id, quantity: String(item.onHand), unitCost: '', locationName: item.locationName, reason: '', batchNo: '', expiryDate: '' }); setMode('count'); }} />; })}</div></DialogContent></Dialog>

    {itemRequests.length > 0 && <section><h2 className="mb-3 text-xl font-bold">أصناف جديدة بانتظار قبول مدير المخزن</h2><div className="grid gap-3">{itemRequests.map((request) => <Card key={request.id}><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><strong>{request.itemName}{request.productBrand ? ` — ${request.productBrand}` : ''}</strong><p className="text-sm text-muted-foreground">{request.itemCode} • {request.unit} • حد أدنى {request.minStock}</p></div>{canManage && <div className="flex gap-2"><Button onClick={() => void invoke('inventory_review_item_request', { _request_id: request.id, _approve: true, _review_notes: '' })}>قبول وإضافة الصنف</Button><Button variant="outline" onClick={() => void invoke('inventory_review_item_request', { _request_id: request.id, _approve: false, _review_notes: 'مرفوض من مدير المخزن' })}>رفض</Button></div>}</CardContent></Card>)}</div></section>}

    {purchaseRequests.filter((request) => request.status === 'pending_store_approval').length > 0 && <section><h2 className="mb-3 text-xl font-bold">شراء بانتظار قبول مدير المخزن</h2><div className="grid gap-3">{purchaseRequests.filter((request) => request.status === 'pending_store_approval').map((request) => <Card key={request.id}><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><strong>{request.requestNo}</strong><p className="text-sm text-muted-foreground">{request.supplierName || 'مورد غير محدد'} — {request.lines.map((entry) => `${entry.itemName} (${entry.quantity})`).join('، ')}</p></div>{canManage && <div className="flex gap-2"><Button onClick={() => void invoke('inventory_review_purchase_request', { _request_id: request.id, _approve: true, _review_notes: '' })}><ArrowDownToLine className="ml-2 h-4 w-4" />اعتماد وإضافة للمخزون</Button><Button variant="outline" onClick={() => void invoke('inventory_review_purchase_request', { _request_id: request.id, _approve: false, _review_notes: 'مرفوض من مدير المخزن' })}>رفض</Button></div>}</CardContent></Card>)}</div></section>}

    {movements.length > 0 && <section><h2 className="mb-3 text-xl font-bold">آخر الحركات</h2><Card><CardContent className="divide-y p-0">{movements.slice(0, 10).map((movement) => <div key={movement.id} className="flex items-center justify-between p-3 text-sm"><span><strong>{movement.itemName}</strong> — {movement.type} — {movement.quantity}</span><span>{formatEGPCurrency(movement.value)}</span></div>)}</CardContent></Card></section>}

    <Dialog open={mode !== null} onOpenChange={(open) => !open && reset()}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{mode === 'item' ? 'إضافة صنف جديد' : mode === 'category' ? 'إضافة فئة' : mode === 'purchase' ? 'تسجيل شراء بانتظار الاعتماد' : mode === 'withdrawal' ? 'تسجيل مسحوبات اليوم' : mode === 'count' ? 'جرد وتسوية صنف' : movementAction === 'deposit' ? 'إيداع في المخزون' : movementAction === 'waste' ? 'تسجيل هالك' : 'سحب من المخزون'}</DialogTitle><DialogDescription>{mode === 'purchase' ? 'سيصل إشعار لمدير المخزن؛ الرصيد لا يزيد قبل اعتماده.' : 'تُسجل الحركة بقيمتها وسجلها التدقيقي.'}</DialogDescription></DialogHeader>
      {mode === 'item' && <ItemForm draft={itemDraft} setDraft={setItemDraft} categories={categories} onSave={createItem} />}
      {mode === 'category' && <div className="space-y-3"><Field label="اسم الفئة بالعربية" value={categoryDraft.nameAr} onChange={(value) => setCategoryDraft((current) => ({ ...current, nameAr: value }))} /><Field label="الكود (إنجليزي بلا مسافات)" value={categoryDraft.code} onChange={(value) => setCategoryDraft((current) => ({ ...current, code: value }))} /><Field label="الاسم بالإنجليزية" value={categoryDraft.nameEn} onChange={(value) => setCategoryDraft((current) => ({ ...current, nameEn: value }))} /><Button className="w-full" onClick={() => void createCategory()}>حفظ الفئة</Button></div>}
      {mode === 'movement' && <div className="space-y-3"><LineEditor items={items} line={line} setLine={setLine} showCost={movementAction === 'deposit'} /><Button className="w-full" onClick={() => void postMovement()}>{movementAction === 'deposit' ? 'تأكيد الإيداع' : movementAction === 'waste' ? 'تأكيد الهالك' : 'تأكيد السحب'}</Button></div>}
      {mode === 'count' && <div className="space-y-3"><LineEditor items={items} line={line} setLine={setLine} quantityLabel="الرصيد الفعلي بعد الجرد" /><Button className="w-full" onClick={() => void postCount()}><ClipboardCheck className="ml-2 h-4 w-4" />اعتماد الجرد والتسوية</Button></div>}
      {(mode === 'purchase' || mode === 'withdrawal') && <MultiLineForm items={items} lines={lines} line={line} setLine={setLine} addLine={addLine} removeLine={(index) => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} showCost={mode === 'purchase'} />}
      {mode === 'purchase' && <div className="space-y-3"><Field label="المورد" value={supplierName} onChange={setSupplierName} /><Label>ملاحظات</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /><Button className="w-full" onClick={() => void submitPurchase()}><ShoppingCart className="ml-2 h-4 w-4" />إرسال للاعتماد</Button></div>}
      {mode === 'withdrawal' && <div className="space-y-3"><Label>ملاحظات المسحوبات</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="مثال: تجهيز وردية الغداء" /><Button className="w-full" onClick={() => void postWithdrawal()}><WalletCards className="ml-2 h-4 w-4" />اعتماد مسحوبات اليوم</Button></div>}
    </DialogContent></Dialog>
  </div>;
}

function ItemCard({ item, batches, consumptionQuantity, consumptionValue, consumptionDays, lastMovement, canManage, onDelete, onPurchase, onAction, onCount }: { item: OperationalInventoryItem; batches: InventoryBatch[]; consumptionQuantity: number; consumptionValue: number; consumptionDays: number; lastMovement?: import('@/types/operationalInventory').OperationalMovement; canManage: boolean; onDelete: () => void; onPurchase: () => void; onAction: (action: MovementAction) => void; onCount: () => void }) {
  const value = item.onHand * item.averageCost;
  const low = item.onHand <= item.minStock;
  const suggestedPurchase = Math.max(item.minStock - item.onHand, 0);

  return <Card className={low ? 'border-amber-300' : ''}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-2"><div><CardTitle className="text-lg">{item.name}</CardTitle><CardDescription>{item.code} • الموقع: {item.locationName}</CardDescription></div><Badge variant={low ? 'destructive' : 'secondary'}>{low ? 'وصل للحد الأدنى' : 'الرصيد آمن'}</Badge></div></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-3 gap-2 text-center"><Metric label="المتاح" value={`${item.onHand} ${item.unit}`} /><Metric label="الحد الأدنى" value={`${item.minStock} ${item.unit}`} /><Metric label="قيمة الصنف" value={formatEGPCurrency(value)} /></div><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">متوسط تكلفة الوحدة</p><p className="font-semibold">{formatEGPCurrency(item.averageCost)}</p></div><div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">آخر سعر شراء</p><p className="font-semibold">{formatEGPCurrency(item.lastPurchasePrice)}</p></div></div><div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-sm"><p className="font-semibold">متوسط الاستهلاك اليومي — آخر {consumptionDays} يومًا</p><div className="mt-1 flex justify-between"><span>{consumptionQuantity.toFixed(2)} {item.unit}</span><span>{formatEGPCurrency(consumptionValue)}</span></div></div>{batches.length > 0 && <div className="rounded-lg border p-2 text-xs"><p className="mb-1 font-semibold">الدُفعات المتاحة</p>{batches.slice(0, 2).map((batch) => <p key={batch.id}>#{batch.batchNo} — {batch.quantityOnHand} {item.unit}{batch.expiryDate ? ` — صلاحية ${batch.expiryDate}` : ''}</p>)}</div>}{low && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">المطلوب للحد الأدنى: <strong>{suggestedPurchase} {item.unit}</strong></div>}{item.notes && <p className="text-xs text-muted-foreground">ملاحظات: {item.notes}</p>}{lastMovement && <p className="text-xs text-muted-foreground">آخر حركة: {lastMovement.type} — {lastMovement.quantity} {item.unit}</p>}{canManage && <div className="grid grid-cols-2 gap-2">{low && <Button size="sm" onClick={onPurchase}><ShoppingCart className="ml-1 h-3.5 w-3.5" />طلب شراء</Button>}<Button size="sm" variant="outline" onClick={() => onAction('deposit')}>إيداع</Button><Button size="sm" variant="outline" onClick={() => onAction('withdraw')}>سحب</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => onAction('waste')}><Trash2 className="ml-1 h-3.5 w-3.5" />هالك</Button><Button size="sm" variant="outline" onClick={onCount}>جرد</Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="ml-1 h-3.5 w-3.5" />حذف الصنف</Button></div>}</CardContent></Card>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-1"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function LineEditor({ items, line, setLine, showCost = false, quantityLabel = 'الكمية' }: { items: OperationalInventoryItem[]; line: DraftLine; setLine: React.Dispatch<React.SetStateAction<DraftLine>>; showCost?: boolean; quantityLabel?: string }) { return <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>الصنف</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={line.itemId} onChange={(event) => { const item = items.find((entry) => entry.id === event.target.value); setLine((current) => ({ ...current, itemId: event.target.value, locationName: item?.locationName ?? 'main', unitCost: String(item?.averageCost ?? '') })); }}><option value="">اختر الصنف</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} — المتاح {item.onHand}</option>)}</select></div><div className="space-y-1"><Label>{quantityLabel}</Label><Input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => setLine((current) => ({ ...current, quantity: event.target.value }))} /></div>{showCost && <><div className="space-y-1"><Label>سعر الوحدة</Label><Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setLine((current) => ({ ...current, unitCost: event.target.value }))} /></div><div className="space-y-1"><Label>رقم الدفعة</Label><Input value={line.batchNo} placeholder="اختياري" onChange={(event) => setLine((current) => ({ ...current, batchNo: event.target.value }))} /></div><div className="space-y-1"><Label>تاريخ الصلاحية</Label><Input type="date" value={line.expiryDate} onChange={(event) => setLine((current) => ({ ...current, expiryDate: event.target.value }))} /></div></>}<div className="space-y-1"><Label>الموقع</Label><Input value={line.locationName} onChange={(event) => setLine((current) => ({ ...current, locationName: event.target.value }))} /></div><div className="space-y-1 sm:col-span-2"><Label>السبب / الملاحظات</Label><Input value={line.reason} onChange={(event) => setLine((current) => ({ ...current, reason: event.target.value }))} /></div></div>; }
function MultiLineForm({ items, lines, line, setLine, addLine, removeLine, showCost }: { items: OperationalInventoryItem[]; lines: DraftLine[]; line: DraftLine; setLine: React.Dispatch<React.SetStateAction<DraftLine>>; addLine: () => void; removeLine: (index: number) => void; showCost: boolean }) { return <div className="space-y-3"><LineEditor items={items} line={line} setLine={setLine} showCost={showCost} /><Button type="button" variant="outline" className="w-full" onClick={addLine}><Plus className="ml-2 h-4 w-4" />إضافة السطر</Button>{lines.length > 0 && <div className="space-y-2 rounded-xl border p-3">{lines.map((entry, index) => { const item = items.find((candidate) => candidate.id === entry.itemId); const cost = showCost ? number(entry.unitCost || '0') : item?.averageCost ?? 0; return <div className="flex items-center justify-between text-sm" key={`${entry.itemId}-${index}`}><span>{item?.name} — {entry.quantity} × {formatEGPCurrency(cost)}</span><Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeLine(index)}>حذف</Button></div>; })}</div>}</div>; }
function ItemForm({ draft, setDraft, categories, onSave }: { draft: any; setDraft: React.Dispatch<React.SetStateAction<any>>; categories: { code: string; name_ar: string }[]; onSave: () => void }) { const update = (key: string, value: string) => setDraft((current: any) => ({ ...current, [key]: value })); return <div className="grid gap-3 sm:grid-cols-2"><Field label="اسم الصنف" value={draft.name} onChange={(value) => update('name', value)} /><Field label="كود الصنف (اختياري)" value={draft.code} onChange={(value) => update('code', value)} /><div className="space-y-1"><Label>الفئة</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={draft.category} onChange={(event) => update('category', event.target.value)}><option value="">اختر الفئة</option>{categories.map((category) => <option key={category.code} value={category.code}>{category.name_ar}</option>)}</select></div><Field label="الوحدة" value={draft.unit} onChange={(value) => update('unit', value)} /><Field label="الحد الأدنى" value={draft.minStock} onChange={(value) => update('minStock', value)} /><Field label="الموقع" value={draft.locationName} onChange={(value) => update('locationName', value)} /><Field label="الرصيد الافتتاحي" value={draft.openingQuantity} onChange={(value) => update('openingQuantity', value)} /><Field label="متوسط سعر الوحدة الافتتاحي" value={draft.openingCost} onChange={(value) => update('openingCost', value)} /><div className="space-y-1 sm:col-span-2"><Label>ملاحظات</Label><Textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} /></div><Button className="sm:col-span-2" onClick={onSave}>حفظ الصنف</Button></div>; }
