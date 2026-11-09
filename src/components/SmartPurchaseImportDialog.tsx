import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { INVENTORY_UNIT_LABELS } from '@/types/inventory';
import { parseSmartPurchaseMessage, unitMatchesInventory, type SmartPurchaseCatalogItem, type SmartPurchaseLine } from '@/lib/smartPurchaseImport';
import { convertInvoiceLineToPurchaseUnit } from '@/lib/procurementUnits';
import { downscaleImage } from '@/lib/ocrImage';
import ProcurementPriceAlert from '@/components/ProcurementPriceAlert';

export type SmartPurchaseSubmission = {
  supplierId: string;
  supplierName: string;
  purchaserName: string;
  notes: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  taxAmount: number;
  discountAmount: number;
  paidAmount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  invoiceFile: File | null;
  lines: Array<{ itemId: string; quantity: number; unitPrice: number }>;
};

type Props = {
  open: boolean;
  inventoryItems: Array<SmartPurchaseCatalogItem & { purchaseUnit: string; usageUnit: string; conversionFactor: number; lastPurchasePrice: number }>;
  suppliers: Array<{ id: string; name: string }>;
  defaultPurchaserName: string;
  startWith: 'message' | 'image';
  onOpenChange: (open: boolean) => void;
  onSubmit: (submission: SmartPurchaseSubmission) => Promise<boolean>;
};

type ReviewLine = SmartPurchaseLine;

export default function SmartPurchaseImportDialog({
  open,
  inventoryItems,
  suppliers,
  defaultPurchaserName,
  startWith,
  onOpenChange,
  onSubmit,
}: Props) {
  const [message, setMessage] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [purchaserName, setPurchaserName] = useState(defaultPurchaserName);
  const [notes, setNotes] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [taxAmount, setTaxAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<SmartPurchaseSubmission['paymentMethod']>('cash');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [ignoredLines, setIgnoredLines] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState('');
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const ocrAbortRef = useRef<AbortController | null>(null);

  const selectedItems = useMemo(
    () => new Map(inventoryItems.map((item) => [item.id, item])),
    [inventoryItems],
  );
  const convertedLines = useMemo(
    () => new Map(lines.map((line) => {
      const item = selectedItems.get(line.itemId);
      return [line.id, item
        ? convertInvoiceLineToPurchaseUnit(line.quantity, line.unitPrice, line.sourceUnit, item)
        : null] as const;
    })),
    [lines, selectedItems],
  );
  // The invoice total is computed from every extracted line (quantity × unit
  // price), even before the lines are linked to catalog items — the paid
  // amount follows it automatically.
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const invoiceTotal = Math.max(0, total + taxAmount - discountAmount);
  // The paid amount always follows the computed invoice total (lines after
  // unit conversion + tax − discount). Editing the field manually is not
  // needed — the system computes it.
  useEffect(() => {
    setPaidAmount(invoiceTotal);
  }, [invoiceTotal]);
  const paymentConsistencyError = useMemo(() => {
    if (paymentMethod === 'credit' && !dueDate) {
      return 'الشراء الآجل يتطلب تحديد تاريخ الاستحقاق.';
    }
    if (paymentMethod !== 'credit' && dueDate) {
      return 'تاريخ الاستحقاق يُستخدم مع الشراء الآجل فقط.';
    }
    return '';
  }, [paymentMethod, dueDate]);
  const canSubmit = lines.length > 0
    && Boolean(purchaserName.trim())
    && taxAmount >= 0
    && discountAmount >= 0
    && paidAmount >= 0
    && paidAmount <= invoiceTotal
    && !paymentConsistencyError
    && lines.every((line) => Boolean(selectedItems.get(line.itemId)) && convertedLines.get(line.id) !== null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return;
    }

    const imageUrl = URL.createObjectURL(imageFile);
    setImagePreview(imageUrl);
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageFile]);

  useEffect(() => {
    if (open) {
      setPurchaserName(defaultPurchaserName);
      window.setTimeout(() => {
        (startWith === 'message' ? messageRef.current : imageInputRef.current)?.focus();
      }, 100);
    }
  }, [defaultPurchaserName, open, startWith]);

  const applyParse = (text: string) => {
    const result = parseSmartPurchaseMessage(text, inventoryItems);
    setLines(result.lines);
    setIgnoredLines(result.ignoredLines);
    if (result.supplierName) {
      setSupplierName(result.supplierName);
    }
    if (result.lines.length === 0) {
      toast.error('لم أتعرف على أصناف. اكتب كل صنف في سطر مستقل بأي صيغة، مثل: طماطم 5 كجم × 30 أو اشتريت 3 جرجير سعر الواحده 3.5 جنيه.');
    } else {
      toast.success(`تم استخراج ${result.lines.length} صنف؛ راجع البيانات قبل التسجيل.`);
    }
  };

  const parseMessage = () => {
    if (!message.trim()) {
      toast.error('الصق رسالة المورد أولًا');
      return;
    }
    applyParse(message);
  };

  const readImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('اختر ملف صورة صالحًا');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error('حجم الصورة يتجاوز 12 ميجابايت');
      return;
    }

    setImageFile(file);
    setIsReadingImage(true);
    const controller = new AbortController();
    ocrAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
    try {
      // Downscale large photos before OCR to keep the browser responsive.
      const ocrSource = await downscaleImage(file, 1600);
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('ara+eng');
      try {
        const recognizePromise = worker.recognize(ocrSource);
        const { data } = await Promise.race([
          recognizePromise,
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('تم إلغاء قراءة الصورة')));
          }),
        ]);
        setMessage(data.text);
        applyParse(data.text);
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        toast.error('استغرقت قراءة الصورة وقتًا طويلًا أو أُلغيت. جرّب صورة أوضح.');
      } else {
        const message = error instanceof Error ? error.message : 'تعذر قراءة الصورة';
        toast.error(`تعذر استخراج النص من الصورة: ${message}`);
      }
    } finally {
      window.clearTimeout(timeoutId);
      ocrAbortRef.current = null;
      setIsReadingImage(false);
    }
  };

  const cancelImageRead = () => {
    ocrAbortRef.current?.abort();
  };

  const updateLine = (id: string, update: Partial<ReviewLine>) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...update } : line));
  };

  const submit = async () => {
    if (!canSubmit) {
      toast.error('أكمل ربط الأصناف وصحح الكميات والوحدات قبل التسجيل');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await onSubmit({
        supplierName: supplierName.trim(),
        supplierId,
        purchaserName: purchaserName.trim(),
        notes: notes.trim(),
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        dueDate,
        taxAmount,
        discountAmount,
        paidAmount,
        paymentMethod,
        invoiceFile,
        lines: lines.map(({ id, itemId }) => ({
          itemId,
          quantity: convertedLines.get(id)?.quantity ?? 0,
          unitPrice: convertedLines.get(id)?.unitPrice ?? 0,
        })),
      });
      if (saved) {
        onOpenChange(false);
        setMessage('');
        setLines([]);
        setIgnoredLines([]);
        setSupplierName('');
        setSupplierId('');
        setNotes('');
        setInvoiceNumber('');
        setInvoiceDate(new Date().toISOString().slice(0, 10));
        setDueDate('');
        setTaxAmount(0);
        setDiscountAmount(0);
        setPaidAmount(0);
        setPaymentMethod('cash');
        setInvoiceFile(null);
        setImageFile(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>الإدخال السريع الذكي للمشتريات</DialogTitle>
          <DialogDescription>
            الصق رسالة المورد أو اختر صورة فاتورة. تُقرأ الصورة داخل المتصفح؛ راجع الصنف والكمية والسعر قبل تسجيل الشراء وإرساله للمخزن للاستلام. تُضاف الكميات بعد اعتماد الاستلام.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="smart-purchase-message">رسالة واتساب أو نص الفاتورة</Label>
            <Textarea
              id="smart-purchase-message"
              ref={messageRef}
              rows={8}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={'اكتب بأي صيغة — مثال:\nالمورد: مورد الخضار\nطماطم 5 كجم × 30\nأو بشكل حر:\nاشتريت 3 جرجير سعر الواحده 3.5 جنيه و نص\nاشتريت كابوتشا 12 واحده سعر الواحده 9 جنيه'}
              dir="auto"
            />
            <Button type="button" variant="outline" className="gap-2" onClick={parseMessage}>
              <Sparkles className="h-4 w-4" />
              تحليل النص
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smart-purchase-image">صورة الفاتورة</Label>
            <Input
              id="smart-purchase-image"
              ref={imageInputRef}
              type="file"
              accept="image/*"
              disabled={isReadingImage}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readImage(file);
                event.currentTarget.value = '';
              }}
            />
            <p className="text-xs text-muted-foreground">يدعم صور الفواتير بالعربية والإنجليزية. تتم المعالجة محليًا في المتصفح ولا تُرفع الصورة.</p>
            {isReadingImage ? (
              <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ استخراج النص من الصورة...
                <Button type="button" variant="ghost" size="sm" className="mr-auto" onClick={cancelImageRead}>إلغاء</Button>
              </div>
            ) : imagePreview ? (
              <div className="flex items-start gap-3 rounded-lg border p-2">
                <img src={imagePreview} alt="معاينة صورة الفاتورة" className="max-h-44 min-w-0 rounded object-contain" />
                <Button type="button" variant="ghost" size="icon" aria-label="إزالة الصورة" onClick={() => setImageFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                <Upload className="ml-2 h-4 w-4" /> اختر صورة واضحة لبدء القراءة
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="smart-purchase-supplier">المورد المسجل</Label>
            <select id="smart-purchase-supplier" className="h-10 w-full rounded-md border bg-background px-3" value={supplierId} onChange={(event) => {
              const nextSupplierId = event.target.value;
              setSupplierId(nextSupplierId);
              setSupplierName(suppliers.find((supplier) => supplier.id === nextSupplierId)?.name ?? '');
            }}>
              <option value="">مورد غير مسجل</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <Input aria-label="اسم المورد" value={supplierName} onChange={(event) => { setSupplierId(''); setSupplierName(event.target.value); }} placeholder="أو اكتب اسم المورد" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smart-purchase-purchaser">اسم من قام بالشراء</Label>
            <Input id="smart-purchase-purchaser" value={purchaserName} onChange={(event) => setPurchaserName(event.target.value)} required />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2"><Label htmlFor="smart-invoice-number">رقم الفاتورة</Label><Input id="smart-invoice-number" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="smart-invoice-date">تاريخ الفاتورة</Label><Input id="smart-invoice-date" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="smart-invoice-tax">الضريبة</Label><Input id="smart-invoice-tax" type="number" min="0" step="0.01" value={taxAmount} onChange={(event) => setTaxAmount(Number(event.target.value))} /></div>
          <div className="space-y-2"><Label htmlFor="smart-invoice-discount">الخصم</Label><Input id="smart-invoice-discount" type="number" min="0" step="0.01" value={discountAmount} onChange={(event) => setDiscountAmount(Number(event.target.value))} /></div>
          <div className="space-y-2"><Label htmlFor="smart-invoice-paid">المبلغ المدفوع</Label><Input id="smart-invoice-paid" type="number" min="0" step="0.01" value={paidAmount} readOnly className="bg-muted" /></div>
          <div className="space-y-2"><Label htmlFor="smart-payment-method">طريقة الدفع</Label><select id="smart-payment-method" className="h-10 w-full rounded-md border bg-background px-3" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as SmartPurchaseSubmission['paymentMethod'])}><option value="cash">نقدًا</option><option value="bank_transfer">تحويل بنكي</option><option value="credit">آجل</option></select></div>
          <div className="space-y-2"><Label htmlFor="smart-invoice-due">تاريخ الاستحقاق</Label><Input id="smart-invoice-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="smart-invoice-file">الفاتورة (PDF أو صورة)</Label><Input id="smart-invoice-file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)} /></div>
        </div>

        {paymentConsistencyError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{paymentConsistencyError}</p>}

        {lines.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">مراجعة الأصناف المستخرجة ({lines.length})</h3>
              <span className="text-sm text-muted-foreground">الإجمالي التقديري: {total.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="space-y-3">
              {lines.map((line) => {
                const item = selectedItems.get(line.itemId);
                const converted = convertedLines.get(line.id);
                return (
                  <div key={line.id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1.3fr),minmax(0,1.4fr),0.6fr,0.7fr,0.8fr,auto] md:items-end">
                    <div className="space-y-1">
                      <Label>النص المستخرج</Label>
                      <div className="truncate rounded-md bg-muted px-3 py-2 text-sm" dir="auto">{line.sourceName}</div>
                      {line.itemId && line.matchConfidence < 1 && (
                        <p className="text-xs font-medium text-amber-600">مطابقة تقريبية — راجع الصنف المختار قبل التسجيل</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`smart-item-${line.id}`}>صنف المخزون</Label>
                      <select
                        id={`smart-item-${line.id}`}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={line.itemId}
                        onChange={(event) => {
                          const nextItem = inventoryItems.find((candidate) => candidate.id === event.target.value);
                          updateLine(line.id, { itemId: event.target.value, confirmedUnit: unitMatchesInventory(line.sourceUnit, nextItem ?? null) });
                        }}
                      >
                        <option value="">اختر الصنف المطابق</option>
                        {inventoryItems.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.sku ? ` (${candidate.sku})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`smart-qty-${line.id}`}>الكمية {line.sourceUnit ? `(${INVENTORY_UNIT_LABELS[line.sourceUnit] ?? line.sourceUnit})` : '(وحدة الشراء)'}</Label>
                      <Input id={`smart-qty-${line.id}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`smart-price-${line.id}`}>سعر الوحدة</Label>
                      <Input id={`smart-price-${line.id}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: Number(event.target.value) })} />
                    </div>
                    <div className="space-y-1">
                      <Label>الإجمالي</Label>
                      <div className="flex h-10 items-center justify-center rounded-md border bg-muted px-3 text-sm font-semibold tabular-nums">
                        {(line.quantity * line.unitPrice).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`حذف ${line.sourceName}`} onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                    {item && converted ? (
                      <div className="space-y-2 md:col-span-6">
                        <p className="text-xs text-muted-foreground">
                          ستُسجل {converted.quantity.toLocaleString('ar-EG', { maximumFractionDigits: 3 })} {item.purchaseUnit}
                          {line.sourceUnit && line.sourceUnit !== item.purchaseUnit
                            ? ` (محوّلة تلقائيًا من ${line.sourceUnit} إلى وحدة الشراء بمعامل ${item.conversionFactor})`
                            : ' بوحدة الشراء'}
                          {' '}بسعر {converted.unitPrice.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م للوحدة
                          {' '}— إجمالي السطر {(converted.quantity * converted.unitPrice).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م.
                        </p>
                        <ProcurementPriceAlert
                          itemName={item.name}
                          currentPrice={converted.unitPrice}
                          previousPrice={item.lastPurchasePrice}
                          unit={item.purchaseUnit}
                        />
                      </div>
                    ) : item ? (
                      <p className="text-xs text-destructive md:col-span-6">
                        وحدة الفاتورة غير متوافقة مع وحدات الصنف؛ راجع وحدة الصنف أو إعداد معامل التحويل قبل التسجيل.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {ignoredLines.length > 0 ? (
          <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">أسطر لم تُحلل ({ignoredLines.length})</summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground" dir="auto">
              {ignoredLines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
            </ul>
          </details>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="smart-purchase-notes">ملاحظات (اختياري)</Label>
          <Textarea id="smart-purchase-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>إلغاء</Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSubmit || isSaving || isReadingImage}>
            {isSaving ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جارٍ التسجيل...</> : 'تسجيل الشراء وإرساله للمخزن'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
