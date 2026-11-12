import { OrderStatus, STATUS_LABELS, STATUS_COLORS } from '@/types/order';
import { Badge } from '@/components/ui/badge';

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={`${STATUS_COLORS[status]} font-semibold text-[11px] px-2.5 py-0.5 rounded-full`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
