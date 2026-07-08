import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Order, STATUS_LABELS, OrderStatus, ACHIEVEMENT_TIERS, SOURCE_LABELS, OrderSource } from '@/types/order';
import { ClipboardList, DollarSign, TrendingUp, Clock, Target, Award, Flame, Sparkles, AlertTriangle, Repeat, CircleDollarSign } from 'lucide-react';
import { Brand } from '@/hooks/useBrands';
import { formatEGPCurrency } from '@/lib/utils';

interface Props {
  orders: Order[];
  brands: Brand[];
  getTarget: (type: string) => number;
}

export default function Dashboard({ orders, brands, getTarget }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const now = Date.now();
  const pct = (val: number, target: number) => target > 0 ? Math.min(100, (val / target) * 100) : 0;

  const getDayKey = (value: string) => value.slice(0, 10);

  const getCustomerKey = (order: Order) => `${order.brand_id ?? 'no-brand'}:${order.phone}`;

  const daysAgo = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.getTime();
  };

  const stats = useMemo(() => {
    const todayOrders = orders.filter(o => o.created_at.slice(0, 10) === today);
    const monthOrders = orders.filter(o => o.created_at.slice(0, 7) === month);
    const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    const todaySales = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.price, 0);
    const monthSales = monthOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.price, 0);
    const cancelledToday = todayOrders.filter(o => o.status === 'cancelled');
    const deliveredToday = todayOrders.filter(o => o.status === 'delivered');
    const averageOrderValue = todaySales / Math.max(1, todayOrders.filter(o => o.status !== 'cancelled').length);
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
    orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [orders]);

  const sourceBreakdown = useMemo(() => {
    const counts: Partial<Record<OrderSource, number>> = {};
    orders.filter(o => o.created_at.slice(0, 7) === month).forEach(o => {
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

    let current = new Date();
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

    const atRiskCustomers = Array.from(customerLastSeen.values()).filter((lastSeen) => lastSeen < previous14DaysStart && lastSeen >= atRiskWindowStart).length;
    const delayedOrders = orders.filter((order) => !['delivered', 'cancelled'].includes(order.status) && now - new Date(order.created_at).getTime() > 1000 * 60 * 60 * 6).length;
    const missedRevenue = stats.cancelledToday.reduce((sum, order) => sum + order.price, 0);
    const bestSourceEntry = Object.entries(sourceBreakdown).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];

    return [
      {
        title: 'فرصة استرجاع عملاء',
        value: `${atRiskCustomers} عميل`,
        hint: atRiskCustomers > 0 ? 'ابعت عرض رجوع للعملاء غير النشطين منذ 14 إلى 30 يومًا.' : 'لا توجد قائمة استرجاع ساخنة الآن.',
        icon: Repeat,
        tone: 'text-info',
      },
      {
        title: 'طلبات معرضة للتأخير',
        value: `${delayedOrders} طلب`,
        hint: delayedOrders > 0 ? 'راجع الطلبات المفتوحة الأقدم من 6 ساعات قبل أن تتحول إلى إلغاء.' : 'لا توجد طلبات متأخرة حرجة الآن.',
        icon: AlertTriangle,
        tone: 'text-warning',
      },
      {
        title: 'إيراد مهدور اليوم',
        value: formatEGPCurrency(missedRevenue),
        hint: missedRevenue > 0 ? 'هذا هو أثر الطلبات الملغية اليوم مباشرة على الكاش.' : 'لم تخسر إيرادًا من الإلغاء اليوم.',
        icon: CircleDollarSign,
        tone: 'text-destructive',
      },
      {
        title: 'أفضل مصدر بيع',
        value: bestSourceEntry ? SOURCE_LABELS[bestSourceEntry[0] as OrderSource] : 'لا يوجد',
        hint: bestSourceEntry ? `المصدر الأقوى جلب ${bestSourceEntry[1]} طلب هذا الشهر. ركز عليه اليوم.` : 'ابدأ تتبع مصدر أول طلب فعلي.',
        icon: Sparkles,
        tone: 'text-success',
      },
    ];
  }, [daysAgo, now, orders, sourceBreakdown, stats.cancelledToday]);

  const missionLabel = stats.todaySales >= targets.dailySales && stats.todayOrderCount >= targets.dailyOrders
    ? 'تم تحقيق مهمة اليوم كاملة.'
    : stats.onTrackRevenue
      ? 'أنت قريب من إغلاق اليوم على الهدف.'
      : 'ركز على رفع الإيراد أولًا، لا عدد الطلبات فقط.';

  const missionProgress = Math.min(100, ((pct(stats.todaySales, targets.dailySales) + pct(stats.todayOrderCount, targets.dailyOrders)) / 2));

  const brandBreakdown = useMemo(() => {
    return brands.map(b => {
      const brandOrders = orders.filter(o => o.brand_id === b.id && o.created_at.slice(0, 7) === month);
      const sales = brandOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.price, 0);
      return { ...b, orders: brandOrders.length, sales };
    });
  }, [orders, brands, month]);

  const currentTier = useMemo(() => {
    const monthCount = stats.monthOrderCount;
    return [...ACHIEVEMENT_TIERS].reverse().find(t => monthCount >= t.threshold);
  }, [stats.monthOrderCount]);

  const nextTier = useMemo(() => {
    const monthCount = stats.monthOrderCount;
    return ACHIEVEMENT_TIERS.find(t => monthCount < t.threshold);
  }, [stats.monthOrderCount]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
        {currentTier && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: currentTier.color + '20', color: currentTier.color }}>
            <Award className="h-4 w-4" />
            <span className="text-sm font-bold">{currentTier.emoji} {currentTier.label}</span>
          </div>
        )}
      </div>

      <Card className="overflow-hidden border-0 bg-gradient-to-br from-orange-50 via-amber-50 to-emerald-50 p-0 shadow-sm">
        <div className="grid gap-4 p-5 lg:grid-cols-[1.5fr,1fr] lg:items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-orange-600">
              <Flame className="h-5 w-5" />
              <span className="text-sm font-semibold">مهمة اليوم</span>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">{missionLabel}</h2>
              <p className="mt-1 text-sm text-slate-600">كل زيادة في متوسط الطلب وتقليل الإلغاء ترفع الربح أسرع من مجرد زيادة عدد الأوردرات.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">تقدم المهمة</span>
                <span className="font-bold text-slate-900">{missionProgress.toFixed(0)}%</span>
              </div>
              <Progress value={missionProgress} className="h-3 bg-white/80" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-xs text-slate-500">ستريك تحقيق الهدف</div>
              <div className="mt-1 text-3xl font-black text-slate-900">{streak}</div>
              <div className="text-xs text-slate-600">يوم متتالي فوق هدف الإيراد</div>
            </div>
            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-xs text-slate-500">متوسط الطلب اليوم</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{formatEGPCurrency(stats.averageOrderValue)}</div>
              <div className="text-xs text-slate-600">كل رفع هنا يؤثر مباشرة على المكسب</div>
            </div>
            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-xs text-slate-500">إلغاء اليوم</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{stats.cancellationRate.toFixed(0)}%</div>
              <div className="text-xs text-slate-600">الهدف الصحي أقل من 5%</div>
            </div>
            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-xs text-slate-500">العملاء العائدون</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{repeatCustomerRate.toFixed(0)}%</div>
              <div className="text-xs text-slate-600">كل عميل عائد أرخص من اكتساب عميل جديد</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'طلبات اليوم', value: stats.todayOrderCount, icon: ClipboardList, accent: 'text-primary' },
          { label: 'الطلبات النشطة', value: stats.activeOrders, icon: Clock, accent: 'text-warning' },
          { label: 'مبيعات اليوم', value: formatEGPCurrency(stats.todaySales), icon: DollarSign, accent: 'text-success' },
          { label: 'مبيعات الشهر', value: formatEGPCurrency(stats.monthSales), icon: TrendingUp, accent: 'text-info' },
        ].map(({ label, value, icon: Icon, accent }) => (
          <Card key={label} className="p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
              <Icon className={`h-5 w-5 ${accent}`} />
            </div>
            <span className="text-2xl font-bold text-foreground">{value}</span>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {quickWins.map(({ title, value, hint, icon: Icon, tone }) => (
          <Card key={title} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <Icon className={`h-4 w-4 ${tone}`} />
            </div>
            <div className="text-2xl font-black text-foreground">{value}</div>
            <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
          </Card>
        ))}
      </div>

      {/* Targets with progress bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">الأهداف اليومية</h2>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">الطلبات: {stats.todayOrderCount}/{targets.dailyOrders}</span>
                <span className="font-medium text-foreground">{pct(stats.todayOrderCount, targets.dailyOrders).toFixed(0)}%</span>
              </div>
              <Progress value={pct(stats.todayOrderCount, targets.dailyOrders)} className="h-3" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">المبيعات: {formatEGPCurrency(stats.todaySales)} / {formatEGPCurrency(targets.dailySales)}</span>
                <span className="font-medium text-foreground">{pct(stats.todaySales, targets.dailySales).toFixed(0)}%</span>
              </div>
              <Progress value={pct(stats.todaySales, targets.dailySales)} className="h-3" />
            </div>
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-info" />
            <h2 className="text-sm font-semibold text-foreground">الأهداف الشهرية</h2>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">الطلبات: {stats.monthOrderCount}/{targets.monthlyOrders}</span>
                <span className="font-medium text-foreground">{pct(stats.monthOrderCount, targets.monthlyOrders).toFixed(0)}%</span>
              </div>
              <Progress value={pct(stats.monthOrderCount, targets.monthlyOrders)} className="h-3" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">المبيعات: {formatEGPCurrency(stats.monthSales)} / {formatEGPCurrency(targets.monthlySales)}</span>
                <span className="font-medium text-foreground">{pct(stats.monthSales, targets.monthlySales).toFixed(0)}%</span>
              </div>
              <Progress value={pct(stats.monthSales, targets.monthlySales)} className="h-3" />
            </div>
          </div>
        </Card>
      </div>

      {/* Achievement progress */}
      {nextTier && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold text-foreground">الإنجاز التالي: {nextTier.emoji} {nextTier.label}</h2>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">{stats.monthOrderCount} / {nextTier.threshold} طلب هذا الشهر</span>
            <span className="font-medium">{pct(stats.monthOrderCount, nextTier.threshold).toFixed(0)}%</span>
          </div>
          <Progress value={pct(stats.monthOrderCount, nextTier.threshold)} className="h-4" />
        </Card>
      )}

      {/* Brand performance */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">أداء العلامات التجارية هذا الشهر</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {brandBreakdown.map(b => (
            <div key={b.id} className="rounded-xl p-3 border" style={{ borderColor: b.color + '40' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="text-sm font-medium text-foreground">{b.name}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{b.orders} طلب</span>
                <span className="font-bold text-foreground">{formatEGPCurrency(b.sales)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Source breakdown + Status breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">مصادر الطلبات هذا الشهر</h2>
          <div className="space-y-2">
            {(Object.entries(SOURCE_LABELS) as [OrderSource, string][]).map(([key, label]) => {
              const count = sourceBreakdown[key] || 0;
              const total = Object.values(sourceBreakdown).reduce((s, v) => s + (v || 0), 0);
              return (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{count}</span>
                    <span className="text-xs text-muted-foreground">({total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">توزيع الحالات</h2>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(STATUS_LABELS) as [OrderStatus, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="font-bold text-foreground text-sm">{statusBreakdown[key] || 0}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
