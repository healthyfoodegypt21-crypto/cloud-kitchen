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
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{updated ? 'تم تغيير كلمة المرور' : 'إنشاء كلمة مرور جديدة'}</CardTitle>
        </CardHeader>
        <CardContent>
          {updated ? (
            <Button asChild className="w-full"><Link to="/login">العودة لتسجيل الدخول</Link></Button>
          ) : (
            <form onSubmit={updatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
                <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? 'جارٍ التحديث...' : 'حفظ كلمة المرور'}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
