import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [updated, setUpdated] = useState(false);

  const updatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error('يجب ألا تقل كلمة المرور عن 8 أحرف');
      return;
    }
    if (password !== confirmation) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message || 'تعذر تحديث كلمة المرور. افتح رابطًا جديدًا وأعد المحاولة.');
      return;
    }
    setUpdated(true);
    toast.success('تم تحديث كلمة المرور بنجاح');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50/80 text-slate-900 antialiased p-4" dir="rtl">
      <Card className="w-full max-w-sm border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-slate-900">{updated ? 'تم تغيير كلمة المرور' : 'إنشاء كلمة مرور جديدة'}</CardTitle>
        </CardHeader>
        <CardContent>
          {updated ? (
            <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"><Link to="/login">العودة لتسجيل الدخول</Link></Button>
          ) : (
            <form onSubmit={updatePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs font-semibold text-slate-700">كلمة المرور الجديدة</Label>
                <Input id="new-password" type="password" dir="ltr" className="text-left" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-semibold text-slate-700">تأكيد كلمة المرور</Label>
                <Input id="confirm-password" type="password" dir="ltr" className="text-left" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving}>{saving ? 'جارٍ التحديث...' : 'حفظ كلمة المرور'}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
