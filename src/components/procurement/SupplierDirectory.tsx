import { useEffect, useState } from 'react';
import { Loader2, Pencil, Star, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';

export type SupplierDirectoryEntry = {
  id: string;
  name: string;
  phone: string;
  email: string;
  paymentTerms: string;
  leadTimeDays: number;
  notes: string;
  lastPurchaseAt: string;
  status: string;
};

type SupplierDraft = {
  id: string;
  name: string;
  phone: string;
  email: string;
  paymentTerms: string;
  leadTimeDays: string;
  rating: number;
  address: string;
  taxNumber: string;
  notes: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const emptyDraft = (): SupplierDraft => ({
  id: '', name: '', phone: '', email: '', paymentTerms: '', leadTimeDays: '0',
  rating: 0, address: '', taxNumber: '', notes: '',
});

function RatingStars({ value, onChange, disabled }: {
  value: number;
  onChange?: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled || !onChange}
          onClick={() => onChange?.(star === value ? 0 : star)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
          aria-label={`تقييم ${star} من 5`}
        >
          <Star className={`h-5 w-5 ${star <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
        </button>
      ))}
    </div>
  );
}

export default function SupplierDirectory({ brandId, suppliers, onRefresh }: {
  brandId: string;
  suppliers: SupplierDirectoryEntry[];
  onRefresh: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<SupplierDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!brandId || !suppliers.length) {
      setRatings({});
      return;
    }
    let cancelled = false;
    const loadRatings = async () => {
      const client = asSupabaseLooseClient(supabase);
      const { data, error } = await client
        .from('suppliers')
        .select('id,rating')
        .eq('brand_id', brandId)
        .limit(500);
      if (cancelled || error) return;
      const next: Record<string, number> = {};
      (Array.isArray(data) ? data : []).forEach((row) => {
        if (isRecord(row)) next[String(row.id ?? '')] = toNumber(row.rating);
      });
      setRatings(next);
    };
    void loadRatings();
    return () => {
      cancelled = true;
    };
  }, [brandId, suppliers]);

  const openEdit = async (supplier: SupplierDirectoryEntry) => {
    setDraft({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      paymentTerms: supplier.paymentTerms,
      leadTimeDays: String(supplier.leadTimeDays),
      rating: 0,
      address: '',
      taxNumber: '',
      notes: supplier.notes,
    });
    setEditOpen(true);
    const client = asSupabaseLooseClient(supabase);
    const { data, error } = await client
      .from('suppliers')
      .select('rating,address,tax_number')
      .eq('id', supplier.id)
      .maybeSingle();
    if (error || !isRecord(data)) return;
    setDraft((current) => (current.id === supplier.id ? {
      ...current,
      rating: toNumber(data.rating),
      address: String(data.address ?? ''),
      taxNumber: String(data.tax_number ?? ''),
    } : current));
  };

  const saveEdit = async () => {
    if (!draft.id) return;
    setSaving(true);
    const client = asSupabaseLooseClient(supabase);
    const { error } = await client
      .from('suppliers')
      .update({
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        payment_terms: draft.paymentTerms.trim(),
        lead_time_days: Math.max(Math.round(toNumber(draft.leadTimeDays)), 0),
        rating: Math.min(Math.max(draft.rating, 0), 5),
        address: draft.address.trim(),
        tax_number: draft.taxNumber.trim(),
        notes: draft.notes.trim(),
      })
      .eq('id', draft.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || 'تعذر حفظ بيانات المورد');
      return;
    }
    toast.success('تم حفظ بيانات المورد');
    setRatings((current) => ({ ...current, [draft.id]: Math.min(Math.max(draft.rating, 0), 5) }));
    setEditOpen(false);
    onRefresh();
  };

  const toggleStatus = async (supplier: SupplierDirectoryEntry) => {
    const nextStatus = supplier.status === 'active' ? 'inactive' : 'active';
    setTogglingId(supplier.id);
    const client = asSupabaseLooseClient(supabase);
    const { error } = await client
      .from('suppliers')
      .update({ status: nextStatus })
      .eq('id', supplier.id);
    setTogglingId('');
    if (error) {
      toast.error(error.message || 'تعذر تحديث حالة المورد');
      return;
    }
    toast.success(nextStatus === 'active' ? 'تمت إعادة تفعيل المورد' : 'تم إيقاف المورد');
    onRefresh();
  };

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          دليل الموردين
        </CardTitle>
        <CardDescription>بيانات التواصل وشروط الدفع ومدة التوريد والتقييم لكل مورد.</CardDescription>
      </CardHeader>
      <CardContent>
        {suppliers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  {['المورد', 'الهاتف', 'البريد', 'شروط الدفع', 'مدة التوريد', 'التقييم', 'آخر شراء', 'الحالة', 'الإجراء'].map((head) => (
                    <th className="p-2" key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr className="border-b" key={supplier.id}>
                    <td className="p-2 font-semibold">{supplier.name}</td>
                    <td className="p-2">{supplier.phone || '—'}</td>
                    <td className="p-2">{supplier.email || '—'}</td>
                    <td className="p-2">{supplier.paymentTerms || '—'}</td>
                    <td className="p-2">{supplier.leadTimeDays} يوم</td>
                    <td className="p-2"><RatingStars value={ratings[supplier.id] ?? 0} disabled /></td>
                    <td className="p-2 tabular-nums">{supplier.lastPurchaseAt ? new Date(supplier.lastPurchaseAt).toLocaleDateString('en-US') : '—'}</td>
                    <td className="p-2">
                      <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'}>
                        {supplier.status === 'active' ? 'نشط' : 'موقوف'}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void openEdit(supplier)}>
                          <Pencil className="ml-1 h-3 w-3" />
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={togglingId === supplier.id}
                          onClick={() => void toggleStatus(supplier)}
                        >
                          {togglingId === supplier.id ? <Loader2 className="ml-1 h-3 w-3 animate-spin" /> : null}
                          {supplier.status === 'active' ? 'إيقاف' : 'إعادة تفعيل'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا يوجد موردون للعلامة المحددة.
          </div>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المورد{draft.name ? ` · ${draft.name}` : ''}</DialogTitle>
            <DialogDescription>تحديث بيانات التواصل وشروط الدفع والتقييم والبيانات الضريبية للمورد.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="supplier-phone">الهاتف</Label>
              <Input id="supplier-phone" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-email">البريد الإلكتروني</Label>
              <Input id="supplier-email" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-payment-terms">شروط الدفع</Label>
              <Input id="supplier-payment-terms" value={draft.paymentTerms} onChange={(event) => setDraft((current) => ({ ...current, paymentTerms: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-lead-time">مدة التوريد بالأيام</Label>
              <Input id="supplier-lead-time" type="number" min="0" value={draft.leadTimeDays} onChange={(event) => setDraft((current) => ({ ...current, leadTimeDays: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-address">العنوان</Label>
              <Input id="supplier-address" value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-tax-number">الرقم الضريبي</Label>
              <Input id="supplier-tax-number" value={draft.taxNumber} onChange={(event) => setDraft((current) => ({ ...current, taxNumber: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>التقييم</Label>
              <RatingStars value={draft.rating} onChange={(rating) => setDraft((current) => ({ ...current, rating }))} disabled={saving} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="supplier-notes">ملاحظات</Label>
              <Textarea id="supplier-notes" rows={2} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
          <Button disabled={saving || !brandId} onClick={() => void saveEdit()}>
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            حفظ التعديلات
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
