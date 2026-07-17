import { useMemo, useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';

export type PurchaseOrderLine = {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
  unitCost: string;
  locationName: string;
  notes: string;
};

type NewItemDraft = { name: string; code: string; category: string; unit: string; minStock: string; unitCost: string };
const blankNewItem: NewItemDraft = { name: '', code: '', category: '', unit: 'kg', minStock: '0', unitCost: '' };

function suggestedLine(item: OperationalInventoryItem): PurchaseOrderLine {
  return { itemId: item.id, itemName: item.name, unit: item.unit, quantity: String(Math.max(item.minStock - item.onHand, 1)), unitCost: String(item.lastPurchasePrice || item.averageCost || ''), locationName: item.locationName, notes: item.onHand <= item.minStock ? 'اقتراح تلقائي: وصل للحد الأدنى' : '' };
}

export default function PurchaseOrderBuilder({ items, categories, onSubmit, onCreateNewItem }: {
  items: OperationalInventoryItem[];
  categories: InventoryCategoryRecord[];
  onSubmit: (lines: PurchaseOrderLine[], supplierName: string, notes: string) => Promise<void>;
  onCreateNewItem: (draft: NewItemDraft) => Promise<{ id: string; code: string } | null>;
}) {
  const [lines, setLines] = useState<PurchaseOrderLine[]>(() => items.filter(item => item.onHand <= item.minStock).map(suggestedLine));
  const [existingItemId, setExistingItemId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [newItem, setNewItem] = useState<NewItemDraft>(blankNewItem);
  const [creatingItem, setCreatingItem] = useState(false);
  const selectedIds = useMemo(() => new Set(lines.map(line => line.itemId)), [lines]);
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0);

  const updateLine = (itemId: string, patch: Partial<PurchaseOrderLine>) => setLines(current => current.map(line => line.itemId === itemId ? { ...line, ...patch } : line));
  const addExistingItem = () => {
    const item = items.find(candidate => candidate.id === existingItemId);
    if (!item || selectedIds.has(item.id)) return;
    setLines(current => [...current, suggestedLine(item)]);
    setExistingItemId('');
  };
  const addNewItem = async () => {
    if (!newItem.name.trim() || !newItem.category || !newItem.unit.trim()) { toast.error('أدخل اسم الصنف والفئة والوحدة'); return; }
    setCreatingItem(true);
    const created = await onCreateNewItem(newItem);
    setCreatingItem(false);
    if (!created) return;
    setLines(current => [...current, { itemId: created.id, itemName: newItem.name.trim(), unit: newItem.unit.trim(), quantity: '1', unitCost: newItem.unitCost, locationName: 'main', notes: 'صنف جديد ضمن أمر الشراء' }]);
    setNewItem(blankNewItem);
    toast.success('تمت إضافة الصنف الجديد إلى أمر الشراء');
  };
  const submit = async () => {
    if (lines.length === 0 || lines.some(line => Number(line.quantity) <= 0)) { toast.error('أضف صنفًا واحدًا على الأقل بكمية صحيحة'); return; }
    await onSubmit(lines, supplierName, notes);
  };

  return <div className="space-y-5">
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">تمت إضافة {lines.filter(line => line.notes.includes('اقتراح تلقائي')).length} أصناف تلقائيًا لأنها وصلت للحد الأدنى. عدّل الكمية أو احذف أي صنف قبل الإرسال.</div>
    <div className="space-y-3">
      <h3 className="font-semibold">أصناف أمر الشراء</h3>
      {lines.map(line => <div className="rounded-xl border p-3" key={line.itemId}><div className="mb-3 flex items-center justify-between gap-2"><div><strong>{line.itemName}</strong><span className="mr-2 text-sm text-muted-foreground">({line.unit})</span></div><Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setLines(current => current.filter(item => item.itemId !== line.itemId))}><Trash2 className="ml-1 h-4 w-4" />حذف</Button></div><div className="grid gap-3 sm:grid-cols-2"><NumberField label="الكمية المطلوبة" value={line.quantity} onChange={value => updateLine(line.itemId, { quantity: value })} /><NumberField label="سعر الوحدة المتوقع" value={line.unitCost} onChange={value => updateLine(line.itemId, { unitCost: value })} step="0.01" /></div></div>)}
      {lines.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">لا توجد أصناف في الأمر. أضف صنفًا من المخزون أو صنفًا جديدًا.</p>}
    </div>
    <div className="rounded-xl bg-muted/50 p-4"><Label>إضافة صنف موجود في المخزون</Label><div className="mt-2 flex gap-2"><select className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3" value={existingItemId} onChange={event => setExistingItemId(event.target.value)}><option value="">اختر الصنف</option>{items.filter(item => !selectedIds.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name} — المتاح {item.onHand} {item.unit}</option>)}</select><Button type="button" variant="outline" disabled={!existingItemId} onClick={addExistingItem}><Plus className="ml-1 h-4 w-4" />إضافة</Button></div></div>
    <div className="rounded-xl border border-dashed p-4"><h3 className="flex items-center gap-2 font-semibold"><PackagePlus className="h-5 w-5" />إضافة صنف جديد إلى الأمر</h3><p className="mt-1 text-sm text-muted-foreground">سيُنشأ الصنف في المخزون بدون رصيد، ثم يُضاف لهذا الأمر بالكمية التي تحددها.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><TextField label="اسم الصنف الجديد" value={newItem.name} onChange={value => setNewItem(current => ({ ...current, name: value }))} /><TextField label="كود الصنف (اختياري)" value={newItem.code} onChange={value => setNewItem(current => ({ ...current, code: value }))} /><div className="space-y-1"><Label>الفئة</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={newItem.category} onChange={event => setNewItem(current => ({ ...current, category: event.target.value }))}><option value="">اختر الفئة</option>{categories.map(category => <option key={category.id} value={category.code}>{category.name_ar}</option>)}</select></div><TextField label="الوحدة" value={newItem.unit} onChange={value => setNewItem(current => ({ ...current, unit: value }))} /><NumberField label="الحد الأدنى" value={newItem.minStock} onChange={value => setNewItem(current => ({ ...current, minStock: value }))} /><NumberField label="سعر الوحدة المتوقع" value={newItem.unitCost} onChange={value => setNewItem(current => ({ ...current, unitCost: value }))} step="0.01" /></div><Button type="button" className="mt-3" variant="outline" disabled={creatingItem} onClick={() => void addNewItem()}><Plus className="ml-1 h-4 w-4" />{creatingItem ? 'جارٍ إضافة الصنف...' : 'إضافة الصنف الجديد للأمر'}</Button></div>
    <div className="grid gap-3 sm:grid-cols-2"><TextField label="المورد" value={supplierName} onChange={setSupplierName} /><div className="rounded-lg bg-muted p-3 text-sm"><p className="text-muted-foreground">إجمالي تقديري</p><strong>{total.toLocaleString('ar-EG')} ج.م</strong></div></div>
    <div className="space-y-1"><Label>ملاحظات أمر الشراء</Label><Textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="أي تعليمات للمورد أو للمخزن" /></div>
    <Button className="w-full" disabled={lines.length === 0} onClick={() => void submit()}><PackagePlus className="ml-2 h-4 w-4" />إرسال أمر شراء مجمع ({lines.length} أصناف)</Button>
  </div>;
}
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-1"><Label>{label}</Label><Input value={value} onChange={event => onChange(event.target.value)} /></div>; }
function NumberField({ label, value, onChange, step = '0.001' }: { label: string; value: string; onChange: (value: string) => void; step?: string }) { return <div className="space-y-1"><Label>{label}</Label><Input type="number" min="0" step={step} value={value} onChange={event => onChange(event.target.value)} /></div>; }
