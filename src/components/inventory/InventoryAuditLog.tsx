import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { supabase } from '@/integrations/supabase/client';
import { formatEGPCurrency } from '@/lib/utils';

type Props = {
  brandId: string;
};

type AuditEntry = {
  id: string;
  action: string;
  actorName: string;
  locationName: string;
  quantity: number;
  unitCost: number;
  movementValue: number;
  reason: string;
  referenceTable: string;
  createdAt: string;
  itemId: string;
  itemName: string;
};

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  purchase_receipt: 'استلام شراء',
  production_consumption: 'صرف إنتاج',
  waste: 'هالك',
  adjustment: 'تسوية جرد',
};

const records = (value: unknown) => Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null) : [];
const numeric = (value: unknown) => Number(value ?? 0);

export default function InventoryAuditLog({ brandId }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (offset: number, append: boolean) => {
    if (!brandId) {
      setEntries([]);
      setHasMore(false);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    const client = asSupabaseLooseClient(supabase);
    const { data, error } = await client
      .from('inventory_audit_log')
      .select('id,action,actor_name,location_name,quantity,unit_cost,movement_value,reason,reference_table,created_at,item_id')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      // The audit log ships with a later migration; show an empty state instead
      // of an error toast until it is applied.
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const rows = records(data);
    const itemIds = Array.from(new Set(rows.map((row) => String(row.item_id ?? '')).filter(Boolean)));
    const itemNames = new Map<string, string>();
    if (itemIds.length > 0) {
      const { data: itemData, error: itemError } = await client
        .from('items_master')
        .select('id,name')
        .in('id', itemIds);
      if (itemError) {
        toast.error(itemError.message || 'تعذر تحميل أسماء الأصناف');
      } else {
        for (const item of records(itemData)) {
          itemNames.set(String(item.id), String(item.name ?? ''));
        }
      }
    }

    const mapped: AuditEntry[] = rows.map((row) => {
      const itemId = String(row.item_id ?? '');
      return {
        id: String(row.id),
        action: String(row.action ?? ''),
        actorName: String(row.actor_name ?? ''),
        locationName: String(row.location_name ?? ''),
        quantity: numeric(row.quantity),
        unitCost: numeric(row.unit_cost),
        movementValue: numeric(row.movement_value),
        reason: String(row.reason ?? ''),
        referenceTable: String(row.reference_table ?? ''),
        createdAt: String(row.created_at ?? ''),
        itemId,
        itemName: itemNames.get(itemId) ?? 'صنف غير معروف',
      };
    });

    setEntries((current) => append ? [...current, ...mapped] : mapped);
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
    setLoadingMore(false);
  }, [brandId]);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
      const day = entry.createdAt.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (term) {
        const haystack = `${entry.itemName} ${entry.actorName} ${entry.reason}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [entries, search, actionFilter, dateFrom, dateTo]);

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <section dir="rtl" className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold"><ScrollText className="h-5 w-5" /> سجل حركات المخزون</h2>
        <p className="text-sm text-muted-foreground">تتبع كل حركة استلام وصرف وهالك وتسوية على الأصناف.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">الفلاتر</CardTitle>
          <CardDescription>ابحث بالصنف أو المستخدم أو السبب، وصفِّ حسب نوع الحركة والتاريخ.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="audit-search">بحث</Label>
            <Input id="audit-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اسم الصنف / المستخدم / السبب" />
          </div>
          <div className="space-y-1">
            <Label>نوع الحركة</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="purchase_receipt">استلام شراء</SelectItem>
                <SelectItem value="production_consumption">صرف إنتاج</SelectItem>
                <SelectItem value="waste">هالك</SelectItem>
                <SelectItem value="adjustment">تسوية جرد</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="audit-from">من تاريخ</Label>
              <Input id="audit-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit-to">إلى تاريخ</Label>
              <Input id="audit-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="grid min-h-32 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">لا توجد حركات مطابقة.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الصنف</TableHead>
                  <TableHead>الحركة</TableHead>
                  <TableHead>الكمية</TableHead>
                  <TableHead>القيمة</TableHead>
                  <TableHead>الموقع</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>السبب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell>{entry.itemName}</TableCell>
                    <TableCell>
                      <Badge variant={entry.action === 'waste' ? 'destructive' : 'secondary'}>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{entry.quantity}</TableCell>
                    <TableCell>{formatEGPCurrency(entry.movementValue)}</TableCell>
                    <TableCell>{entry.locationName || '—'}</TableCell>
                    <TableCell>{entry.actorName || '—'}</TableCell>
                    <TableCell className="max-w-48 truncate" title={entry.reason}>{entry.reason || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {hasMore && !loading ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void load(entries.length, true)} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
            تحميل المزيد
          </Button>
        </div>
      ) : null}
    </section>
  );
}
