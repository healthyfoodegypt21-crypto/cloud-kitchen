import { useMemo } from 'react';
import { AlertTriangle, Boxes, CalendarClock, Download, Flame, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverNow } from '@/lib/serverTime';
import { formatEGPCurrency } from '@/lib/utils';
import type { DailyWithdrawal, InventoryBatch, OperationalInventoryItem, OperationalMovement } from '@/types/operationalInventory';

type Props = {
  items: OperationalInventoryItem[];
  movements: OperationalMovement[];
  withdrawals: DailyWithdrawal[];
  batches: InventoryBatch[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 7;
const CONSUMPTION_TYPES = new Set(['production_consumption', 'waste']);

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase_receipt: 'استلام شراء',
  production_consumption: 'صرف إنتاج',
  waste: 'هالك',
  adjustment: 'تسوية جرد',
};

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function InventoryReports({ items, movements, withdrawals, batches }: Props) {
  const report = useMemo(() => {
    const now = new Date(serverNow());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const cutoff30 = todayStart - 30 * DAY_MS;

    const totalStockValue = items.reduce((sum, item) => sum + item.onHand * item.averageCost, 0);

    const recentMovements = movements.filter((movement) => {
      const time = new Date(movement.createdAt).getTime();
      return Number.isFinite(time) && time >= cutoff30 && CONSUMPTION_TYPES.has(movement.type);
    });
    const consumption30 = recentMovements
      .filter((movement) => movement.type === 'production_consumption')
      .reduce((sum, movement) => sum + movement.value, 0);
    const wasteCost = movements
      .filter((movement) => movement.type === 'waste' && new Date(movement.createdAt).getTime() >= cutoff30)
      .reduce((sum, movement) => sum + movement.value, 0);

    const belowMin = items.filter((item) => item.minStock > 0 && item.availableQuantity < item.minStock);

    const batchRows = batches.map((batch) => {
      const item = items.find((entry) => entry.id === batch.itemId);
      const available = Math.max(batch.quantityOnHand - batch.reservedQuantity, 0);
      let daysRemaining: number | null = null;
      if (batch.expiryDate) {
        const expiryMs = new Date(`${batch.expiryDate}T00:00:00`).getTime();
        if (Number.isFinite(expiryMs)) {
          daysRemaining = Math.floor((expiryMs - todayStart) / DAY_MS);
        }
      }
      return {
        batch,
        itemName: item?.name ?? 'صنف غير معروف',
        available,
        daysRemaining,
        value: available * batch.unitCost,
      };
    });
    const riskyBatches = batchRows.filter((row) => row.daysRemaining !== null && row.daysRemaining <= EXPIRING_SOON_DAYS);
    const riskyValue = riskyBatches.reduce((sum, row) => sum + row.value, 0);

    return { totalStockValue, consumption30, wasteCost, belowMin, batchRows, riskyValue, recentMovements };
  }, [items, movements, batches]);

  const todayTag = new Date(serverNow()).toISOString().slice(0, 10);

  const exportBalances = () => {
    downloadCsv(
      `inventory-balances-${todayTag}.csv`,
      ['الصنف', 'الكود', 'الفئة', 'الرصيد', 'المحجوز', 'المتاح', 'متوسط التكلفة', 'القيمة'],
      items.map((item) => [
        item.name,
        item.code,
        item.category,
        item.onHand,
        item.reservedQuantity,
        item.availableQuantity,
        item.averageCost,
        item.onHand * item.averageCost,
      ]),
    );
  };

  const exportConsumption = () => {
    downloadCsv(
      `inventory-consumption-${todayTag}.csv`,
      ['التاريخ', 'الصنف', 'النوع', 'الكمية', 'تكلفة الوحدة', 'القيمة'],
      report.recentMovements.map((movement) => [
        movement.createdAt.slice(0, 10),
        movement.itemName,
        MOVEMENT_TYPE_LABELS[movement.type] ?? movement.type,
        movement.quantity,
        movement.unitCost,
        movement.value,
      ]),
    );
  };

  const exportBatches = () => {
    downloadCsv(
      `inventory-batches-${todayTag}.csv`,
      ['الصنف', 'رقم الدفعة', 'الموقع', 'الكمية المتاحة', 'تاريخ الانتهاء', 'الأيام المتبقية', 'القيمة'],
      report.batchRows.map((row) => [
        row.itemName,
        row.batch.batchNo,
        row.batch.locationName,
        row.available,
        row.batch.expiryDate ?? '',
        row.daysRemaining ?? '',
        row.value,
      ]),
    );
  };

  const cards = [
    { title: 'قيمة المخزون الإجمالية', value: formatEGPCurrency(report.totalStockValue), icon: Boxes },
    { title: 'استهلاك آخر 30 يوم', value: formatEGPCurrency(report.consumption30), icon: TrendingDown },
    { title: 'تكلفة الهالك (آخر 30 يوم)', value: formatEGPCurrency(report.wasteCost), icon: Flame },
    { title: 'أصناف تحت الحد الأدنى', value: String(report.belowMin.length), icon: AlertTriangle },
    { title: 'قيمة الدفعات المنتهية/قاربت', value: formatEGPCurrency(report.riskyValue), icon: CalendarClock },
  ];

  return (
    <section dir="rtl" className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">تقارير المخزون</h2>
        <p className="text-sm text-muted-foreground">ملخص القيمة والاستهلاك والهالك والصلاحية مع تصدير CSV.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><card.icon className="h-4 w-4" /> {card.title}</CardDescription>
              <CardTitle className="text-xl">{card.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الأصناف والأرصدة</CardTitle>
            <CardDescription>{items.length} صنف · {withdrawals.length} إذن صرف مسجل</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={exportBalances} disabled={items.length === 0}>
              <Download className="ml-1 h-4 w-4" /> تصدير CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">حركات الاستهلاك</CardTitle>
            <CardDescription>{report.recentMovements.length} حركة خلال آخر 30 يوم</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={exportConsumption} disabled={report.recentMovements.length === 0}>
              <Download className="ml-1 h-4 w-4" /> تصدير CSV
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الدفعات والصلاحية</CardTitle>
            <CardDescription>{report.batchRows.length} دفعة</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={exportBatches} disabled={report.batchRows.length === 0}>
              <Download className="ml-1 h-4 w-4" /> تصدير CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
