import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import ProcurementPriceAlert from '@/components/ProcurementPriceAlert';
import { formatCleanUnitLabel } from '@/lib/procurementEngine';
import { INVENTORY_CATEGORY_LABELS, INVENTORY_UNIT_LABELS, type InventoryUnit } from '@/types/inventory';
import { cn, formatEGPCurrency } from '@/lib/utils';

export interface DirectPurchaseCatalogItem {
  id: string;
  name: string;
  code: string;
  purchaseUnit: string;
  usageUnit: string;
  conversionFactor: number;
  lastPrice: number;
  averageCost: number;
}

export interface DirectPurchaseLinePayload {
  itemId: string;
  newItemName?: string;
  newItemCategory?: string;
  newItemUnit?: InventoryUnit;
  quantity: number;
  unitCost: number;
  batchNo: string;
  expiryDate: string;
}

export interface DirectMultiPurchaseSubmission {
  supplierId: string;
  supplierName: string;
  purchaserName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  taxAmount: number;
  discountAmount: number;
  paidAmount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  notes: string;
  invoiceFile: File | null;
  lines: DirectPurchaseLinePayload[];
}

interface LineDraft {
  rowId: string;
  mode: 'existing' | 'new';
  searchQuery: string;
  itemId: string;
  newItemName: string;
  newItemCategory: string;
  newItemUnit: InventoryUnit;
  quantity: string;
  unitCost: string;
  batchNo: string;
  expiryDate: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DirectPurchaseCatalogItem[];
  suppliers: Array<{ id: string; name: string }>;
  categories?: Array<{ code: string; name: string }>;
  authenticatedAccountName: string;
  onSubmit: (submission: DirectMultiPurchaseSubmission) => Promise<boolean>;
}

const makeRow = (): LineDraft => ({
  rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  mode: 'existing',
  searchQuery: '',
  itemId: '',
  newItemName: '',
  newItemCategory: 'other',
  newItemUnit: 'kg',
  quantity: '1',
  unitCost: '',
  batchNo: '',
  expiryDate: '',
});

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function DirectMultiPurchaseDialog({
  open,
  onOpenChange,
  items,
  suppliers,
  categories = [],
  authenticatedAccountName,
  onSubmit,
}: Props) {
  const [supplierId, setSupplierId] = useState('');
  const [customSupplierName, setCustomSupplierName] = useState('');
  const [purchaserName, setPurchaserName] = useState(authenticatedAccountName);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer' | 'credit' | 'partial'>('cash');
  const [partialPaidAmount, setPartialPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [lines, setLines] = useState<LineDraft[]>(() => [makeRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPurchaserName(authenticatedAccountName);
    }
  }, [authenticatedAccountName, open]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, row) => {
        const q = Number(row.quantity);
        const p = Number(row.unitCost);
        if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0) return sum;
        return sum + q * p;
      }, 0),
    [lines],
  );

  const taxNum = Math.max(0, Number(taxAmount) || 0);
  const discountNum = Math.max(0, Number(discountAmount) || 0);
  const grandTotal = Math.max(0, Math.round((subtotal + taxNum - discountNum) * 100) / 100);

  const effectivePaidAmount = useMemo(() => {
    if (paymentMode === 'cash' || paymentMode === 'bank_transfer') return grandTotal;
    if (paymentMode === 'credit') return 0;
    return Math.max(0, Math.min(grandTotal, Number(partialPaidAmount) || 0));
  }, [grandTotal, partialPaidAmount, paymentMode]);

  const remainingDue = Math.max(0, Math.round((grandTotal - effectivePaidAmount) * 100) / 100);

  const updateRow = (rowId: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );
  };

  const handleSelectItem = (rowId: string, itemId: string) => {
    const item = itemMap.get(itemId);
    const factor = item && item.conversionFactor > 0 ? item.conversionFactor : 1;
    const defaultCost = item ? item.lastPrice || Math.round(item.averageCost * factor * 100) / 100 : 0;
    updateRow(rowId, {
      itemId,
      unitCost: defaultCost > 0 ? String(defaultCost) : '',
    });
  };

  const resetForm = () => {
    setSupplierId('');
    setCustomSupplierName('');
    setPurchaserName(authenticatedAccountName);
    setInvoiceNumber('');
    setInvoiceDate(todayIso());
    setDueDate('');
    setTaxAmount('0');
    setDiscountAmount('0');
    setPaymentMode('cash');
    setPartialPaidAmount('0');
    setNotes('');
    setInvoiceFile(null);
    setLines([makeRow()]);
  };

  const handleSubmit = async () => {
    if (lines.length === 0) {
      toast.error('أضف صنفاً واحداً على الأقل للفاتورة');
      return;
    }

    for (const row of lines) {
      const q = Number(row.quantity);
      const p = Number(row.unitCost);
      if (row.mode === 'existing' && !row.itemId) {
        toast.error('اختر الصنف من القائمة أو اضغط «صنف جديد» لتعريفه فوراً');
        return;
      }
      if (row.mode === 'new' && !row.newItemName.trim()) {
        toast.error('اكتب اسم الصنف الجديد');
        return;
      }
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0) {
        toast.error('أدخل كمية وسعر وحدة صحيحين لكل الأصناف');
        return;
      }
    }

    if (remainingDue > 0 && !dueDate) {
      toast.error('حدد تاريخ استحقاق المبلغ المتبقي للمشتريات الآجلة أو الجزئية');
      return;
    }

    const selectedSupplier = suppliers.find((s) => s.id === supplierId);
    const effectivePaymentMethod: 'cash' | 'bank_transfer' | 'credit' =
      paymentMode === 'bank_transfer'
        ? 'bank_transfer'
        : paymentMode === 'credit'
          ? 'credit'
          : 'cash';

    setSaving(true);
    try {
      const ok = await onSubmit({
        supplierId,
        supplierName: selectedSupplier?.name ?? customSupplierName.trim(),
        purchaserName: purchaserName.trim() || authenticatedAccountName || 'مسؤول المشتريات',
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        dueDate: remainingDue > 0 ? dueDate : '',
        taxAmount: taxNum,
        discountAmount: discountNum,
        paidAmount: effectivePaidAmount,
        paymentMethod: effectivePaymentMethod,
        notes: notes.trim(),
        invoiceFile,
        lines: lines.map((row) => ({
          itemId: row.mode === 'existing' ? row.itemId : '',
          newItemName: row.mode === 'new' ? row.newItemName.trim() : undefined,
          newItemCategory: row.mode === 'new' ? row.newItemCategory : undefined,
          newItemUnit: row.mode === 'new' ? row.newItemUnit : undefined,
          quantity: Number(row.quantity),
          unitCost: Number(row.unitCost),
          batchNo: row.batchNo.trim(),
          expiryDate: row.expiryDate,
        })),
      });
      if (ok) {
        resetForm();
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl" dir="rtl">
        <DialogHeader className="space-y-2 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
              <PackagePlus className="h-5 w-5 text-emerald-600" />
              تسجيل فاتورة شراء مباشر (متعددة الأصناف)
            </DialogTitle>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              مُسجّل العملية تلقائياً: {authenticatedAccountName || 'حسابك الحالي'}
            </span>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            سجّل فاتورة مورد كاملة بصنف واحد أو عدة أصناف دفعة واحدة، مع حساب تلقائي للإجمالي والمدفوع وإرسالها مباشرة لاعتماد استلام المخزن.
          </DialogDescription>
        </DialogHeader>

        {/* Supplier & Header Metadata */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">المورد المسجل</Label>
            <select
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium"
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                if (e.target.value) setCustomSupplierName('');
              }}
            >
              <option value="">— اختر مورداً أو اكتب اسمه —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {!supplierId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">اسم مورد خارجي / نقدي</Label>
              <Input
                className="h-9 text-xs"
                placeholder="مثال: سوق العبور / مورد خضار"
                value={customSupplierName}
                onChange={(e) => setCustomSupplierName(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">القائم بالشراء / المندوب</Label>
            <Input
              className="h-9 text-xs"
              value={purchaserName}
              onChange={(e) => setPurchaserName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">رقم الفاتورة (اختياري)</Label>
            <Input
              className="h-9 text-xs"
              placeholder="INV-..."
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">تاريخ الفاتورة</Label>
            <Input
              type="date"
              className="h-9 text-xs tabular-nums"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
        </div>

        {/* Invoice Lines */}
        <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-slate-800">
              بنود وأصناف الفاتورة ({lines.length})
            </h4>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-lg bg-white text-xs font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setLines((prev) => [...prev, makeRow()])}
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة صنف آخر للفاتورة
            </Button>
          </div>

          <div className="space-y-2.5">
            {lines.map((row, idx) => {
              const selectedItem = row.mode === 'existing' ? itemMap.get(row.itemId) : undefined;
              const filteredOptions = row.searchQuery.trim()
                ? items.filter(
                    (it) =>
                      it.name.toLowerCase().includes(row.searchQuery.trim().toLowerCase()) ||
                      it.code.toLowerCase().includes(row.searchQuery.trim().toLowerCase()),
                  )
                : items;
              const unitInfo = formatCleanUnitLabel(selectedItem?.purchaseUnit ?? row.newItemUnit);
              const lineTotal = (Number(row.quantity) || 0) * (Number(row.unitCost) || 0);

              return (
                <div
                  key={row.rowId}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white tabular-nums">
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateRow(row.rowId, {
                            mode: row.mode === 'existing' ? 'new' : 'existing',
                          })
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer',
                          row.mode === 'new'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
                        )}
                      >
                        {row.mode === 'existing' ? '+ تعريف كصنف جديد غير مسجل' : '← اختيار من أصناف المخزن'}
                      </button>
                    </div>

                    {lines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                        onClick={() => setLines((prev) => prev.filter((r) => r.rowId !== row.rowId))}
                        aria-label="حذف السطر"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {row.mode === 'existing' ? (
                    <div className="grid gap-2.5 md:grid-cols-[1.5fr_0.7fr_0.8fr_0.8fr]">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">الصنف (ابحث واختر)</Label>
                        <div className="space-y-1.5">
                          <div className="relative">
                            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                              className="h-8 pr-8 text-xs"
                              placeholder="ابحث بالاسم أو الكود..."
                              value={row.searchQuery}
                              onChange={(e) => updateRow(row.rowId, { searchQuery: e.target.value })}
                            />
                          </div>
                          <select
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold"
                            value={row.itemId}
                            onChange={(e) => handleSelectItem(row.rowId, e.target.value)}
                          >
                            <option value="">اختر الصنف ({filteredOptions.length})</option>
                            {filteredOptions.map((it) => {
                              const u = formatCleanUnitLabel(it.purchaseUnit);
                              return (
                                <option key={it.id} value={it.id}>
                                  {it.name} — ({u.unitShort})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">
                          الكمية ({unitInfo.unitShort})
                        </Label>
                        <Input
                          type="number"
                          min="0.001"
                          step="0.001"
                          className="h-9 text-xs font-bold tabular-nums"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.rowId, { quantity: e.target.value })}
                        />
                        {unitInfo.packHint && (
                          <p className="text-[10px] text-slate-400">العبوة: {unitInfo.packHint}</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">سعر الوحدة (ج.م)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-9 text-xs font-bold tabular-nums"
                          placeholder="0.00"
                          value={row.unitCost}
                          onChange={(e) => updateRow(row.rowId, { unitCost: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">إجمالي السطر</Label>
                        <div className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-extrabold text-slate-900 tabular-nums">
                          {formatEGPCurrency(lineTotal)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2.5 md:grid-cols-[1.2fr_0.8fr_0.7fr_0.6fr_0.7fr]">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-emerald-600" /> اسم الصنف الجديد *
                        </Label>
                        <Input
                          className="h-9 text-xs"
                          placeholder="مثال: صوص ديمي جلاس"
                          value={row.newItemName}
                          onChange={(e) => updateRow(row.rowId, { newItemName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">الفئة</Label>
                        <select
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                          value={row.newItemCategory}
                          onChange={(e) => updateRow(row.rowId, { newItemCategory: e.target.value })}
                        >
                          {categories.length > 0
                            ? categories.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.name}
                                </option>
                              ))
                            : Object.entries(INVENTORY_CATEGORY_LABELS).map(([code, label]) => (
                                <option key={code} value={code}>
                                  {label}
                                </option>
                              ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">وحدة الشراء</Label>
                        <select
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                          value={row.newItemUnit}
                          onChange={(e) =>
                            updateRow(row.rowId, { newItemUnit: e.target.value as InventoryUnit })
                          }
                        >
                          {Object.entries(INVENTORY_UNIT_LABELS).map(([u, label]) => (
                            <option key={u} value={u}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">الكمية</Label>
                        <Input
                          type="number"
                          min="0.001"
                          step="0.001"
                          className="h-9 text-xs tabular-nums"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.rowId, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold">سعر الوحدة</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-9 text-xs tabular-nums"
                          value={row.unitCost}
                          onChange={(e) => updateRow(row.rowId, { unitCost: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {selectedItem && Number(row.unitCost) > 0 && (
                    <ProcurementPriceAlert
                      itemName={selectedItem.name}
                      currentPrice={Number(row.unitCost)}
                      previousPrice={selectedItem.lastPrice}
                      unit={selectedItem.purchaseUnit}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals, Payment Mode & Attachment */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">نظام السداد</Label>
            <select
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold"
              value={paymentMode}
              onChange={(e) =>
                setPaymentMode(e.target.value as 'cash' | 'bank_transfer' | 'credit' | 'partial')
              }
            >
              <option value="cash">نقداً (مسدد بالكامل)</option>
              <option value="bank_transfer">تحويل بنكي / انستاباي / محفظة</option>
              <option value="credit">آجل (على الحساب للمورد)</option>
              <option value="partial">دفعة جزئية الآن والباقي آجل</option>
            </select>
          </div>

          {paymentMode === 'partial' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">المبلغ المدفوع الآن (ج.م)</Label>
              <Input
                type="number"
                min="0"
                max={grandTotal}
                step="0.01"
                className="h-9 text-xs font-bold tabular-nums"
                value={partialPaidAmount}
                onChange={(e) => setPartialPaidAmount(e.target.value)}
              />
            </div>
          )}

          {remainingDue > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-amber-800">تاريخ استحقاق الباقي *</Label>
              <Input
                type="date"
                className="h-9 text-xs tabular-nums border-amber-300"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">الخصم (ج.م)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="h-9 text-xs tabular-nums"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">الضريبة (ج.م)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="h-9 text-xs tabular-nums"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Upload className="h-3.5 w-3.5 text-slate-500" /> إرفاق صورة الفاتورة أو PDF (اختياري)
            </Label>
            <Input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              className="h-9 text-xs"
              onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-semibold">ملاحظات الفاتورة</Label>
            <Textarea
              rows={1}
              className="min-h-9 text-xs"
              placeholder="أي ملاحظات على التوريد أو الأسعار..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 tabular-nums">
            <span>
              إجمالي البنود: <strong>{formatEGPCurrency(subtotal)}</strong>
            </span>
            {discountNum > 0 && (
              <span className="text-emerald-700">خصم: -{formatEGPCurrency(discountNum)}</span>
            )}
            {taxNum > 0 && <span>ضريبة: +{formatEGPCurrency(taxNum)}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3 tabular-nums">
            <Badge variant="outline" className="bg-white text-slate-900 font-extrabold text-xs px-3 py-1">
              الصافي: {formatEGPCurrency(grandTotal)}
            </Badge>
            <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-1">
              مدفوع: {formatEGPCurrency(effectivePaidAmount)}
            </Badge>
            {remainingDue > 0 && (
              <Badge variant="destructive" className="font-bold text-xs px-2.5 py-1">
                متبقي آجل: {formatEGPCurrency(remainingDue)}
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            disabled={saving}
            onClick={() => void handleSubmit()}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ الحفظ...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> تسجيل الفاتورة وإشعار المخزن للاستلام
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
