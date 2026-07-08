import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useTargets } from '@/hooks/useTargets';
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">أهداف التشغيل والربح</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">غيّر الأهداف التي تتحرك عليها لوحة التحكم ولوحة الصدارة حتى يظل الفريق يلعب على أرقام حقيقية.</p>
            </div>
          </div>

          <form onSubmit={handleSaveTargets} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {TARGET_FIELDS.map(({ key, label, hint, icon: Icon }) => (
                <div key={key} className="rounded-2xl border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <Label htmlFor={key}>{label}</Label>
                  </div>
                  <Input
                    id={key}
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={targetValues[key]}
                    onChange={(e) => handleTargetValueChange(key, e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>
            <Button type="submit" disabled={targetsLoading}>
              {targetsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ أهداف التشغيل'}
            </Button>
          </form>
        </Card>

        <Card className="p-6 max-w-md">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">تغيير كلمة المرور</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">مسجل الدخول باسم <strong>{displayName}</strong></p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="6 أحرف على الأقل" />
            </div>
            <div className="space-y-1.5">
              <Label>تأكيد كلمة المرور</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="أعد كتابة كلمة المرور" />
            </div>
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تحديث كلمة المرور'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
