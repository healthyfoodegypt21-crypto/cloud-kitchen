import { useEffect, useState } from 'react';
import { BadgeCheck, CalendarClock, Hourglass, Wallet, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { serverNow } from '@/lib/serverTime';
import { formatEGPCurrency } from '@/lib/utils';

type KpiData = {
  totalSpend: number;
  unpaidCommitments: number;
  averageLeadDays: number | null;
  pendingApprovals: number;
  dueSoonInvoices: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);
const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default function ProcurementKpis({ brandId }: { brandId: string }) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiData | null>(null);

  useEffect(() => {
    if (!brandId) {
      setKpis(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const client = asSupabaseLooseClient(supabase);
      const [requestResult, invoiceResult, approvalResult] = await Promise.all([
        client.from('inventory_purchase_requests')
          .select('status,created_at,purchased_at,total_amount,paid_amount')
          .eq('brand_id', brandId)
          .limit(500),
        client.from('supplier_invoices')
          .select('total_amount,paid_amount,due_date,status')
          .eq('brand_id', brandId)
          .limit(500),
        client.from('inventory_purchase_approvals')
          .select('status')
          .eq('brand_id', brandId)
          .limit(500),
      ]);
      if (cancelled) return;
      // The approvals table ships with a later migration; treat its absence as
      // "no pending approvals" instead of failing the whole KPI panel.
      const firstError = requestResult.error || invoiceResult.error;
      if (firstError) {
        toast.error(firstError.message || 'تعذر تحميل مؤشرات المشتريات');
        setKpis(null);
        setLoading(false);
        return;
      }

      const requests = records(requestResult.data);
      const invoices = records(invoiceResult.data);
      const approvals = approvalResult.error ? [] : records(approvalResult.data);

      const purchasedRequests = requests.filter((row) => String(row.purchased_at ?? ''));
      const totalSpend = purchasedRequests.reduce((sum, row) => sum + toNumber(row.total_amount), 0);

      const leadDays = purchasedRequests
        .map((row) => {
          const createdAt = new Date(String(row.created_at ?? '')).getTime();
          const purchasedAt = new Date(String(row.purchased_at ?? '')).getTime();
          if (!Number.isFinite(createdAt) || !Number.isFinite(purchasedAt) || purchasedAt < createdAt) return null;
          return (purchasedAt - createdAt) / DAY_MS;
        })
        .filter((value): value is number => value !== null);
      const averageLeadDays = leadDays.length ? leadDays.reduce((sum, value) => sum + value, 0) / leadDays.length : null;

      const unpaidCommitments = invoices
        .filter((row) => String(row.status ?? '') !== 'paid')
        .reduce((sum, row) => sum + Math.max(toNumber(row.total_amount) - toNumber(row.paid_amount), 0), 0);

      const pendingApprovals = approvals.filter((row) => String(row.status ?? '') === 'pending').length;

      const now = serverNow();
      const dueSoonLimit = now + 3 * DAY_MS;
      const dueSoonInvoices = invoices.filter((row) => {
        if (String(row.status ?? '') === 'paid') return false;
        const dueDateValue = String(row.due_date ?? '');
        if (!dueDateValue) return false;
        const dueTime = new Date(`${dueDateValue.slice(0, 10)}T23:59:59`).getTime();
        return Number.isFinite(dueTime) && dueTime >= now - DAY_MS && dueTime <= dueSoonLimit;
      }).length;

      setKpis({ totalSpend, unpaidCommitments, averageLeadDays, pendingApprovals, dueSoonInvoices });
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" dir="rtl">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-7 w-32" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!kpis) return null;

  const cards = [
    { title: 'إجمالي المصروفات', value: formatEGPCurrency(kpis.totalSpend), icon: Wallet },
    { title: 'الالتزامات غير المدفوعة', value: formatEGPCurrency(kpis.unpaidCommitments), icon: CreditCard },
    {
      title: 'متوسط زمن التنفيذ بالأيام',
      value: kpis.averageLeadDays === null ? '—' : kpis.averageLeadDays.toFixed(1),
      icon: Hourglass,
    },
    { title: 'طلبات بانتظار الاعتماد', value: String(kpis.pendingApprovals), icon: BadgeCheck },
    { title: 'فواتير مستحقة خلال 3 أيام', value: String(kpis.dueSoonInvoices), icon: CalendarClock },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" dir="rtl">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="h-4 w-4" />
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
