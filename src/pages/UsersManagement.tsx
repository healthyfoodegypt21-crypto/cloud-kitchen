import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Building2, ChevronLeft, ChevronRight, Clock3, Download, Ellipsis, FilterX, KeyRound,
  Mail, Plus, Search, Shield, Store, Trash2, UserRound, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBrands } from '@/hooks/useBrands';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { ALL_PAGES, DEFAULT_PAGES, type AppPageId } from '@/lib/permissions';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import * as XLSX from 'xlsx';

type UserStatus = 'active' | 'inactive' | 'pending';
type UserRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  branches: string[];
  brands: string[];
  pages: string[];
  status: UserStatus;
  last_login: string | null;
  created_at: string;
};
type KitchenHub = { id: string; name: string; is_active: boolean };
type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  brands: string[];
  branches: string[];
  pages: AppPageId[];
};
type ConfirmAction = { type: 'delete' | 'status'; userIds: string[]; status?: UserStatus } | null;

const EMPTY_FORM: UserForm = {
  name: '', email: '', phone: '', password: '', role: '',
  brands: [], branches: [], pages: [],
};

const ROLE_TEMPLATES: { value: string; label: string; color: string; pages: AppPageId[] }[] = [
  { value: 'owner', label: 'مدير نظام', color: 'bg-primary text-primary-foreground', pages: DEFAULT_PAGES.owner },
  { value: 'branch_manager', label: 'مدير فرع', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200', pages: ['dashboard', 'orders', 'kitchen', 'customers', 'inventory', 'purchases', 'hr'] },
  { value: 'inventory_manager', label: 'مدير مخزن', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', pages: ['dashboard', 'inventory', 'purchases'] },
  { value: 'cashier', label: 'كاشير وإغلاق', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', pages: ['dashboard', 'orders', 'customers'] },
  { value: 'chef', label: 'شيف', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200', pages: ['kitchen', 'inventory'] },
  { value: 'purchasing', label: 'مشتريات', color: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200', pages: ['inventory', 'purchases'] },
];

const LEGACY_ROLE_LABELS: Record<string, string> = {
  call_center: 'خدمة العملاء',
  kitchen: 'المطبخ',
  delivery: 'التوصيل',
};

function roleLabel(role: string) {
  return ROLE_TEMPLATES.find((item) => item.value === role)?.label ?? LEGACY_ROLE_LABELS[role] ?? role;
}

function roleStyle(role: string) {
  return ROLE_TEMPLATES.find((item) => item.value === role)?.color
    ?? (role === 'call_center' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
      : role === 'kitchen' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
        : role === 'delivery' ? 'bg-secondary text-secondary-foreground'
          : 'bg-secondary text-secondary-foreground');
}

const REALTIME_TABLES = [
  { table: 'profiles' },
  { table: 'user_roles' },
  { table: 'user_brand_access' },
  { table: 'user_page_permissions' },
  { table: 'kitchen_hubs' },
  { table: 'user_kitchen_hub_access' },
];

const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'نشط',
  inactive: 'معطل',
  pending: 'معلق',
};

const STATUS_STYLES: Record<UserStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  inactive: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
};

function localDemoUser(): UserRecord {
  return {
    id: 'local-demo-owner',
    name: 'مالك تجريبي',
    email: '',
    phone: '',
    role: 'owner',
    branches: [],
    brands: ['brand-1', 'brand-2', 'brand-3'],
    pages: DEFAULT_PAGES.owner,
    status: 'active',
    last_login: null,
    created_at: new Date(0).toISOString(),
  };
}

function relativeActivity(value: string | null) {
  if (!value) return 'لم يسجل الدخول';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'غير متاح';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'الآن';
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['day', 86_400],
    ['hour', 3_600], ['minute', 60],
  ];
  const [unit, divisor] = units.find(([, size]) => seconds >= size) ?? units[units.length - 1];
  return new Intl.RelativeTimeFormat('ar', { numeric: 'auto' }).format(-Math.floor(seconds / divisor), unit);
}

function validateForm(form: UserForm, mode: 'create' | 'details' | 'permissions') {
  if (mode === 'permissions') {
    if (form.brands.length === 0) return 'اختر علامة تجارية واحدة على الأقل';
    if (form.pages.length === 0) return 'اختر صفحة واحدة على الأقل';
    return null;
  }
  if (!form.name.trim()) return 'أدخل اسم الموظف';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'أدخل بريدًا إلكترونيًا صحيحًا';
  if (!form.role.trim()) return 'اختر الدور الوظيفي';
  if (form.phone && !/^[+\d()\s-]{7,24}$/.test(form.phone.trim())) return 'أدخل رقم هاتف صحيحًا';
  if (mode === 'create' && form.password.length < 8) return 'يجب ألا تقل كلمة المرور عن 8 أحرف';
  if (mode === 'create' && form.brands.length === 0) return 'اختر علامة تجارية واحدة على الأقل';
  if (mode === 'create' && form.pages.length === 0) return 'اختر صفحة واحدة على الأقل';
  return null;
}

async function getFunctionErrorMessage(error: unknown) {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null);
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
  }
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع في الخادم';
}

function AssignmentBadges({ ids, labels, kind }: { ids: string[]; labels: Map<string, { name: string; color?: string }>; kind: 'brand' | 'hub' }) {
  if (ids.length === 0) return <span className="text-xs text-muted-foreground">غير معين</span>;
  const visible = ids.slice(0, 2);
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((id) => {
        const label = labels.get(id);
        if (!label) return null;
        return (
          <Badge
            key={id}
            variant="outline"
            className="max-w-32 truncate font-normal"
            style={kind === 'brand' && label.color ? { borderColor: `${label.color}70`, color: label.color } : undefined}
          >
            {label.name}
          </Badge>
        );
      })}
      {ids.length > visible.length && <Badge variant="secondary">+{ids.length - visible.length} أخرى</Badge>}
    </div>
  );
}

export default function UsersManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [hubs, setHubs] = useState<KitchenHub[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hubDialogOpen, setHubDialogOpen] = useState(false);
  const [hubName, setHubName] = useState('');
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [dialogTab, setDialogTab] = useState('details');
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [hubFilter, setHubFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const { brands } = useBrands();
  const { user: currentUser } = useAuth();

  const fetchUsers = useCallback(async () => {
    if (isSupabaseUnavailable()) {
      setUsers([localDemoUser()]);
      setHubs([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke<{
      users?: UserRecord[];
      hubs?: KitchenHub[];
      error?: string;
    }>('create-user', { body: { action: 'list_users' } });

    if (error || data?.error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        setUsers([localDemoUser()]);
        setHubs([]);
      } else {
        console.error(error || data?.error);
        toast.error(data?.error || await getFunctionErrorMessage(error));
        setUsers([]);
      }
      setLoading(false);
      return;
    }

    setUsers(data?.users ?? []);
    setHubs(data?.hubs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);
  useSupabaseRealtimeRefresh({
    channelName: 'users-management-realtime-v2',
    tables: REALTIME_TABLES,
    onRefresh: fetchUsers,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim().toLocaleLowerCase()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const brandLabels = useMemo(
    () => new Map(brands.map((brand) => [brand.id, { name: brand.name, color: brand.color }])),
    [brands],
  );
  const hubLabels = useMemo(() => new Map(hubs.map((hub) => [hub.id, { name: hub.name }])), [hubs]);
  const roleOptions = useMemo(() => [...new Set(users.map((item) => item.role).filter(Boolean))], [users]);
  const filteredUsers = useMemo(() => users.filter((item) => {
    const matchesSearch = !debouncedSearch
      || item.name.toLocaleLowerCase().includes(debouncedSearch)
      || item.email.toLocaleLowerCase().includes(debouncedSearch)
      || item.phone.toLocaleLowerCase().includes(debouncedSearch);
    return matchesSearch
      && (roleFilter === 'all' || item.role === roleFilter)
      && (hubFilter === 'all' || item.branches.includes(hubFilter))
      && (brandFilter === 'all' || item.brands.includes(brandFilter))
      && (statusFilter === 'all' || item.status === statusFilter);
  }), [users, debouncedSearch, roleFilter, hubFilter, brandFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pageNumbers = pageCount <= 7
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : [...new Set([1, 2, page - 1, page, page + 1, pageCount - 1, pageCount].filter((value) => value > 0 && value <= pageCount))];
  const pageUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
  const selectedUsers = users.filter((item) => selected.includes(item.id));
  const selectablePageUsers = pageUsers.filter((item) => item.role !== 'owner' && item.id !== currentUser?.id);
  const allPageSelected = selectablePageUsers.length > 0 && selectablePageUsers.every((item) => selected.includes(item.id));
  const somePageSelected = selectablePageUsers.some((item) => selected.includes(item.id));

  useEffect(() => { setPage(1); }, [debouncedSearch, roleFilter, hubFilter, brandFilter, statusFilter, pageSize]);

  const openCreate = () => {
    setEditUser(null);
    setForm({ ...EMPTY_FORM, brands: brands.map((brand) => brand.id), pages: ['dashboard'] });
    setDialogTab('details');
    setDialogOpen(true);
  };

  const openEdit = (record: UserRecord, tab = 'details') => {
    setEditUser(record);
    setForm({
      name: record.name,
      email: record.email,
      phone: record.phone,
      password: '',
      role: record.role,
      brands: record.brands,
      branches: record.branches,
      pages: record.pages.filter((item): item is AppPageId => ALL_PAGES.some((pageItem) => pageItem.id === item)),
    });
    setDialogTab(tab);
    setDialogOpen(true);
  };

  const setRole = (role: string) => {
    const template = ROLE_TEMPLATES.find((item) => item.value === role);
    setForm((current) => ({ ...current, role, pages: editUser ? current.pages : template?.pages ?? current.pages }));
  };

  const toggleListValue = (key: 'brands' | 'branches' | 'pages', value: string) => {
    setForm((current) => {
      const currentValues = current[key] as string[];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      return { ...current, [key]: nextValues };
    });
  };

  const saveForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formMode = !editUser ? 'create' : dialogTab === 'details' ? 'details' : 'permissions';
    const validationError = validateForm(form, formMode);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (isSupabaseUnavailable()) {
      toast.error('إدارة المستخدمين غير متاحة في الوضع المحلي.');
      return;
    }

    setSaving(true);
    if (!editUser) {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'create_user',
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          role: form.role,
          brand_ids: form.brands,
          kitchen_hub_ids: form.branches,
          pages: form.pages,
        },
      });
      setSaving(false);
      if (error || data?.error) {
        toast.error(data?.error || await getFunctionErrorMessage(error));
        return;
      }
      toast.success('تم إنشاء المستخدم بنجاح');
    } else if (dialogTab === 'details') {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'update_user',
          user_id: editUser.id,
          name: form.name.trim(),
          phone: form.phone.trim(),
          role: form.role,
        },
      });
      setSaving(false);
      if (error || data?.error) {
        toast.error(data?.error || await getFunctionErrorMessage(error));
        return;
      }
      toast.success('تم تحديث بيانات المستخدم');
    } else {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'update_permissions',
          user_id: editUser.id,
          brand_ids: form.brands,
          kitchen_hub_ids: form.branches,
          pages: form.pages,
        },
      });
      setSaving(false);
      if (error || data?.error) {
        toast.error(data?.error || await getFunctionErrorMessage(error));
        return;
      }
      toast.success('تم تحديث الصلاحيات');
    }

    setDialogOpen(false);
    setSelected([]);
    await fetchUsers();
  };

  const sendPasswordReset = async (record: UserRecord) => {
    if (!record.email) {
      toast.error('لا يوجد بريد إلكتروني مسجل لهذا المستخدم');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(record.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message || 'تعذر إرسال رابط إعادة التعيين');
      return;
    }
    toast.success('تم إرسال رابط آمن لإعادة تعيين كلمة المرور إلى البريد المسجل');
  };

  const createHub = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = hubName.trim();
    if (!name) return toast.error('أدخل اسم المطبخ أو الفرع');
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{ hub?: KitchenHub; error?: string }>('create-user', {
      body: { action: 'create_kitchen_hub', name },
    });
    setSaving(false);
    if (error || data?.error || !data?.hub) {
      toast.error(data?.error || await getFunctionErrorMessage(error));
      return;
    }
    setHubs((current) => [...current, data.hub!].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
    setForm((current) => ({ ...current, branches: [...current.branches, data.hub!.id] }));
    setHubName('');
    setHubDialogOpen(false);
    toast.success('تمت إضافة المطبخ');
  };

  const runConfirmedAction = async () => {
    if (!confirmAction || isSupabaseUnavailable()) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: confirmAction.type === 'delete'
        ? { action: 'delete_users', user_ids: confirmAction.userIds }
        : { action: 'set_status', user_ids: confirmAction.userIds, status: confirmAction.status },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error(data?.error || await getFunctionErrorMessage(error));
      setConfirmAction(null);
      await fetchUsers();
      return;
    }
    toast.success(confirmAction.type === 'delete' ? 'تم حذف الحسابات المحددة' : 'تم تحديث حالة الحسابات المحددة');
    setSelected((current) => current.filter((id) => !confirmAction.userIds.includes(id)));
    setConfirmAction(null);
    await fetchUsers();
  };

  const exportRows = async (records: UserRecord[]) => {
    if (records.length === 0) {
      toast.error('لا توجد بيانات لتصديرها');
      return;
    }
    const XLSX = await import('xlsx');
    const rows = records.map((record) => ({
      'الاسم': record.name,
      'البريد الإلكتروني': record.email,
      'الهاتف': record.phone,
      'الدور الوظيفي': roleLabel(record.role),
      'الفروع والمطابخ': record.branches.map((id) => hubLabels.get(id)?.name).filter(Boolean).join('، '),
      'العلامات التجارية': record.brands.map((id) => brandLabels.get(id)?.name).filter(Boolean).join('، '),
      'الحالة': STATUS_LABELS[record.status],
      'آخر تسجيل دخول': record.last_login ?? '',
      'تاريخ الإنشاء': record.created_at,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'المستخدمون');
    XLSX.writeFile(workbook, 'cloud-kitchen-users.xlsx');
  };

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setHubFilter('all');
    setBrandFilter('all');
    setStatusFilter('all');
  };

  const activeCount = users.filter((item) => item.status === 'active').length;
  const inactiveCount = users.filter((item) => item.status === 'inactive').length;
  const pendingCount = users.filter((item) => item.status === 'pending').length;
  const firstItem = filteredUsers.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, filteredUsers.length);

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> إدارة النظام</div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
          <p className="mt-1 text-sm text-muted-foreground">إدارة حسابات الموظفين وأدوارهم ونطاق وصولهم.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportRows(filteredUsers)} disabled={loading || isSupabaseUnavailable()}>
            <Download className="ms-2 h-4 w-4" /> تصدير Excel
          </Button>
          <Button variant="outline" onClick={() => setHubDialogOpen(true)} disabled={isSupabaseUnavailable()}>
            <Store className="ms-2 h-4 w-4" /> إضافة مطبخ
          </Button>
          <Button onClick={openCreate} disabled={isSupabaseUnavailable()}>
            <Plus className="ms-2 h-4 w-4" /> إضافة مستخدم
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {([
          { title: 'المستخدمون النشطون', count: activeCount, dot: 'bg-emerald-500', icon: Users },
          { title: 'الحسابات المعطلة', count: inactiveCount, dot: 'bg-slate-400', icon: Shield },
          { title: 'بانتظار التفعيل', count: pendingCount, dot: 'bg-amber-500', icon: Clock3 },
        ]).map(({ title, count, dot, icon: Icon }) => (
          <Card key={title}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted ${dot}`}><Icon className="h-5 w-5 text-white" /></span>
              <div><p className="text-sm text-muted-foreground">{title}</p><p className="text-xl font-bold">{count}</p></div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو البريد أو الهاتف..." className="pe-9" aria-label="البحث عن مستخدم" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[680px]">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger aria-label="تصفية حسب الدور"><SelectValue placeholder="كل الأدوار" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأدوار</SelectItem>
                  {roleOptions.map((role) => <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={hubFilter} onValueChange={setHubFilter}>
                <SelectTrigger aria-label="تصفية حسب المطبخ"><SelectValue placeholder="كل المطابخ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المطابخ</SelectItem>
                  {hubs.map((hub) => <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger aria-label="تصفية حسب العلامة"><SelectValue placeholder="كل العلامات" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل العلامات</SelectItem>
                  {brands.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="تصفية حسب الحالة"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([status, label]) => <SelectItem key={status} value={status}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium"><span>{selected.length} مستخدم محدد</span><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="إلغاء التحديد" onClick={() => setSelected([])}><X className="h-4 w-4" /></Button></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: 'status', userIds: selected, status: 'inactive' })}>تعطيل المحدد</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: 'delete', userIds: selected })}><Trash2 className="ms-1 h-4 w-4" /> حذف المحدد</Button>
                <Button size="sm" onClick={() => void exportRows(selectedUsers)}><Download className="ms-1 h-4 w-4" /> تصدير المحدد</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr className="border-b">
                  <th className="w-12 p-3"><Checkbox aria-label="تحديد مستخدمي الصفحة" checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false} onCheckedChange={(checked) => {
                    const ids = selectablePageUsers.map((item) => item.id);
                    setSelected((current) => checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)));
                  }} /></th>
                  <th className="p-3 text-right font-medium">الموظف</th>
                  <th className="p-3 text-right font-medium">الدور</th>
                  <th className="p-3 text-right font-medium">المطابخ والعلامات</th>
                  <th className="p-3 text-right font-medium">الحالة</th>
                  <th className="p-3 text-right font-medium">آخر ظهور</th>
                  <th className="w-14 p-3 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }, (_, index) => (
                  <tr key={index} className="border-b">
                    <td className="p-3"><Skeleton className="h-4 w-4" /></td>
                    <td className="p-3"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-44" /></div></div></td>
                    <td className="p-3"><Skeleton className="h-6 w-24 rounded-full" /></td>
                    <td className="p-3"><Skeleton className="h-6 w-36 rounded-full" /></td>
                    <td className="p-3"><Skeleton className="h-6 w-16 rounded-full" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-3"><Skeleton className="mx-auto h-8 w-8" /></td>
                  </tr>
                )) : pageUsers.map((record) => {
                  const isProtected = record.role === 'owner' || record.id === currentUser?.id;
                  return (
                    <tr key={record.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3">
                        <Checkbox
                          aria-label={`تحديد ${record.name}`}
                          checked={selected.includes(record.id)}
                          disabled={isProtected}
                          onCheckedChange={(checked) => setSelected((current) => checked ? [...current, record.id] : current.filter((id) => id !== record.id))}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex min-w-48 items-center gap-3">
                          <Avatar className="h-10 w-10 border"><AvatarFallback className="bg-primary/10 font-semibold text-primary">{record.name.trim().slice(0, 2) || <UserRound className="h-4 w-4" />}</AvatarFallback></Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{record.name}</p>
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Mail className="h-3 w-3 shrink-0" />{record.email || 'لا يوجد بريد مسجل'}</p>
                            {record.phone && <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{record.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3"><Badge className={roleStyle(record.role)}>{roleLabel(record.role)}</Badge></td>
                      <td className="max-w-64 space-y-1.5 p-3">
                        {record.role === 'owner'
                          ? <Badge variant="secondary">صلاحيات مدير النظام الكاملة</Badge>
                          : <><AssignmentBadges ids={record.branches} labels={hubLabels} kind="hub" /><AssignmentBadges ids={record.brands} labels={brandLabels} kind="brand" /></>}
                      </td>
                      <td className="p-3"><Badge variant="outline" className={`gap-1.5 ${STATUS_STYLES[record.status]}`}><span className={`h-1.5 w-1.5 rounded-full ${record.status === 'active' ? 'bg-emerald-500' : record.status === 'inactive' ? 'bg-slate-400' : 'bg-amber-500'}`} />{STATUS_LABELS[record.status]}</Badge></td>
                      <td className="whitespace-nowrap p-3 text-muted-foreground"><span title={record.last_login ?? undefined}>{relativeActivity(record.last_login)}</span></td>
                      <td className="p-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`إجراءات ${record.name}`}><Ellipsis className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" dir="rtl">
                            <DropdownMenuItem onSelect={() => openEdit(record, 'details')}><UserRound className="ms-2 h-4 w-4" /> تعديل البيانات</DropdownMenuItem>
                            {record.role !== 'owner' && <DropdownMenuItem onSelect={() => openEdit(record, 'permissions')}><Shield className="ms-2 h-4 w-4" /> إدارة الصلاحيات</DropdownMenuItem>}
                            <DropdownMenuItem onSelect={() => void sendPasswordReset(record)}><KeyRound className="ms-2 h-4 w-4" /> إرسال رابط كلمة المرور</DropdownMenuItem>
                            {!isProtected && <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setConfirmAction({ type: 'status', userIds: [record.id], status: record.status === 'active' ? 'inactive' : 'active' })}>
                                <Shield className="ms-2 h-4 w-4" />{record.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                              </DropdownMenuItem>
                              {record.status === 'active' && <DropdownMenuItem onSelect={() => setConfirmAction({ type: 'status', userIds: [record.id], status: 'pending' })}>
                                <Clock3 className="ms-2 h-4 w-4" /> تعليق الحساب
                              </DropdownMenuItem>}
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmAction({ type: 'delete', userIds: [record.id] })}>
                                <Trash2 className="ms-2 h-4 w-4" /> حذف الحساب
                              </DropdownMenuItem>
                            </>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
                {!loading && pageUsers.length === 0 && (
                  <tr><td colSpan={7} className="p-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><FilterX className="h-6 w-6 text-muted-foreground" /></span>
                      <div><p className="font-semibold">لا توجد نتائج مطابقة</p><p className="mt-1 text-sm text-muted-foreground">جرّب تغيير كلمات البحث أو الفلاتر.</p></div>
                      <Button variant="outline" size="sm" onClick={resetFilters}>مسح البحث والفلاتر</Button>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <footer className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>عرض {firstItem} إلى {lastItem} من أصل {filteredUsers.length} مستخدم</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span>صفوف لكل صفحة</span>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronRight className="h-4 w-4" /></Button>
                {pageNumbers.map((pageNumber, index) => (
                  <span key={`page-${pageNumber}`}>
                    {index > 0 && pageNumber - pageNumbers[index - 1] > 1 && <span className="px-1">…</span>}
                  <Button variant={page === pageNumber ? 'default' : 'outline'} size="icon" className="h-9 w-9" onClick={() => setPage(pageNumber)}>{pageNumber}</Button>
                  </span>
                ))}
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="الصفحة التالية" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}><ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
          </footer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editUser ? `إدارة المستخدم: ${editUser.name}` : 'إضافة مستخدم جديد'}</DialogTitle>
            <DialogDescription>أدخل بيانات الموظف وحدد الأدوار ونطاق الوصول المناسب.</DialogDescription>
          </DialogHeader>
          <Tabs value={dialogTab} onValueChange={setDialogTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">بيانات الموظف</TabsTrigger>
              <TabsTrigger value="permissions">الصلاحيات والتعيينات</TabsTrigger>
            </TabsList>
            <form onSubmit={saveForm}>
              <TabsContent value="details" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="user-name">الاسم الكامل *</Label><Input id="user-name" autoComplete="name" maxLength={120} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
                  <div className="space-y-2"><Label htmlFor="user-email">البريد الإلكتروني الرسمي *</Label><Input id="user-email" type="email" autoComplete="email" required disabled={Boolean(editUser)} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />{editUser && <p className="text-xs text-muted-foreground">تغيير البريد يتطلب مسار تحقق منفصل.</p>}</div>
                  <div className="space-y-2"><Label htmlFor="user-phone">رقم الهاتف</Label><Input id="user-phone" type="tel" autoComplete="tel" dir="ltr" maxLength={24} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+20" /></div>
                  {!editUser && <div className="space-y-2 sm:col-span-2"><Label htmlFor="user-password">كلمة مرور أولية *</Label><Input id="user-password" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /><p className="text-xs text-muted-foreground">8 أحرف على الأقل. يمكن للموظف تغييرها لاحقًا.</p></div>}
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="user-role">الدور الوظيفي *</Label>
                    <Select disabled={editUser?.role === 'owner'} value={ROLE_TEMPLATES.some((item) => item.value === form.role) ? form.role : form.role ? 'custom' : ''} onValueChange={(value) => {
                      if (value === 'custom') setForm((current) => ({ ...current, role: '' }));
                      else setRole(value);
                    }}>
                      <SelectTrigger id="user-role"><SelectValue placeholder="اختر الدور أو اكتب دورًا مخصصًا" /></SelectTrigger>
                      <SelectContent>
                        {ROLE_TEMPLATES.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                        <SelectItem value="custom">دور مخصص</SelectItem>
                      </SelectContent>
                    </Select>
                    {(!ROLE_TEMPLATES.some((item) => item.value === form.role)) && <Input className="mt-2" maxLength={80} required placeholder="اكتب المسمى الوظيفي" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} />}
                    {form.role === 'owner' && <p className="text-xs text-amber-700">هذا الدور يمنح صلاحيات مدير النظام الكاملة.</p>}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="permissions" className="space-y-5">
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2"><div><Label className="flex items-center gap-2"><Building2 className="h-4 w-4" /> الفروع والمطابخ</Label><p className="text-xs text-muted-foreground">حدد المطابخ التي يعمل بها الموظف.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setHubDialogOpen(true)}><Plus className="ms-1 h-4 w-4" />إضافة مطبخ</Button></div>
                  {hubs.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">أضف مطبخًا أو فرعًا لتعيينه للمستخدم.</p> : <div className="grid gap-2 sm:grid-cols-2">{hubs.map((hub) => <label key={hub.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3"><Checkbox checked={form.branches.includes(hub.id)} onCheckedChange={() => toggleListValue('branches', hub.id)} /><Store className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{hub.name}</span></label>)}</div>}
                </section>
                <section className="space-y-2">
                  <Label className="flex items-center gap-2"><Shield className="h-4 w-4" /> العلامات التجارية *</Label>
                  <div className="grid gap-2 sm:grid-cols-2">{brands.map((brand) => <label key={brand.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3"><Checkbox checked={form.brands.includes(brand.id)} onCheckedChange={() => toggleListValue('brands', brand.id)} /><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brand.color }} /><span className="text-sm">{brand.name}</span></label>)}</div>
                </section>
                <section className="space-y-2">
                  <div><Label className="flex items-center gap-2"><Shield className="h-4 w-4" /> صفحات النظام *</Label><p className="text-xs text-muted-foreground">قوالب الدور تحدد إعدادًا مبدئيًا، ويمكن تخصيص الوصول هنا.</p></div>
                  <div className="grid gap-2 sm:grid-cols-2">{ALL_PAGES.map((systemPage) => <label key={systemPage.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3"><Checkbox checked={form.pages.includes(systemPage.id)} onCheckedChange={() => toggleListValue('pages', systemPage.id)} /><span className="text-sm">{systemPage.label}</span></label>)}</div>
                </section>
              </TabsContent>
              <div className="mt-5 flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
                <Button type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : editUser ? dialogTab === 'details' ? 'حفظ البيانات' : 'حفظ الصلاحيات' : 'إنشاء المستخدم'}</Button>
              </div>
            </form>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={hubDialogOpen} onOpenChange={setHubDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>إضافة مطبخ أو فرع</DialogTitle><DialogDescription>أنشئ موقعًا فعليًا ثم عيّن الموظفين إليه.</DialogDescription></DialogHeader>
          <form onSubmit={createHub} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="hub-name">اسم المطبخ أو الفرع</Label><Input id="hub-name" autoFocus maxLength={100} value={hubName} onChange={(event) => setHubName(event.target.value)} placeholder="مثال: مطبخ مدينة نصر" /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setHubDialogOpen(false)}>إلغاء</Button><Button type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إضافة'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => { if (!open && !saving) setConfirmAction(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.type === 'delete' ? 'حذف حسابات المستخدمين؟' : confirmAction?.status === 'inactive' ? 'تعطيل الحسابات المحددة؟' : 'تفعيل الحسابات المحددة؟'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'delete'
                ? `سيتم حذف ${confirmAction.userIds.length} حساب نهائيًا وإلغاء ارتباطاته. لا يمكن التراجع عن هذا الإجراء.`
                : confirmAction?.status === 'inactive'
                  ? `سيفقد ${confirmAction?.userIds.length ?? 0} مستخدم إمكانية تسجيل الدخول حتى إعادة تفعيل حساباتهم.`
                  : `سيتمكن ${confirmAction?.userIds.length ?? 0} مستخدم من تسجيل الدخول مجددًا.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void runConfirmedAction(); }}>{saving ? 'جارٍ التنفيذ...' : confirmAction?.type === 'delete' ? 'حذف نهائي' : 'تأكيد'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
