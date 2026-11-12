import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useTargets } from '@/hooks/useTargets';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import { Loader2, KeyRound, Target, TrendingUp, CircleDollarSign } from 'lucide-react';
import { toast } from 'sonner';

const TARGET_FIELDS = [
  { key: 'daily_orders', label: 'هدف طلبات اليوم', hint: 'عدد الأوردرات المطلوب الوصول له يوميًا.', icon: Target },
  { key: 'daily_sales', label: 'هدف مبيعات اليوم', hint: 'المبلغ الذي تريد إقفاله يوميًا.', icon: CircleDollarSign },
  { key: 'monthly_orders', label: 'هدف طلبات الشهر', hint: 'حجم الطلبات الشهري المستهدف.', icon: TrendingUp },
  { key: 'monthly_sales', label: 'هدف مبيعات الشهر', hint: 'إيراد الشهر الذي تريد اللعب للوصول له.', icon: CircleDollarSign },
] as const;

type TargetFieldKey = typeof TARGET_FIELDS[number]['key'];
type TargetFormState = Record<TargetFieldKey, string>;

const EMPTY_TARGET_FORM: TargetFormState = {
  daily_orders: '',
  daily_sales: '',
  monthly_orders: '',
  monthly_sales: '',
};

export default function Settings() {
  const { displayName } = useAuth();
  const { targets, getTarget, updateTarget } = useTargets();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetValues, setTargetValues] = useState<TargetFormState>(EMPTY_TARGET_FORM);

  useEffect(() => {
    setTargetValues({
      daily_orders: String(getTarget('daily_orders') || ''),
      daily_sales: String(getTarget('daily_sales') || ''),
      monthly_orders: String(getTarget('monthly_orders') || ''),
      monthly_sales: String(getTarget('monthly_sales') || ''),
    });
  }, [targets, getTarget]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error('يرجى ملء الحقلين');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('يجب ألا تقل كلمة المرور عن 6 أحرف');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    if (isSupabaseUnavailable()) {
      toast.error('تغيير كلمة المرور غير متاح في الوضع المحلي.');
      return;
    }

    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);
    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        toast.error('تغيير كلمة المرور غير متاح في الوضع المحلي.');
        return;
      }

      toast.error(error.message);
    } else {
      toast.success('تم تحديث كلمة المرور بنجاح');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleTargetValueChange = (key: TargetFieldKey, value: string) => {
    setTargetValues((current) => ({ ...current, [key]: value }));
  };

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEntries = TARGET_FIELDS.map(({ key, label }) => {
      const rawValue = targetValues[key].trim();
      const parsedValue = Number(rawValue);
      return { key, label, rawValue, parsedValue };
    });

    const invalidEntry = normalizedEntries.find(({ rawValue, parsedValue }) => rawValue === '' || !Number.isFinite(parsedValue) || parsedValue < 0);
    if (invalidEntry) {
      toast.error(`أدخل رقمًا صحيحًا في ${invalidEntry.label}`);
      return;
    }

    setTargetsLoading(true);

    for (const entry of normalizedEntries) {
      await updateTarget(entry.key, entry.parsedValue);
    }

    setTargetsLoading(false);
    toast.success('تم تحديث أهداف التشغيل بنجاح');
  };

  return (
    <div className="space-y-5">
      <AppLayoutHeaderPortal>
        <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200/80 px-3 py-1 text-xs font-semibold text-slate-600">
          الحساب: {displayName || 'مستخدم'}
        </span>
      </AppLayoutHeaderPortal>

      <div className="grid gap-4 lg:grid-cols-12 items-stretch">
        <Card className="lg:col-span-7 p-5 flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700">
                    <Target className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900">أهداف التشغيل والربح</h2>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">غيّر الأهداف التي تتحرك عليها لوحة التحكم ولوحة الصدارة حتى يظل الفريق يلعب على أرقام حقيقية.</p>
              </div>
            </div>

            <form id="targets-form" onSubmit={handleSaveTargets} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {TARGET_FIELDS.map(({ key, label, hint, icon: Icon }) => (
                  <div key={key} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-emerald-600" />
                      <Label htmlFor={key} className="text-xs font-semibold text-slate-800">{label}</Label>
                    </div>
                    <Input
                      id={key}
                      inputMode="numeric"
                      min="0"
                      step="1"
                      className="bg-white tabular-nums tracking-tight font-semibold"
                      value={targetValues[key]}
                      onChange={(e) => handleTargetValueChange(key, e.target.value)}
                      placeholder="0"
                    />
                    <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>
                  </div>
                ))}
              </div>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold" disabled={targetsLoading}>
                {targetsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ أهداف التشغيل'}
              </Button>
            </form>
          </div>
        </Card>

        <Card className="lg:col-span-5 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-600">
                <KeyRound className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900">تغيير كلمة المرور</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">مسجل الدخول باسم <strong className="text-slate-800">{displayName}</strong></p>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">كلمة المرور الجديدة</Label>
                <Input type="password" dir="ltr" className="text-left" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="6 أحرف على الأقل" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">تأكيد كلمة المرور</Label>
                <Input type="password" dir="ltr" className="text-left" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="أعد كتابة كلمة المرور" />
              </div>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold" disabled={passwordLoading}>
                {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تحديث كلمة المرور'}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
