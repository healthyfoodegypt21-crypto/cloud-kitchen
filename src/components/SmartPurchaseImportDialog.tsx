import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryUnit } from '@/types/inventory';
import { INVENTORY_UNIT_LABELS } from '@/types/inventory';
import { normalizePurchaseUnit, parseSmartPurchaseMessage, type SmartPurchaseCatalogItem, type SmartPurchaseLine } from '@/lib/smartPurchaseImport';

export type SmartPurchaseSubmission = {
  supplierName: string;
  purchaserName: string;
  notes: string;
  lines: Array<{ itemId: string; quantity: number; unitPrice: number }>;
};

type Props = {
  open: boolean;
  inventoryItems: Array<SmartPurchaseCatalogItem & { unit: string }>;
  defaultPurchaserName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (submission: SmartPurchaseSubmission) => Promise<boolean>;
};

type ReviewLine = SmartPurchaseLine & { confirmedUnit: boolean };

function unitMatchesInventory(sourceUnit: InventoryUnit | null, item: { unit: string } | undefined) {
  return !sourceUnit || sourceUnit === normalizePurchaseUnit(item?.unit);
}

export default function SmartPurchaseImportDialog({
  open,
  inventoryItems,
  defaultPurchaserName,
  onOpenChange,
  onSubmit,
}: Props) {
  const [message, setMessage] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [purchaserName, setPurchaserName] = useState(defaultPurchaserName);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [ignoredLines, setIgnoredLines] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState('');
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const selectedItems = useMemo(
    () => new Map(inventoryItems.map((item) => [item.id, item])),
    [inventoryItems],
  );
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const canSubmit = lines.length > 0
    && Boolean(purchaserName.trim())
    && lines.every((line) => {
      const item = selectedItems.get(line.itemId);
      return Boolean(item)
        && line.quantity > 0
        && line.unitPrice >= 0
        && (unitMatchesInventory(line.sourceUnit, item) || line.confirmedUnit);
    });

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
    }
  }, [defaultPurchaserName, open]);

  const applyParse = (text: string) => {
    const result = parseSmartPurchaseMessage(text, inventoryItems);
    setLines(result.lines.map((line) => ({
      ...line,
      confirmedUnit: unitMatchesInventory(line.sourceUnit, inventoryItems.find((item) => item.id === line.itemId)),
    })));
    setIgnoredLines(result.ignoredLines);
    if (result.supplierName) {
      setSupplierName(result.supplierName);
    }
    if (result.lines.length === 0) {
      toast.error('لم أتعرف على أصناف. استخدم الصيغة: اسم الصنف، الكمية، الوحدة، سعر الوحدة.');
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
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('ara+eng');
      try {
        const { data } = await worker.recognize(file);
        setMessage(data.text);
        applyParse(data.text);
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر قراءة الصورة';
      toast.error(`تعذر استخراج النص من الصورة: ${message}`);
    } finally {
      setIsReadingImage(false);
    }
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
        purchaserName: purchaserName.trim(),
        notes: notes.trim(),
        lines: lines.map(({ itemId, quantity, unitPrice }) => ({ itemId, quantity, unitPrice })),
      });
      if (saved) {
        onOpenChange(false);
        setMessage('');
        setLines([]);
        setIgnoredLines([]);
        setSupplierName('');
        setNotes('');
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
              rows={8}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={'مثال:\nالمورد: مورد الخضار\nطماطم 5 كجم × 30\nبصل 3 كجم × 25'}
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
            <Label htmlFor="smart-purchase-supplier">المورد</Label>
            <Input id="smart-purchase-supplier" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smart-purchase-purchaser">اسم من قام بالشراء</Label>
            <Input id="smart-purchase-purchaser" value={purchaserName} onChange={(event) => setPurchaserName(event.target.value)} required />
          </div>
        </div>

        {lines.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">مراجعة الأصناف المستخرجة ({lines.length})</h3>
              <span className="text-sm text-muted-foreground">الإجمالي التقديري: {total.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="space-y-3">
              {lines.map((line) => {
                const item = selectedItems.get(line.itemId);
                const unitMismatch = !unitMatchesInventory(line.sourceUnit, item);
                return (
                  <div key={line.id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1.4fr),minmax(0,1.5fr),0.7fr,0.8fr,auto] md:items-end">
                    <div className="space-y-1">
                      <Label>النص المستخرج</Label>
                      <div className="truncate rounded-md bg-muted px-3 py-2 text-sm" dir="auto">{line.sourceName}</div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`smart-item-${line.id}`}>صنف المخزون</Label>
                      <select
                        id={`smart-item-${line.id}`}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={line.itemId}
                        onChange={(event) => {
                          const nextItem = inventoryItems.find((candidate) => candidate.id === event.target.value);
                          updateLine(line.id, { itemId: event.target.value, confirmedUnit: unitMatchesInventory(line.sourceUnit, nextItem) });
                        }}
                      >
                        <option value="">اختر الصنف المطابق</option>
                        {inventoryItems.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.sku ? ` (${candidate.sku})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`smart-qty-${line.id}`}>الكمية {item ? `(${INVENTORY_UNIT_LABELS[item.unit as InventoryUnit] ?? item.unit})` : ''}</Label>
                      <Input id={`smart-qty-${line.id}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`smart-price-${line.id}`}>سعر الوحدة</Label>
                      <Input id={`smart-price-${line.id}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: Number(event.target.value) })} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`حذف ${line.sourceName}`} onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                    {unitMismatch ? (
                      <label className="flex items-start gap-2 text-sm text-amber-700 md:col-span-5">
                        <input type="checkbox" checked={line.confirmedUnit} onChange={(event) => updateLine(line.id, { confirmedUnit: event.target.checked })} />
                        وحدة المصدر ({line.sourceUnit}) تختلف عن وحدة المخزون؛ تحققت من تحويل الكمية إلى وحدة المخزون.
                      </label>
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
