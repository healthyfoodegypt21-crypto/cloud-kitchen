import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getUnitLabel } from '@/lib/procurementUnits';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { formatEGPCurrency } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';

type ReceiptLine = {
  id: string;
  itemName: string;
  unit: string;
  usageUnit: string;
  conversionFactor: number;
  quantity: number;
  receivedQuantity: number;
  rejectedQuantity: number;
  unitCost: number;
  locationName: string;
  batchNo: string;
  expiryDate: string;
  rejectionReason: string;
};

type ReceiptRequest = {
  id: string;
  requestNo: string;
  supplierName: string;
  purchaserName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: string;
  invoiceStoragePath: string;
  notes: string;
  lines: ReceiptLine[];
};

type Props = {
  brandId: string;
  canManage: boolean;
};

const records = (value: unknown) => Array.isArray(value) ? value.filter(isRecord) : [];
const numeric = (value: unknown) => Number(value ?? 0);

export default function PurchaseReceiptPanel({ brandId, canManage }: Props) {
  const { displayName, user } = useAuth();
  const [requests, setRequests] = useState<ReceiptRequest[]>([]);
  const [receiver, setReceiver] = useState('');

  useEffect(() => {
    const fallbackName = displayName || user?.email || '';
    if (fallbackName) {
      setReceiver((prev) => prev || fallbackName);
    }
  }, [displayName, user?.email]);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, Record<string, Partial<ReceiptLine>>>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState('');

  const load = useCallback(async () => {
    if (!brandId) {
      setRequests([]);
      return;
    }

    setLoading(true);
    const client = asSupabaseLooseClient(supabase);
    const { data: requestData, error: requestError } = await client
      .from('inventory_purchase_requests')
      .select('id,request_no,supplier_name,purchaser_name,invoice_number,invoice_date,total_amount,paid_amount,payment_method,invoice_storage_path,notes')
      .eq('brand_id', brandId)
      .eq('status', 'purchased_pending_receipt')
      .order('created_at', { ascending: true })
      .limit(100);

    if (requestError) {
      toast.error(requestError.message || 'تعذر تحميل مشتريات بانتظار الاستلام');
      setLoading(false);
      return;
    }

    const requestRows = records(requestData);
    const requestIds = requestRows.map((request) => String(request.id));
    if (requestIds.length === 0) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const { data: lineData, error: lineError } = await client
      .from('inventory_purchase_request_lines')
      .select('id,purchase_request_id,item_id,quantity,unit_cost,location_name,batch_no,expiry_date,received_quantity,rejected_quantity,rejection_reason')
      .in('purchase_request_id', requestIds);
    const lineRows = records(lineData);
    const itemIds = Array.from(new Set(lineRows.map((line) => String(line.item_id))));
    const { data: itemData, error: itemError } = await client
      .from('items_master')
      .select('id,name,purchase_unit,usage_unit,conversion_factor')
      .in('id', itemIds);
    const firstError = lineError || itemError;
    if (firstError) {
      toast.error(firstError.message || 'تعذر تحميل بنود الاستلام');
      setLoading(false);
      return;
    }

    const itemMap = new Map(records(itemData).map((item) => [String(item.id), item]));
    const nextRequests = requestRows.map((request) => {
      const reqLines = lineRows.filter((line) => String(line.purchase_request_id) === String(request.id)).map((line) => {
        const item = itemMap.get(String(line.item_id));
        const remaining = Math.max(
          numeric(line.quantity) - numeric(line.received_quantity) - numeric(line.rejected_quantity),
          0,
        );
        return {
          id: String(line.id),
          itemName: String(item?.name ?? 'صنف'),
          unit: String(item?.purchase_unit ?? ''),
          usageUnit: String(item?.usage_unit ?? item?.purchase_unit ?? ''),
          conversionFactor: numeric(item?.conversion_factor ?? 1) || 1,
          quantity: numeric(line.quantity),
          receivedQuantity: numeric(line.received_quantity),
          rejectedQuantity: numeric(line.rejected_quantity),
          unitCost: numeric(line.unit_cost),
          locationName: String(line.location_name ?? 'main'),
          batchNo: String(line.batch_no ?? ''),
          expiryDate: String(line.expiry_date ?? ''),
          rejectionReason: String(line.rejection_reason ?? ''),
          remainingQuantity: remaining,
        };
      });
      const computedSubtotal = reqLines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
      return {
        id: String(request.id),
        requestNo: String(request.request_no),
        supplierName: String(request.supplier_name ?? ''),
        purchaserName: String(request.purchaser_name ?? ''),
        invoiceNumber: String(request.invoice_number ?? ''),
        invoiceDate: String(request.invoice_date ?? ''),
        totalAmount: numeric(request.total_amount) || computedSubtotal,
        paidAmount: numeric(request.paid_amount),
        paymentMethod: String(request.payment_method ?? ''),
        invoiceStoragePath: String(request.invoice_storage_path ?? ''),
        notes: String(request.notes ?? ''),
        lines: reqLines,
      };
    });

    setRequests(nextRequests);
    setDrafts((current) => Object.fromEntries(nextRequests.map((request) => [
      request.id,
      Object.fromEntries(request.lines.map((line) => [
        line.id,
        current[request.id]?.[line.id] ?? {
          receivedQuantity: line.remainingQuantity,
          rejectedQuantity: 0,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          rejectionReason: '',
        },
      ])),
    ])));
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    void load();
  }, [load]);

  useSupabaseRealtimeRefresh({
    enabled: Boolean(brandId),
    channelName: `purchase-receipts-${brandId}`,
    tables: [
      { table: 'inventory_purchase_requests', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_purchase_request_lines' },
    ],
    onRefresh: load,
  });

  const updateLine = (requestId: string, lineId: string, patch: Partial<ReceiptLine>) => {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...current[requestId],
        [lineId]: { ...current[requestId]?.[lineId], ...patch },
      },
    }));
  };

  const receive = async (request: ReceiptRequest) => {
    if (!receiver.trim()) {
      toast.error('أدخل اسم مسؤول الاستلام');
      return;
    }

    const lines = request.lines.map((line) => {
      const draft = drafts[request.id]?.[line.id] ?? {};
      return {
        line_id: line.id,
        received_quantity: numeric(draft.receivedQuantity),
        rejected_quantity: numeric(draft.rejectedQuantity),
        rejection_reason: draft.rejectionReason ?? '',
        batch_no: draft.batchNo ?? '',
        expiry_date: draft.expiryDate || null,
        location_name: line.locationName,
      };
    }).filter((line) => line.received_quantity > 0 || line.rejected_quantity > 0);

    if (lines.length === 0) {
      toast.error('أدخل كمية مستلمة أو مرفوضة لبند واحد على الأقل');
      return;
    }

    // Client-side guard: accepted + rejected can never exceed the remaining
    // quantity, and every rejected quantity needs a recorded reason.
    for (const line of lines) {
      const source = request.lines.find((entry) => entry.id === line.line_id);
      if (!source) continue;
      const remaining = Math.max(source.quantity - source.receivedQuantity - source.rejectedQuantity, 0);
      if (line.received_quantity < 0 || line.rejected_quantity < 0 || line.received_quantity + line.rejected_quantity > remaining) {
        toast.error(`الكمية المدخلة لبند "${source.itemName}" تتجاوز المتبقي (${remaining})`);
        return;
      }
      if (line.rejected_quantity > 0 && !line.rejection_reason.trim()) {
        toast.error(`اكتب سبب رفض الكمية المرفوضة لبند "${source.itemName}"`);
        return;
      }
    }

    setSavingId(request.id);
    const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_receive_purchase_request_v2', {
      _request_id: request.id,
      _lines: lines,
      _received_by: receiver.trim(),
      _receipt_date: receiptDate,
      _notes: notes[request.id] ?? '',
    });
    setSavingId('');
    if (error) {
      toast.error(error.message || 'تعذر اعتماد الاستلام');
      return;
    }

    toast.success('تم تسجيل الاستلام الجزئي أو الكلي وتحديث المخزون');
    setDrafts({});
    await load();
  };

  const openInvoiceAttachment = async (storagePath: string) => {
    const { data, error } = await supabase.storage.from('supplier-invoices').createSignedUrl(storagePath, 120);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || 'تعذر فتح صورة الفاتورة');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (!canManage || (!loading && requests.length === 0)) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">استلام المشتريات ومراجعة الجودة</h2>
        <p className="text-sm text-muted-foreground">راجع الأصناف والكميات والأسعار المسجلة، ثم اعتمد المقبول والمرفوض لإضافة الكميات إلى رصيد المخزون.</p>
      </div>
      {loading ? <div className="grid min-h-24 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : null}
      {requests.map((request) => (
        <Card key={request.id} className="border-sky-300/90">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {request.requestNo} · {request.supplierName || 'مشتريات نقدية / مورد غير محدد'}
                </CardTitle>
                <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {request.purchaserName && <span>القائم بالشراء: <strong>{request.purchaserName}</strong></span>}
                  {request.invoiceNumber && <span>· فاتورة #{request.invoiceNumber}</span>}
                  {request.invoiceDate && <span>· التاريخ: {request.invoiceDate}</span>}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-600 text-white text-xs font-bold tabular-nums">
                  إجمالي الفاتورة: {formatEGPCurrency(request.totalAmount)}
                </Badge>
                {request.invoiceStoragePath && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => void openInvoiceAttachment(request.invoiceStoragePath)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    عرض الفاتورة
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {request.lines.map((line) => {
              const draft = drafts[request.id]?.[line.id] ?? {};
              const remaining = Math.max(line.quantity - line.receivedQuantity - line.rejectedQuantity, 0);
              const unitLbl = getUnitLabel(line.unit);
              const usageLbl = getUnitLabel(line.usageUnit);
              const lineTotal = Math.round(line.quantity * line.unitCost * 100) / 100;
              return (
                <div key={line.id} className="grid gap-3 rounded-xl border bg-slate-50/50 p-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="md:col-span-2 xl:col-span-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                    <div>
                      <strong className="text-sm">{line.itemName}</strong>
                      <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        الكمية المشتراة: <strong>{line.quantity} {unitLbl}</strong>
                        {line.conversionFactor !== 1 && line.usageUnit !== line.unit
                          ? ` (= ${Math.round(line.quantity * line.conversionFactor * 1000) / 1000} ${usageLbl} بالمخزن)`
                          : ''}
                        {' '}· استُلم {line.receivedQuantity} · رُفض {line.rejectedQuantity} · المتبقي {remaining}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                      <span className="rounded-md border bg-white px-2.5 py-1 font-semibold text-slate-700">
                        سعر الـ {unitLbl}: {formatEGPCurrency(line.unitCost)}
                      </span>
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-900">
                        إجمالي الصنف: {formatEGPCurrency(lineTotal)}
                      </span>
                    </div>
                  </div>
                  <NumberField label={`المقبول (${unitLbl})`} value={String(draft.receivedQuantity ?? '')} max={remaining} onChange={(value) => updateLine(request.id, line.id, { receivedQuantity: Number(value) })} />
                  <NumberField label={`المرفوض (${unitLbl})`} value={String(draft.rejectedQuantity ?? '0')} max={remaining} onChange={(value) => updateLine(request.id, line.id, { rejectedQuantity: Number(value) })} />
                  <div className="space-y-1">
                    <Label htmlFor={`receipt-batch-${line.id}`}>رقم الدفعة</Label>
                    <Input id={`receipt-batch-${line.id}`} value={String(draft.batchNo ?? '')} onChange={(event) => updateLine(request.id, line.id, { batchNo: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`receipt-expiry-${line.id}`}>الصلاحية</Label>
                    <Input id={`receipt-expiry-${line.id}`} type="date" value={String(draft.expiryDate ?? '')} onChange={(event) => updateLine(request.id, line.id, { expiryDate: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`receipt-reason-${line.id}`}>سبب الرفض</Label>
                    <Input id={`receipt-reason-${line.id}`} value={String(draft.rejectionReason ?? '')} onChange={(event) => updateLine(request.id, line.id, { rejectionReason: event.target.value })} />
                  </div>
                </div>
              );
            })}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`receipt-by-${request.id}`}>مسؤول الاستلام *</Label>
                <Input id={`receipt-by-${request.id}`} value={receiver} onChange={(event) => setReceiver(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`receipt-date-${request.id}`}>تاريخ الاستلام</Label>
                <Input id={`receipt-date-${request.id}`} type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} />
              </div>
            </div>
            <Textarea placeholder="ملاحظات الاستلام" value={notes[request.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} />
            <Button disabled={savingId === request.id} onClick={() => void receive(request)}>
              {savingId === request.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="ml-2 h-4 w-4" />}
              حفظ الاستلام
            </Button>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function NumberField({ label, value, max, onChange }: { label: string; value: string; max: number; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" min="0" max={max} step="0.001" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
