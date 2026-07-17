import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, PackageCheck, ShoppingBasket } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useBrands } from '@/hooks/useBrands';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type RequestLine = { id: string; itemId: string; itemName: string; quantity: string; unitCost: string; unit: string; batchNo: string; expiryDate: string };
type Request = { id: string; requestNo: string; supplierName: string; notes: string; createdAt: string; lines: RequestLine[] };
const asRows = (data: unknown) => Array.isArray(data) ? data as Record<string, unknown>[] : [];

export default function Procurement() {
  const { brands, loading: brandsLoading } = useBrands();
  const [brandId, setBrandId] = useState('');
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierByRequest, setSupplierByRequest] = useState<Record<string, string>>({});
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>({});
  const [linesByRequest, setLinesByRequest] = useState<Record<string, RequestLine[]>>({});
  useEffect(() => { if (!brandId && brands[0]) setBrandId(brands[0].id); }, [brandId, brands]);
  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    const [requestRes, linesRes, itemsRes] = await Promise.all([
      (supabase as any).from('inventory_purchase_requests').select('id,request_no,supplier_name,notes,created_at').eq('brand_id', brandId).eq('status', 'pending_procurement').order('created_at'),
      (supabase as any).from('inventory_purchase_request_lines').select('id,purchase_request_id,item_id,quantity,unit_cost,batch_no,expiry_date'),
      (supabase as any).from('items_master').select('id,name,purchase_unit').eq('brand_id', brandId),
    ]);
    const error = requestRes.error || linesRes.error || itemsRes.error;
    if (error) { toast.error(error.message || 'تعذر تحميل أوامر الشراء'); setLoading(false); return; }
    const itemMap = new Map(asRows(itemsRes.data).map(item => [String(item.id), { name: String(item.name), unit: String(item.purchase_unit) }]));
    const allLines = asRows(linesRes.data);
    const mapped = asRows(requestRes.data).map(request => ({ id: String(request.id), requestNo: String(request.request_no), supplierName: String(request.supplier_name ?? ''), notes: String(request.notes ?? ''), createdAt: String(request.created_at), lines: allLines.filter(line => String(line.purchase_request_id) === String(request.id)).map(line => ({ id: String(line.id), itemId: String(line.item_id), itemName: itemMap.get(String(line.item_id))?.name ?? 'صنف', unit: itemMap.get(String(line.item_id))?.unit ?? '', quantity: String(line.quantity), unitCost: String(line.unit_cost), batchNo: String(line.batch_no ?? ''), expiryDate: line.expiry_date ? String(line.expiry_date) : '' })) }));
    setRequests(mapped); setSupplierByRequest(Object.fromEntries(mapped.map(request => [request.id, request.supplierName]))); setLinesByRequest(Object.fromEntries(mapped.map(request => [request.id, request.lines]))); setLoading(false);
  }, [brandId]);
  useEffect(() => { void load(); }, [load]);
  const updateLine = (requestId: string, lineId: string, patch: Partial<RequestLine>) => setLinesByRequest(current => ({ ...current, [requestId]: (current[requestId] ?? []).map(line => line.id === lineId ? { ...line, ...patch } : line) }));
  const complete = async (request: Request) => {
    const lines = linesByRequest[request.id] ?? request.lines;
    if (lines.some(line => Number(line.quantity) <= 0 || Number(line.unitCost) < 0)) { toast.error('أدخل الكمية والسعر الفعليين لكل صنف'); return; }
    const { error } = await (supabase as any).rpc('inventory_complete_procurement_purchase', { _request_id: request.id, _supplier_name: supplierByRequest[request.id] ?? '', _lines: lines.map(line => ({ line_id: line.id, quantity: Number(line.quantity), unit_cost: Number(line.unitCost), batch_no: line.batchNo, expiry_date: line.expiryDate || null })), _notes: notesByRequest[request.id] ?? '' });
    if (error) { toast.error(error.message || 'تعذر تسجيل تنفيذ الشراء'); return; }
    toast.success('تم تسجيل الشراء الحقيقي وإشعار مدير المخزن للاستلام'); void load();
  };
  if (brandsLoading || loading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  return <div className="space-y-6"><header><h1 className="text-3xl font-bold">المشتريات</h1><p className="text-muted-foreground">أوامر الشراء الواردة من مدير المخزن. سجّل ما تم شراؤه فعليًا ثم أرسله للمخزن للاستلام.</p></header><div className="grid gap-4 md:grid-cols-3"><Metric title="أوامر بانتظار التنفيذ" value={String(requests.length)} /><Metric title="أصناف مطلوبة" value={String(requests.reduce((sum, request) => sum + request.lines.length, 0))} /><Metric title="الدورة التشغيلية" value="مخزن ← مشتريات ← مخزن" /></div>{requests.length === 0 ? <Card><CardContent className="p-10 text-center text-muted-foreground">لا توجد أوامر شراء بانتظار التنفيذ الآن.</CardContent></Card> : requests.map(request => <Card key={request.id}><CardHeader><CardTitle className="flex items-center gap-2"><ShoppingBasket className="h-5 w-5" />{request.requestNo}</CardTitle><CardDescription>أنشئ {new Date(request.createdAt).toLocaleString('ar-EG')} • {request.notes || 'بدون ملاحظات'}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-1"><Label>المورد الذي تم الشراء منه</Label><Input value={supplierByRequest[request.id] ?? ''} onChange={event => setSupplierByRequest(current => ({ ...current, [request.id]: event.target.value }))} placeholder="اسم المورد" /></div><div className="space-y-3">{(linesByRequest[request.id] ?? request.lines).map(line => <div key={line.id} className="rounded-xl border p-3"><strong>{line.itemName}</strong><span className="mr-2 text-sm text-muted-foreground">({line.unit})</span><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="الكمية التي تم شراؤها" value={line.quantity} onChange={value => updateLine(request.id, line.id, { quantity: value })} type="number" /><Field label="سعر الوحدة الفعلي" value={line.unitCost} onChange={value => updateLine(request.id, line.id, { unitCost: value })} type="number" /><Field label="رقم الدفعة" value={line.batchNo} onChange={value => updateLine(request.id, line.id, { batchNo: value })} /><Field label="الصلاحية" value={line.expiryDate} onChange={value => updateLine(request.id, line.id, { expiryDate: value })} type="date" /></div></div>)}</div><div className="space-y-1"><Label>ملاحظات التنفيذ</Label><Textarea value={notesByRequest[request.id] ?? ''} onChange={event => setNotesByRequest(current => ({ ...current, [request.id]: event.target.value }))} /></div><Button onClick={() => void complete(request)}><CheckCircle2 className="ml-2 h-4 w-4" />تم الشراء — إرسال للمخزن للاستلام</Button></CardContent></Card>)}</div>;
}
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <div className="space-y-1"><Label>{label}</Label><Input type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.001' : undefined} value={value} onChange={event => onChange(event.target.value)} /></div>; }
function Metric({ title, value }: { title: string; value: string }) { return <Card><CardHeader className="pb-2"><CardDescription>{title}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>; }
