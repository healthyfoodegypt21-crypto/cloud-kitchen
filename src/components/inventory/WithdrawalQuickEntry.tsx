import { useMemo, useRef, useState } from 'react';
import { ClipboardPaste, FileImage, FileSpreadsheet, Loader2, PenLine, Plus, Printer, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downscaleImage } from '@/lib/ocrImage';
import { parseWithdrawalSheetText, type WithdrawalImportLine } from '@/lib/withdrawalImport';
import type { InventoryLocation, OperationalInventoryItem } from '@/types/operationalInventory';

export type WithdrawalPlan = {
  notes: string;
  withdrawals: Array<{ itemId: string; quantity: number; locationName: string; reason: string }>;
  openings: Array<{ itemId: string; quantity: number; locationName: string; reason: string }>;
  waste: Array<{ itemId: string; quantity: number; locationName: string; reason: string }>;
  counts: Array<{ itemId: string; physicalQuantity: number; locationName: string; reason: string }>;
};

type DiscrepancyAction = 'waste' | 'count' | 'ignore';

type ReviewLine = WithdrawalImportLine & { discrepancyAction: DiscrepancyAction };

type LineStatus = 'unmatched' | 'opening' | 'auto' | 'match' | 'shortage' | 'surplus';

const STATUS_LABELS: Record<LineStatus, string> = {
  unmatched: 'صنف غير مربوط',
  opening: 'أول تسجيل — رصيد أول المدة',
  auto: 'يُحسب تلقائيًا',
  match: 'مطابق للنظام',
  shortage: 'فرق عجز — هدر محتمل',
  surplus: 'فرق زيادة — يحتاج تسوية',
};

const STATUS_STYLES: Record<LineStatus, string> = {
  unmatched: 'border-destructive/50 bg-destructive/10 text-destructive',
  opening: 'border-sky-300 bg-sky-50 text-sky-700',
  auto: 'border-muted bg-muted/40 text-muted-foreground',
  match: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  shortage: 'border-amber-300 bg-amber-50 text-amber-700',
  surplus: 'border-amber-300 bg-amber-50 text-amber-700',
};

type Props = {
  items: OperationalInventoryItem[];
  locations: InventoryLocation[];
  defaultLocation: string;
  submitting: boolean;
  initialMethod?: 'manual' | 'text' | 'image';
  onOpenPrintSheet?: () => void;
  onSubmit: (plan: WithdrawalPlan) => Promise<boolean>;
  onCancel: () => void;
};

export default function WithdrawalQuickEntry({
  items,
  locations,
  defaultLocation,
  submitting,
  initialMethod = 'manual',
  onOpenPrintSheet,
  onSubmit,
  onCancel,
}: Props) {
  const [method, setMethod] = useState<'manual' | 'text' | 'image'>(initialMethod);
  const [text, setText] = useState('');
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [ignoredLines, setIgnoredLines] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isReadingImage, setIsReadingImage] = useState(false);
  const ocrAbortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const activeItems = useMemo(() => items.filter((item) => item.status === 'active'), [items]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const analyze = (sourceText: string) => {
    const result = parseWithdrawalSheetText(sourceText, activeItems);
    if (result.lines.length === 0) {
      toast.error('لم أتعرف على سطور مسحوبات. استخدم الصيغة: اسم الصنف ثم الكمية، واختياريًا «متبقي» ثم الكمية المتبقية.');
      return;
    }
    setLines(result.lines.map((line) => ({ ...line, discrepancyAction: defaultActionFor(line, itemById.get(line.itemId)) })));
    setIgnoredLines(result.ignoredLines);
    toast.success(`تم استخراج ${result.lines.length} سطر؛ راجع الربط والكميات قبل التسجيل.`);
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

    setIsReadingImage(true);
    const controller = new AbortController();
    ocrAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const ocrSource = await downscaleImage(file, 1600);
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('ara+eng');
      try {
        const { data } = await Promise.race([
          worker.recognize(ocrSource),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('تم إلغاء قراءة الصورة')));
          }),
        ]);
        setText(data.text);
        analyze(data.text);
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        toast.error('استغرقت قراءة الصورة وقتًا طويلًا أو أُلغيت. جرّب صورة أوضح.');
      } else {
        toast.error(`تعذر استخراج النص من الصورة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
      }
    } finally {
      window.clearTimeout(timeoutId);
      ocrAbortRef.current = null;
      setIsReadingImage(false);
    }
  };

  const updateLine = (id: string, patch: Partial<ReviewLine>) => {
    setLines((current) => current.map((line) => {
      if (line.id !== id) return line;
      const next = { ...line, ...patch };
      if (patch.itemId !== undefined || patch.remainingQuantity !== undefined || patch.quantity !== undefined) {
        next.discrepancyAction = defaultActionFor(next, itemById.get(next.itemId));
      }
      return next;
    }));
  };

  const addManualLine = () => {
    setLines((current) => [...current, {
      id: `manual-${Date.now()}-${current.length}`,
      sourceName: '',
      itemId: '',
      quantity: 0,
      remainingQuantity: null,
      sourceUnit: null,
      matchConfidence: 1,
      discrepancyAction: 'ignore',
    }]);
  };

  const summary = useMemo(() => {
    const counts = { opening: 0, discrepancy: 0, unmatched: 0, ready: 0 };
    lines.forEach((line) => {
      const status = lineStatus(line, itemById.get(line.itemId));
      if (status === 'unmatched') counts.unmatched += 1;
      else if (status === 'opening') counts.opening += 1;
      else if (status === 'shortage' || status === 'surplus') counts.discrepancy += 1;
      else counts.ready += 1;
    });
    return counts;
  }, [lines, itemById]);

  const canSubmit = lines.length > 0
    && summary.unmatched === 0
    && lines.every((line) => Number.isFinite(line.quantity) && line.quantity > 0
      && (line.remainingQuantity === null || (Number.isFinite(line.remainingQuantity) && line.remainingQuantity >= 0)));

  const submit = async () => {
    if (!canSubmit) {
      toast.error('اربط كل سطر بصنف وأدخل كميات صحيحة قبل التسجيل');
      return;
    }

    const plan: WithdrawalPlan = { notes: notes.trim(), withdrawals: [], openings: [], waste: [], counts: [] };
    for (const line of lines) {
      const item = itemById.get(line.itemId);
      if (!item) continue;
      const status = lineStatus(line, item);
      const reason = line.sourceName && line.sourceName !== item.name ? `ورقة المسحوبات: ${line.sourceName}` : 'تشغيل المطبخ';

      if (status === 'opening' && line.remainingQuantity !== null) {
        plan.openings.push({
          itemId: line.itemId,
          quantity: line.remainingQuantity + line.quantity,
          locationName: defaultLocation,
          reason: 'رصيد أول المدة من ورقة المسحوبات',
        });
      }

      plan.withdrawals.push({ itemId: line.itemId, quantity: line.quantity, locationName: defaultLocation, reason });

      if ((status === 'shortage' || status === 'surplus') && line.remainingQuantity !== null) {
        const systemRemaining = item.availableQuantity - line.quantity;
        const diff = line.remainingQuantity - systemRemaining;
        if (line.discrepancyAction === 'waste' && diff < 0) {
          plan.waste.push({
            itemId: line.itemId,
            quantity: Math.abs(diff),
            locationName: defaultLocation,
            reason: `فرق ورقة المسحوبات عن رصيد النظام (${line.sourceName || item.name})`,
          });
        } else if (line.discrepancyAction === 'count') {
          plan.counts.push({
            itemId: line.itemId,
            physicalQuantity: line.remainingQuantity,
            locationName: defaultLocation,
            reason: 'تسوية جرد من ورقة المسحوبات',
          });
        }
      }
    }

    const saved = await onSubmit(plan);
    if (saved) {
      setLines([]);
      setIgnoredLines([]);
      setText('');
      setNotes('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3.5 rounded-xl border">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>تسجيل وتأكيد مسحوبات المطبخ</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            سجل الكميات المسحوبة يدويًا، أو الصق نصًا، أو ارفع صورة ورقة المسحوبات الورقية الموقعة لخصمها آليًا.
          </p>
        </div>
        {onOpenPrintSheet && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenPrintSheet}
            className="gap-1.5 shrink-0 bg-background hover:bg-muted text-xs"
          >
            <Printer className="h-3.5 w-3.5 text-slate-600" />
            <span>طباعة ورقة مسحوبات</span>
          </Button>
        )}
      </div>

      <Tabs value={method} onValueChange={(value) => setMethod(value as typeof method)}>
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl p-1">
          <TabsTrigger value="manual" className="gap-1.5 rounded-lg py-2"><PenLine className="h-4 w-4" />كتابة يدوية</TabsTrigger>
          <TabsTrigger value="text" className="gap-1.5 rounded-lg py-2"><ClipboardPaste className="h-4 w-4" />لصق نص</TabsTrigger>
          <TabsTrigger value="image" className="gap-1.5 rounded-lg py-2"><FileImage className="h-4 w-4" />صورة الورقة</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">أضف كل صنف وكميته، واكتب «المتبقي الفعلي» فقط إذا عددت الرصيد بعد السحب.</p>
          <Button type="button" variant="outline" className="w-full" onClick={addManualLine}><Plus className="ml-2 h-4 w-4" />إضافة سطر</Button>
        </TabsContent>

        <TabsContent value="text" className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label htmlFor="withdrawal-text">انسخ مسحوبات الواتساب هنا</Label>
            <Textarea
              id="withdrawal-text"
              rows={7}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={'مثال:\nطماطم 5 كجم\nبصل 3 كجم متبقي 10\nفراخ 2 - الباقي 8'}
              dir="auto"
            />
            <Button type="button" variant="outline" className="gap-2" onClick={() => analyze(text)}>
              <Sparkles className="h-4 w-4" />تحليل النص
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="image" className="space-y-3 pt-3">
          <div className="space-y-2">
            <Label htmlFor="withdrawal-image">صورة ورقة المسحوبات</Label>
            <Input
              id="withdrawal-image"
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
            <p className="text-xs text-muted-foreground">تُقرأ الصورة داخل المتصفح ولا تُرفع. اكتب كل صنف في سطر مع الكمية، و«متبقي» ثم الكمية المتبقية عند وجودها.</p>
            {isReadingImage && (
              <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> جارٍ استخراج النص من الصورة...
                <Button type="button" variant="ghost" size="sm" className="mr-auto" onClick={() => ocrAbortRef.current?.abort()}>إلغاء</Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {lines.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{lines.length} سطر</Badge>
            {summary.ready > 0 && <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700">{summary.ready} جاهز</Badge>}
            {summary.opening > 0 && <Badge className="border-sky-300 bg-sky-50 text-sky-700">{summary.opening} رصيد أول مدة</Badge>}
            {summary.discrepancy > 0 && <Badge className="border-amber-300 bg-amber-50 text-amber-700">{summary.discrepancy} فرق يحتاج مراجعة</Badge>}
            {summary.unmatched > 0 && <Badge variant="destructive">{summary.unmatched} غير مربوط</Badge>}
          </div>

          <div className="space-y-3">
            {lines.map((line) => {
              const item = itemById.get(line.itemId);
              const status = lineStatus(line, item);
              const systemRemaining = item ? item.availableQuantity - line.quantity : null;
              return (
                <div key={line.id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1.5fr),0.6fr,0.7fr,auto] md:items-end">
                  <div className="space-y-1">
                    <Label>الصنف {line.sourceName ? <span className="text-xs text-muted-foreground">({line.sourceName})</span> : null}</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={line.itemId}
                      onChange={(event) => updateLine(line.id, { itemId: event.target.value })}
                    >
                      <option value="">اختر الصنف المطابق</option>
                      {activeItems.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>{candidate.name} — المتاح {candidate.availableQuantity} {candidate.unit}</option>
                      ))}
                    </select>
                    {line.itemId && line.matchConfidence < 1 && (
                      <p className="text-xs font-medium text-amber-600">مطابقة تقريبية — راجع الصنف المختار</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>الكمية المسحوبة {item ? `(${item.unit})` : ''}</Label>
                    <Input type="number" min="0.001" step="0.001" value={line.quantity || ''} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label>المتبقي الفعلي <span className="text-xs text-muted-foreground">(اختياري)</span></Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="يُحسب تلقائيًا"
                      value={line.remainingQuantity ?? ''}
                      onChange={(event) => updateLine(line.id, { remainingQuantity: event.target.value === '' ? null : Number(event.target.value) })}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="حذف السطر" onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}>
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="flex flex-wrap items-center gap-2 md:col-span-4">
                    <Badge variant="outline" className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</Badge>
                    {(status === 'shortage' || status === 'surplus') && systemRemaining !== null && line.remainingQuantity !== null && (
                      <>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          النظام يحسب {systemRemaining.toLocaleString('en-US', { maximumFractionDigits: 3 })} {item?.unit} — الفرق {Math.abs(line.remainingQuantity - systemRemaining).toLocaleString('en-US', { maximumFractionDigits: 3 })}
                        </span>
                        <select
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                          value={line.discrepancyAction}
                          onChange={(event) => updateLine(line.id, { discrepancyAction: event.target.value as DiscrepancyAction })}
                        >
                          {status === 'shortage' && <option value="waste">تسجيل الفرق كهالك</option>}
                          <option value="count">إرسال تسوية جرد للمراجعة</option>
                          <option value="ignore">تجاهل الفرق</option>
                        </select>
                      </>
                    )}
                    {status === 'opening' && line.remainingQuantity !== null && (
                      <span className="text-xs text-muted-foreground tabular-nums">سيُسجل رصيد أول المدة {(line.remainingQuantity + line.quantity).toLocaleString('en-US', { maximumFractionDigits: 3 })} {item?.unit} ثم يُخصم السحب</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ignoredLines.length > 0 && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">أسطر لم تُحلل ({ignoredLines.length})</summary>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground" dir="auto">
            {ignoredLines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
          </ul>
        </details>
      )}

      <div className="space-y-2">
        <Label htmlFor="withdrawal-notes">ملاحظات السحب (اختياري)</Label>
        <Textarea id="withdrawal-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="مثال: تجهيز وردية الغداء المشتركة" />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>إلغاء</Button>
        <Button type="button" onClick={() => void submit()} disabled={!canSubmit || submitting || isReadingImage}>
          {submitting ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جارٍ التسجيل...</> : 'تسجيل المسحوبات'}
        </Button>
      </div>
    </div>
  );
}

function lineStatus(line: WithdrawalImportLine, item: OperationalInventoryItem | undefined): LineStatus {
  if (!item) return 'unmatched';
  if (line.remainingQuantity === null) return 'auto';
  if (item.balances.length === 0) return 'opening';
  const systemRemaining = item.availableQuantity - line.quantity;
  const diff = line.remainingQuantity - systemRemaining;
  if (Math.abs(diff) <= 0.001) return 'match';
  return diff < 0 ? 'shortage' : 'surplus';
}

function defaultActionFor(line: WithdrawalImportLine, item: OperationalInventoryItem | undefined): DiscrepancyAction {
  const status = lineStatus(line, item);
  if (status === 'shortage') return 'waste';
  if (status === 'surplus') return 'count';
  return 'ignore';
}
