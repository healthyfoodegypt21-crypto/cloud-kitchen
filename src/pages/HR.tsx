import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlarmClockOff, BadgeCheck, CalendarClock, Clock3, Download, Gift, Loader2, Lock, LockOpen,
  Pencil, Plus, Printer, Scissors, Search, Settings2, Trash2, TrendingUp, UsersRound, Wallet, WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useBrands } from '@/hooks/useBrands';
import { hasHrAction } from '@/lib/permissions';
import {
  createAdvance,
  createBonus,
  createDeduction,
  loadHrSnapshot,
  lockHrMonth,
  migrateLegacyLocalHrData,
  persistHrSettings,
  removeAdvance,
  removeAttendanceRecord,
  removeBonus,
  removeDeduction,
  removeEmployee,
  removeHrRealtimeSubscription,
  saveAttendanceRecord,
  saveEmployee,
  settleAdvance,
  subscribeToHrRealtime,
  unlockHrMonth,
} from '@/lib/hrRealtime';
import { formatEGPCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PayslipPrintSheet from '@/components/PayslipPrintSheet';
import {
  AttendanceStatus, EmployeeStatus, HrAdvance, HrAttendance, HrBonus, HrDeduction, HrEmployee, HrEmployeeInput,
  HrAuditEntry, PayrollResult, RepaymentMethod, advanceRemaining, calculatePayroll, computeAttendanceHours, monthKey,
} from '@/store/hr';

const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = { working: 'يعمل', leave: 'إجازة', suspended: 'موقوف', resigned: 'مستقيل' };
const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = { present: 'حاضر', absent: 'غياب', annual_leave: 'إجازة سنوية', sick_leave: 'إجازة مرضية', mission: 'مأمورية' };
const REPAYMENT_LABELS: Record<RepaymentMethod, string> = { one_time: 'دفعة واحدة', installments: 'أقساط', salary_deduction: 'خصم من المرتب' };
const MONTH_LABELS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const todayValue = () => new Date().toISOString().slice(0, 10);

const emptyEmployeeDraft: HrEmployeeInput = {
  full_name: '', job_title: '', employee_code: '', department: '', branch: '', hire_date: '', status: 'working', manager_name: '',
  base_salary: 0, hourly_rate: 0, overtime_hourly_rate: 0, daily_work_hours: 8, weekly_work_days: 6, scheduled_check_in: '', scheduled_check_out: '',
  phone: '', national_id: '', address: '', birth_date: '', emergency_contact: '', notes: '',
};

export default function HR() {
  const { role, pagePermissions, displayName, user } = useAuth();
  const { brands, loading: brandsLoading } = useBrands();
  const actor = displayName || 'مستخدم';
  const actorUserId = user?.id ?? null;
  const primaryBrandId = brands[0]?.id ?? '';
  const can = useCallback((action: Parameters<typeof hasHrAction>[2]) => hasHrAction(role, pagePermissions, action), [role, pagePermissions]);

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [advances, setAdvances] = useState<HrAdvance[]>([]);
  const [deductions, setDeductions] = useState<HrDeduction[]>([]);
  const [bonuses, setBonuses] = useState<HrBonus[]>([]);
  const [attendance, setAttendance] = useState<HrAttendance[]>([]);
  const [audit, setAudit] = useState<HrAuditEntry[]>([]);
  const [settings, setSettings] = useState({ grace_period_minutes: 15 });
  const [lockedMonths, setLockedMonths] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    if (!primaryBrandId) return;
    try {
      if (role === 'owner') {
        const migrated = await migrateLegacyLocalHrData(primaryBrandId, actorUserId, actor);
        if (migrated) {
          toast.success('تم نقل بيانات الموارد البشرية القديمة إلى قاعدة البيانات المشتركة');
        }
      }
      const snapshot = await loadHrSnapshot(primaryBrandId);
      setEmployees(snapshot.employees);
      setAdvances(snapshot.advances);
      setDeductions(snapshot.deductions);
      setBonuses(snapshot.bonuses);
      setAttendance(snapshot.attendance);
      setAudit(snapshot.audit);
      setSettings(snapshot.settings);
      setLockedMonths(snapshot.lockedMonths);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل بيانات الموارد البشرية');
    } finally {
      setLoading(false);
    }
  }, [actor, actorUserId, primaryBrandId, role]);

  const refresh = useCallback(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (brandsLoading || !primaryBrandId) return;
    setLoading(true);
    void loadData();
  }, [brandsLoading, primaryBrandId, loadData]);

  useEffect(() => {
    if (brandsLoading || !primaryBrandId) return;
    const channel = subscribeToHrRealtime(() => {
      void loadData();
    });

    return () => {
      void removeHrRealtimeSubscription(channel);
    };
  }, [brandsLoading, primaryBrandId, loadData]);

  const log = useCallback<LogFn>(() => undefined, []);

  const employeeName = useCallback((id: string) => employees.find((item) => item.id === id)?.full_name ?? 'موظف محذوف', [employees]);
  const activeEmployees = useMemo(() => employees.filter((item) => item.status === 'working'), [employees]);

  if (loading || brandsLoading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">الموارد البشرية</h1>
        <p className="text-muted-foreground">إدارة الموظفين، الحضور، السلف، الخصومات، المكافآت، واحتساب المرتبات تلقائياً.</p>
      </header>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="dashboard"><TrendingUp className="ml-1 h-4 w-4" />المؤشرات</TabsTrigger>
          <TabsTrigger value="directory"><UsersRound className="ml-1 h-4 w-4" />الموظفون</TabsTrigger>
          <TabsTrigger value="attendance"><CalendarClock className="ml-1 h-4 w-4" />الحضور</TabsTrigger>
          <TabsTrigger value="advances"><WalletCards className="ml-1 h-4 w-4" />السلف</TabsTrigger>
          <TabsTrigger value="deductions"><Scissors className="ml-1 h-4 w-4" />الخصومات</TabsTrigger>
          <TabsTrigger value="bonuses"><Gift className="ml-1 h-4 w-4" />المكافآت</TabsTrigger>
          <TabsTrigger value="payroll"><Wallet className="ml-1 h-4 w-4" />المرتبات</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="ml-1 h-4 w-4" />سجل العمليات</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab employees={employees} attendance={attendance} deductions={deductions} bonuses={bonuses} advances={advances} />
        </TabsContent>
        <TabsContent value="directory" className="mt-4">
          <DirectoryTab employees={employees} can={can} refresh={refresh} log={log} settings={settings} setSettings={setSettings} primaryBrandId={primaryBrandId} actorUserId={actorUserId} />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab employees={employees} attendance={attendance} settings={settings} can={can} refresh={refresh} log={log} actorUserId={actorUserId} />
        </TabsContent>
        <TabsContent value="advances" className="mt-4">
          <AdvancesTab advances={advances} activeEmployees={activeEmployees} employeeName={employeeName} actor={actor} actorUserId={actorUserId} can={can} refresh={refresh} log={log} />
        </TabsContent>
        <TabsContent value="deductions" className="mt-4">
          <DeductionsTab deductions={deductions} activeEmployees={activeEmployees} employeeName={employeeName} actor={actor} actorUserId={actorUserId} can={can} refresh={refresh} log={log} />
        </TabsContent>
        <TabsContent value="bonuses" className="mt-4">
          <BonusesTab bonuses={bonuses} activeEmployees={activeEmployees} employeeName={employeeName} actor={actor} actorUserId={actorUserId} can={can} refresh={refresh} log={log} />
        </TabsContent>
        <TabsContent value="payroll" className="mt-4">
          <PayrollTab employees={employees} attendance={attendance} advances={advances} deductions={deductions} bonuses={bonuses} settings={settings} lockedMonths={lockedMonths} primaryBrandId={primaryBrandId} actorUserId={actorUserId} can={can} log={log} refresh={refresh} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab audit={audit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type CanFn = (action: Parameters<typeof hasHrAction>[2]) => boolean;
type LogFn = (action: string, entity: string, oldData?: unknown, newData?: unknown) => void;

function Metric({ icon: Icon, title, value, hint, danger = false }: { icon: React.ElementType; title: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <Card className={danger ? 'border-destructive/40' : ''}>
      <CardHeader className="pb-2"><CardDescription><Icon className="ml-1 inline h-4 w-4" />{title}</CardDescription><CardTitle className={danger ? 'text-destructive' : ''}>{value}</CardTitle></CardHeader>
      {hint ? <CardContent className="text-sm text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

// ---------------------------------------------------------------- Dashboard

function DashboardTab({ employees, attendance, deductions, bonuses, advances }: { employees: HrEmployee[]; attendance: HrAttendance[]; deductions: HrDeduction[]; bonuses: HrBonus[]; advances: HrAdvance[] }) {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = todayValue();
  const todayRecords = attendance.filter((item) => item.date === today);
  const present = todayRecords.filter((item) => item.status === 'present' || item.status === 'mission').length;
  const absent = todayRecords.filter((item) => item.status === 'absent').length;
  const late = todayRecords.filter((item) => item.late_hours > 0).length;
  const totalSalaries = employees.filter((item) => item.status === 'working').reduce((sum, item) => sum + item.base_salary, 0);
  const monthDeductions = deductions.filter((item) => item.date.startsWith(monthPrefix)).reduce((sum, item) => sum + item.amount, 0);
  const monthBonuses = bonuses.filter((item) => item.date.startsWith(monthPrefix)).reduce((sum, item) => sum + item.amount, 0);
  const outstandingAdvances = advances.reduce((sum, item) => sum + advanceRemaining(item), 0);

  const monthAttendance = attendance.filter((item) => item.date.startsWith(monthPrefix));
  const byEmployee = (id: string) => monthAttendance.filter((item) => item.employee_id === id);
  const rankings = employees.map((employee) => {
    const records = byEmployee(employee.id);
    return {
      employee,
      absents: records.filter((item) => item.status === 'absent').length,
      lateHours: Math.round(records.reduce((sum, item) => sum + item.late_hours, 0) * 10) / 10,
      overtimeHours: Math.round(records.reduce((sum, item) => sum + item.overtime_hours, 0) * 10) / 10,
    };
  });
  const topAbsent = [...rankings].filter((row) => row.absents > 0).sort((a, b) => b.absents - a.absents).slice(0, 5);
  const topLate = [...rankings].filter((row) => row.lateHours > 0).sort((a, b) => b.lateHours - a.lateHours).slice(0, 5);
  const topOvertime = [...rankings].filter((row) => row.overtimeHours > 0).sort((a, b) => b.overtimeHours - a.overtimeHours).slice(0, 5);
  const laborCost = totalSalaries + monthBonuses - monthDeductions;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={UsersRound} title="عدد الموظفين" value={String(employees.length)} hint={`${employees.filter((item) => item.status === 'working').length} على رأس العمل`} />
        <Metric icon={BadgeCheck} title="الحاضرون اليوم" value={String(present)} hint={`من ${employees.length} موظف`} />
        <Metric icon={AlarmClockOff} title="الغائبون اليوم" value={String(absent)} danger={absent > 0} />
        <Metric icon={Clock3} title="المتأخرون اليوم" value={String(late)} danger={late > 0} />
        <Metric icon={Wallet} title="إجمالي الرواتب" value={formatEGPCurrency(totalSalaries)} hint="أساسي شهري" />
        <Metric icon={Scissors} title="خصومات الشهر" value={formatEGPCurrency(monthDeductions)} />
        <Metric icon={Gift} title="مكافآت الشهر" value={formatEGPCurrency(monthBonuses)} />
        <Metric icon={WalletCards} title="سلف قائمة" value={formatEGPCurrency(outstandingAdvances)} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardDescription><TrendingUp className="ml-1 inline h-4 w-4" />تكلفة العمالة لهذا الشهر</CardDescription><CardTitle>{formatEGPCurrency(laborCost)}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">الأساسي + المكافآت − الخصومات. يمكن مراجعة الصافي الدقيق لكل موظف من تبويب المرتبات.</CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard title="الأكثر غياباً" icon={AlarmClockOff} rows={topAbsent.map((row) => ({ name: row.employee.full_name, value: `${row.absents} يوم` }))} />
        <RankCard title="الأكثر تأخيراً" icon={Clock3} rows={topLate.map((row) => ({ name: row.employee.full_name, value: `${row.lateHours} س` }))} />
        <RankCard title="الأعلى وقتاً إضافياً" icon={TrendingUp} rows={topOvertime.map((row) => ({ name: row.employee.full_name, value: `${row.overtimeHours} س` }))} />
      </div>
    </div>
  );
}

function RankCard({ title, icon: Icon, rows }: { title: string; icon: React.ElementType; rows: { name: string; value: string }[] }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base"><Icon className="ml-2 inline h-4 w-4" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد بيانات هذا الشهر.</p> : rows.map((row, index) => (
          <div key={`${row.name}-${index}`} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm"><span>{row.name}</span><Badge variant="secondary">{row.value}</Badge></div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- Directory

function DirectoryTab({ employees, can, refresh, log, settings, setSettings, primaryBrandId, actorUserId }: { employees: HrEmployee[]; can: CanFn; refresh: () => void; log: LogFn; settings: { grace_period_minutes: number }; setSettings: (value: { grace_period_minutes: number }) => void; primaryBrandId: string; actorUserId: string | null }) {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HrEmployee | null>(null);
  const [draft, setDraft] = useState<HrEmployeeInput>(emptyEmployeeDraft);
  const [graceDraft, setGraceDraft] = useState(String(settings.grace_period_minutes));

  const visible = useMemo(() => employees.filter((employee) => `${employee.full_name} ${employee.job_title} ${employee.employee_code} ${employee.department}`.toLowerCase().includes(search.toLowerCase())), [employees, search]);

  const openCreate = () => { setEditing(null); setDraft(emptyEmployeeDraft); setDialogOpen(true); };
  const openEdit = (employee: HrEmployee) => { setEditing(employee); setDraft(employee); setDialogOpen(true); };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.full_name?.trim() || !draft.job_title?.trim()) { toast.error('أدخل اسم الموظف والوظيفة'); return; }
    if (editing && !can('edit')) { toast.error('لا تملك صلاحية التعديل'); return; }
    if (!editing && !can('add')) { toast.error('لا تملك صلاحية الإضافة'); return; }
    if (!primaryBrandId) { toast.error('لا يوجد براند متاح لهذا المستخدم'); return; }
    try {
      await saveEmployee({ ...draft, id: editing?.id }, primaryBrandId, actorUserId);
      log(editing ? 'تعديل موظف' : 'إضافة موظف', `موظف: ${draft.full_name}`, editing ?? undefined, draft);
      toast.success(editing ? 'تم تحديث بيانات الموظف' : 'تمت إضافة الموظف');
      setDialogOpen(false); setEditing(null); setDraft(emptyEmployeeDraft); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ الموظف');
    }
  };

  const remove = async (employee: HrEmployee) => {
    if (!can('delete')) { toast.error('حذف الموظفين مخصص للمالك'); return; }
    try {
      await removeEmployee(employee.id);
      log('حذف موظف', `موظف: ${employee.full_name}`, employee, undefined);
      toast.success('تم حذف الموظف'); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حذف الموظف');
    }
  };

  const saveGrace = async () => {
    if (!primaryBrandId) { toast.error('لا يوجد براند متاح لهذا المستخدم'); return; }
    try {
      const next = await persistHrSettings(primaryBrandId, { grace_period_minutes: Number(graceDraft) || 0 }, actorUserId);
      setSettings(next); log('تعديل إعدادات', 'حد التسامح في التأخير', settings, next); toast.success('تم حفظ حد التسامح');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات');
    }
  };

  const exportEmployees = () => {
    const rows = employees.map((employee) => ({
      الكود: employee.employee_code, الاسم: employee.full_name, الوظيفة: employee.job_title, القسم: employee.department,
      الفرع: employee.branch, 'تاريخ التعيين': employee.hire_date, الحالة: EMPLOYEE_STATUS_LABELS[employee.status],
      'الراتب الأساسي': employee.base_salary, الهاتف: employee.phone, 'الرقم القومي': employee.national_id,
    }));
    exportSheet(rows, 'employees', 'الموظفون');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xs"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pr-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الوظيفة أو القسم" /></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportEmployees}><Download className="ml-2 h-4 w-4" />تصدير Excel</Button>
          {can('add') ? <Button onClick={openCreate}><Plus className="ml-2 h-4 w-4" />إضافة موظف</Button> : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base"><Settings2 className="ml-2 inline h-4 w-4" />حد التسامح في التأخير (Grace Period)</CardTitle><CardDescription>عدد الدقائق المسموح بها قبل بدء حساب التأخير.</CardDescription></CardHeader>
        <CardContent className="flex items-end gap-2"><div className="space-y-1"><Label>الدقائق</Label><Input type="number" min="0" className="w-32" value={graceDraft} onChange={(event) => setGraceDraft(event.target.value)} /></div><Button variant="outline" onClick={saveGrace}>حفظ</Button></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>دليل الموظفين</CardTitle><CardDescription>كل بيانات الموظف الأساسية والمالية والشخصية.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>الموظف</TableHead><TableHead>الوظيفة / القسم</TableHead><TableHead>الحالة</TableHead><TableHead>الراتب</TableHead><TableHead className="text-left">إجراءات</TableHead></TableRow></TableHeader>
            <TableBody>
              {visible.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell><div className="font-medium">{employee.full_name}</div><div className="text-xs text-muted-foreground">{employee.employee_code} • {employee.phone || 'بدون هاتف'}</div></TableCell>
                  <TableCell><div>{employee.job_title}</div><div className="text-xs text-muted-foreground">{employee.department || '—'}{employee.branch ? ` • ${employee.branch}` : ''}</div></TableCell>
                  <TableCell><Badge variant={employee.status === 'working' ? 'secondary' : 'outline'}>{EMPLOYEE_STATUS_LABELS[employee.status]}</Badge></TableCell>
                  <TableCell>{formatEGPCurrency(employee.base_salary)}</TableCell>
                  <TableCell className="text-left"><div className="flex justify-end gap-1">
                    {can('edit') ? <Button size="icon" variant="ghost" onClick={() => openEdit(employee)}><Pencil className="h-4 w-4" /></Button> : null}
                    {can('delete') ? <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(employee)}><Trash2 className="h-4 w-4" /></Button> : null}
                  </div></TableCell>
                </TableRow>
              ))}
              {visible.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">لا يوجد موظفون مطابقون.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditing(null); setDraft(emptyEmployeeDraft); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'تعديل بيانات الموظف' : 'إضافة موظف'}</DialogTitle><DialogDescription>البيانات الأساسية والمالية والشخصية والمستندات.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={save}>
            <Section title="البيانات الأساسية">
              <Field label="الاسم *" value={draft.full_name ?? ''} onChange={(value) => setDraft({ ...draft, full_name: value })} />
              <Field label="الرقم الوظيفي" value={draft.employee_code ?? ''} onChange={(value) => setDraft({ ...draft, employee_code: value })} placeholder="تلقائي إن ترك فارغاً" />
              <Field label="الوظيفة *" value={draft.job_title ?? ''} onChange={(value) => setDraft({ ...draft, job_title: value })} />
              <Field label="القسم" value={draft.department ?? ''} onChange={(value) => setDraft({ ...draft, department: value })} />
              <Field label="الفرع" value={draft.branch ?? ''} onChange={(value) => setDraft({ ...draft, branch: value })} />
              <Field label="تاريخ التعيين" type="date" value={draft.hire_date ?? ''} onChange={(value) => setDraft({ ...draft, hire_date: value })} />
              <div className="space-y-1"><Label>الحالة</Label>
                <Select value={draft.status ?? 'working'} onValueChange={(value) => setDraft({ ...draft, status: value as EmployeeStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Field label="المدير المباشر" value={draft.manager_name ?? ''} onChange={(value) => setDraft({ ...draft, manager_name: value })} />
            </Section>
            <Section title="البيانات المالية">
              <Field label="الراتب الأساسي" type="number" value={String(draft.base_salary ?? 0)} onChange={(value) => setDraft({ ...draft, base_salary: Number(value) })} />
              <Field label="أجر الساعة (اختياري)" type="number" value={String(draft.hourly_rate ?? 0)} onChange={(value) => setDraft({ ...draft, hourly_rate: Number(value) })} placeholder="يُحتسب تلقائياً إن ترك صفراً" />
              <Field label="أجر الساعة الإضافية" type="number" value={String(draft.overtime_hourly_rate ?? 0)} onChange={(value) => setDraft({ ...draft, overtime_hourly_rate: Number(value) })} />
              <Field label="ساعات العمل اليومية" type="number" value={String(draft.daily_work_hours ?? 8)} onChange={(value) => setDraft({ ...draft, daily_work_hours: Number(value) })} />
              <Field label="أيام العمل الأسبوعية" type="number" value={String(draft.weekly_work_days ?? 6)} onChange={(value) => setDraft({ ...draft, weekly_work_days: Number(value) })} />
              <Field label="موعد الحضور المعتاد" type="time" value={draft.scheduled_check_in ?? ''} onChange={(value) => setDraft({ ...draft, scheduled_check_in: value })} />
              <Field label="موعد الانصراف المعتاد" type="time" value={draft.scheduled_check_out ?? ''} onChange={(value) => setDraft({ ...draft, scheduled_check_out: value })} />
            </Section>
            <Section title="البيانات الشخصية">
              <Field label="رقم الهاتف" value={draft.phone ?? ''} onChange={(value) => setDraft({ ...draft, phone: value })} />
              <Field label="الرقم القومي" value={draft.national_id ?? ''} onChange={(value) => setDraft({ ...draft, national_id: value })} />
              <Field label="تاريخ الميلاد" type="date" value={draft.birth_date ?? ''} onChange={(value) => setDraft({ ...draft, birth_date: value })} />
              <Field label="جهة الاتصال في الطوارئ" value={draft.emergency_contact ?? ''} onChange={(value) => setDraft({ ...draft, emergency_contact: value })} />
              <div className="space-y-1 sm:col-span-2"><Label>العنوان</Label><Input value={draft.address ?? ''} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></div>
            </Section>
            <div className="space-y-1"><Label>ملاحظات / مستندات</Label><Textarea value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="مثال: صورة البطاقة مستلمة، عقد العمل موقّع، الشهادات..." /></div>
            <DialogFooter><Button type="submit">{editing ? 'حفظ التعديلات' : 'حفظ الموظف'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><p className="text-sm font-semibold text-primary">{title}</p><div className="grid gap-3 sm:grid-cols-2">{children}</div></div>;
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>;
}

// ---------------------------------------------------------------- Attendance

function AttendanceTab({ employees, attendance, settings, can, refresh, log, actorUserId }: { employees: HrEmployee[]; attendance: HrAttendance[]; settings: { grace_period_minutes: number }; can: CanFn; refresh: () => void; log: LogFn; actorUserId: string | null }) {
  const [date, setDate] = useState(todayValue());
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [notes, setNotes] = useState('');

  const dayRecords = useMemo(() => attendance.filter((item) => item.date === date), [attendance, date]);
  const selectedEmployee = employees.find((item) => item.id === employeeId) ?? null;
  const preview = selectedEmployee ? computeAttendanceHours({ check_in: checkIn, check_out: checkOut, status }, selectedEmployee, settings) : null;

  const resolveEmployee = (value: string) => {
    setEmployeeQuery(value);
    const match = employees.find((item) => item.full_name === value || item.employee_code === value);
    setEmployeeId(match?.id ?? '');
    if (match) { setCheckIn(match.scheduled_check_in || ''); setCheckOut(match.scheduled_check_out || ''); }
  };

  const record = async () => {
    if (!employeeId || !selectedEmployee) { toast.error('اختر موظفاً من القائمة'); return; }
    if (!can('add')) { toast.error('لا تملك صلاحية التسجيل'); return; }
    try {
      await saveAttendanceRecord({ employee_id: employeeId, date, check_in: checkIn, check_out: checkOut, status, notes }, selectedEmployee, settings, actorUserId);
      log('تسجيل حضور', `${selectedEmployee.full_name} — ${date}`, undefined, { status, checkIn, checkOut });
      toast.success('تم تسجيل الحضور');
      setEmployeeQuery(''); setEmployeeId(''); setCheckIn(''); setCheckOut(''); setStatus('present'); setNotes('');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر التسجيل');
    }
  };

  const remove = async (item: HrAttendance) => {
    if (!can('delete')) { toast.error('حذف السجلات مخصص للمالك'); return; }
    try {
      await removeAttendanceRecord(item.id);
      log('حذف حضور', `${item.date}`, item, undefined); toast.success('تم الحذف'); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حذف الحضور');
    }
  };

  const exportDay = () => {
    const rows = dayRecords.map((item) => ({
      الموظف: employees.find((employee) => employee.id === item.employee_id)?.full_name ?? '—', التاريخ: item.date,
      الحضور: item.check_in || '—', الانصراف: item.check_out || '—', 'ساعات العمل': item.work_hours, 'ساعات التأخير': item.late_hours,
      'ساعات إضافية': item.overtime_hours, الحالة: ATTENDANCE_STATUS_LABELS[item.status],
    }));
    exportSheet(rows, `attendance-${date}`, 'الحضور');
  };

  const attendanceDisabled = status !== 'present' && status !== 'mission';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>تسجيل الحضور والانصراف</CardTitle><CardDescription>اختر التاريخ ثم ابدأ بكتابة اسم الموظف لتظهر القائمة. الحساب تلقائي مع حد تسامح {settings.grace_period_minutes} دقيقة.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
            <div className="space-y-1"><Label>الموظف</Label><Input list="hr-employee-list" value={employeeQuery} onChange={(event) => resolveEmployee(event.target.value)} placeholder="اكتب الاسم..." /><datalist id="hr-employee-list">{employees.map((employee) => <option key={employee.id} value={employee.full_name}>{employee.job_title}</option>)}</datalist></div>
            <div className="space-y-1"><Label>الحالة</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as AttendanceStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ATTENDANCE_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>وقت الحضور</Label><Input type="time" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} disabled={attendanceDisabled} /></div>
            <div className="space-y-1"><Label>وقت الانصراف</Label><Input type="time" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} disabled={attendanceDisabled} /></div>
            <div className="space-y-1"><Label>ملاحظات</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
          </div>
          {preview ? <div className="flex flex-wrap gap-2 text-sm"><Badge variant="secondary">ساعات العمل: {preview.work_hours}</Badge><Badge variant={preview.late_hours > 0 ? 'destructive' : 'secondary'}>تأخير: {preview.late_hours} س</Badge><Badge variant="secondary">إضافي: {preview.overtime_hours} س</Badge></div> : null}
          <Button onClick={record}><Plus className="ml-2 h-4 w-4" />تسجيل</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>سجل يوم {date}</CardTitle><CardDescription>{dayRecords.length} تسجيل</CardDescription></div><Button variant="outline" onClick={exportDay}><Download className="ml-2 h-4 w-4" />تصدير</Button></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>الموظف</TableHead><TableHead>الحضور</TableHead><TableHead>الانصراف</TableHead><TableHead>عمل</TableHead><TableHead>تأخير</TableHead><TableHead>إضافي</TableHead><TableHead>الحالة</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {dayRecords.map((item) => {
                const employee = employees.find((row) => row.id === item.employee_id);
                return (
                  <TableRow key={item.id}>
                    <TableCell>{employee?.full_name ?? '—'}</TableCell>
                    <TableCell>{item.check_in || '—'}</TableCell>
                    <TableCell>{item.check_out || '—'}</TableCell>
                    <TableCell>{item.work_hours}</TableCell>
                    <TableCell className={item.late_hours > 0 ? 'text-destructive' : ''}>{item.late_hours}</TableCell>
                    <TableCell>{item.overtime_hours}</TableCell>
                    <TableCell><Badge variant="outline">{ATTENDANCE_STATUS_LABELS[item.status]}</Badge></TableCell>
                    <TableCell>{can('delete') ? <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button> : null}</TableCell>
                  </TableRow>
                );
              })}
              {dayRecords.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">لا توجد تسجيلات في هذا اليوم.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Advances

function AdvancesTab({ advances, activeEmployees, employeeName, actor, actorUserId, can, refresh, log }: { advances: HrAdvance[]; activeEmployees: HrEmployee[]; employeeName: (id: string) => string; actor: string; actorUserId: string | null; can: CanFn; refresh: () => void; log: LogFn }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ employee_id: '', date: todayValue(), amount: '', reason: '', repayment_method: 'installments' as RepaymentMethod, installments: '', notes: '' });
  const [repayFor, setRepayFor] = useState<HrAdvance | null>(null);
  const [repayAmount, setRepayAmount] = useState('');

  const totals = useMemo(() => {
    const total = advances.reduce((sum, item) => sum + item.amount, 0);
    const repaid = advances.reduce((sum, item) => sum + item.repaid_amount, 0);
    const remaining = advances.reduce((sum, item) => sum + advanceRemaining(item), 0);
    return { total, repaid, remaining, settled: advances.filter((item) => advanceRemaining(item) === 0).length, unsettled: advances.filter((item) => advanceRemaining(item) > 0).length };
  }, [advances]);

  const submit = async () => {
    if (!draft.employee_id || !Number(draft.amount)) { toast.error('اختر الموظف وأدخل قيمة السلفة'); return; }
    try {
      await createAdvance({ employee_id: draft.employee_id, date: draft.date, amount: Number(draft.amount), reason: draft.reason, repayment_method: draft.repayment_method, installments: draft.installments ? Number(draft.installments) : null, notes: draft.notes }, actorUserId, actor);
      log('إضافة سلفة', `${employeeName(draft.employee_id)} — ${draft.amount}`, undefined, draft);
      toast.success('تم تسجيل السلفة'); setOpen(false); setDraft({ employee_id: '', date: todayValue(), amount: '', reason: '', repayment_method: 'installments', installments: '', notes: '' }); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل السلفة');
    }
  };

  const submitRepay = async () => {
    if (!repayFor) return;
    try {
      await settleAdvance(repayFor.id, repayFor.repaid_amount, repayFor.amount, Number(repayAmount));
      log('سداد سلفة', `${employeeName(repayFor.employee_id)} — ${repayAmount}`, repayFor, { repay: repayAmount });
      toast.success('تم تسجيل السداد'); setRepayFor(null); setRepayAmount(''); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل السداد');
    }
  };

  const remove = async (item: HrAdvance) => { if (!can('delete')) { toast.error('الحذف مخصص للمالك'); return; } try { await removeAdvance(item.id); log('حذف سلفة', employeeName(item.employee_id), item, undefined); toast.success('تم الحذف'); refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حذف السلفة'); } };

  const exportAll = () => exportSheet(advances.map((item) => ({ الموظف: employeeName(item.employee_id), التاريخ: item.date, القيمة: item.amount, المسدد: item.repaid_amount, المتبقي: advanceRemaining(item), السبب: item.reason, 'طريقة السداد': REPAYMENT_LABELS[item.repayment_method] })), 'advances', 'السلف');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={WalletCards} title="إجمالي السلف" value={formatEGPCurrency(totals.total)} />
        <Metric icon={Wallet} title="المسدد" value={formatEGPCurrency(totals.repaid)} />
        <Metric icon={Scissors} title="المتبقي" value={formatEGPCurrency(totals.remaining)} danger={totals.remaining > 0} />
        <Metric icon={BadgeCheck} title="سلف مسددة / غير مسددة" value={`${totals.settled} / ${totals.unsettled}`} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={exportAll}><Download className="ml-2 h-4 w-4" />تصدير</Button>
        {can('add') ? <Button onClick={() => setOpen(true)}><Plus className="ml-2 h-4 w-4" />تسجيل سلفة</Button> : null}
      </div>
      <Card><CardContent className="pt-6">
        <Table>
          <TableHeader><TableRow><TableHead>الموظف</TableHead><TableHead>التاريخ</TableHead><TableHead>القيمة</TableHead><TableHead>المتبقي</TableHead><TableHead>طريقة السداد</TableHead><TableHead>السبب</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {advances.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{employeeName(item.employee_id)}</TableCell>
                <TableCell>{item.date}</TableCell>
                <TableCell>{formatEGPCurrency(item.amount)}</TableCell>
                <TableCell className={advanceRemaining(item) > 0 ? 'text-destructive' : 'text-emerald-600'}>{formatEGPCurrency(advanceRemaining(item))}</TableCell>
                <TableCell>{REPAYMENT_LABELS[item.repayment_method]}{item.installments ? ` (${item.installments})` : ''}</TableCell>
                <TableCell className="max-w-[160px] truncate">{item.reason || '—'}</TableCell>
                <TableCell><div className="flex justify-end gap-1">
                  {advanceRemaining(item) > 0 && can('approve_advances') ? <Button size="sm" variant="outline" onClick={() => { setRepayFor(item); setRepayAmount(''); }}>سداد</Button> : null}
                  {can('delete') ? <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button> : null}
                </div></TableCell>
              </TableRow>
            ))}
            {advances.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">لا توجد سلف مسجلة.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>تسجيل سلفة</DialogTitle><DialogDescription>تُخصم تلقائياً من بيان المرتب حسب طريقة السداد.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <EmployeePicker employees={activeEmployees} value={draft.employee_id} onChange={(value) => setDraft({ ...draft, employee_id: value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="التاريخ" type="date" value={draft.date} onChange={(value) => setDraft({ ...draft, date: value })} />
              <Field label="قيمة السلفة" type="number" value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} />
            </div>
            <div className="space-y-1"><Label>طريقة السداد</Label>
              <Select value={draft.repayment_method} onValueChange={(value) => setDraft({ ...draft, repayment_method: value as RepaymentMethod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REPAYMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {draft.repayment_method === 'installments' ? <Field label="عدد الأقساط" type="number" value={draft.installments} onChange={(value) => setDraft({ ...draft, installments: value })} /> : null}
            <Field label="سبب السلفة" value={draft.reason} onChange={(value) => setDraft({ ...draft, reason: value })} />
            <div className="space-y-1"><Label>ملاحظات</Label><Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={submit}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={repayFor !== null} onOpenChange={(open) => !open && setRepayFor(null)}>
        <DialogContent><DialogHeader><DialogTitle>سداد سلفة</DialogTitle><DialogDescription>المتبقي: {repayFor ? formatEGPCurrency(advanceRemaining(repayFor)) : ''}</DialogDescription></DialogHeader>
          <Field label="قيمة السداد" type="number" value={repayAmount} onChange={setRepayAmount} />
          <DialogFooter><Button onClick={submitRepay}>تأكيد السداد</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- Deductions

function DeductionsTab({ deductions, activeEmployees, employeeName, actor, actorUserId, can, refresh, log }: { deductions: HrDeduction[]; activeEmployees: HrEmployee[]; employeeName: (id: string) => string; actor: string; actorUserId: string | null; can: CanFn; refresh: () => void; log: LogFn }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ employee_id: '', date: todayValue(), amount: '', reason: '', notes: '' });

  const submit = async () => {
    if (!draft.employee_id || !Number(draft.amount)) { toast.error('اختر الموظف وأدخل القيمة'); return; }
    if (!draft.reason.trim()) { toast.error('سبب الخصم إجباري'); return; }
    try {
      await createDeduction({ employee_id: draft.employee_id, date: draft.date, amount: Number(draft.amount), reason: draft.reason, notes: draft.notes }, actorUserId, actor);
      log('إضافة خصم', `${employeeName(draft.employee_id)} — ${draft.amount}`, undefined, draft);
      toast.success('تم تسجيل الخصم'); setOpen(false); setDraft({ employee_id: '', date: todayValue(), amount: '', reason: '', notes: '' }); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الخصم');
    }
  };
  const remove = async (item: HrDeduction) => { if (!can('delete')) { toast.error('الحذف مخصص للمالك'); return; } try { await removeDeduction(item.id); log('حذف خصم', employeeName(item.employee_id), item, undefined); toast.success('تم الحذف'); refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حذف الخصم'); } };
  const exportAll = () => exportSheet(deductions.map((item) => ({ الموظف: employeeName(item.employee_id), التاريخ: item.date, القيمة: item.amount, السبب: item.reason, 'أضافه': item.created_by })), 'deductions', 'الخصومات');

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={exportAll}><Download className="ml-2 h-4 w-4" />تصدير</Button>
        {can('add') ? <Button onClick={() => setOpen(true)}><Plus className="ml-2 h-4 w-4" />تسجيل خصم</Button> : null}
      </div>
      <Card><CardContent className="pt-6">
        <Table>
          <TableHeader><TableRow><TableHead>الموظف</TableHead><TableHead>التاريخ</TableHead><TableHead>القيمة</TableHead><TableHead>السبب</TableHead><TableHead>أضافه</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {deductions.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{employeeName(item.employee_id)}</TableCell><TableCell>{item.date}</TableCell><TableCell className="text-destructive">{formatEGPCurrency(item.amount)}</TableCell>
                <TableCell className="max-w-[220px] truncate">{item.reason}</TableCell><TableCell className="text-muted-foreground">{item.created_by || '—'}</TableCell>
                <TableCell>{can('delete') ? <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button> : null}</TableCell>
              </TableRow>
            ))}
            {deductions.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد خصومات مسجلة.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>تسجيل خصم</DialogTitle><DialogDescription>السبب إجباري ويظهر في سجل العمليات.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <EmployeePicker employees={activeEmployees} value={draft.employee_id} onChange={(value) => setDraft({ ...draft, employee_id: value })} />
            <div className="grid gap-3 sm:grid-cols-2"><Field label="التاريخ" type="date" value={draft.date} onChange={(value) => setDraft({ ...draft, date: value })} /><Field label="القيمة" type="number" value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} /></div>
            <Field label="سبب الخصم *" value={draft.reason} onChange={(value) => setDraft({ ...draft, reason: value })} />
            <div className="space-y-1"><Label>ملاحظات</Label><Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={submit}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- Bonuses

function BonusesTab({ bonuses, activeEmployees, employeeName, actor, actorUserId, can, refresh, log }: { bonuses: HrBonus[]; activeEmployees: HrEmployee[]; employeeName: (id: string) => string; actor: string; actorUserId: string | null; can: CanFn; refresh: () => void; log: LogFn }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ employee_id: '', date: todayValue(), amount: '', reason: '', notes: '' });

  const submit = async () => {
    if (!draft.employee_id || !Number(draft.amount)) { toast.error('اختر الموظف وأدخل القيمة'); return; }
    try {
      await createBonus({ employee_id: draft.employee_id, date: draft.date, amount: Number(draft.amount), reason: draft.reason, notes: draft.notes }, actorUserId, actor);
      log('إضافة مكافأة', `${employeeName(draft.employee_id)} — ${draft.amount}`, undefined, draft);
      toast.success('تم تسجيل المكافأة'); setOpen(false); setDraft({ employee_id: '', date: todayValue(), amount: '', reason: '', notes: '' }); refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل المكافأة');
    }
  };
  const remove = async (item: HrBonus) => { if (!can('delete')) { toast.error('الحذف مخصص للمالك'); return; } try { await removeBonus(item.id); log('حذف مكافأة', employeeName(item.employee_id), item, undefined); toast.success('تم الحذف'); refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حذف المكافأة'); } };
  const exportAll = () => exportSheet(bonuses.map((item) => ({ الموظف: employeeName(item.employee_id), التاريخ: item.date, القيمة: item.amount, السبب: item.reason, 'أضافها': item.created_by })), 'bonuses', 'المكافآت');

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={exportAll}><Download className="ml-2 h-4 w-4" />تصدير</Button>
        {can('add') ? <Button onClick={() => setOpen(true)}><Plus className="ml-2 h-4 w-4" />تسجيل مكافأة</Button> : null}
      </div>
      <Card><CardContent className="pt-6">
        <Table>
          <TableHeader><TableRow><TableHead>الموظف</TableHead><TableHead>التاريخ</TableHead><TableHead>القيمة</TableHead><TableHead>السبب</TableHead><TableHead>أضافها</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {bonuses.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{employeeName(item.employee_id)}</TableCell><TableCell>{item.date}</TableCell><TableCell className="text-emerald-600">{formatEGPCurrency(item.amount)}</TableCell>
                <TableCell className="max-w-[220px] truncate">{item.reason || '—'}</TableCell><TableCell className="text-muted-foreground">{item.created_by || '—'}</TableCell>
                <TableCell>{can('delete') ? <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button> : null}</TableCell>
              </TableRow>
            ))}
            {bonuses.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد مكافآت مسجلة.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>تسجيل مكافأة</DialogTitle><DialogDescription>تُضاف تلقائياً في بيان المرتب.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <EmployeePicker employees={activeEmployees} value={draft.employee_id} onChange={(value) => setDraft({ ...draft, employee_id: value })} />
            <div className="grid gap-3 sm:grid-cols-2"><Field label="التاريخ" type="date" value={draft.date} onChange={(value) => setDraft({ ...draft, date: value })} /><Field label="القيمة" type="number" value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} /></div>
            <Field label="سبب المكافأة" value={draft.reason} onChange={(value) => setDraft({ ...draft, reason: value })} />
            <div className="space-y-1"><Label>ملاحظات</Label><Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={submit}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- Payroll

function PayrollTab({ employees, attendance, advances, deductions, bonuses, settings, lockedMonths, primaryBrandId, actorUserId, can, log, refresh }: { employees: HrEmployee[]; attendance: HrAttendance[]; advances: HrAdvance[]; deductions: HrDeduction[]; bonuses: HrBonus[]; settings: { grace_period_minutes: number }; lockedMonths: string[]; primaryBrandId: string; actorUserId: string | null; can: CanFn; log: LogFn; refresh: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employeeId, setEmployeeId] = useState('');
  const [officialHolidays, setOfficialHolidays] = useState('0');
  const [printPayroll, setPrintPayroll] = useState<PayrollResult | null>(null);

  const locked = lockedMonths.includes(monthKey(year, month));
  const selectedEmployee = employees.find((item) => item.id === employeeId) ?? null;
  const holidays = Number(officialHolidays) || 0;

  const payroll = useMemo(() => selectedEmployee ? calculatePayroll({ employee: selectedEmployee, year, month, attendance, advances, deductions, bonuses, officialHolidays: holidays, settings }) : null, [selectedEmployee, year, month, attendance, advances, deductions, bonuses, holidays, settings]);
  const allPayroll = useMemo(() => employees.filter((item) => item.status === 'working').map((employee) => calculatePayroll({ employee, year, month, attendance, advances, deductions, bonuses, officialHolidays: holidays, settings })), [employees, year, month, attendance, advances, deductions, bonuses, holidays, settings]);

  const printPayslip = (result: PayrollResult) => {
    setPrintPayroll(result);
    window.setTimeout(() => window.print(), 60);
  };

  const toggleLock = async () => {
    if (!can('lock_month')) { toast.error('إغلاق الشهر مخصص للمالك'); return; }
    if (!primaryBrandId) { toast.error('لا يوجد براند متاح لهذا المستخدم'); return; }
    try {
      if (locked) { await unlockHrMonth(primaryBrandId, year, month); log('فتح شهر', `${month}/${year}`); toast.success('تم فتح الشهر'); }
      else { await lockHrMonth(primaryBrandId, year, month, actorUserId); log('إغلاق شهر', `${month}/${year}`); toast.success('تم إغلاق الشهر واعتماد المرتبات'); }
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تغيير حالة الشهر');
    }
  };

  const exportPayrollSheet = () => exportSheet(allPayroll.map((row) => ({
    الموظف: row.employeeName, الوظيفة: row.jobTitle, 'الراتب الأساسي': row.baseSalary, 'أيام العمل': row.actualWorkDays,
    الغياب: row.absentDays, 'قيمة الغياب': row.absenceValue, 'ساعات التأخير': row.lateHours, 'قيمة التأخير': row.lateValue,
    'ساعات إضافية': row.overtimeHours, 'قيمة الإضافي': row.overtimeValue, المكافآت: row.totalBonuses, الخصومات: row.totalDeductions,
    السلف: row.advancesDue, 'صافي المرتب': row.netSalary,
  })), `payroll-${year}-${month}`, 'المرتبات');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>بيان المرتب</CardTitle><CardDescription>اختر الشهر والسنة والموظف ليحسب النظام كل البنود تلقائياً.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><Label>الشهر</Label><Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MONTH_LABELS.map((label, index) => <SelectItem key={label} value={String(index + 1)}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>السنة</Label><Input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></div>
          <div className="space-y-1"><Label>الموظف</Label><Select value={employeeId} onValueChange={setEmployeeId}><SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger><SelectContent>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.full_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>عدد الإجازات الرسمية</Label><Input type="number" min="0" value={officialHolidays} onChange={(event) => setOfficialHolidays(event.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant={locked ? 'destructive' : 'secondary'}>{locked ? 'الشهر مغلق ومعتمد' : 'الشهر مفتوح'}</Badge>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportPayrollSheet}><Download className="ml-2 h-4 w-4" />كشف المرتبات Excel</Button>
          {can('lock_month') ? <Button variant={locked ? 'outline' : 'default'} onClick={toggleLock}>{locked ? <><LockOpen className="ml-2 h-4 w-4" />فتح الشهر</> : <><Lock className="ml-2 h-4 w-4" />إغلاق الشهر</>}</Button> : null}
        </div>
      </div>

      {payroll && selectedEmployee ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>{payroll.employeeName}</CardTitle><CardDescription>{payroll.jobTitle} • {MONTH_LABELS[month - 1]} {year}</CardDescription></div><Button variant="outline" onClick={() => printPayslip(payroll)}><Printer className="ml-2 h-4 w-4" />طباعة المفردات</Button></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <PayrollRow label="الراتب الأساسي" value={formatEGPCurrency(payroll.baseSalary)} />
              <PayrollRow label="أجر الساعة" value={formatEGPCurrency(payroll.hourlyRate)} />
              <PayrollRow label="أيام الشهر" value={String(payroll.daysInMonth)} />
              <PayrollRow label="أيام الجمعة" value={String(payroll.fridaysCount)} />
              <PayrollRow label="الإجازات الرسمية" value={String(payroll.officialHolidays)} />
              <PayrollRow label="أيام العمل المتوقعة" value={String(payroll.expectedWorkDays)} />
              <PayrollRow label="أيام العمل الفعلية" value={String(payroll.actualWorkDays)} />
              <PayrollRow label="أيام الغياب" value={String(payroll.absentDays)} />
              <PayrollRow label="قيمة الغياب" value={`- ${formatEGPCurrency(payroll.absenceValue)}`} negative />
              <PayrollRow label="ساعات التأخير" value={`${payroll.lateHours} س`} />
              <PayrollRow label="قيمة التأخير" value={`- ${formatEGPCurrency(payroll.lateValue)}`} negative />
              <PayrollRow label="ساعات إضافية" value={`${payroll.overtimeHours} س`} />
              <PayrollRow label="قيمة الإضافي" value={`+ ${formatEGPCurrency(payroll.overtimeValue)}`} positive />
              <PayrollRow label="إجمالي المكافآت" value={`+ ${formatEGPCurrency(payroll.totalBonuses)}`} positive />
              <PayrollRow label="إجمالي الخصومات" value={`- ${formatEGPCurrency(payroll.totalDeductions)}`} negative />
              <PayrollRow label="السلف المستحقة" value={`- ${formatEGPCurrency(payroll.advancesDue)}`} negative />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground"><span className="text-lg font-bold">صافي المرتب</span><span className="text-2xl font-black">{formatEGPCurrency(payroll.netSalary)}</span></div>
          </CardContent>
        </Card>
      ) : <Card><CardContent className="py-10 text-center text-muted-foreground">اختر موظفاً لعرض بيان مرتبه.</CardContent></Card>}

      <Card>
        <CardHeader><CardTitle>كشف مرتبات {MONTH_LABELS[month - 1]} {year}</CardTitle><CardDescription>ملخص صافي كل الموظفين النشطين.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>الموظف</TableHead><TableHead>الأساسي</TableHead><TableHead>إضافي</TableHead><TableHead>مكافآت</TableHead><TableHead>خصومات</TableHead><TableHead>سلف</TableHead><TableHead>الصافي</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {allPayroll.map((row) => (
                <TableRow key={row.employeeId}>
                  <TableCell>{row.employeeName}</TableCell><TableCell>{formatEGPCurrency(row.baseSalary)}</TableCell><TableCell className="text-emerald-600">{formatEGPCurrency(row.overtimeValue)}</TableCell>
                  <TableCell className="text-emerald-600">{formatEGPCurrency(row.totalBonuses)}</TableCell><TableCell className="text-destructive">{formatEGPCurrency(row.totalDeductions)}</TableCell>
                  <TableCell className="text-destructive">{formatEGPCurrency(row.advancesDue)}</TableCell><TableCell className="font-bold">{formatEGPCurrency(row.netSalary)}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => printPayslip(row)}><Printer className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
              {allPayroll.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">لا يوجد موظفون نشطون.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PayslipPrintSheet payroll={printPayroll} employee={printPayroll ? employees.find((item) => item.id === printPayroll.employeeId) ?? null : null} />
    </div>
  );
}

function PayrollRow({ label, value, positive = false, negative = false }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="text-muted-foreground">{label}</span><span className={positive ? 'text-emerald-600' : negative ? 'text-destructive' : 'font-medium'}>{value}</span></div>;
}

// ---------------------------------------------------------------- Activity

function ActivityTab({ audit }: { audit: HrAuditEntry[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>سجل العمليات</CardTitle><CardDescription>كل تعديل داخل الموارد البشرية مع المستخدم والتاريخ.</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>المستخدم</TableHead><TableHead>العملية</TableHead><TableHead>التفاصيل</TableHead><TableHead>الوقت</TableHead></TableRow></TableHeader>
          <TableBody>
            {audit.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.user}</TableCell><TableCell><Badge variant="outline">{entry.action}</Badge></TableCell>
                <TableCell className="max-w-[280px] truncate">{entry.entity}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(entry.timestamp).toLocaleString('ar-EG')}</TableCell>
              </TableRow>
            ))}
            {audit.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">لا توجد عمليات مسجلة بعد.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- shared

function EmployeePicker({ employees, value, onChange }: { employees: HrEmployee[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1"><Label>الموظف</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
        <SelectContent>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.full_name} — {employee.job_title}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

async function exportSheet(rows: Record<string, unknown>[], fileName: string, sheetName: string) {
  if (rows.length === 0) { toast.error('لا توجد بيانات للتصدير'); return; }
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}
