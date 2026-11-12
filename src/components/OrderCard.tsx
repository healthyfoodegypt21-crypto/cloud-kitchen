import { Order, NEXT_STATUS, ORDER_MODE_LABELS, STATUS_LABELS, SOURCE_LABELS, SOURCE_ICONS } from '@/types/order';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import OrderStatusBadge from './OrderStatusBadge';
import { ArrowLeft, CalendarDays, MapPin, Pencil, Phone, X, LocateFixed, ExternalLink } from 'lucide-react';
import { Meal, PackagePlan } from '@/types/menu';
import { getOrderMealCount, resolveOrderMeals } from '@/lib/orderMeals';
import { toast } from 'sonner';
import { Brand } from '@/hooks/useBrands';
import { buildOrderLocationUrl, formatArabicDate, formatEGPCurrency, getArabicWeekday } from '@/lib/utils';

interface Props {
  order: Order;
  onUpdate: () => void;
  updateStatus: (id: string, status: Order['status']) => Promise<void>;
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
  deliveryUsers?: Array<{ id: string; display_name: string }>;
  onAssign?: (orderId: string, userId: string | null) => Promise<boolean>;
  onRecordLocation?: (orderId: string, locationLink: string) => Promise<boolean>;
  onEdit?: (order: Order) => void;
}

export default function OrderCard({ order, onUpdate, updateStatus, brands, meals, packages, deliveryUsers = [], onAssign, onRecordLocation, onEdit }: Props) {
  const nextStatus = NEXT_STATUS[order.status];
  const brand = brands.find((b) => b.id === order.brand_id);
  const executionDay = getArabicWeekday(order.execution_date);
  const executionDate = formatArabicDate(order.execution_date);
  const mealCount = getOrderMealCount(order, meals, packages);
  const resolvedMeals = resolveOrderMeals(order, meals, packages);
  const mapUrl = buildOrderLocationUrl(order);

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

  const recordLocation = () => {
    if (!onRecordLocation || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => void onRecordLocation(order.id, `geo:${position.coords.latitude},${position.coords.longitude}`),
      () => toast.error('لم نتمكن من قراءة موقع الجهاز. اسمح بالموقع ثم حاول مرة أخرى.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <Card
      className="p-4 hover:border-slate-300 hover:shadow-xs transition-all duration-150 border-r-[3px]"
      style={{ borderRightColor: brand?.color ?? '#10b981' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-slate-900">{order.customer_name}</span>
            <OrderStatusBadge status={order.status} />
            {brand && (
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-semibold border"
                style={{
                  backgroundColor: `${brand.color}14`,
                  borderColor: `${brand.color}38`,
                  color: brand.color,
                }}
              >
                {brand.name}
              </span>
            )}
            <span className="text-[11px] font-medium text-slate-400 tabular-nums tracking-tight">
              {order.order_number}
            </span>
          </div>

          <div className="grid gap-1 sm:grid-cols-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 tabular-nums">
              <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <a href={`tel:${order.phone}`} className="hover:text-emerald-700 transition-colors">
                {order.phone}
              </a>
              {order.phone_secondary && (
                <span className="text-slate-400">· {order.phone_secondary}</span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>التنفيذ: {executionDay} - {executionDate}</span>
            </span>
            <span className="flex items-center gap-1.5 sm:col-span-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{order.address}</span>
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-emerald-700 hover:text-emerald-800 font-medium shrink-0"
              >
                <span>الخريطة</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-xs flex-wrap pt-0.5">
            <span className="font-semibold text-slate-800">
              {order.package} · {ORDER_MODE_LABELS[order.order_mode]}
            </span>
            <span className="rounded-full bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums tracking-tight">
              {mealCount.toLocaleString('en-US')} وجبة
            </span>
            <span className="font-bold text-sm text-emerald-700 tabular-nums tracking-tight">
              {formatEGPCurrency(order.price)}
            </span>
            <span className="text-[11px] text-slate-400">
              {SOURCE_ICONS[order.source]} {SOURCE_LABELS[order.source]}
            </span>
          </div>

          {resolvedMeals.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {resolvedMeals.map((meal, index) => (
                <span
                  key={`${meal.customizationKey}-${index}`}
                  className="rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-0.5 text-slate-600 font-medium"
                >
                  {meal.label}
                </span>
              ))}
            </div>
          )}

          {order.notes && (
            <p className="text-xs text-amber-800 bg-amber-50/70 border border-amber-200/60 rounded-lg px-2.5 py-1.5">
              ملاحظة: {order.notes}
            </p>
          )}

          {order.meal_customizations && order.meal_customizations.length > 0 && (
            <div className="space-y-1 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200/60">
              {order.meal_customizations.map((item) => (
                <p key={item.key}>
                  <span className="font-semibold text-slate-800">تعديل {item.label}:</span> {item.notes}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-row sm:flex-col flex-wrap gap-1.5 shrink-0">
          {nextStatus && (
            <Button
              size="sm"
              onClick={advance}
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white h-8"
            >
              <span>{STATUS_LABELS[nextStatus]}</span>
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          {onEdit && (
            <Button size="sm" variant="outline" onClick={() => onEdit(order)} className="gap-1.5 text-xs h-8">
              <Pencil className="h-3.5 w-3.5" />
              <span>تعديل</span>
            </Button>
          )}
          {onAssign && (
            <select
              aria-label="تعيين مندوب"
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              value={order.assigned_to ?? ''}
              onChange={(event) => void onAssign(order.id, event.target.value || null)}
            >
              <option value="">بدون مندوب</option>
              {deliveryUsers.map((deliveryUser) => (
                <option key={deliveryUser.id} value={deliveryUser.id}>
                  {deliveryUser.display_name}
                </option>
              ))}
            </select>
          )}
          {onRecordLocation && (
            <Button size="sm" variant="outline" onClick={recordLocation} className="gap-1.5 text-xs h-8">
              <LocateFixed className="h-3.5 w-3.5 text-emerald-600" />
              <span>تسجيل الموقع</span>
            </Button>
          )}
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={cancel}
              className="gap-1 text-xs h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <X className="h-3.5 w-3.5" />
              <span>إلغاء</span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
