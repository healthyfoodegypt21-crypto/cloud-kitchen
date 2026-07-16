import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, Pencil, Plus, Search, UsersRound, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useBrands } from '@/hooks/useBrands';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

type Employee = { id: string; employee_code: string; full_name: string; phone: string; role_title: string; salary: number; is_active: boolean; notes: string; user_id: string | null; scheduled_check_in: string | null; scheduled_check_out: string | null };
type Attendance = { employee_id: string; attendance_date: string; check_in: string | null; check_out: string | null; status: string; notes: string };
type Draft = { full_name: string; employee_code: string; phone: string; role_title: string; salary: string; scheduled_check_in: string; scheduled_check_out: string; notes: string };
const initialDraft: Draft = { full_name: '', employee_code: '', phone: '', role_title: '', salary: '', scheduled_check_in: '', scheduled_check_out: '', notes: '' };
const dateKey = () => new Date().toISOString().slice(0, 10);
const localDateTime = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const asRows = (data: unknown) => Array.isArray(data) ? data as Record<string, unknown>[] : [];

export default function HR() {
  const { brands, loading: brandsLoading } = useBrands();
  const [brandId, setBrandId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [attendanceEmployee, setAttendanceEmployee] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [attendanceDraft, setAttendanceDraft] = useState({ checkIn: '', checkOut: '', status: 'present', notes: '' });

  useEffect(() => { if (!brandId && brands[0]) setBrandId(brands[0].id); }, [brandId, brands]);
  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    const [employeeRes, attendanceRes] = await Promise.all([
      (supabase as any).from('employees').select('id,employee_code,full_name,phone,role_title,salary,is_active,notes,user_id,scheduled_check_in,scheduled_check_out').eq('brand_id', brandId).order('full_name'),
      (supabase as any).from('employee_attendance').select('employee_id,attendance_date,check_in,check_out,status,notes').eq('attendance_date', dateKey()),
    ]);
    const error = employeeRes.error || attendanceRes.error;
    if (error) toast.error(error.message || 'تعذر تحميل بيانات الموارد البشرية');
    setEmployees(asRows(employeeRes.data).map(row => ({ id: String(row.id), employee_code: String(row.employee_code), full_name: String(row.full_name), phone: String(row.phone ?? ''), role_title: String(row.role_title ?? ''), salary: Number(row.salary ?? 0), is_active: Boolean(row.is_active), notes: String(row.notes ?? ''), user_id: row.user_id ? String(row.user_id) : null, scheduled_check_in: row.scheduled_check_in ? String(row.scheduled_check_in).slice(0, 5) : null, scheduled_check_out: row.scheduled_check_out ? String(row.scheduled_check_out).slice(0, 5) : null })));
    setAttendance(asRows(attendanceRes.data).map(row => ({ employee_id: String(row.employee_id), attendance_date: String(row.attendance_date), check_in: row.check_in ? String(row.check_in) : null, check_out: row.check_out ? String(row.check_out) : null, status: String(row.status), notes: String(row.notes ?? '') })));
    setLoading(false);
  }, [brandId]);
  useEffect(() => { void load(); }, [load]);

  const saveEmployee = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.full_name.trim() || !draft.role_title.trim()) { toast.error('أدخل اسم الموظف ووظيفته'); return; }
    const code = draft.employee_code.trim() || `EMP-${Date.now().toString().slice(-6)}`;
    const values = { employee_code: code, full_name: draft.full_name.trim(), phone: draft.phone.trim(), role_title: draft.role_title.trim(), salary: Number(draft.salary || 0), scheduled_check_in: draft.scheduled_check_in || null, scheduled_check_out: draft.scheduled_check_out || null, notes: draft.notes.trim() };
    const { error } = editingEmployee
      ? await (supabase as any).from('employees').update(values).eq('id', editingEmployee.id)
      : await (supabase as any).from('employees').insert({ brand_id: brandId, ...values });
    if (error) { toast.error(error.message); return; }
    toast.success(editingEmployee ? 'تم تعديل بيانات الموظف' : 'تمت إضافة الموظف بدون إنشاء حساب دخول'); setDialogOpen(false); setEditingEmployee(null); setDraft(initialDraft); void load();
  };
  const openEdit = (employee: Employee) => { setEditingEmployee(employee); setDraft({ full_name: employee.full_name, employee_code: employee.employee_code, phone: employee.phone, role_title: employee.role_title, salary: String(employee.salary), scheduled_check_in: employee.scheduled_check_in ?? '', scheduled_check_out: employee.scheduled_check_out ?? '', notes: employee.notes }); setDialogOpen(true); };
  const openAttendance = (employee: Employee) => {
    const record = attendance.find(item => item.employee_id === employee.id);
    setAttendanceEmployee(employee);
    setAttendanceDraft({ checkIn: localDateTime(record?.check_in ?? null), checkOut: localDateTime(record?.check_out ?? null), status: record?.status ?? 'present', notes: record?.notes ?? '' });
  };
  const saveAttendance = async () => {
    if (!attendanceEmployee) return;
    const { error } = await (supabase as any).from('employee_attendance').upsert({ employee_id: attendanceEmployee.id, attendance_date: dateKey(), check_in: attendanceDraft.checkIn ? new Date(attendanceDraft.checkIn).toISOString() : null, check_out: attendanceDraft.checkOut ? new Date(attendanceDraft.checkOut).toISOString() : null, status: attendanceDraft.status, notes: attendanceDraft.notes }, { onConflict: 'employee_id,attendance_date' });
    if (error) { toast.error(error.message); return; }
    toast.success('تم حفظ حضور وانصراف اليوم'); setAttendanceEmployee(null); void load();
  };
  const visibleEmployees = useMemo(() => employees.filter(employee => `${employee.full_name} ${employee.role_title} ${employee.employee_code}`.toLowerCase().includes(search.toLowerCase())), [employees, search]);
  const presentCount = attendance.filter(item => item.status === 'present').length;
  const salaryTotal = employees.filter(item => item.is_active).reduce((sum, item) => sum + item.salary, 0);

  if (brandsLoading || loading) return <div className="grid min-h-[40vh] place-items-center"><UsersRound className="h-8 w-8 animate-pulse text-primary" /></div>;
  return <div className="space-y-6">
    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h1 className="text-3xl font-bold">الموارد البشرية</h1><p className="text-muted-foreground">سجل الموظفين والحضور والانصراف، حتى للعمال والطهاة بدون حساب دخول.</p></div><Button onClick={() => setDialogOpen(true)}><Plus className="ml-2 h-4 w-4" />إضافة موظف</Button></header>
    <div className="grid gap-4 md:grid-cols-3"><Metric icon={UsersRound} title="موظفون نشطون" value={String(employees.filter(item => item.is_active).length)} hint="متاحون للتنظيف والعمليات" /><Metric icon={CalendarClock} title="حاضرون اليوم" value={String(presentCount)} hint={`من ${employees.length} موظف`} /><Metric icon={WalletCards} title="إجمالي الرواتب" value={`${salaryTotal.toLocaleString('ar-EG')} ج.م`} hint="للعمالة النشطة شهريًا" /></div>
    <Card><CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle>دليل الموظفين</CardTitle><CardDescription>بيانات الموظف وساعات عمله المعتادة. لا يحتاج العامل إلى حساب دخول.</CardDescription></div><div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pr-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الوظيفة" /></div></div></CardHeader><CardContent className="space-y-3">{visibleEmployees.map(employee => <div key={employee.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong>{employee.full_name}</strong><Badge variant="secondary">{employee.role_title || 'بدون مسمى'}</Badge>{!employee.user_id && <Badge variant="outline">بدون حساب دخول</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{employee.employee_code} • {employee.phone || 'لا يوجد هاتف'} • الراتب: {employee.salary.toLocaleString('ar-EG')} ج.م</p><p className="mt-1 text-sm text-muted-foreground">مواعيد العمل المعتادة: {employee.scheduled_check_in || '—'} إلى {employee.scheduled_check_out || '—'}</p></div><Button variant="outline" onClick={() => openEdit(employee)}><Pencil className="ml-2 h-4 w-4" />تعديل البيانات</Button></div>)}{visibleEmployees.length === 0 && <p className="py-8 text-center text-muted-foreground">لا يوجد موظفون بعد. أضف العمال والطهاة هنا ليظهروا في توزيع التنظيفات.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>شيت حضور وانصراف اليوم</CardTitle><CardDescription>هذا تسجيل فعلي ليوم {dateKey()}، مستقل تمامًا عن مواعيد العمل المعتادة.</CardDescription></CardHeader><CardContent className="space-y-3">{employees.filter(employee => employee.is_active).map(employee => { const record = attendance.find(item => item.employee_id === employee.id); return <div key={employee.id} className="flex flex-col gap-2 rounded-xl border p-3 md:flex-row md:items-center md:justify-between"><div><strong>{employee.full_name}</strong><span className="mr-2 text-sm text-muted-foreground">{employee.role_title}</span><p className="text-sm text-muted-foreground">{record?.status === 'present' ? `حضور: ${record.check_in ? new Date(record.check_in).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'} • انصراف: ${record.check_out ? new Date(record.check_out).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}` : record?.status === 'absent' ? 'غائب' : record?.status === 'leave' ? 'إجازة' : 'لم يتم التسجيل'}</p></div><Button variant="outline" onClick={() => openAttendance(employee)}><Clock3 className="ml-2 h-4 w-4" />تسجيل الحضور</Button></div>; })}</CardContent></Card>
    <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) { setEditingEmployee(null); setDraft(initialDraft); } }}><DialogContent><DialogHeader><DialogTitle>{editingEmployee ? 'تعديل بيانات الموظف' : 'إضافة موظف'}</DialogTitle><DialogDescription>مواعيد العمل المعتادة تُحفظ هنا؛ تسجيل الحضور الفعلي يتم في الشيت المنفصل أدناه.</DialogDescription></DialogHeader><form className="grid gap-3" onSubmit={saveEmployee}><Field label="اسم الموظف *" value={draft.full_name} onChange={value => setDraft({ ...draft, full_name: value })} /><div className="grid gap-3 sm:grid-cols-2"><Field label="الوظيفة *" value={draft.role_title} onChange={value => setDraft({ ...draft, role_title: value })} placeholder="عامل نظافة، طباخ..." /><Field label="الراتب الشهري" value={draft.salary} onChange={value => setDraft({ ...draft, salary: value })} type="number" /></div><div className="grid gap-3 sm:grid-cols-2"><Field label="موعد الحضور المعتاد" value={draft.scheduled_check_in} onChange={value => setDraft({ ...draft, scheduled_check_in: value })} type="time" /><Field label="موعد الانصراف المعتاد" value={draft.scheduled_check_out} onChange={value => setDraft({ ...draft, scheduled_check_out: value })} type="time" /></div><div className="grid gap-3 sm:grid-cols-2"><Field label="كود الموظف" value={draft.employee_code} onChange={value => setDraft({ ...draft, employee_code: value })} placeholder="اختياري" /><Field label="الهاتف" value={draft.phone} onChange={value => setDraft({ ...draft, phone: value })} /></div><div className="space-y-1"><Label>ملاحظات</Label><Textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></div><Button type="submit">{editingEmployee ? 'حفظ التعديلات' : 'حفظ الموظف'}</Button></form></DialogContent></Dialog>
    <Dialog open={attendanceEmployee !== null} onOpenChange={open => !open && setAttendanceEmployee(null)}><DialogContent><DialogHeader><DialogTitle>حضور وانصراف — {attendanceEmployee?.full_name}</DialogTitle><DialogDescription>يتم حفظ سجل اليوم فقط، ويمكن تعديله عند الانصراف.</DialogDescription></DialogHeader><div className="grid gap-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="وقت الحضور" type="datetime-local" value={attendanceDraft.checkIn} onChange={value => setAttendanceDraft({ ...attendanceDraft, checkIn: value })} /><Field label="وقت الانصراف" type="datetime-local" value={attendanceDraft.checkOut} onChange={value => setAttendanceDraft({ ...attendanceDraft, checkOut: value })} /></div><div className="space-y-1"><Label>الحالة</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={attendanceDraft.status} onChange={event => setAttendanceDraft({ ...attendanceDraft, status: event.target.value })}><option value="present">حاضر</option><option value="absent">غائب</option><option value="leave">إجازة</option></select></div><div className="space-y-1"><Label>ملاحظات</Label><Textarea value={attendanceDraft.notes} onChange={event => setAttendanceDraft({ ...attendanceDraft, notes: event.target.value })} /></div><Button onClick={() => void saveAttendance()}>حفظ سجل اليوم</Button></div></DialogContent></Dialog>
  </div>;
}
function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></div>; }
function Metric({ icon: Icon, title, value, hint }: { icon: React.ElementType; title: string; value: string; hint: string }) { return <Card><CardHeader className="pb-2"><CardDescription><Icon className="ml-1 inline h-4 w-4" />{title}</CardDescription><CardTitle>{value}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{hint}</CardContent></Card>; }
