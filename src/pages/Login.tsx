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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <BrandLogo compact iconClassName="h-14 w-14 rounded-3xl" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Cloud Kitchen</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'سجّل الدخول لإدارة العلامات والطلبات' : 'أنشئ حساب المالك للبدء'}
          </p>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تسجيل الدخول'}
            </Button>
            {import.meta.env.DEV && (
              <Button type="button" variant="outline" className="w-full" onClick={signInAsLocalDemo}>
                دخول تجريبي محلي
              </Button>
            )}
            <button type="button" onClick={() => setMode('setup')} className="w-full text-sm text-muted-foreground hover:text-primary transition-colors">
              أول مرة؟ أنشئ حساب المالك
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="space-y-1.5">
              <Label>الاسم</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="اسم المالك" />
            </div>
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>كلمة المرور</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="6 أحرف على الأقل" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إنشاء حساب المالك'}
            </Button>
            {import.meta.env.DEV && (
              <Button type="button" variant="outline" className="w-full" onClick={signInAsLocalDemo}>
                دخول تجريبي محلي
              </Button>
            )}
            <button type="button" onClick={() => setMode('login')} className="w-full text-sm text-muted-foreground hover:text-primary transition-colors">
              لديك حساب بالفعل؟ سجّل الدخول
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
