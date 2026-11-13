import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Brand } from '@/hooks/useBrands';
import { formatEGPCurrency, getTodayDateValue } from '@/lib/utils';
import {
  ALLOCATION_TYPE_LABELS,
  AllocationType,
  ExpenseCategory,
  ExpenseInput,
  ExpensePaymentMethod,
  ExpensePaymentStatus,
  ExpenseRecord,
  ExpenseType,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/finance';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingExpense: ExpenseRecord | null;
  categories: ExpenseCategory[];
  brands: Brand[];
  onSaveExpense: (input: ExpenseInput) => Promise<boolean>;
  onUploadReceipt: (file: File) => Promise<string | null>;
  onAddSubcategory: (input: {
    name: string;
    parent_id: string;
    expense_type: ExpenseType;
    default_allocation_rule: AllocationType;
  }) => Promise<ExpenseCategory | null>;
}

export default function NewExpenseDialog({
  open,
  onOpenChange,
  editingExpense,
  categories,
  brands,
  onSaveExpense,
  onUploadReceipt,
  onAddSubcategory,
}: Props) {
  const parentCategories = useMemo(
    () => categories.filter((c) => c.parent_id === null),
    [categories],
  );

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [expenseDate, setExpenseDate] = useState(() => getTodayDateValue());
  const [parentCatId, setParentCatId] = useState('');
  const [subCatId, setSubCatId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('cash');
  const [paymentStatus, setPaymentStatus] = useState<ExpensePaymentStatus>('paid');
  const [allocationType, setAllocationType] = useState<AllocationType>('shared_revenue');
  const [directBrandId, setDirectBrandId] = useState('');
  const [fixedPctMap, setFixedPctMap] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Quick inline subcategory creator
  const [quickSubOpen, setQuickSubOpen] = useState(false);
  const [quickSubName, setQuickSubName] = useState('');
  const [quickSubType, setQuickSubType] = useState<ExpenseType>('opex');

  const childCategories = useMemo(
    () => categories.filter((c) => c.parent_id === parentCatId),
    [categories, parentCatId],
  );

  useEffect(() => {
    if (!open) return;

    if (editingExpense) {
      setTitle(editingExpense.title);
      setAmount(String(editingExpense.amount));
      setTaxAmount(String(editingExpense.tax_amount ?? 0));
      setExpenseDate(editingExpense.expense_date);
      setPaymentMethod(editingExpense.payment_method);
      setPaymentStatus(editingExpense.payment_status);
      setNotes(editingExpense.notes ?? '');
      setExistingReceiptUrl(editingExpense.receipt_url);
      setReceiptFile(null);

      const matchedCat = categories.find((c) => c.id === editingExpense.category_id);
      if (matchedCat) {
        if (matchedCat.parent_id) {
          setParentCatId(matchedCat.parent_id);
          setSubCatId(matchedCat.id);
        } else {
          setParentCatId(matchedCat.id);
          setSubCatId('');
        }
      }

      const firstAlloc = editingExpense.allocations[0];
      if (firstAlloc) {
        setAllocationType(firstAlloc.allocation_type);
        setDirectBrandId(firstAlloc.allocation_type === 'direct' ? firstAlloc.company_id : brands[0]?.id ?? '');
        if (firstAlloc.allocation_type === 'fixed_percent') {
          const map: Record<string, string> = {};
          editingExpense.allocations.forEach((a) => {
            map[a.company_id] = String(a.percentage);
          });
          setFixedPctMap(map);
        }
      } else {
        setAllocationType(editingExpense.brand_id ? 'direct' : 'shared_revenue');
        setDirectBrandId(editingExpense.brand_id ?? brands[0]?.id ?? '');
      }
      return;
    }

    const defaultParent = parentCategories[0];
    const firstSub = categories.find((c) => c.parent_id === defaultParent?.id);
    setTitle('');
    setAmount('');
    setTaxAmount('0');
    setExpenseDate(getTodayDateValue());
    setParentCatId(defaultParent?.id ?? '');
    setSubCatId(firstSub?.id ?? '');
    setPaymentMethod('cash');
    setPaymentStatus('paid');
    setAllocationType(firstSub?.default_allocation_rule ?? defaultParent?.default_allocation_rule ?? 'shared_revenue');
    setDirectBrandId(brands[0]?.id ?? '');
    const equalPct = brands.length > 0 ? String(Math.round((100 / brands.length) * 10) / 10) : '100';
    setFixedPctMap(Object.fromEntries(brands.map((b) => [b.id, equalPct])));
    setNotes('');
    setReceiptFile(null);
    setExistingReceiptUrl(null);
    setQuickSubOpen(false);
    setQuickSubName('');
  }, [open, editingExpense, parentCategories, categories, brands]);

  const handleParentChange = (nextParentId: string) => {
    setParentCatId(nextParentId);
    const subs = categories.filter((c) => c.parent_id === nextParentId);
    const firstSub = subs[0];
    setSubCatId(firstSub?.id ?? '');
    const rule =
      firstSub?.default_allocation_rule ??
      categories.find((c) => c.id === nextParentId)?.default_allocation_rule ??
      'shared_revenue';
    setAllocationType(rule);
  };

  const handleSubChange = (nextSubId: string) => {
    setSubCatId(nextSubId);
    const sub = categories.find((c) => c.id === nextSubId);
    if (sub) {
      setAllocationType(sub.default_allocation_rule);
    }
  };

  const handleQuickCreateSubcategory = async () => {
    if (!parentCatId || !quickSubName.trim()) return;
    const created = await onAddSubcategory({
      name: quickSubName,
      parent_id: parentCatId,
      expense_type: quickSubType,
      default_allocation_rule: allocationType,
    });
    if (created) {
      setSubCatId(created.id);
      setQuickSubName('');
      setQuickSubOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount || 0);
    const numTax = Number(taxAmount || 0);
    const effectiveCategoryId = subCatId || parentCatId;
    if (!effectiveCategoryId || numAmount <= 0) return;

    setSaving(true);
    let receiptUrl = existingReceiptUrl;
    if (receiptFile) {
      const uploaded = await onUploadReceipt(receiptFile);
      if (uploaded) receiptUrl = uploaded;
    }

    const numericFixed: Record<string, number> = {};
    for (const [k, v] of Object.entries(fixedPctMap)) {
      numericFixed[k] = Number(v || 0);
    }

    const ok = await onSaveExpense({
      id: editingExpense?.id,
      title,
      amount: numAmount,
      tax_amount: Math.max(0, numTax),
      expense_date: expenseDate,
      category_id: effectiveCategoryId,
      source_type: editingExpense?.source_type ?? 'manual',
      source_ref_id: editingExpense?.source_ref_id ?? null,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      receipt_url: receiptUrl,
      notes,
      allocation_type: allocationType,
      direct_company_id: allocationType === 'direct' ? directBrandId : null,
      fixed_percentages: allocationType === 'fixed_percent' ? numericFixed : undefined,
    });
    setSaving(false);
    if (ok) {
      onOpenChange(false);
    }
  };

  const totalPreview = (Number(amount || 0) || 0) + (Number(taxAmount || 0) || 0);
  const selectedCatObj = categories.find((c) => c.id === (subCatId || parentCatId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingExpense ? 'تعديل قيد المصروف' : 'تسجيل مصروف جديد في دفتر الأستاذ الموحد'}
          </DialogTitle>
          <DialogDescription>
            سجّل المصروف وحدد قاعدة توزيع التكلفة على الشركات (مباشر كإسبونسر براند محدد أو مشترك على المطبخ).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="exp-title" className="text-xs font-semibold">
                عنوان / بيان المصروف *
              </Label>
              <Input
                id="exp-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: إسبونسر فيسبوك Healthy Food أو صيانة ثلاجة التجميد"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="exp-date" className="text-xs font-semibold">
                تاريخ الاستحقاق / الصرف *
              </Label>
              <Input
                id="exp-date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="tabular-nums"
                required
              />
            </div>
          </div>

          {/* Amount + Tax + Total Preview */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="exp-amount" className="text-xs font-semibold">
                المبلغ الأساسي (ج.م.) *
              </Label>
              <Input
                id="exp-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="tabular-nums font-semibold"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="exp-tax" className="text-xs font-semibold">
                الضريبة / الرسوم (ج.م.)
              </Label>
              <Input
                id="exp-tax"
                type="number"
                min="0"
                step="0.01"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3.5 py-2 flex flex-col justify-center">
              <span className="text-[11px] text-emerald-700 font-medium">الإجمالي شامل الضريبة</span>
              <span className="text-base font-bold text-slate-900 tabular-nums tracking-tight">
                {formatEGPCurrency(totalPreview)}
              </span>
            </div>
          </div>

          {/* Category & Subcategory with instant Quick Add */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">التصنيف الرئيسي *</Label>
                <Select value={parentCatId} onValueChange={handleParentChange}>
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="اختر التصنيف الرئيسي" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">البند الفرعي</Label>
                  <button
                    type="button"
                    onClick={() => setQuickSubOpen((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    <span>إضافة بند فرعي جديد</span>
                  </button>
                </div>
                <Select value={subCatId} onValueChange={handleSubChange}>
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue placeholder="اختر البند الفرعي" />
                  </SelectTrigger>
                  <SelectContent>
                    {childCategories.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name} {sub.expense_type === 'capex' ? '(أصل رأسمالي CapEx)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedCatObj?.expense_type === 'capex' && (
              <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1.5">
                ملاحظة محاسبية: هذا البند مُصنّف كـ <strong>أصل رأسمالي (CapEx)</strong>؛ يظهر في التدفق النقدي الفعلي ولا يُخصم من صافي الربح التشغيلي الشهري حتى لا يشوّه هامش الربح.
              </p>
            )}

            {quickSubOpen && (
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] items-center pt-2 border-t border-slate-200/70">
                <Input
                  value={quickSubName}
                  onChange={(e) => setQuickSubName(e.target.value)}
                  placeholder="اسم البند الفرعي الجديد..."
                  className="h-8 text-xs bg-white"
                />
                <select
                  value={quickSubType}
                  onChange={(e) => setQuickSubType(e.target.value as ExpenseType)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                >
                  <option value="opex">تشغيلي (OpEx)</option>
                  <option value="capex">أصل رأسمالي (CapEx)</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleQuickCreateSubcategory()}
                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  حفظ البند
                </Button>
              </div>
            )}
          </div>

          {/* Payment Method & Status */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">طريقة الدفع</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as ExpensePaymentMethod)}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PAYMENT_METHOD_LABELS) as [ExpensePaymentMethod, string][]).map(
                    ([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">حالة السداد</Label>
              <Select
                value={paymentStatus}
                onValueChange={(v) => setPaymentStatus(v as ExpensePaymentStatus)}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PAYMENT_STATUS_LABELS) as [ExpensePaymentStatus, string][]).map(
                    ([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Multi-Brand Cost Allocation Routing */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">توجيه وتوزيع التكلفة على الشركات *</Label>
                <Select
                  value={allocationType}
                  onValueChange={(v) => setAllocationType(v as AllocationType)}
                >
                  <SelectTrigger className="bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ALLOCATION_TYPE_LABELS) as [AllocationType, string][]).map(
                      ([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              {allocationType === 'direct' && (
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">اختر الشركة المحمّل عليها المصروف *</Label>
                  <Select value={directBrandId} onValueChange={setDirectBrandId}>
                    <SelectTrigger className="bg-white text-xs">
                      <SelectValue placeholder="اختر الشركة" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {allocationType === 'fixed_percent' && brands.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-3 pt-1">
                {brands.map((brand) => (
                  <div key={brand.id} className="rounded-lg border border-slate-200 bg-white p-2 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-700 block truncate">
                      {brand.name} (%)
                    </span>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={fixedPctMap[brand.id] ?? '0'}
                      onChange={(e) =>
                        setFixedPctMap((prev) => ({ ...prev, [brand.id]: e.target.value }))
                      }
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Receipt Upload + Notes */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                إرفاق صورة الفاتورة / الإيصال (اختياري)
              </Label>
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">ملاحظات إضافية</Label>
              <Textarea
                rows={1}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="رقم مرجعي، اسم مستلم، أو تفاصيل..."
                className="text-xs min-h-10"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>{editingExpense ? 'حفظ التعديلات' : 'ترحيل المصروف للدفتر'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
