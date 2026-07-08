import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Order, ACHIEVEMENT_TIERS } from '@/types/order';
import { Trophy, Medal, Award, TrendingUp, Flame, ShieldCheck, CircleDollarSign } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { formatEGPCurrency } from '@/lib/utils';

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
  const podiumColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-warning" />
        <h1 className="text-2xl font-bold text-foreground">لوحة الصدارة</h1>
        <span className="text-sm text-muted-foreground">هذا الشهر</span>
      </div>

      {leaderboard.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">لا يوجد نشاط هذا الشهر حتى الآن. ابدأ بإنشاء طلبات جديدة.</div>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((agent, idx) => {
            const PodiumIcon = idx < 3 ? podiumIcons[idx] : TrendingUp;
            const podiumColor = idx < 3 ? podiumColors[idx] : 'text-muted-foreground';
            return (
              <Card key={agent.userId} className={`p-4 transition-all duration-200 hover:shadow-lg ${idx === 0 ? 'border-yellow-400/50 bg-yellow-50/30 dark:bg-yellow-900/10' : ''}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                    <PodiumIcon className={`h-5 w-5 ${podiumColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-lg">#{idx + 1}</span>
                      <span className="font-medium text-foreground">{agent.name}</span>
                      {agent.tier && (
                        <span className="text-sm px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: agent.tier.color + '20', color: agent.tier.color }}>
                          {agent.tier.emoji} {agent.tier.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>تقدم النقاط</span>
                        <span className="font-semibold text-foreground">{agent.score} نقطة</span>
                      </div>
                      <Progress value={Math.min(100, (agent.score / topScoreTarget) * 100)} className="h-2" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 font-bold text-foreground text-lg"><Flame className="h-4 w-4 text-orange-500" />{agent.score}</div>
                      <div className="text-xs text-muted-foreground">النقاط</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 font-bold text-foreground text-lg"><CircleDollarSign className="h-4 w-4 text-emerald-500" />{formatEGPCurrency(agent.sales)}</div>
                      <div className="text-xs text-muted-foreground">المبيعات</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-foreground text-lg">{agent.conversionRate.toFixed(0)}%</div>
                      <div className="text-xs text-muted-foreground">تسليم من الطلبات</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 font-bold text-foreground text-lg"><ShieldCheck className="h-4 w-4 text-sky-500" />{agent.reliabilityRate.toFixed(0)}%</div>
                      <div className="text-xs text-muted-foreground">اعتمادية</div>
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
