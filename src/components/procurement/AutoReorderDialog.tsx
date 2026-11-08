import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { formatEGPCurrency } from '@/lib/utils';

export type AutoReorderLine = {
  itemId: string;
  quantity: number;
  unitCost: number;
  supplierId: string;
};

type ReorderSuggestionRow = {
  itemId: string;
  itemName: string;
  itemCode: string;
  purchaseUnit: string;
  onHand: number;
  minStock: number;
  leadTimeDays: number;
  suggestedQuantity: number;
  estimatedUnitCost: number;
  preferredSupplierId: string;
  preferredSupplierName: string;
  selected: boolean;
  quantity: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);
const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function AutoReorderDialog({ open, onOpenChange, brandId, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  onSubmit: (lines: AutoReorderLine[], notes: string) => Promise<boolean>;
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rows, setRows] = useState<ReorderSuggestionRow[]>([]);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    setErrorMessage('');
    const client = asSupabaseLooseClient(supabase);
    const { data, error } = await client.rpc('inventory_suggest_reorder', { _brand_id: brandId });
    if (error) {
      setRows([]);
      setErrorMessage(error.message || 'تعذر تحميل اقتراحات إعادة الطلب');
      setLoading(false);
      return;
    }
    setRows(records(data).map((row) => {
      const suggested = toNumber(row.suggested_quantity);
      return {
        itemId: String(row.item_id ?? ''),
        itemName: String(row.item_name ?? ''),
        itemCode: String(row.item_code ?? ''),
        purchaseUnit: String(row.purchase_unit ?? ''),
        onHand: toNumber(row.on_hand),
        minStock: toNumber(row.min_stock),
        leadTimeDays: toNumber(row.lead_time_days),
        suggestedQuantity: suggested,
        estimatedUnitCost: toNumber(row.estimated_unit_cost),
        preferredSupplierId: String(row.preferred_supplier_id ?? ''),
        preferredSupplierName: String(row.preferred_supplier_name ?? ''),
        selected: suggested > 0,
        quantity: suggested > 0 ? String(suggested) : '',
      };
    }).filter((row) => row.itemId));
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    if (open && brandId) {
      setNotes('');
      void load();
    }
    if (!open) {
      setRows([]);
      setErrorMessage('');
    }
  }, [open, brandId, load]);

  const updateRow = (itemId: string, patch: Partial<Pick<ReorderSuggestionRow, 'selected' | 'quantity'>>) => {
    setRows((current) => current.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)));
  };

  const selectedRows = useMemo(() => rows.filter((row) => row.selected && toNumber(row.quantity) > 0), [rows]);
  const totalEstimated = useMemo(
    () => selectedRows.reduce((sum, row) => sum + toNumber(row.quantity) * row.estimatedUnitCost, 0),
    [selectedRows],
  );

  const handleSubmit = async () => {
    if (!selectedRows.length) {
      toast.error('اختر صنفًا واحدًا على الأقل بكمية أكبر من صفر');
      return;
    }
    setSubmitting(true);
    const lines: AutoReorderLine[] = selectedRows.map((row) => ({
      itemId: row.itemId,
      quantity: toNumber(row.quantity),
      unitCost: row.estimatedUnitCost,
      supplierId: row.preferredSupplierId,
    }));
    try {
      const success = await onSubmit(lines, notes.trim());
      if (success) {
        toast.success('تم إنشاء أمر الشراء من الاقتراحات');
        onOpenChange(false);
      } else {
        toast.error('تعذر إنشاء أمر الشراء');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء أمر الشراء');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>اقتراحات إعادة الطلب التلقائي</DialogTitle>
          <DialogDescription>أصناف وصلت لحد الطلب أو أقل؛ راجع الكميات المقترحة ثم أنشئ أمر الشراء.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            جارٍ تحميل الاقتراحات...
          </div>
        ) : errorMessage ? (
          <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
            <p className="font-semibold">تعذر تحميل اقتراحات إعادة الطلب</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <p className="text-xs text-muted-foreground">تأكد من تطبيق ترحيل قاعدة البيانات الخاص بتحسينات المشتريات ثم أعد المحاولة.</p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCcw className="ml-2 h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  {['', 'الصنف', 'المتاح', 'حد الطلب', 'المورد المفضل', 'التكلفة التقديرية', 'الكمية', 'الإجمالي'].map((head) => (
                    <th className="p-2" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const quantity = toNumber(row.quantity);
                  return (
                    <tr className="border-b" key={row.itemId}>
                      <td className="p-2">
                        <Checkbox
                          checked={row.selected}
                          onCheckedChange={(checked) => updateRow(row.itemId, { selected: checked === true })}
                          aria-label={`اختيار ${row.itemName}`}
                        />
                      </td>
                      <td className="p-2">
                        <div className="font-semibold">{row.itemName}</div>
                        <div className="text-xs text-muted-foreground">{row.itemCode || '—'} · {row.purchaseUnit || '—'}</div>
                      </td>
                      <td className="p-2">{row.onHand}</td>
                      <td className="p-2">{row.minStock}</td>
                      <td className="p-2">
                        <div>{row.preferredSupplierName || '—'}</div>
                        {row.leadTimeDays > 0 ? <div className="text-xs text-muted-foreground">التوريد خلال {row.leadTimeDays} يوم</div> : null}
                      </td>
                      <td className="p-2">{formatEGPCurrency(row.estimatedUnitCost)}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          className="w-28"
                          value={row.quantity}
                          onChange={(event) => updateRow(row.itemId, { quantity: event.target.value })}
                          placeholder={row.suggestedQuantity > 0 ? String(row.suggestedQuantity) : '0'}
                        />
                      </td>
                      <td className="p-2 font-semibold">{row.selected && quantity > 0 ? formatEGPCurrency(quantity * row.estimatedUnitCost) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا توجد أصناف تحتاج إعادة طلب حاليًا لهذه العلامة.
          </div>
        )}

        {!loading && !errorMessage && rows.length ? (
          <div className="space-y-3 border-t pt-3">
            <div className="space-y-1">
              <Label htmlFor="auto-reorder-notes">ملاحظات أمر الشراء</Label>
              <Textarea
                id="auto-reorder-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="ملاحظات اختيارية تظهر على أمر الشراء"
                rows={2}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-muted-foreground">إجمالي القيمة التقديرية: </span>
                <span className="font-bold">{formatEGPCurrency(totalEstimated)}</span>
                <span className="mr-2 text-xs text-muted-foreground">({selectedRows.length} صنف)</span>
              </div>
              <Button disabled={submitting || !selectedRows.length} onClick={() => void handleSubmit()}>
                {submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="ml-2 h-4 w-4" />}
                إنشاء أمر الشراء
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
