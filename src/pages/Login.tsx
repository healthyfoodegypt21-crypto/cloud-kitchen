import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import BrandLogo from '@/components/BrandLogo';

export default function Login() {
  const { signIn, signInAsLocalDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [displayName, setDisplayName] = useState('');

  const getFunctionErrorMessage = async (error: unknown) => {
    const context = (error as { context?: unknown } | null)?.context;

    if (context instanceof Response) {
      const body = await context.clone().json().catch(() => null);
      if (body && typeof body === 'object' && typeof body.error === 'string') {
        return body.error;
      }
    }

    return error instanceof Error ? error.message : undefined;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) toast.error(error);
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !displayName.trim()) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }
    if (password.length < 6) {
      toast.error('يجب ألا تقل كلمة المرور عن 6 أحرف');
      return;
    }
    setLoading(true);

    if (isSupabaseUnavailable()) {
      toast.error('إعداد الحساب غير متاح حاليًا لأن الاتصال بقاعدة البيانات غير متاح. استخدم الدخول التجريبي المحلي.');
      setLoading(false);
      return;
    }

    // Call setup-owner edge function (creates user + assigns owner role server-side)
    const { data, error } = await supabase.functions.invoke('setup-owner', {
      body: {
        email: email.trim(),
        password,
        display_name: displayName.trim(),
      },
    });

    if (error || data?.error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        toast.error('إعداد الحساب غير متاح حاليًا لأن الاتصال بقاعدة البيانات غير متاح. استخدم الدخول التجريبي المحلي.');
        setLoading(false);
        return;
      }

      const errorMessage = data?.error || await getFunctionErrorMessage(error);
      if (errorMessage === 'Owner already exists. Use sign in.') {
        setMode('login');
        toast.error('يوجد حساب مالك بالفعل. سجّل الدخول باستخدام حساب المالك.');
      } else {
        toast.error(errorMessage || 'فشل إعداد الحساب');
      }
      setLoading(false);
      return;
    }

    // Now sign in with the created credentials
    const { error: signInError } = await signIn(email.trim(), password);
    setLoading(false);
    if (signInError) {
      toast.error(signInError);
    } else {
      toast.success('تم إنشاء حساب المالك بنجاح');
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50/80 text-slate-900 antialiased flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 space-y-6 border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <BrandLogo compact iconClassName="w-6 h-6 text-white" />
            </div>
            <span className="text-base font-bold tracking-wider text-slate-900">CLOUD KITCHENS</span>
          </div>
          <p className="text-xs text-slate-500">
            {mode === 'login' ? 'سجّل الدخول لإدارة العلامات والطلبات' : 'أنشئ حساب المالك للبدء'}
          </p>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">البريد الإلكتروني</Label>
              <Input id="email" type="email" dir="ltr" className="text-left" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-slate-700">كلمة المرور</Label>
              <Input id="password" type="password" dir="ltr" className="text-left" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تسجيل الدخول'}
            </Button>
            {import.meta.env.DEV && (
              <Button type="button" variant="outline" className="w-full text-xs" onClick={signInAsLocalDemo}>
                دخول تجريبي محلي
              </Button>
            )}
            <button type="button" onClick={() => setMode('setup')} className="w-full text-xs font-medium text-slate-500 hover:text-emerald-700 transition-colors">
              أول مرة؟ أنشئ حساب المالك
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">الاسم</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="اسم المالك" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">البريد الإلكتروني</Label>
              <Input type="email" dir="ltr" className="text-left" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">كلمة المرور</Label>
              <Input type="password" dir="ltr" className="text-left" value={password} onChange={e => setPassword(e.target.value)} placeholder="6 أحرف على الأقل" />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إنشاء حساب المالك'}
            </Button>
            {import.meta.env.DEV && (
              <Button type="button" variant="outline" className="w-full text-xs" onClick={signInAsLocalDemo}>
                دخول تجريبي محلي
              </Button>
            )}
            <button type="button" onClick={() => setMode('login')} className="w-full text-xs font-medium text-slate-500 hover:text-emerald-700 transition-colors">
              لديك حساب بالفعل؟ سجّل الدخول
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
