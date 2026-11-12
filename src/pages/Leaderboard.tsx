import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Order, ACHIEVEMENT_TIERS } from '@/types/order';
import { Trophy, Medal, Award, TrendingUp, Flame, ShieldCheck, CircleDollarSign } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import { cn, formatEGPCurrency } from '@/lib/utils';

interface UserProfile {
  id: string;
  display_name: string;
}

interface Props {
  orders: Order[];
  profiles: UserProfile[];
}

export default function Leaderboard({ orders, profiles }: Props) {
  const month = new Date().toISOString().slice(0, 7);
  const topScoreTarget = 120;

  const leaderboard = useMemo(() => {
    const monthOrders = orders.filter(o => o.created_at.slice(0, 7) === month);
    const agentMap = new Map<string, { orders: number; delivered: number; cancelled: number; sales: number }>();

    monthOrders.forEach(o => {
      if (!o.created_by) return;
      const existing = agentMap.get(o.created_by) || { orders: 0, delivered: 0, cancelled: 0, sales: 0 };
      if (o.status !== 'cancelled') {
        existing.orders++;
        existing.sales += o.price;
      }
      if (o.status === 'delivered') existing.delivered++;
      if (o.status === 'cancelled') existing.cancelled++;
      agentMap.set(o.created_by, existing);
    });

    return Array.from(agentMap.entries())
      .map(([userId, stats]) => {
        const profile = profiles.find(p => p.id === userId);
        const tier = [...ACHIEVEMENT_TIERS].reverse().find(t => stats.orders >= t.threshold);
        const conversionRate = stats.orders > 0 ? (stats.delivered / stats.orders) * 100 : 0;
        const reliabilityRate = (stats.orders + stats.cancelled) > 0 ? (stats.delivered / (stats.orders + stats.cancelled)) * 100 : 0;
        const score = Math.max(0, Math.round((stats.delivered * 8) + (stats.orders * 3) + (stats.sales / 250) - (stats.cancelled * 6)));
        return {
          userId,
          name: profile?.display_name ?? 'غير معروف',
          ...stats,
          conversionRate,
          reliabilityRate,
          score,
          tier,
        };
      })
      .sort((a, b) => b.score - a.score || b.sales - a.sales || b.delivered - a.delivered);
  }, [orders, profiles, month]);

  const podiumIcons = [Trophy, Medal, Award];
  const podiumBadges = [
    'bg-amber-50 text-amber-700 border border-amber-200/80',
    'bg-slate-100 text-slate-700 border border-slate-200/80',
    'bg-orange-50 text-orange-700 border border-orange-200/80',
  ];

  return (
    <div className="space-y-5">
      <AppLayoutHeaderPortal>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200/80 px-3 py-1 text-xs font-semibold text-amber-700 tabular-nums">
          <Trophy className="h-3.5 w-3.5" />
          <span>ترتيب الشهر الحالي ({leaderboard.length.toLocaleString('en-US')})</span>
        </span>
      </AppLayoutHeaderPortal>

      {leaderboard.length === 0 ? (
        <Card className="border-dashed p-12 text-center text-sm text-slate-500">
          لا يوجد نشاط هذا الشهر حتى الآن. ابدأ بإنشاء طلبات جديدة.
        </Card>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((agent, idx) => {
            const PodiumIcon = idx < 3 ? podiumIcons[idx] : TrendingUp;
            const iconBoxClass =
              idx < 3
                ? podiumBadges[idx]
                : 'bg-slate-50 text-slate-500 border border-slate-200/60';

            return (
              <Card
                key={agent.userId}
                className={cn(
                  'p-5 hover:border-slate-300 hover:shadow-xs transition-all duration-150',
                  idx === 0 && 'border-r-4 border-r-amber-500 bg-amber-50/20',
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl shrink-0', iconBoxClass)}>
                    <PodiumIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm tabular-nums">#{idx + 1}</span>
                      <span className="font-bold text-sm text-slate-900">{agent.name}</span>
                      {agent.tier && (
                        <span
                          className={cn(
                            'text-[11px] px-2 py-0.5 rounded-full font-semibold border',
                            agent.tier.badge === 'gold' && 'bg-amber-50 text-amber-700 border-amber-200/80',
                            agent.tier.badge === 'silver' && 'bg-slate-100 text-slate-700 border-slate-200/80',
                            agent.tier.badge === 'bronze' && 'bg-orange-50 text-orange-700 border-orange-200/80',
                          )}
                        >
                          {agent.tier.emoji} {agent.tier.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>تقدم النقاط</span>
                        <span className="font-semibold text-slate-900 tabular-nums tracking-tight">{agent.score.toLocaleString('en-US')} نقطة</span>
                      </div>
                      <Progress value={Math.min(100, (agent.score / topScoreTarget) * 100)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4 shrink-0">
                    <div className="rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 font-bold text-slate-900 text-sm tabular-nums tracking-tight"><Flame className="h-3.5 w-3.5 text-orange-500" />{agent.score.toLocaleString('en-US')}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">النقاط</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 font-bold text-slate-900 text-sm tabular-nums tracking-tight"><CircleDollarSign className="h-3.5 w-3.5 text-emerald-600" />{formatEGPCurrency(agent.sales)}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">المبيعات</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="font-bold text-slate-900 text-sm tabular-nums tracking-tight">{agent.conversionRate.toFixed(0)}%</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">تسليم من الطلبات</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 font-bold text-slate-900 text-sm tabular-nums tracking-tight"><ShieldCheck className="h-3.5 w-3.5 text-sky-600" />{agent.reliabilityRate.toFixed(0)}%</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">اعتمادية</div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
