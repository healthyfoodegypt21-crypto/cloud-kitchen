import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Clock,
  Copy,
  ExternalLink,
  History,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import type { Brand } from '@/hooks/useBrands';
import { Customer, CustomerUpsertInput } from '@/types/customer';
import { Meal, PackagePlan } from '@/types/menu';
import { Order, ORDER_MODE_LABELS, SOURCE_ICONS, SOURCE_LABELS } from '@/types/order';
import {
  buildCustomer360Insights,
  buildSmartWhatsAppMessage,
  buildWhatsAppUrl,
  CustomerSegment,
  getRecommendedTemplateForSegment,
  WHATSAPP_TEMPLATE_OPTIONS,
  WhatsAppTemplateId,
} from '@/lib/customerCrm';
import { getOrderMealCount, resolveOrderMeals } from '@/lib/orderMeals';
import { buildOrderLocationUrl, cn, formatArabicDate, formatEGPCurrency } from '@/lib/utils';

interface Props {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment: CustomerSegment;
  brand?: Brand;
  orders: Order[];
  meals?: Meal[];
  packages?: PackagePlan[];
  onUpdateCustomer?: (input: CustomerUpsertInput) => Promise<Customer | null>;
}

const SEGMENT_META: Record<CustomerSegment, { label: string; badgeClass: string }> = {
  vip: {
    label: 'عميل VIP',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  at_risk: {
    label: 'معرض للانقطاع',
    badgeClass: 'bg-rose-50 text-rose-600 border-rose-200/60',
  },
  new: {
    label: 'عميل جديد',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/80',
  },
  repeat: {
    label: 'عميل عائد',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  },
};

export default function CustomerProfileDrawer({
  customer,
  open,
  onOpenChange,
  segment,
  brand,
  orders,
  meals = [],
  packages = [],
  onUpdateCustomer,
}: Props) {
  const insights = useMemo(() => {
    if (!customer) return null;
    return buildCustomer360Insights(customer, orders, meals, packages);
  }, [customer, orders, meals, packages]);

  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplateId>('renewal');
  const [messageDraft, setMessageDraft] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [customerNotesDraft, setCustomerNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!customer || !insights) return;
    const defaultTpl = getRecommendedTemplateForSegment(segment);
    setSelectedTemplate(defaultTpl);
    setMessageDraft(
      buildSmartWhatsAppMessage({
        templateId: defaultTpl,
        customerName: customer.name,
        brandName: brand?.name,
        lastPackageName: insights.lastPackageName,
        orderCount: insights.validOrdersCount || customer.order_count,
      }),
    );
    setCustomerNotesDraft(customer.notes ?? '');
  }, [customer, segment, brand?.name, insights]);

  if (!customer || !insights) {
    return null;
  }

  const handleSelectTemplate = (templateId: WhatsAppTemplateId) => {
    setSelectedTemplate(templateId);
    setMessageDraft(
      buildSmartWhatsAppMessage({
        templateId,
        customerName: customer.name,
        brandName: brand?.name,
        lastPackageName: insights.lastPackageName,
        orderCount: insights.validOrdersCount || customer.order_count,
      }),
    );
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessage(true);
      toast.success(`تم نسخ ${label}`);
      window.setTimeout(() => setCopiedMessage(false), 1800);
    } catch {
      toast.error('تعذر النسخ إلى الحافظة');
    }
  };

  const handleSaveCustomerNotes = async () => {
    if (!onUpdateCustomer || !customer.brand_id) return;
    setSavingNotes(true);
    const updated = await onUpdateCustomer({
      id: customer.record_source === 'customers' ? customer.id : undefined,
      brand_id: customer.brand_id,
      name: customer.name,
      phone: customer.phone,
      phone_secondary: customer.phone_secondary,
      address: customer.address,
      address_house_number: customer.address_house_number,
      address_street: customer.address_street,
      address_area: customer.address_area,
      address_floor: customer.address_floor,
      address_apartment: customer.address_apartment,
      notes: customerNotesDraft,
    });
    setSavingNotes(false);
    if (updated) {
      toast.success('تم حفظ ملاحظات وتفضيلات العميل');
    }
  };

  const whatsappUrl = buildWhatsAppUrl(customer.phone, messageDraft);
  const mapUrl = buildOrderLocationUrl(
    insights.lastLocationOrder ?? {
      address: customer.address,
      address_house_number: customer.address_house_number,
      address_street: customer.address_street,
      address_area: customer.address_area,
    },
  );
  const segMeta = SEGMENT_META[segment];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-2xl p-0 flex flex-col h-full overflow-hidden bg-slate-50/90"
      >
        {/* Sticky Profile Header */}
        <div className="shrink-0 bg-white border-b border-slate-200/80 px-5 py-4 pl-12">
          <SheetHeader className="space-y-1 p-0">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="text-base font-bold text-slate-900">
                {customer.name}
              </SheetTitle>
              <span
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                  segMeta.badgeClass,
                )}
              >
                {segMeta.label}
              </span>
              {brand && (
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                  style={{
                    backgroundColor: `${brand.color}14`,
                    borderColor: `${brand.color}38`,
                    color: brand.color,
                  }}
                >
                  {brand.name}
                </span>
              )}
            </div>
            <SheetDescription className="sr-only">
              الملف الشخصي الشامل للعميل وسجل طلباته وقوالب التواصل عبر واتساب
            </SheetDescription>
          </SheetHeader>

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <a
              href={`tel:${customer.phone}`}
              className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-emerald-700 tabular-nums transition-colors"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-600" />
              <span>{customer.phone}</span>
            </a>
            <button
              type="button"
              onClick={() => void handleCopyText(customer.phone, 'رقم الهاتف')}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <Copy className="h-3 w-3" />
              <span>نسخ الرقم</span>
            </button>
            {customer.phone_secondary && (
              <span className="text-slate-400 tabular-nums">
                · بديل: {customer.phone_secondary}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable 360 Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 1. Executive LTV & Behavior Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white border border-slate-200/80 border-t-2 border-t-emerald-500 p-3.5 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span>القيمة الدائمة (LTV)</span>
                <Wallet className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div className="mt-1.5 text-base font-bold text-slate-900 tabular-nums tracking-tight">
                {formatEGPCurrency(insights.lifetimeValue)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">إجمالي الإنفاق الفعلي</div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200/80 p-3.5 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span>إجمالي الطلبات</span>
                <History className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <div className="mt-1.5 text-base font-bold text-slate-900 tabular-nums tracking-tight">
                {(insights.validOrdersCount || customer.order_count).toLocaleString('en-US')} طلب
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 tabular-nums">
                {insights.cancelledOrdersCount > 0
                  ? `${insights.cancelledOrdersCount} ملغي (${insights.cancellationRate.toFixed(0)}%)`
                  : `${insights.deliveredOrdersCount} تم تسليمه`}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200/80 p-3.5 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span>متوسط قيمة الطلب</span>
                <TrendingUp className="h-3.5 w-3.5 text-sky-600" />
              </div>
              <div className="mt-1.5 text-base font-bold text-slate-900 tabular-nums tracking-tight">
                {formatEGPCurrency(insights.averageOrderValue)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">لكل طلب مؤكد</div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200/80 p-3.5 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                <span>إيقاع الشراء</span>
                <Clock className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <div className="mt-1.5 text-base font-bold text-slate-900 tabular-nums tracking-tight">
                {insights.daysSinceLastOrder === null
                  ? '—'
                  : insights.daysSinceLastOrder === 0
                    ? 'اليوم'
                    : `منذ ${insights.daysSinceLastOrder.toLocaleString('en-US')} يوم`}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400 tabular-nums">
                {insights.averageCadenceDays
                  ? `يطلب كل ~${insights.averageCadenceDays.toLocaleString('en-US')} يوم`
                  : 'أول دورة طلب'}
              </div>
            </div>
          </div>

          {/* 2. Smart WhatsApp CRM Composer */}
          <div className="rounded-xl bg-white border border-emerald-200/90 p-4 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-700">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    منصة واتساب الذكية (1-Click WhatsApp CRM)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    اختر القالب الأنسب لشريحة العميل أو عدّل الرسالة قبل الإرسال المباشر
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {WHATSAPP_TEMPLATE_OPTIONS.map((tpl) => {
                const active = selectedTemplate === tpl.id;
                const isRecommended = getRecommendedTemplateForSegment(segment) === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer border',
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    <span>{tpl.shortLabel}</span>
                    {isRecommended && (
                      <Sparkles className={cn('h-3 w-3', active ? 'text-amber-200' : 'text-emerald-600')} />
                    )}
                  </button>
                );
              })}
            </div>

            <Textarea
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              rows={3}
              className="text-xs leading-relaxed bg-slate-50/50 border-slate-200"
              aria-label="نص رسالة واتساب"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => void handleCopyText(messageDraft, 'نص الرسالة')}
              >
                {copiedMessage ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedMessage ? 'تم النسخ' : 'نسخ الرسالة'}</span>
              </Button>

              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>فتح المحادثة في واتساب</span>
                  <ExternalLink className="h-3 w-3 opacity-80" />
                </a>
              )}
            </div>
          </div>

          {/* 3. Favorite Meals, Packages & Dietary Notes */}
          <div className="rounded-xl bg-white border border-slate-200/80 p-4 space-y-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900">
                الوجبات المفضلة والتفضيلات الغذائية
              </h3>
            </div>

            {insights.favoritePackages.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">الباقات المختارة سابقاً</p>
                <div className="flex flex-wrap gap-1.5">
                  {insights.favoritePackages.map((pkg) => (
                    <span
                      key={pkg.label}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200/70 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                    >
                      <span>{pkg.label}</span>
                      <span className="rounded bg-white px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 tabular-nums">
                        ×{pkg.count.toLocaleString('en-US')}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-500">الأصناف والوجبات الأكثر طلباً</p>
              {insights.favoriteMeals.length === 0 ? (
                <p className="text-xs text-slate-400">لم تُسجل أصناف تفصيلية بعد لهذا العميل.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {insights.favoriteMeals.map((meal) => (
                    <span
                      key={meal.label}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/80 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      <span>{meal.label}</span>
                      <span className="rounded bg-slate-200/70 px-1.5 text-[10px] font-bold text-slate-700 tabular-nums">
                        ×{meal.count.toLocaleString('en-US')}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {insights.recurringNotes.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">ملاحظات وتعديلات سابقة على الوجبات</p>
                <div className="flex flex-wrap gap-1.5">
                  {insights.recurringNotes.map((note) => (
                    <span
                      key={note}
                      className="rounded-lg bg-amber-50/70 border border-amber-200/70 px-2.5 py-1 text-[11px] text-amber-900"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {onUpdateCustomer && customer.brand_id && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  ملاحظات العميل الثابتة (حساسية / تفضيل غذائي / مواعيد استلام)
                </label>
                <div className="flex gap-2">
                  <Textarea
                    value={customerNotesDraft}
                    onChange={(e) => setCustomerNotesDraft(e.target.value)}
                    placeholder="مثال: بدون بصل، يفضل التوصيل قبل الساعة 2 ظهرًا..."
                    rows={2}
                    className="text-xs bg-slate-50/50"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingNotes || customerNotesDraft.trim() === (customer.notes ?? '').trim()}
                    onClick={() => void handleSaveCustomerNotes()}
                    className="shrink-0 self-end h-9 gap-1.5 text-xs font-semibold"
                  >
                    {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>حفظ</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Saved Address & Location */}
          <div className="rounded-xl bg-white border border-slate-200/80 p-4 flex flex-wrap items-center justify-between gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-start gap-2.5 min-w-0">
              <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500">العنوان المسجل للتوصيل</p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5 break-words">
                  {customer.address || 'لا يوجد عنوان مسجل بعد'}
                </p>
              </div>
            </div>
            {customer.address && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors shrink-0"
              >
                <span>فتح على الخريطة</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* 5. Complete Order Timeline */}
          <div className="rounded-xl bg-white border border-slate-200/80 p-4 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold text-slate-900">سجل الطلبات الزمني الكامل</h3>
              </div>
              <Badge variant="outline" className="text-[11px] tabular-nums">
                {insights.orders.length.toLocaleString('en-US')} سجل
              </Badge>
            </div>

            {insights.orders.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                لا توجد طلبات مسجلة في السجل الحالي لهذا العميل.
              </p>
            ) : (
              <div className="space-y-2.5">
                {insights.orders.map((order) => {
                  const mealCount = getOrderMealCount(order, meals, packages);
                  const orderMeals = resolveOrderMeals(order, meals, packages);
                  const dateDisplay = formatArabicDate(order.execution_date || order.created_at.slice(0, 10));

                  return (
                    <div
                      key={order.id}
                      className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 space-y-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 tabular-nums">
                            {order.order_number}
                          </span>
                          <OrderStatusBadge status={order.status} />
                          <span className="text-[11px] text-slate-500">{dateDisplay}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 tabular-nums tracking-tight">
                          {formatEGPCurrency(order.price)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          {order.package || ORDER_MODE_LABELS[order.order_mode]}
                        </span>
                        <span className="rounded-full bg-white border border-slate-200/80 px-2 py-0.5 text-[11px] font-medium tabular-nums">
                          {mealCount.toLocaleString('en-US')} وجبة
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {SOURCE_ICONS[order.source]} {SOURCE_LABELS[order.source]}
                        </span>
                      </div>

                      {orderMeals.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {orderMeals.slice(0, 5).map((m, idx) => (
                            <span
                              key={`${m.customizationKey}-${idx}`}
                              className="rounded bg-white border border-slate-200/70 px-2 py-0.5 text-[11px] text-slate-600"
                            >
                              {m.label}
                            </span>
                          ))}
                          {orderMeals.length > 5 && (
                            <span className="px-1.5 py-0.5 text-[11px] text-slate-400 tabular-nums">
                              +{orderMeals.length - 5} أخرى
                            </span>
                          )}
                        </div>
                      )}

                      {order.notes && (
                        <p className="text-[11px] text-amber-800 bg-amber-50/60 rounded px-2 py-1">
                          ملاحظة: {order.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
