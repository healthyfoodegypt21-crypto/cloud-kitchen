import { OrderStatus, STATUS_LABELS, STATUS_COLORS } from '@/types/order';
import { Badge } from '@/components/ui/badge';

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge className={`${STATUS_COLORS[status]} border-0 font-medium text-xs`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
