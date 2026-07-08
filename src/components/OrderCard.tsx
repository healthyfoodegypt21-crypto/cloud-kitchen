import { Order, NEXT_STATUS, ORDER_MODE_LABELS, STATUS_LABELS, SOURCE_LABELS, SOURCE_ICONS } from '@/types/order';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import OrderStatusBadge from './OrderStatusBadge';
import { ArrowRight, CalendarDays, MapPin, Phone, X } from 'lucide-react';
import { Meal, PackagePlan } from '@/types/menu';
import { getOrderMealCount, resolveOrderMeals } from '@/lib/orderMeals';
import { toast } from 'sonner';
import { Brand } from '@/hooks/useBrands';
import { formatArabicDate, formatEGPCurrency, getArabicWeekday } from '@/lib/utils';

interface Props {
  order: Order;
  onUpdate: () => void;
  updateStatus: (id: string, status: Order['status']) => Promise<void>;
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
}

export default function OrderCard({ order, onUpdate, updateStatus, brands, meals, packages }: Props) {
  const nextStatus = NEXT_STATUS[order.status];
  const brand = brands.find(b => b.id === order.brand_id);
  const executionDay = getArabicWeekday(order.execution_date);
  const executionDate = formatArabicDate(order.execution_date);
  const mealCount = getOrderMealCount(order, meals, packages);
  const resolvedMeals = resolveOrderMeals(order, meals, packages);

  const advance = async () => {
    if (!nextStatus) return;
    await updateStatus(order.id, nextStatus);
    toast.success(`تم نقل الطلب إلى ${STATUS_LABELS[nextStatus]}`);
    onUpdate();
  };

  const cancel = async () => {
    await updateStatus(order.id, 'cancelled');
    toast('تم إلغاء الطلب');
    onUpdate();
  };

  return (
    <Card className="p-4 hover:shadow-lg transition-all duration-200 border-r-4" style={{ borderRightColor: brand?.color ?? 'hsl(var(--border))' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{order.customer_name}</span>
            <OrderStatusBadge status={order.status} />
            {brand && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: brand.color + '20', color: brand.color }}>
                {brand.name}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{order.order_number}</span>
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{order.phone}</span>
            {order.phone_secondary && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />رقم بديل: {order.phone_secondary}</span>}
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{order.address}</span>
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />التنفيذ: {executionDay} - {executionDate}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm flex-wrap">
            <span className="font-medium text-foreground">{order.package} • {ORDER_MODE_LABELS[order.order_mode]}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{mealCount} وجبة</span>
            <span className="font-bold text-primary">{formatEGPCurrency(order.price)}</span>
            <span className="text-xs text-muted-foreground">{SOURCE_ICONS[order.source]} {SOURCE_LABELS[order.source]}</span>
          </div>
          {resolvedMeals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {resolvedMeals.map((meal, index) => (
                <span key={`${meal.customizationKey}-${index}`} className="rounded-full border bg-background px-2.5 py-1 text-muted-foreground">
                  {meal.label}
                </span>
              ))}
            </div>
          )}
          {order.notes && <p className="mt-1 text-xs text-muted-foreground italic">"{order.notes}"</p>}
          {order.meal_customizations && order.meal_customizations.length > 0 && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {order.meal_customizations.map((item) => (
                <p key={item.key}>تعديل {item.label}: {item.notes}</p>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {nextStatus && (
            <Button size="sm" onClick={advance} className="gap-1 text-xs">
              <ArrowRight className="h-3.5 w-3.5" /> {STATUS_LABELS[nextStatus]}
            </Button>
          )}
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <Button size="sm" variant="ghost" onClick={cancel} className="gap-1 text-xs text-destructive hover:text-destructive">
              <X className="h-3.5 w-3.5" /> إلغاء
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
