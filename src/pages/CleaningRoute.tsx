import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ImagePlus, Play, Plus, Sparkles, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBrands } from '@/hooks/useBrands';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import { supabase } from '@/integrations/supabase/client';

type Target = {
  id: string;
  name: string;
  kind: 'area' | 'equipment';
  icon: string;
  frequency_days: number;
  estimated_minutes: number;
  notes: string;
};

type Task = {
  id: string;
  target_id: string;
  scheduled_date: string;
  assigned_employee_id: string | null;
  status: 'pending' | 'overdue' | 'completed';
  estimated_minutes: number;
  started_at: string | null;
  completed_at: string | null;
  photo_path: string;
  points_awarded: number;
};

type Staff = {
  id: string;
  display_name: string;
  role_title: string;
  has_app_login: boolean;
};

type CleaningKind = Target['kind'];

const asRows = (data: unknown) => (Array.isArray(data) ? (data as Record<string, unknown>[]) : []);

const initialDraft = {
  name: '',
  kind: 'area' as CleaningKind,
  icon: '✨',
  frequencyDays: '1',
  estimatedMinutes: '15',
  notes: '',
};

const sectionMeta: Record<CleaningKind, { title: string; description: string; addLabel: string; placeholder: string; emptyLabel: string; icon: string }> = {
  equipment: {
    title: 'المعدات',
    description: 'تنظيف الثلاجات والأفران وأسطح العمل وكل ما يحتاج متابعة دورية للمعدات.',
    addLabel: 'إضافة معدة',
    placeholder: 'مثال: ثلاجة التبريد أو الفرن الرئيسي',
    emptyLabel: 'لا توجد معدات محفوظة بعد.',
    icon: '🧰',
  },
  area: {
    title: 'مناطق التنظيف',
    description: 'متابعة مناطق التحضير والتخزين والاستلام وكل المساحات التي تحتاج خطة تنظيف ثابتة.',
    addLabel: 'إضافة منطقة تنظيف',
    placeholder: 'مثال: منطقة التحضير أو الممر الخلفي',
    emptyLabel: 'لا توجد مناطق تنظيف محفوظة بعد.',
    icon: '🧼',
  },
};

export default function CleaningRoute() {
  const { brands, loading: brandsLoading } = useBrands();
  const [brandId, setBrandId] = useState('');
  const [selectedKind, setSelectedKind] = useState<CleaningKind | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [managerNotes, setManagerNotes] = useState('');
  const [draft, setDraft] = useState(initialDraft);

  useEffect(() => {
    if (!brandId && brands[0]) {
      setBrandId(brands[0].id);
    }
  }, [brandId, brands]);

  useEffect(() => {
    if (!selectedKind) {
      return;
    }

    setDraft((current) => ({
      ...current,
      kind: selectedKind,
      icon: current.icon === '' || current.icon === '✨' ? sectionMeta[selectedKind].icon : current.icon,
    }));
  }, [selectedKind]);

  const load = useCallback(async () => {
    if (!brandId) {
      return;
    }

    setLoading(true);
    const client = supabase as any;
    await client.rpc('cleaning_generate_tasks', { _brand_id: brandId });

    const [targetRes, taskRes, staffRes] = await Promise.all([
      client
        .from('cleaning_targets')
        .select('id,name,kind,icon,frequency_days,estimated_minutes,notes')
        .eq('brand_id', brandId)
        .eq('is_active', true)
        .order('created_at'),
      client
        .from('cleaning_tasks')
        .select('id,target_id,scheduled_date,assigned_employee_id,status,estimated_minutes,started_at,completed_at,photo_path,points_awarded')
        .eq('brand_id', brandId)
        .order('scheduled_date'),
      client.rpc('cleaning_staff', { _brand_id: brandId }),
    ]);

    const error = [targetRes, taskRes, staffRes].find((result) => result.error)?.error;
    if (error) {
      toast.error(error.message || 'تعذر تحميل التنظيفات');
    }

    setTargets(
      asRows(targetRes.data).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        kind: String(row.kind) as CleaningKind,
        icon: String(row.icon),
        frequency_days: Number(row.frequency_days),
        estimated_minutes: Number(row.estimated_minutes),
        notes: String(row.notes ?? ''),
      })),
    );
    setTasks(
      asRows(taskRes.data).map((row) => ({
        id: String(row.id),
        target_id: String(row.target_id),
        scheduled_date: String(row.scheduled_date),
        assigned_employee_id: row.assigned_employee_id ? String(row.assigned_employee_id) : null,
        status: String(row.status) as Task['status'],
        estimated_minutes: Number(row.estimated_minutes),
        started_at: row.started_at ? String(row.started_at) : null,
        completed_at: row.completed_at ? String(row.completed_at) : null,
        photo_path: String(row.photo_path ?? ''),
        points_awarded: Number(row.points_awarded ?? 0),
      })),
    );
    setStaff(
      asRows(staffRes.data).map((row) => ({
        id: String(row.id),
        display_name: String(row.display_name),
        role_title: String(row.role_title ?? ''),
        has_app_login: Boolean(row.has_app_login),
      })),
    );
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    void load();
  }, [load]);

  useSupabaseRealtimeRefresh({
    enabled: Boolean(brandId),
    channelName: `cleaning-${brandId}`,
    tables: [
      { table: 'cleaning_targets', filter: `brand_id=eq.${brandId}` },
      { table: 'cleaning_tasks', filter: `brand_id=eq.${brandId}` },
      { table: 'employees' },
    ],
    onRefresh: load,
  });

  const createTarget = async () => {
    if (!brandId) {
      toast.error('اختر البراند أولًا');
      return;
    }

    if (!draft.name.trim()) {
      toast.error('أدخل اسم المكان أو المعدة');
      return;
    }

    const payloadKind = selectedKind ?? draft.kind;
    const payloadIcon = draft.icon.trim() || sectionMeta[payloadKind].icon;
    const { error } = await (supabase as any).rpc('cleaning_create_target', {
      _brand_id: brandId,
      _name: draft.name.trim(),
      _kind: payloadKind,
      _icon: payloadIcon,
      _frequency_days: Number(draft.frequencyDays),
      _estimated_minutes: Number(draft.estimatedMinutes),
      _notes: draft.notes,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('تم حفظ المهمة وإنشاء موعدها الدوري');
    setTargetDialogOpen(false);
    setDraft({
      ...initialDraft,
      kind: payloadKind,
      icon: sectionMeta[payloadKind].icon,
    });
    void load();
  };

  const assign = async (taskId: string, employeeId: string) => {
    const { error } = await (supabase as any).rpc('cleaning_assign_task', {
      _task_id: taskId,
      _assigned_to: employeeId || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('تم توزيع المهمة');
    void load();
  };

  const start = async (taskId: string) => {
    const { error } = await (supabase as any).rpc('cleaning_start_task', { _task_id: taskId });
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('تم بدء مؤقت التنفيذ الفعلي');
    void load();
  };

  const complete = async () => {
    if (!completeTask || !photo) {
      toast.error('صورة إثبات التنظيف مطلوبة');
      return;
    }

    const extension = photo.name.split('.').pop() || 'jpg';
    const path = `${brandId}/${completeTask.id}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('cleaning-photos').upload(path, photo, { upsert: false });
    if (uploadError) {
      toast.error(uploadError.message);
      return;
    }

    const { error } = await (supabase as any).rpc('cleaning_complete_task', {
      _task_id: completeTask.id,
      _photo_path: path,
      _manager_notes: managerNotes,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('تم استلام التنظيف وإضافة النقاط');
    setCompleteTask(null);
    setPhoto(null);
    setManagerNotes('');
    void load();
  };

  const targetById = useMemo(() => new Map(targets.map((target) => [target.id, target])), [targets]);
  const sectionTargets = useMemo(() => (selectedKind ? targets.filter((target) => target.kind === selectedKind) : []), [selectedKind, targets]);
  const sectionTasks = useMemo(() => (selectedKind ? tasks.filter((task) => targetById.get(task.target_id)?.kind === selectedKind) : []), [selectedKind, targetById, tasks]);
  const taskCards = useMemo(() => sectionTasks.filter((task) => task.status !== 'completed'), [sectionTasks]);
  const completedToday = useMemo(() => sectionTasks.filter((task) => task.status === 'completed' && task.scheduled_date === new Date().toISOString().slice(0, 10)), [sectionTasks]);
  const overdue = useMemo(() => sectionTasks.filter((task) => task.status === 'overdue'), [sectionTasks]);
  const score = useMemo(() => {
    if (!selectedKind) {
      return 100;
    }

    return sectionTargets.length
      ? Math.round(Math.max(0, 100 - overdue.length * 15 - taskCards.filter((task) => !task.assigned_employee_id).length * 5 + completedToday.length * 5))
      : 100;
  }, [completedToday.length, overdue.length, sectionTargets.length, selectedKind, taskCards]);
  const leaders = useMemo(
    () =>
      staff
        .map((member) => ({
          ...member,
          points: sectionTasks
            .filter((task) => task.assigned_employee_id === member.id && task.status === 'completed')
            .reduce((sum, task) => sum + task.points_awarded, 0),
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 3),
    [sectionTasks, staff],
  );

  const equipmentCount = targets.filter((target) => target.kind === 'equipment').length;
  const areaCount = targets.filter((target) => target.kind === 'area').length;
  const sectionInfo = selectedKind ? sectionMeta[selectedKind] : null;

  if (brandsLoading || loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">إدارة النظافة</h1>
          <p className="text-muted-foreground">قسم متكامل لمتابعة المعدات ومناطق التنظيف داخل المنشأة مع توزيع واعتماد بالصور.</p>
        </div>
        <Button
          onClick={() => {
            const nextKind = selectedKind ?? 'area';
            setDraft({ ...initialDraft, kind: nextKind, icon: sectionMeta[nextKind].icon });
            setTargetDialogOpen(true);
          }}
        >
          <Plus className="ml-2 h-4 w-4" />
          {selectedKind ? sectionMeta[selectedKind].addLabel : 'إضافة عنصر جديد'}
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <SectionButton
          title="المعدات"
          description="الثلاجات، الأفران، الطاولات وأي معدات تحتاج جدول تنظيف دوري."
          count={equipmentCount}
          icon="🧰"
          active={selectedKind === 'equipment'}
          onClick={() => setSelectedKind((current) => (current === 'equipment' ? null : 'equipment'))}
        />
        <SectionButton
          title="مناطق التنظيف"
          description="غرف التحضير، الممرات، المخازن وكل منطقة تحتاج متابعة يومية أو دورية."
          count={areaCount}
          icon="🧼"
          active={selectedKind === 'area'}
          onClick={() => setSelectedKind((current) => (current === 'area' ? null : 'area'))}
        />
      </section>

      {!selectedKind ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>الصفحة الرئيسية</CardTitle>
            <CardDescription>اختر أحد الزرين الرئيسيين بالأعلى للدخول إلى إدارة المعدات أو مناطق التنظيف.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-muted p-4">
              <p className="text-sm text-muted-foreground">إجمالي المعدات</p>
              <p className="mt-2 text-2xl font-bold">{equipmentCount}</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-sm text-muted-foreground">إجمالي مناطق التنظيف</p>
              <p className="mt-2 text-2xl font-bold">{areaCount}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric title="نظافة اليوم" value={`${score}%`} hint={`درجة ${sectionInfo?.title ?? 'القسم'}`} />
            <Metric title="مهام اليوم" value={String(taskCards.length)} hint="بانتظار الاستلام" />
            <Metric title="متأخرة" value={String(overdue.length)} hint="تحتاج تدخلًا" danger={overdue.length > 0} />
            <Metric title="مكتملة اليوم" value={String(completedToday.length)} hint="معتمدة بالصور" />
          </div>

          <section>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold">{sectionInfo?.title}</h2>
                <p className="text-sm text-muted-foreground">{sectionInfo?.description}</p>
              </div>
              <Badge variant="outline">المطلوب صورة عند الاستلام</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {taskCards.map((task) => {
                const target = targetById.get(task.target_id);
                const assigned = staff.find((member) => member.id === task.assigned_employee_id);

                return (
                  <Card key={task.id} className={task.status === 'overdue' ? 'border-destructive/40' : ''}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between gap-3">
                        <div>
                          <CardTitle>
                            {target?.icon} {target?.name ?? 'مهمة تنظيف'}
                          </CardTitle>
                          <CardDescription>
                            {target?.kind === 'equipment' ? 'معدة' : 'منطقة'} • كل {target?.frequency_days} يوم
                          </CardDescription>
                        </div>
                        <Badge variant={task.status === 'overdue' ? 'destructive' : 'secondary'}>
                          {task.status === 'overdue' ? 'متأخرة' : 'مستحقة'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="rounded-lg bg-muted p-3 text-sm">
                        <Clock3 className="ml-1 inline h-4 w-4" />
                        الوقت المتوقع: {task.estimated_minutes} دقيقة
                      </div>

                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={task.assigned_employee_id ?? ''}
                        onChange={(event) => void assign(task.id, event.target.value)}
                      >
                        <option value="">اختر الموظف يدويًا</option>
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.display_name} — {member.role_title || 'موظف'}
                            {member.has_app_login ? '' : ' (بدون دخول)'}
                          </option>
                        ))}
                      </select>

                      {assigned ? (
                        <p className="text-sm text-muted-foreground">
                          <Users className="ml-1 inline h-4 w-4" />
                          مسندة إلى: {assigned.display_name} — {assigned.role_title || 'موظف'}
                        </p>
                      ) : null}

                      {task.started_at ? (
                        <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">
                          <Clock3 className="ml-1 inline h-4 w-4" />
                          بدأ التنفيذ الفعلي
                        </div>
                      ) : (
                        <Button className="w-full" variant="outline" disabled={!task.assigned_employee_id} onClick={() => void start(task.id)}>
                          <Play className="ml-2 h-4 w-4" />
                          بدء التنفيذ
                        </Button>
                      )}

                      <Button className="w-full" disabled={!task.started_at} onClick={() => setCompleteTask(task)}>
                        <CheckCircle2 className="ml-2 h-4 w-4" />
                        استلام المهمة
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}

              {taskCards.length === 0 ? (
                <Card className="md:col-span-2 xl:col-span-3">
                  <CardContent className="py-8 text-center text-muted-foreground">لا توجد مهام مفتوحة حاليًا داخل هذا القسم.</CardContent>
                </Card>
              ) : null}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{sectionInfo?.title}</CardTitle>
                <CardDescription>التكرار والوقت المتوقع محفوظان مع كل عنصر.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {sectionTargets.map((target) => (
                  <div key={target.id} className="flex items-center justify-between rounded-lg border p-3">
                    <span>
                      {target.icon} <strong>{target.name}</strong>{' '}
                      <span className="text-muted-foreground">— {target.kind === 'equipment' ? 'معدة' : 'مكان'}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">كل {target.frequency_days} يوم • {target.estimated_minutes} د</span>
                  </div>
                ))}

                {sectionTargets.length === 0 ? <p className="text-sm text-muted-foreground">{sectionInfo?.emptyLabel}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <Trophy className="ml-2 inline h-5 w-5 text-amber-500" />
                  لوحة نقاط التنظيف
                </CardTitle>
                <CardDescription>النقاط للمهام التي استلمها المدير بالصور داخل هذا القسم.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {leaders.map((leader, index) => (
                  <div key={leader.id} className="flex items-center justify-between rounded-lg bg-muted p-3">
                    <span>{['🥇', '🥈', '🥉'][index]} {leader.display_name}</span>
                    <Badge>{leader.points} نقطة</Badge>
                  </div>
                ))}

                {leaders.length === 0 ? <p className="text-sm text-muted-foreground">ستظهر النقاط بعد أول استلام.</p> : null}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedKind ? sectionMeta[selectedKind].addLabel : 'إضافة مكان أو معدة تنظيف'}</DialogTitle>
            <DialogDescription>سيتم حفظها وإنشاء مهمة متكررة تلقائيًا حسب المدة التي تحددها.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>الاسم</Label>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={selectedKind ? sectionMeta[selectedKind].placeholder : 'مثال: ثلاجة التبريد أو منطقة التحضير'}
              />
            </div>

            {selectedKind ? (
              <div className="space-y-1">
                <Label>القسم</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">{sectionMeta[selectedKind].title}</div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>النوع</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value as CleaningKind })}
                >
                  <option value="area">مكان / منطقة</option>
                  <option value="equipment">معدة</option>
                </select>
              </div>
            )}

            <div className="space-y-1">
              <Label>أيقونة</Label>
              <Input value={draft.icon} onChange={(event) => setDraft({ ...draft, icon: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>تنظف كل كم يوم؟</Label>
              <Input type="number" min="1" value={draft.frequencyDays} onChange={(event) => setDraft({ ...draft, frequencyDays: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>الوقت المتوقع بالدقائق</Label>
              <Input type="number" min="1" value={draft.estimatedMinutes} onChange={(event) => setDraft({ ...draft, estimatedMinutes: event.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>ملاحظات أو خطوات</Label>
              <Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </div>
            <Button className="sm:col-span-2" onClick={() => void createTarget()}>
              حفظ وإنشاء المهمة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={completeTask !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCompleteTask(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>استلام التنظيف</DialogTitle>
            <DialogDescription>يرجى رفع صورة كإثبات. ستحسب النقاط تلقائيًا وفق الالتزام بالموعد والوقت المتوقع.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted p-3">الوقت المتوقع: {completeTask?.estimated_minutes} دقيقة</div>
            <div className="space-y-1">
              <Label>صورة إثبات التنظيف</Label>
              <Input type="file" accept="image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => setPhoto(event.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1">
              <Label>ملاحظة المدير</Label>
              <Textarea value={managerNotes} onChange={(event) => setManagerNotes(event.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void complete()}>
              <ImagePlus className="ml-2 h-4 w-4" />
              اعتماد التنظيف وإضافة النقاط
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionButton({
  title,
  description,
  count,
  icon,
  active,
  onClick,
}: {
  title: string;
  description: string;
  count: number;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card className={active ? 'border-primary shadow-sm' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">{icon} {title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant={active ? 'default' : 'secondary'}>{count}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Button className="w-full" size="lg" variant={active ? 'default' : 'outline'} onClick={onClick}>
          {active ? 'العودة للرئيسية' : `دخول ${title}`}
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ title, value, hint, danger = false }: { title: string; value: string; hint: string; danger?: boolean }) {
  return (
    <Card className={danger ? 'border-destructive/40' : ''}>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className={danger ? 'text-destructive' : ''}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}
