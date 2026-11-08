import { useMemo } from 'react';
import { AlertTriangle, CalendarClock, PackageX, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverNow } from '@/lib/serverTime';
import { formatEGPCurrency } from '@/lib/utils';
import type { InventoryBatch, OperationalInventoryItem } from '@/types/operationalInventory';

type Props = {
  batches: InventoryBatch[];
  items: OperationalInventoryItem[];
  onRecordWaste?: (batch: InventoryBatch) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 7;

type BatchView = {
  batch: InventoryBatch;
  itemName: string;
  available: number;
  daysRemaining: number | null;
  totalValue: number;
  state: 'expired' | 'soon' | 'ok' | 'no-expiry';
};

function daysUntil(expiryDate: string | null, todayStartMs: number): number | null {
  if (!expiryDate) return null;
  const expiryMs = new Date(`${expiryDate}T00:00:00`).getTime();
  if (!Number.isFinite(expiryMs)) return null;
  return Math.floor((expiryMs - todayStartMs) / DAY_MS);
}

export default function FefoPanel({ batches, items, onRecordWaste }: Props) {
  const { groups, expiredCount, soonCount, wasteValue } = useMemo(() => {
    const now = new Date(serverNow());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const itemMap = new Map(items.map((item) => [item.id, item.name]));

    const views: BatchView[] = batches.map((batch) => {
      const available = Math.max(batch.quantityOnHand - batch.reservedQuantity, 0);
      const remaining = daysUntil(batch.expiryDate, todayStart);
      const state: BatchView['state'] = remaining === null
        ? 'no-expiry'
        : remaining < 0
          ? 'expired'
          : remaining <= EXPIRING_SOON_DAYS
            ? 'soon'
            : 'ok';
      return {
        batch,
        itemName: itemMap.get(batch.itemId) ?? 'صنف غير معروف',
        available,
        daysRemaining: remaining,
        totalValue: available * batch.unitCost,
        state,
      };
    });

    // FEFO order: earliest expiry first; batches without expiry go last.
    views.sort((a, b) => {
      if (a.daysRemaining === null && b.daysRemaining === null) return 0;
      if (a.daysRemaining === null) return 1;
      if (b.daysRemaining === null) return -1;
      return a.daysRemaining - b.daysRemaining;
    });

    const grouped = new Map<string, { itemName: string; rows: BatchView[] }>();
    for (const view of views) {
      const key = view.batch.itemId;
      const group = grouped.get(key) ?? { itemName: view.itemName, rows: [] };
      group.rows.push(view);
      grouped.set(key, group);
    }

    const expired = views.filter((view) => view.state === 'expired');
    return {
      groups: Array.from(grouped.entries()).map(([itemId, group]) => ({ itemId, ...group })),
      expiredCount: expired.length,
      soonCount: views.filter((view) => view.state === 'soon').length,
      wasteValue: expired.reduce((sum, view) => sum + view.totalValue, 0),
    };
  }, [batches, items]);

  const stateBadge = (view: BatchView) => {
    if (view.state === 'expired') {
      return <Badge variant="destructive">منتهي منذ {Math.abs(view.daysRemaining ?? 0)} يوم</Badge>;
    }
    if (view.state === 'soon') {
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500">متبقي {view.daysRemaining} يوم</Badge>;
    }
    if (view.state === 'no-expiry') {
      return <Badge variant="secondary">بدون تاريخ صلاحية</Badge>;
    }
    return <Badge variant="outline">متبقي {view.daysRemaining} يوم</Badge>;
  };

  return (
    <section dir="rtl" className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">ترتيب الصرف بالصلاحية (FEFO)</h2>
        <p className="text-sm text-muted-foreground">الدفعات مرتبة حسب الأقرب انتهاءً لكل صنف؛ اصرف الأقرب أولاً.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><PackageX className="h-4 w-4" /> دفعات منتهية</CardDescription>
            <CardTitle className="text-2xl text-destructive">{expiredCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><CalendarClock className="h-4 w-4" /> تنتهي خلال {EXPIRING_SOON_DAYS} أيام</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{soonCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> قيمة الهالك المتوقعة</CardDescription>
            <CardTitle className="text-2xl">{formatEGPCurrency(wasteValue)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">لا توجد دفعات مسجلة حالياً.</CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.itemId}>
            <CardHeader>
              <CardTitle className="text-lg">{group.itemName}</CardTitle>
              <CardDescription>{group.rows.length} دفعة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.rows.map((view) => (
                <div
                  key={view.batch.id}
                  className={`grid gap-2 rounded-xl border p-3 md:grid-cols-6 ${
                    view.state === 'expired'
                      ? 'border-destructive/60 bg-destructive/5'
                      : view.state === 'soon'
                        ? 'border-amber-400/60 bg-amber-50'
                        : ''
                  }`}
                >
                  <div>
                    <p className="text-xs text-muted-foreground">رقم الدفعة</p>
                    <p className="font-medium">{view.batch.batchNo || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الموقع</p>
                    <p className="font-medium">{view.batch.locationName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المتاح</p>
                    <p className="font-medium">{view.available}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">تاريخ الانتهاء</p>
                    <p className="font-medium">{view.batch.expiryDate ?? '—'}</p>
                    {stateBadge(view)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">تكلفة الوحدة / القيمة</p>
                    <p className="font-medium">{formatEGPCurrency(view.batch.unitCost)} · {formatEGPCurrency(view.totalValue)}</p>
                  </div>
                  <div className="flex items-end justify-start md:justify-end">
                    {view.state === 'expired' && onRecordWaste ? (
                      <Button variant="destructive" size="sm" onClick={() => onRecordWaste(view.batch)}>
                        <Trash2 className="ml-1 h-4 w-4" /> تسجيل هالك
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </section>
  );
}
