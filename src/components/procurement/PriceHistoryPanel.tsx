import { useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { formatEGPCurrency } from '@/lib/utils';

export type PriceHistoryItem = {
  id: string;
  name: string;
  purchaseUnit: string;
};

type PriceHistoryEntry = {
  id: string;
  supplierName: string;
  unitPrice: number;
  quantity: number;
  purchasedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);
const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ar-EG');
};

export default function PriceHistoryPanel({ brandId, items }: {
  brandId: string;
  items: PriceHistoryItem[];
}) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<PriceHistoryEntry[]>([]);

  useEffect(() => {
    if (!selectedItemId || !brandId) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const client = asSupabaseLooseClient(supabase);
      const { data, error } = await client
        .from('inventory_price_history')
        .select('id,supplier_name,unit_price,quantity,purchased_at')
        .eq('brand_id', brandId)
        .eq('item_id', selectedItemId)
        .order('purchased_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        // The price-history table ships with a later migration; show an empty
        // state instead of an error toast until it is applied.
        setEntries([]);
        setLoading(false);
        return;
      }
      setEntries(records(data).map((row) => ({
        id: String(row.id ?? ''),
        supplierName: String(row.supplier_name ?? ''),
        unitPrice: toNumber(row.unit_price),
        quantity: toNumber(row.quantity),
        purchasedAt: String(row.purchased_at ?? ''),
      })));
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [brandId, selectedItemId]);

  const stats = useMemo(() => {
    if (!entries.length) return null;
    const prices = entries.map((entry) => entry.unitPrice);
    const sum = prices.reduce((total, price) => total + price, 0);
    return {
      last: prices[0],
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: sum / prices.length,
      count: entries.length,
    };
  }, [entries]);

  const spikeIds = useMemo(() => {
    const spikes = new Set<string>();
    entries.forEach((entry) => {
      const others = entries.filter((candidate) => candidate.id !== entry.id).map((candidate) => candidate.unitPrice);
      if (!others.length) return;
      const averageOthers = others.reduce((total, price) => total + price, 0) / others.length;
      if (averageOthers > 0 && entry.unitPrice > averageOthers * 1.1) {
        spikes.add(entry.id);
      }
    });
    return spikes;
  }, [entries]);

  const sparkline = useMemo(() => {
    const chronological = [...entries].reverse();
    if (chronological.length < 2) return null;
    const prices = chronological.map((entry) => entry.unitPrice);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const width = 100;
    const height = 32;
    const span = max - min;
    const points = chronological.map((entry, index) => {
      const x = (index / (chronological.length - 1)) * width;
      const y = span === 0 ? height / 2 : height - ((entry.unitPrice - min) / span) * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    return { points, width, height };
  }, [entries]);

  const selectedItem = items.find((item) => item.id === selectedItemId);

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          سجل أسعار الشراء
        </CardTitle>
        <CardDescription>تتبع تطور سعر الصنف عبر المشتريات السابقة ورصد الارتفاعات المفاجئة.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-1">
          <Label>الصنف</Label>
          <Select value={selectedItemId} onValueChange={setSelectedItemId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر صنفًا لعرض سجل الأسعار" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}{item.purchaseUnit ? ` (${item.purchaseUnit})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            جارٍ تحميل سجل الأسعار...
          </div>
        ) : !selectedItemId ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            اختر صنفًا من القائمة لعرض سجل الأسعار.
          </div>
        ) : !entries.length ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا يوجد سجل أسعار لهذا الصنف بعد{selectedItem ? ` (${selectedItem.name})` : ''}.
          </div>
        ) : (
          <>
            {stats ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: 'آخر سعر', value: formatEGPCurrency(stats.last) },
                  { label: 'أقل سعر', value: formatEGPCurrency(stats.min) },
                  { label: 'متوسط السعر', value: formatEGPCurrency(stats.avg) },
                  { label: 'أعلى سعر', value: formatEGPCurrency(stats.max) },
                  { label: 'عدد المشتريات', value: String(stats.count) },
                ].map((stat) => (
                  <div className="rounded-lg border p-3 text-center" key={stat.label}>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                    <div className="mt-1 font-bold">{stat.value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {sparkline ? (
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-xs text-muted-foreground">تطور السعر عبر الزمن (من الأقدم إلى الأحدث)</div>
                <svg viewBox={`0 0 ${sparkline.width} ${sparkline.height}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="مخطط تطور السعر">
                  <polyline points={sparkline.points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-600" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    {['التاريخ', 'المورد', 'الكمية', 'سعر الوحدة'].map((head) => (
                      <th className="p-2" key={head}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr className={`border-b ${spikeIds.has(entry.id) ? 'bg-amber-50' : ''}`} key={entry.id}>
                      <td className="p-2">{formatDate(entry.purchasedAt)}</td>
                      <td className="p-2">{entry.supplierName || '—'}</td>
                      <td className="p-2">{entry.quantity}</td>
                      <td className="p-2 font-semibold">
                        {formatEGPCurrency(entry.unitPrice)}
                        {spikeIds.has(entry.id) ? <span className="mr-2 text-xs text-amber-700">ارتفاع مفاجئ</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
