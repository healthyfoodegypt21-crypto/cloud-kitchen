import { useMemo, useRef, useState } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { Order, STATUS_LABELS, OrderStatus, ACHIEVEMENT_TIERS, SOURCE_LABELS, OrderSource } from '@/types/order';
import {
  ClipboardList,
  DollarSign,
  TrendingUp,
  Clock,
  Target,
  Award,
  Sparkles,
  AlertTriangle,
  Repeat,
  CircleDollarSign,
  ArrowUpLeft,
  BarChart3,
} from 'lucide-react';
import { Brand } from '@/hooks/useBrands';
import { cn, formatEGPCurrency } from '@/lib/utils';

function RouterBridge({ navRef }: { navRef: React.MutableRefObject<((to: string) => void) | null> }) {
  const navigate = useNavigate();
  navRef.current = navigate;
  return null;
}

interface Props {
  orders: Order[];
  brands: Brand[];
  getTarget: (type: string) => number;
}

const CARD_BASE =
  'h-full flex flex-col justify-between p-5 bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-slate-300 hover:shadow-xs transition-all duration-150';

export default function Dashboard({ orders, brands, getTarget }: Props) {
  const inRouter = useInRouterContext();
  const navRef = useRef<((to: string) => void) | null>(null);
  const [chartMetric, setChartMetric] = useState<'sales' | 'orders'>('sales');
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  const goTo = (to: string) => {
    if (navRef.current) {
      navRef.current(to);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const now = Date.now();
  const pct = (val: number, target: number) => (target > 0 ? Math.min(100, (val / target) * 100) : 0);

  const getDayKey = (value: string) => value.slice(0, 10);

  const getCustomerKey = (order: Order) => `${order.brand_id ?? 'no-brand'}:${order.phone}`;

  const stats = useMemo(() => {
    const todayOrders = orders.filter((o) => o.created_at.slice(0, 10) === today);
    const monthOrders = orders.filter((o) => o.created_at.slice(0, 7) === month);
    const activeOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
    const todaySales = todayOrders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.price, 0);
    const monthSales = monthOrders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.price, 0);
    const cancelledToday = todayOrders.filter((o) => o.status === 'cancelled');
    const deliveredToday = todayOrders.filter((o) => o.status === 'delivered');
    const averageOrderValue = todaySales / Math.max(1, todayOrders.filter((o) => o.status !== 'cancelled').length);
    const cancellationRate = todayOrders.length > 0 ? (cancelledToday.length / todayOrders.length) * 100 : 0;
    const onTrackRevenue = getTarget('daily_sales') > 0 ? todaySales >= getTarget('daily_sales') * 0.75 : false;

    return {
      todayOrders,
      monthOrders,
      deliveredToday,
      cancelledToday,
      todayOrderCount: todayOrders.length,
      monthOrderCount: monthOrders.length,
      activeOrders: activeOrders.length,
      todaySales,
      monthSales,
      averageOrderValue,
      cancellationRate,
      onTrackRevenue,
    };
  }, [orders, today, month, getTarget]);

  const targets = {
    dailyOrders: getTarget('daily_orders'),
    dailySales: getTarget('daily_sales'),
    monthlyOrders: getTarget('monthly_orders'),
    monthlySales: getTarget('monthly_sales'),
  };

  const statusBreakdown = useMemo(() => {
    const counts: Partial<Record<OrderStatus, number>> = {};
    orders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const sourceBreakdown = useMemo(() => {
    const counts: Partial<Record<OrderSource, number>> = {};
    orders
      .filter((o) => o.created_at.slice(0, 7) === month)
      .forEach((o) => {
        counts[o.source] = (counts[o.source] || 0) + 1;
      });
    return counts;
  }, [orders, month]);

  const streak = useMemo(() => {
    const target = targets.dailySales;
    if (target <= 0) {
      return 0;
    }

    const salesByDay = orders.reduce<Record<string, number>>((acc, order) => {
      if (order.status === 'cancelled') {
        return acc;
      }

      const dayKey = getDayKey(order.created_at);
      acc[dayKey] = (acc[dayKey] || 0) + order.price;
      return acc;
    }, {});

    const current = new Date();
    let count = 0;

    while (true) {
      const dayKey = current.toISOString().slice(0, 10);
      if ((salesByDay[dayKey] || 0) >= target) {
        count += 1;
        current.setDate(current.getDate() - 1);
        continue;
      }
      break;
    }

    return count;
  }, [orders, targets.dailySales]);

  const repeatCustomerRate = useMemo(() => {
    const ordersByCustomer = stats.monthOrders.reduce<Record<string, number>>((acc, order) => {
      if (order.status === 'cancelled') {
        return acc;
      }

      const key = getCustomerKey(order);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const activeCustomers = Object.values(ordersByCustomer);
    if (activeCustomers.length === 0) {
      return 0;
    }

    const repeatCustomers = activeCustomers.filter((count) => count > 1).length;
    return (repeatCustomers / activeCustomers.length) * 100;
  }, [stats.monthOrders]);

  const quickWins = useMemo(() => {
    const daysAgo = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date.getTime();
    };
    const previous14DaysStart = daysAgo(14);
    const atRiskWindowStart = daysAgo(30);
    const customerLastSeen = new Map<string, number>();

    orders.forEach((order) => {
      if (order.status === 'cancelled') {
        return;
      }

      const key = getCustomerKey(order);
      const time = new Date(order.created_at).getTime();
      customerLastSeen.set(key, Math.max(customerLastSeen.get(key) ?? 0, time));
    });

    const atRiskCustomers = Array.from(customerLastSeen.values()).filter(
      (lastSeen) => lastSeen < previous14DaysStart && lastSeen >= atRiskWindowStart,
    ).length;
    const delayedOrders = orders.filter(
      (order) =>
        !['delivered', 'cancelled'].includes(order.status) &&
        now - new Date(order.created_at).getTime() > 1000 * 60 * 60 * 6,
    ).length;
    const missedRevenue = stats.cancelledToday.reduce((sum, order) => sum + order.price, 0);
    const bestSourceEntry = Object.entries(sourceBreakdown).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];

    return [
      {
        key: 'delayed',
        title: 'طلبات معرضة للتأخير',
        value: `${delayedOrders.toLocaleString('en-US')} طلب`,
        hint:
          delayedOrders > 0
            ? 'راجع الطلبات المفتوحة الأقدم من 6 ساعات قبل أن تتحول إلى إلغاء.'
            : 'لا توجد طلبات متأخرة حرجة الآن.',
        icon: AlertTriangle,
        urgent: delayedOrders > 0,
        href: '/orders?delayed=1',
        iconBadgeClass:
          delayedOrders > 0
            ? 'bg-amber-100/80 text-amber-700 border border-amber-200/80'
            : 'bg-amber-50/70 text-amber-700 border border-amber-200',
      },
      {
        key: 'missed-revenue',
        title: 'إيراد مهدور اليوم',
        value: formatEGPCurrency(missedRevenue),
        hint:
          missedRevenue > 0
            ? 'هذا هو أثر الطلبات الملغية اليوم مباشرة على الكاش.'
            : 'لم تخسر إيراداً من الإلغاء اليوم.',
        icon: CircleDollarSign,
        urgent: false,
        href: '/orders?status=cancelled',
        iconBadgeClass: 'bg-rose-50 text-rose-600 border border-rose-200/60',
      },
      {
        key: 'recovery',
        title: 'فرصة استرجاع عملاء',
        value: `${atRiskCustomers.toLocaleString('en-US')} عميل`,
        hint:
          atRiskCustomers > 0
            ? 'ابعت عرض رجوع للعملاء غير النشطين منذ 14 إلى 30 يوماً.'
            : 'لا توجد قائمة استرجاع ساخنة الآن.',
        icon: Repeat,
        urgent: false,
        href: '/customers?segment=at_risk',
        iconBadgeClass: 'bg-sky-50 text-sky-600 border border-sky-200/60',
      },
      {
        key: 'best-source',
        title: 'أفضل مصدر بيع',
        value: bestSourceEntry ? SOURCE_LABELS[bestSourceEntry[0] as OrderSource] : 'لا يوجد',
        hint: bestSourceEntry
          ? `المصدر الأقوى جلب ${(bestSourceEntry[1] || 0).toLocaleString('en-US')} طلب هذا الشهر. ركز عليه اليوم.`
          : 'ابدأ تتبع مصدر أول طلب فعلي.',
        icon: Sparkles,
        urgent: false,
        href: '/orders?preset=all',
        iconBadgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60',
      },
    ];
  }, [now, orders, sourceBreakdown, stats.cancelledToday]);

  const missionLabel =
    stats.todaySales >= targets.dailySales && stats.todayOrderCount >= targets.dailyOrders
      ? 'تم تحقيق مهمة اليوم كاملة.'
      : stats.onTrackRevenue
        ? 'أنت قريب من إغلاق اليوم على الهدف.'
        : 'ركز على رفع الإيراد أولاً، لا عدد الطلبات فقط.';

  const missionProgress = Math.min(
    100,
    (pct(stats.todaySales, targets.dailySales) + pct(stats.todayOrderCount, targets.dailyOrders)) / 2,
  );

  const brandBreakdown = useMemo(() => {
    return brands.map((b) => {
      const brandOrders = orders.filter((o) => o.brand_id === b.id && o.created_at.slice(0, 7) === month);
      const sales = brandOrders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.price, 0);
      return { ...b, orders: brandOrders.length, sales };
    });
  }, [orders, brands, month]);

  const currentTier = useMemo(() => {
    const monthCount = stats.monthOrderCount;
    return [...ACHIEVEMENT_TIERS].reverse().find((t) => monthCount >= t.threshold);
  }, [stats.monthOrderCount]);

  const nextTier = useMemo(() => {
    const monthCount = stats.monthOrderCount;
    return ACHIEVEMENT_TIERS.find((t) => monthCount < t.threshold);
  }, [stats.monthOrderCount]);

  const dailyOrdersPct = pct(stats.todayOrderCount, targets.dailyOrders);
  const dailySalesPct = pct(stats.todaySales, targets.dailySales);
  const dailyOverallPct = Math.round((dailyOrdersPct + dailySalesPct) / 2);

  const monthlyOrdersPct = pct(stats.monthOrderCount, targets.monthlyOrders);
  const monthlySalesPct = pct(stats.monthSales, targets.monthlySales);
  const monthlyOverallPct = Math.round((monthlyOrdersPct + monthlySalesPct) / 2);

  const efficiencySnapshot = [
    {
      label: 'ستريك تحقيق الهدف',
      value: streak.toLocaleString('en-US'),
      caption: 'يوم متتالي فوق هدف الإيراد',
    },
    {
      label: 'متوسط الطلب اليوم',
      value: formatEGPCurrency(stats.averageOrderValue),
      caption: 'كل رفع هنا يؤثر مباشرة على المكسب',
    },
    {
      label: 'إلغاء اليوم',
      value: `${stats.cancellationRate.toFixed(0)}%`,
      caption: 'الهدف الصحي أقل من 5%',
    },
    {
      label: 'العملاء العائدون',
      value: `${repeatCustomerRate.toFixed(0)}%`,
      caption: 'كل عميل عائد أرخص من اكتساب عميل جديد',
    },
  ];

  const trend14Days = useMemo(() => {
    const map = new Map<string, { sales: number; orders: number }>();
    orders.forEach((o) => {
      if (o.status === 'cancelled') return;
      const dayKey = o.created_at.slice(0, 10);
      const entry = map.get(dayKey) || { sales: 0, orders: 0 };
      entry.sales += o.price;
      entry.orders += 1;
      map.set(dayKey, entry);
    });

    const days: Array<{ key: string; label: string; sales: number; orders: number }> = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      const bucket = map.get(key) || { sales: 0, orders: 0 };
      days.push({ key, label, sales: bucket.sales, orders: bucket.orders });
    }
    return days;
  }, [orders]);

  const primaryVolumeCards = [
    {
      label: 'طلبات اليوم',
      value: stats.todayOrderCount.toLocaleString('en-US'),
      icon: ClipboardList,
      highlighted: false,
      href: '/orders',
      footer: (
        <span className="text-[11px] text-slate-500 tabular-nums tracking-tight">
          تم تسليم {stats.deliveredToday.length.toLocaleString('en-US')} طلب اليوم
        </span>
      ),
    },
    {
      label: 'الطلبات النشطة',
      value: stats.activeOrders.toLocaleString('en-US'),
      icon: Clock,
      highlighted: false,
      href: '/orders?status=active',
      footer:
        stats.activeOrders > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50/70 text-amber-700 border border-amber-200">
            قيد التشغيل والمتابعة
          </span>
        ) : (
          <span className="text-[11px] text-slate-500">لا توجد طلبات معلقة</span>
        ),
    },
    {
      label: 'مبيعات اليوم',
      value: formatEGPCurrency(stats.todaySales),
      icon: DollarSign,
      highlighted: false,
      href: '/orders',
      footer: (
        <span className="text-[11px] text-slate-500 tabular-nums tracking-tight">
          {dailySalesPct.toFixed(0)}% من الهدف اليومي
        </span>
      ),
    },
    {
      label: 'مبيعات الشهر',
      value: formatEGPCurrency(stats.monthSales),
      icon: TrendingUp,
      highlighted: true,
      href: '/orders?preset=all',
      footer: (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 tabular-nums tracking-tight">
          {stats.monthOrderCount.toLocaleString('en-US')} طلب هذا الشهر
        </span>
      ),
    },
  ];

  const maxChartVal = Math.max(
    1,
    ...trend14Days.map((d) => (chartMetric === 'sales' ? d.sales : d.orders)),
  );
  const activeTrendPoint = hoveredDayIdx !== null ? trend14Days[hoveredDayIdx] : trend14Days[trend14Days.length - 1];

  return (
    <div className="space-y-5" data-tier={currentTier?.badge ?? 'none'}>
      {inRouter && <RouterBridge navRef={navRef} />}
      {/* ROW 1: Executive Focus & Daily Momentum */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* 1. Daily Mission Card */}
        <div className={cn(CARD_BASE, 'lg:col-span-7')}>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200/60 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              مهمة اليوم 🔥
            </span>
            <span className="text-sm font-bold text-slate-900 tabular-nums tracking-tight">
              {missionProgress.toFixed(0)}%
            </span>
          </div>

          <div>
            <h2 className="text-base font-bold text-slate-900 mt-2">{missionLabel}</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              كل زيادة في متوسط الطلب وتقليل الإلغاء ترفع الربح أسرع من مجرد زيادة عدد الأوردرات.
            </p>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-4">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all"
              style={{ width: `${missionProgress}%` }}
            />
          </div>
        </div>

        {/* 2. Quick Efficiency Snapshot */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3">
          {efficiencySnapshot.map((item) => (
            <div
              key={item.label}
              className="h-full bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-slate-300 hover:shadow-xs transition-all duration-150 flex flex-col justify-between"
            >
              <div className="text-[11px] font-medium text-slate-500">{item.label}</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums tracking-tight mt-1">
                {item.value}
              </div>
              <div className="text-[11px] text-slate-400 line-clamp-1 mt-1">{item.caption}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ROW 2: Primary Revenue & Order Volume */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {primaryVolumeCards.map(({ label, value, icon: Icon, highlighted, href, footer }) => (
          <div
            key={label}
            onClick={() => goTo(href)}
            className={cn(
              CARD_BASE,
              inRouter && 'cursor-pointer group',
              highlighted && 'border-t-2 border-t-emerald-500',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">{label}</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-600 border border-slate-200/60 shrink-0 group-hover:border-slate-300 transition-colors">
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tight my-2">
              {value}
            </div>
            <div className="flex items-center justify-between gap-2">
              {footer}
              {inRouter && (
                <ArrowUpLeft className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 transition-colors shrink-0" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ROW 3: Operational Risk & Growth Insights (Actionable Drill-Down) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {quickWins.map(({ key, title, value, hint, icon: Icon, urgent, href, iconBadgeClass }) => (
          <div
            key={key}
            onClick={() => goTo(href)}
            className={cn(
              'h-full flex flex-col justify-between p-5 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150',
              inRouter && 'cursor-pointer group',
              urgent
                ? 'bg-amber-50/40 border border-amber-200/90 border-r-4 border-r-amber-500 hover:shadow-xs'
                : 'bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-xs',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'text-xs font-semibold',
                  urgent ? 'text-amber-900' : 'text-slate-600',
                )}
              >
                {title}
              </span>
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  iconBadgeClass,
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div
              className={cn(
                'text-2xl font-bold tabular-nums tracking-tight my-2',
                urgent ? 'text-amber-950' : 'text-slate-900',
              )}
            >
              {value}
            </div>

            <div className="flex items-end justify-between gap-2">
              <p
                className={cn(
                  'text-xs leading-relaxed',
                  urgent ? 'text-amber-800/90' : 'text-slate-500',
                )}
              >
                {hint}
              </p>
              {inRouter && (
                <ArrowUpLeft
                  className={cn(
                    'w-3.5 h-3.5 shrink-0 transition-colors',
                    urgent
                      ? 'text-amber-600 group-hover:text-amber-900'
                      : 'text-slate-300 group-hover:text-emerald-600',
                  )}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Interactive 14-Day Revenue & Order Volume Trend */}
      <div className={CARD_BASE}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">اتجاه الأداء خلال آخر 14 يوماً</h2>
              <p className="text-[11px] text-slate-500 tabular-nums tracking-tight">
                {activeTrendPoint
                  ? `${activeTrendPoint.label}: ${formatEGPCurrency(activeTrendPoint.sales)} · ${activeTrendPoint.orders.toLocaleString('en-US')} طلب`
                  : ''}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setChartMetric('sales')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer',
                chartMetric === 'sales' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              الإيراد اليومي
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('orders')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer',
                chartMetric === 'orders' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              عدد الطلبات
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-14 gap-1.5 items-end h-32 pt-2" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {trend14Days.map((day, idx) => {
            const val = chartMetric === 'sales' ? day.sales : day.orders;
            const heightPct = val > 0 ? Math.max(10, Math.round((val / maxChartVal) * 100)) : 4;
            const isHovered = hoveredDayIdx === idx;
            return (
              <div
                key={day.key}
                onMouseEnter={() => setHoveredDayIdx(idx)}
                onMouseLeave={() => setHoveredDayIdx(null)}
                className="flex flex-col items-center justify-end h-full gap-1.5 cursor-pointer group"
              >
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={cn(
                      'w-full rounded-t-md transition-all duration-150',
                      val === 0
                        ? 'bg-slate-100'
                        : isHovered
                          ? 'bg-emerald-700'
                          : 'bg-emerald-500/85 group-hover:bg-emerald-600',
                    )}
                    style={{ height: `${heightPct}%` }}
                    title={`${day.label}: ${chartMetric === 'sales' ? formatEGPCurrency(day.sales) : `${day.orders} طلب`}`}
                  />
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums tracking-tight hidden sm:block">
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ROW 4: Daily & Monthly Targets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Daily Targets */}
        <div className={CARD_BASE}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">الأهداف اليومية</h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 tabular-nums tracking-tight">
              {dailyOverallPct}%
            </span>
          </div>

          <div className="space-y-4 mt-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-500">
                  الطلبات:{' '}
                  <span className="font-semibold text-slate-800 tabular-nums tracking-tight">
                    {stats.todayOrderCount.toLocaleString('en-US')} / {targets.dailyOrders.toLocaleString('en-US')}
                  </span>
                </span>
                <span className="font-semibold text-slate-900 tabular-nums tracking-tight">
                  {dailyOrdersPct.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all"
                  style={{ width: `${dailyOrdersPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-500">
                  المبيعات:{' '}
                  <span className="font-semibold text-slate-800 tabular-nums tracking-tight">
                    {formatEGPCurrency(stats.todaySales)} / {formatEGPCurrency(targets.dailySales)}
                  </span>
                </span>
                <span className="font-semibold text-slate-900 tabular-nums tracking-tight">
                  {dailySalesPct.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all"
                  style={{ width: `${dailySalesPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Targets */}
        <div className={CARD_BASE}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-700 border border-slate-200/60 shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">الأهداف الشهرية</h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 tabular-nums tracking-tight">
              {monthlyOverallPct}%
            </span>
          </div>

          <div className="space-y-4 mt-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-500">
                  الطلبات:{' '}
                  <span className="font-semibold text-slate-800 tabular-nums tracking-tight">
                    {stats.monthOrderCount.toLocaleString('en-US')} / {targets.monthlyOrders.toLocaleString('en-US')}
                  </span>
                </span>
                <span className="font-semibold text-slate-900 tabular-nums tracking-tight">
                  {monthlyOrdersPct.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all"
                  style={{ width: `${monthlyOrdersPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-500">
                  المبيعات:{' '}
                  <span className="font-semibold text-slate-800 tabular-nums tracking-tight">
                    {formatEGPCurrency(stats.monthSales)} / {formatEGPCurrency(targets.monthlySales)}
                  </span>
                </span>
                <span className="font-semibold text-slate-900 tabular-nums tracking-tight">
                  {monthlySalesPct.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all"
                  style={{ width: `${monthlySalesPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Achievement progress */}
      {nextTier && (
        <div className={CARD_BASE}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-200/80 shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">
                الإنجاز التالي: {nextTier.emoji} {nextTier.label}
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 tabular-nums tracking-tight">
              {pct(stats.monthOrderCount, nextTier.threshold).toFixed(0)}%
            </span>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-500 tabular-nums tracking-tight">
                {stats.monthOrderCount.toLocaleString('en-US')} / {nextTier.threshold.toLocaleString('en-US')} طلب هذا الشهر
              </span>
              <span className="font-semibold text-slate-900 tabular-nums tracking-tight">
                {pct(stats.monthOrderCount, nextTier.threshold).toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all"
                style={{ width: `${pct(stats.monthOrderCount, nextTier.threshold)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Brand performance */}
      {brandBreakdown.length > 0 && (
        <div className={CARD_BASE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">أداء العلامات التجارية هذا الشهر</h2>
            <span className="text-xs text-slate-400 tabular-nums tracking-tight">
              {brandBreakdown.length.toLocaleString('en-US')} علامة
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {brandBreakdown.map((b) => (
              <div
                key={b.id}
                className="h-full flex flex-col justify-between rounded-xl p-3.5 bg-slate-50/60 border border-slate-200/80 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                  <span className="text-xs font-semibold text-slate-800 truncate">{b.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 tabular-nums tracking-tight">
                    {b.orders.toLocaleString('en-US')} طلب
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums tracking-tight">
                    {formatEGPCurrency(b.sales)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source breakdown + Status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <div className={CARD_BASE}>
          <h2 className="text-sm font-bold text-slate-900 mb-4">مصادر الطلبات هذا الشهر</h2>
          <div className="space-y-2.5 flex-1 flex flex-col justify-between">
            {(Object.entries(SOURCE_LABELS) as [OrderSource, string][]).map(([key, label]) => {
              const count = sourceBreakdown[key] || 0;
              const total = Object.values(sourceBreakdown).reduce((s, v) => s + (v || 0), 0);
              const share = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">{label}</span>
                    <div className="flex items-center gap-2 tabular-nums tracking-tight">
                      <span className="font-semibold text-slate-900">{count.toLocaleString('en-US')}</span>
                      <span className="text-slate-400">({share}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={CARD_BASE}>
          <h2 className="text-sm font-bold text-slate-900 mb-4">توزيع الحالات</h2>
          <div className="grid grid-cols-2 gap-2.5 flex-1">
            {(Object.entries(STATUS_LABELS) as [OrderStatus, string][]).map(([key, label]) => (
              <div
                key={key}
                onClick={() => goTo(`/orders?status=${key}`)}
                className={cn(
                  'flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2.5 transition-colors',
                  inRouter && 'cursor-pointer hover:bg-emerald-50/50 hover:border-emerald-200',
                )}
              >
                <span className="text-xs font-medium text-slate-600">{label}</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums tracking-tight">
                  {(statusBreakdown[key] || 0).toLocaleString('en-US')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
