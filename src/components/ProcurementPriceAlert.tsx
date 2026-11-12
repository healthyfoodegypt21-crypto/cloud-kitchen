import { AlertTriangle, TrendingDown } from 'lucide-react';
import { getProcurementPriceChange } from '@/lib/procurementPriceChanges';

type Props = {
  itemName: string;
  currentPrice: number;
  previousPrice: number;
  unit: string;
};

const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentage = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function ProcurementPriceAlert({ itemName, currentPrice, previousPrice, unit }: Props) {
  const change = getProcurementPriceChange(currentPrice, previousPrice);
  if (!change) {
    return null;
  }

  const increased = change.direction === 'increase';
  const Icon = increased ? AlertTriangle : TrendingDown;

  return (
    <div
      role="status"
      dir="rtl"
      className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
        increased
          ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
          : 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong>تنبيه Allie:</strong> {increased ? 'ارتفع' : 'انخفض'} سعر {itemName} بنسبة {percentage(change.percentage)}%
        {' '}عن آخر شراء ({money(previousPrice)} ← {money(currentPrice)} ج.م/{unit}).
      </span>
    </div>
  );
}
