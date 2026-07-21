import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Shield, Eye, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { useBrands } from '@/hooks/useBrands';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { ALL_PAGES, DEFAULT_PAGES, type AppPageId } from '@/lib/permissions';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';

type KnownAppRole = Database['public']['Enums']['app_role'];

interface UserWithRole {
  id: string;
  display_name: string;
  role: string | null;
  brandIds: string[];
  pages: string[];
}

const ROLE_LABELS: Record<KnownAppRole, string> = {
  owner: 'مالك',
  call_center: 'خدمة العملاء',
  kitchen: 'المطبخ',
  delivery: 'التوصيل',
};

const ROLE_COLORS: Record<KnownAppRole, string> = {
  owner: 'bg-primary text-primary-foreground',
  call_center: 'bg-info text-info-foreground',
  kitchen: 'bg-warning text-warning-foreground',
  delivery: 'bg-secondary text-secondary-foreground',
};

const LOCAL_DEMO_USERS: UserWithRole[] = [
  {
    id: 'local-demo-owner',
    display_name: 'مالك تجريبي',
    role: 'owner',
    brandIds: ['brand-1', 'brand-2', 'brand-3'],
    pages: DEFAULT_PAGES.owner,
  },
];

export default function UsersManagement() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserWithRole | null>(null);
  const [creating, setCreating] = useState(false);
  const { brands } = useBrands();
  const [form, setForm] = useState({
    email: '', password: '', displayName: '', role: '' as string,
    brandIds: [] as string[],
    pages: [] as AppPageId[],
  });

  const fetchUsers = async () => {
    if (isSupabaseUnavailable()) {
      setUsers(LOCAL_DEMO_USERS);
      setLoading(false);
      return;
    }

    const [profilesResponse, rolesResponse, brandAccessResponse, pagePermissionsResponse] = await Promise.all([
      supabase.from('profiles').select('id, display_name'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('user_brand_access').select('user_id, brand_id'),
      supabase.from('user_page_permissions').select('user_id, page'),
    ]);

    const responses = [profilesResponse, rolesResponse, brandAccessResponse, pagePermissionsResponse];
    const networkError = responses.find((response) => isSupabaseNetworkError(response.error));
    if (networkError) {
      markSupabaseUnavailable();
      setUsers(LOCAL_DEMO_USERS);
      setLoading(false);
      return;
    }

    const firstError = responses.find((response) => response.error);
    if (firstError) {
      toast.error(firstError.error?.message || 'تعذر تحميل بيانات المستخدمين');
      console.error(firstError.error);
      setUsers([]);
      setLoading(false);
      return;
    }

    const profiles = profilesResponse.data ?? [];
    const roles = rolesResponse.data ?? [];
    const brandAccess = brandAccessResponse.data ?? [];
    const pagePerms = pagePermissionsResponse.data ?? [];

    if (profiles) {
      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) ?? []);
      const brandMap = new Map<string, string[]>();
      brandAccess?.forEach(ba => {
        const existing = brandMap.get(ba.user_id) || [];
        existing.push(ba.brand_id);
        brandMap.set(ba.user_id, existing);
      });
      const pageMap = new Map<string, string[]>();
      pagePerms?.forEach(pp => {
        const existing = pageMap.get(pp.user_id) || [];
        existing.push(pp.page);
        pageMap.set(pp.user_id, existing);
      });

      setUsers(profiles.map(p => ({
        id: p.id,
        display_name: p.display_name,
        role: roleMap.get(p.id) ?? null,
        brandIds: brandMap.get(p.id) ?? [],
        pages: pageMap.get(p.id) ?? [],
      })));
    } else {
      setUsers(LOCAL_DEMO_USERS);
    }
    setLoading(false);
  };

  useEffect(() => { void fetchUsers(); }, []);

  useSupabaseRealtimeRefresh({
    channelName: 'users-management-realtime',
    tables: [
      { table: 'profiles' },
      { table: 'user_roles' },
      { table: 'user_brand_access' },
      { table: 'user_page_permissions' },
    ],
    onRefresh: fetchUsers,
  });

  const handleRoleChange = (role: string) => {
    const normalizedRole = role.trim().toLowerCase() as KnownAppRole;
    setForm(f => ({
      ...f,
      role,
      pages: DEFAULT_PAGES[normalizedRole] ?? f.pages,
    }));
  };

  const toggleBrand = (brandId: string) => {
    setForm(f => ({
      ...f,
      brandIds: f.brandIds.includes(brandId)
        ? f.brandIds.filter(id => id !== brandId)
        : [...f.brandIds, brandId],
    }));
  };

  const togglePage = (page: string) => {
    setForm(f => ({
      ...f,
      pages: f.pages.includes(page)
        ? f.pages.filter(p => p !== page)
        : [...f.pages, page],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.displayName || !form.role) {
      toast.error('يرجى اختيار الدور وملء جميع الحقول المطلوبة');
      return;
    }
    if (form.password.length < 6) {
      toast.error('يجب ألا تقل كلمة المرور عن 6 أحرف');
      return;
    }
    if (form.brandIds.length === 0) {
      toast.error('يرجى اختيار علامة تجارية واحدة على الأقل');
      return;
    }
    if (form.pages.length === 0) {
      toast.error('يرجى اختيار صفحة واحدة على الأقل للمستخدم');
      return;
    }

    if (isSupabaseUnavailable()) {
      toast.error('إدارة المستخدمين غير متاحة في الوضع المحلي.');
      return;
    }

    setCreating(true);
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: form.email.trim(),
        password: form.password,
        display_name: form.displayName.trim(),
        role: form.role,
        brand_ids: form.brandIds,
        pages: form.pages,
      },
    });
    setCreating(false);

    if (error || data?.error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        toast.error('إدارة المستخدمين غير متاحة في الوضع المحلي.');
        return;
      }

      toast.error(data?.error || error?.message || 'فشل إنشاء المستخدم');
      return;
    }

    toast.success('تم إنشاء المستخدم بنجاح');
    setForm({ email: '', password: '', displayName: '', role: '', brandIds: [], pages: [] });
    setOpen(false);
    fetchUsers();
  };

  const handleResetPassword = async (userId: string) => {
    const newPassword = prompt('أدخل كلمة المرور الجديدة، 6 أحرف على الأقل:');
    if (!newPassword || newPassword.length < 6) {
      toast.error('يجب ألا تقل كلمة المرور عن 6 أحرف');
      return;
    }

    if (isSupabaseUnavailable()) {
      toast.error('إعادة تعيين كلمة المرور غير متاحة في الوضع المحلي.');
      return;
    }

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action: 'reset_password', user_id: userId, password: newPassword },
    });
    if (error || data?.error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        toast.error('إعادة تعيين كلمة المرور غير متاحة في الوضع المحلي.');
        return;
      }

      toast.error(data?.error || error?.message || 'فشل إعادة تعيين كلمة المرور');
    } else {
      toast.success('تمت إعادة تعيين كلمة المرور بنجاح');
    }
  };

  const openEdit = (user: UserWithRole) => {
    setEditUser(user);
    setForm({
      email: '', password: '',
      displayName: user.display_name,
      role: user.role ?? '',
      brandIds: user.brandIds,
      pages: user.pages,
    });
  };

  const savePermissions = async () => {
    if (!editUser) return;

    if (isSupabaseUnavailable()) {
      toast.error('تعديل الصلاحيات غير متاح في الوضع المحلي.');
      return;
    }

    setCreating(true);
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        action: 'update_permissions',
        user_id: editUser.id,
        brand_ids: form.brandIds,
        pages: form.pages,
      },
    });
    setCreating(false);
    if (error || data?.error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        toast.error('تعديل الصلاحيات غير متاح في الوضع المحلي.');
        return;
      }

      toast.error(data?.error || error?.message || 'فشل تحديث الصلاحيات');
    } else {
      toast.success('تم تحديث الصلاحيات');
      setEditUser(null);
      fetchUsers();
    }
  };

  const renderForm = (isEdit: boolean) => (
    <div className="grid gap-4 pt-2">
      {!isEdit && (
        <>
          <div className="grid gap-1.5">
            <Label>الدور *</Label>
            <Input value={form.role} onChange={e => handleRoleChange(e.target.value)} placeholder="مثال: كاشير، مشرف وردية، محاسب" />
            <p className="text-xs text-muted-foreground">
              اكتب أي مسمى وظيفي. للأدوار الافتراضية باللغة الإنجليزية مثل owner أو kitchen تُملأ الصفحات المبدئية تلقائيًا؛ ويمكنك تعديلها أدناه.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>الاسم المعروض *</Label>
            <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="اسم المستخدم" />
          </div>
          <div className="grid gap-1.5">
            <Label>البريد الإلكتروني *</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
          </div>
          <div className="grid gap-1.5">
            <Label>كلمة المرور *</Label>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="6 أحرف على الأقل" />
          </div>
        </>
      )}
      <div className="grid gap-1.5">
        <Label className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> صلاحيات العلامات التجارية *</Label>
        <div className="flex flex-wrap gap-2">
          {brands.map(b => (
            <label key={b.id} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors" style={{
              borderColor: form.brandIds.includes(b.id) ? b.color : 'hsl(var(--border))',
              backgroundColor: form.brandIds.includes(b.id) ? b.color + '15' : 'transparent',
            }}>
              <Checkbox checked={form.brandIds.includes(b.id)} onCheckedChange={() => toggleBrand(b.id)} />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
              <span className="text-sm">{b.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> صلاحيات الصفحات *</Label>
        <p className="text-xs text-muted-foreground">اختر الصفحات التي يستطيع المستخدم فتحها.</p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_PAGES.map(page => (
            <label key={page.id} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-colors hover:bg-muted">
              <Checkbox checked={form.pages.includes(page.id)} onCheckedChange={() => togglePage(page.id)} />
              <span className="text-sm">{page.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مستخدم</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>إنشاء مستخدم جديد</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate}>
              {renderForm(false)}
              <Button type="submit" className="w-full mt-4" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إنشاء المستخدم'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit permissions dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل الصلاحيات - {editUser?.display_name}</DialogTitle></DialogHeader>
          {renderForm(true)}
          <Button onClick={savePermissions} className="w-full mt-4" disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ الصلاحيات'}
          </Button>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">لا يوجد مستخدمون حتى الآن.</div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <Card key={u.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{u.display_name}</span>
                    {u.role && <Badge className={ROLE_COLORS[u.role as KnownAppRole] ?? 'bg-secondary text-secondary-foreground'}>{ROLE_LABELS[u.role as KnownAppRole] ?? u.role}</Badge>}
                  </div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {u.brandIds.map(bid => {
                      const brand = brands.find(b => b.id === bid);
                      return brand ? (
                        <span key={bid} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: brand.color + '20', color: brand.color }}>
                          {brand.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openEdit(u)} className="text-xs gap-1">
                    <Shield className="h-3.5 w-3.5" /> الصلاحيات
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleResetPassword(u.id)} className="text-xs gap-1">
                    <KeyRound className="h-3.5 w-3.5" /> إعادة تعيين
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
