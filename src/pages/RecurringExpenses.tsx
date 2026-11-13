import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useBrands } from '@/hooks/useBrands';
import { useFinance } from '@/hooks/useFinance';
import { useOrders } from '@/hooks/useOrders';
import { cn, formatEGPCurrency, getTodayDateValue } from '@/lib/utils';
import {
  ALLOCATION_TYPE_LABELS,
  AllocationType,
  ExpensePaymentMethod,
  FREQUENCY_LABELS,
  PAYMENT_METHOD_LABELS,
  RecurringExpense,
  RecurringFrequency,
} from '@/types/finance';

function diffDaysFromToday(dateStr: string): number {
  const today = new Date(`${getTodayDateValue()}T00:00:00`);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function RecurringExpenses() {
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();
  const { brands, loading: brandsLoading } = useBrands();
  const { orders } = useOrders();
  const {
    categories,
    recurring: recurringExpenses,
    loading: financeLoading,
    uploadReceipt,
    saveRecurringObligation,
    deleteRecurringObligation,
    confirmRecurringPayment,
  } = useFinance(brands, orders);

  // Add/Edit Recurring Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringExpense | null>(null);
  const [title, setTitle] = useState('');
  const [estimatedAmount, setEstimatedAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [companyId, setCompanyId] = useState('shared');
  const [allocationRule, setAllocationRule] = useState<'direct' | 'shared_revenue' | 'shared_orders'>(
    'shared_revenue',
  );
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dueDay, setDueDay] = useState('1');
  const [nextDueDate, setNextDueDate] = useState(getTodayDateValue());
  const [remindDays, setRemindDays] = useState('3');
  const [saving, setSaving] = useState(false);

  // Confirm Payment Modal
  const [payTarget, setPayTarget] = useState<RecurringExpense | null>(null);
  const [actualAmount, setActualAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [payMethod, setPayMethod] = useState<ExpensePaymentMethod>('cash');
  const [payDate, setPayDate] = useState(getTodayDateValue());
  const [payNotes, setPayNotes] = useState('');
  const [payReceiptUrl, setPayReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const selectableCategories = useMemo(
    () => categories.filter((c) => c.parent_id !== null),
    [categories],
  );

  const urgentItems = useMemo(
    () =>
      recurringExpenses.filter((item) => {
        if (!item.is_active) return false;
        const days = diffDaysFromToday(item.next_due_date);
        return days <= (item.remind_days_before ?? 3);
      }),
    [recurringExpenses],
  );

  const monthlyObligationsSum = useMemo(
    () =>
      recurringExpenses
        .filter((i) => i.is_active)
        .reduce((sum, i) => {
          if (i.frequency === 'weekly') return sum + i.estimated_amount * 4.33;
          if (i.frequency === 'yearly') return sum + i.estimated_amount / 12;
          return sum + i.estimated_amount;
        }, 0),
    [recurringExpenses],
  );

  const openCreateModal = () => {
    setEditingItem(null);
    setTitle('');
    setEstimatedAmount('');
    setCategoryId(selectableCategories[0]?.id ?? '');
    setCompanyId('shared');
    setAllocationRule('shared_revenue');
    setFrequency('monthly');
    setDueDay('1');
    setNextDueDate(getTodayDateValue());
    setRemindDays('3');
    setModalOpen(true);
  };

  const openEditModal = (item: RecurringExpense) => {
    setEditingItem(item);
    setTitle(item.title);
    setEstimatedAmount(String(item.estimated_amount));
    setCategoryId(item.category_id ?? selectableCategories[0]?.id ?? '');
    setCompanyId(item.company_id ?? 'shared');
    setAllocationRule(
      item.allocation_rule === 'shared_orders' ? 'shared_orders' : 'shared_revenue',
    );
    setFrequency(item.frequency);
    setDueDay(String(item.due_day));
    setNextDueDate(item.next_due_date);
    setRemindDays(String(item.remind_days_before ?? 3));
    setModalOpen(true);
  };

  const handleSaveObligation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await saveRecurringObligation({
        id: editingItem?.id,
        title,
        estimated_amount: Number(estimatedAmount) || 0,
        category_id: categoryId || (selectableCategories[0]?.id ?? ''),
        company_id: companyId === 'shared' ? null : companyId,
        allocation_rule: companyId === 'shared' ? allocationRule : 'direct',
        frequency,
        due_day: Number(dueDay) || 1,
        next_due_date: nextDueDate,
        remind_days_before: Number(remindDays) || 3,
        is_active: true,
      });
      if (ok) setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const openConfirmPayModal = (item: RecurringExpense) => {
    setPayTarget(item);
    setActualAmount(String(item.estimated_amount));
    setTaxAmount('0');
    setPayMethod('cash');
    setPayDate(getTodayDateValue());
    setPayNotes('');
    setPayReceiptUrl(null);
  };

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    setConfirming(true);
    try {
      const ok = await confirmRecurringPayment({
        obligation: payTarget,
        actualAmount: Number(actualAmount) || 0,
        taxAmount: Number(taxAmount) || 0,
        paymentMethod: payMethod,
        paymentDate: payDate,
        receiptUrl: payReceiptUrl,
        notes: payNotes,
      });
      if (ok) setPayTarget(null);
    } finally {
      setConfirming(false);
    }
  };

  if (financeLoading || brandsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <AppLayoutHeaderPortal>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-lg gap-1.5 text-xs font-semibold"
            onClick={() => navigate('/expenses')}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span>العودة للوحة المالية والمصروفات</span>
          </Button>
          {!isDemoMode && (
            <Button
              size="sm"
              className="h-9 rounded-lg gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              onClick={openCreateModal}
            >
              <Plus className="h-4 w-4" />
              <span>+ إضافة التزام متكرر</span>
            </Button>
          )}
        </div>
      </AppLayoutHeaderPortal>

      {/* Alert Banner for Due Soon (<= 3 days) or Overdue */}
      {urgentItems.length > 0 && (
        <Card className="p-4 bg-amber-50/70 border border-amber-200 border-r-4 border-r-amber-500 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <BellRing className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-950 tabular-nums">
                تنبيه استحقاق: لديك {urgentItems.length.toLocaleString('en-US')} التزامات وفواتير مستحقة خلال 3 أيام أو متأخرة!
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                {urgentItems.map((u) => u.title).join(' · ')} — اضغط &quot;تسجيل الفاتورة / تأكيد السداد&quot; لترحيل القيمة الفعلية وتحديث موعد الشهر القادم.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-3 items-stretch">
        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-500">إجمالي الالتزامات النشطة</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
            {recurringExpenses.filter((i) => i.is_active).length.toLocaleString('en-US')} التزام
          </p>
          <span className="text-[11px] text-slate-400">إيجار، مرافق، رواتب ثابتة، واشتراكات</span>
        </Card>

        <Card className="p-5 flex flex-col justify-between border-t-2 border-t-emerald-500">
          <span className="text-xs font-medium text-slate-500">التكلفة الشهرية التقديرية الثابتة</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">
            {formatEGPCurrency(monthlyObligationsSum)}
          </p>
          <span className="text-[11px] text-slate-400">يتم تعديل القيمة الفعلية عند تسجيل كل فاتورة</span>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-500">فواتير مستحقة حالياً</span>
          <p
            className={cn(
              'mt-2 text-2xl font-bold tabular-nums tracking-tight',
              urgentItems.length > 0 ? 'text-amber-700' : 'text-emerald-700',
            )}
          >
            {urgentItems.length.toLocaleString('en-US')} فاتورة
          </p>
          <span className="text-[11px] text-slate-400">تذكير استباقي قبل موعد الاستحقاق</span>
        </Card>
      </div>

      {/* Obligations Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              جدول الالتزامات الثابتة والفواتير المتكررة
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-right text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 font-semibold">
                <th className="px-4 py-3">البند / الالتزام</th>
                <th className="px-4 py-3">التصنيف</th>
                <th className="px-4 py-3">التوجيه المحاسبي</th>
                <th className="px-4 py-3">الدورية</th>
                <th className="px-4 py-3">القيمة التقديرية</th>
                <th className="px-4 py-3">الاستحقاق القادم</th>
                <th className="px-4 py-3 text-left">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {recurringExpenses.map((item) => {
                const daysLeft = diffDaysFromToday(item.next_due_date);
                const isOverdue = daysLeft < 0;
                const isDueSoon = daysLeft >= 0 && daysLeft <= (item.remind_days_before ?? 3);
                const cat = item.category_id ? catById.get(item.category_id) : null;
                const brand = item.company_id ? brandById.get(item.company_id) : null;

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      'border-b border-slate-100 last:border-0 hover:bg-slate-50/60',
                      isOverdue && 'bg-rose-50/30',
                      isDueSoon && 'bg-amber-50/30',
                    )}
                  >
                    <td className="px-4 py-3 font-bold text-slate-900">{item.title}</td>
                    <td className="px-4 py-3 text-slate-600">{cat?.name ?? 'مرافق وتشغيل'}</td>
                    <td className="px-4 py-3">
                      {brand ? (
                        <Badge variant="outline" className="text-[11px]">
                          مباشر: {brand.name}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          {ALLOCATION_TYPE_LABELS[item.allocation_rule as AllocationType]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {FREQUENCY_LABELS[item.frequency]} (يوم {item.due_day})
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">
                      {formatEGPCurrency(item.estimated_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold tabular-nums text-slate-800">
                          {item.next_due_date}
                        </span>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 tabular-nums">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            متأخر {Math.abs(daysLeft)} يوم
                          </span>
                        )}
                        {isDueSoon && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 tabular-nums">
                            خلال {daysLeft} يوم
                          </span>
                        )}
                        {!isOverdue && !isDueSoon && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isDemoMode && (
                          <>
                            <Button
                              size="sm"
                              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5"
                              onClick={() => openConfirmPayModal(item)}
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              <span>تسجيل الفاتورة / تأكيد السداد</span>
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => openEditModal(item)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                              onClick={() => void deleteRecurringObligation(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit Recurring Obligation Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right font-bold">
              {editingItem ? 'تعديل التزام متكرر' : 'إضافة التزام أو فاتورة متكررة'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveObligation} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">اسم الالتزام / الفاتورة *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: فاتورة الغاز التجاري، إيجار المطبخ، اشتراك الإنترنت..."
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">القيمة التقديرية (ج.م.) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={estimatedAmount}
                  onChange={(e) => setEstimatedAmount(e.target.value)}
                  className="tabular-nums"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">التصنيف الفرعي</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الشركة (أو مشترك على المطبخ)</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">مشترك على المطبخ بالكامل</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {companyId === 'shared' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">قاعدة التوزيع على الشركات</Label>
                  <Select
                    value={allocationRule}
                    onValueChange={(v) =>
                      setAllocationRule(v as 'shared_revenue' | 'shared_orders')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shared_revenue">حسب نسبة المبيعات</SelectItem>
                      <SelectItem value="shared_orders">حسب عدد الطلبات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الدورية</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as RecurringFrequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="weekly">أسبوعي</SelectItem>
                    <SelectItem value="yearly">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">يوم الاستحقاق</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">التذكير قبل (أيام)</Label>
                <Input
                  type="number"
                  min="0"
                  max="30"
                  value={remindDays}
                  onChange={(e) => setRemindDays(e.target.value)}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">تاريخ الاستحقاق القادم *</Label>
              <Input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="tabular-nums"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الالتزام'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Bill Payment Modal */}
      <Dialog open={!!payTarget} onOpenChange={(v) => !v && setPayTarget(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right font-bold">
              تسجيل الفاتورة وتأكيد السداد: {payTarget?.title}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleConfirmPay} className="space-y-4">
            <p className="text-xs text-slate-500">
              أدخل القيمة الفعلية للفاتورة الحالية (خاصة لفواتير الكهرباء والغاز المتغيرة). سيتم ترحيلها فوراً لسجل المصروفات الموحد وتحديث الاستحقاق القادم تلقائياً.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">القيمة الفعلية للفاتورة (ج.م.) *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={actualAmount}
                  onChange={(e) => setActualAmount(e.target.value)}
                  className="tabular-nums font-bold"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الضريبة إن وجدت (ج.م.)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">طريقة الدفع</Label>
                <Select
                  value={payMethod}
                  onValueChange={(v) => setPayMethod(v as ExpensePaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PAYMENT_METHOD_LABELS) as [ExpensePaymentMethod, string][]).map(
                      ([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">تاريخ السداد الفعلي</Label>
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">إرفاق صورة الفاتورة (اختياري)</Label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                <Upload className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  {uploading
                    ? 'جاري الرفع...'
                    : payReceiptUrl
                      ? 'تم إرفاق الإيصال بنجاح ✓'
                      : 'اختر صورة الفاتورة'}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    const path = await uploadReceipt(file);
                    if (path) setPayReceiptUrl(path);
                    setUploading(false);
                  }}
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">ملاحظات / قراءة العداد</Label>
              <Input
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="مثال: قراءة عداد الكهرباء لشهر نوفمبر..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setPayTarget(null)}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={confirming || uploading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {confirming ? 'جاري الترحيل...' : 'تأكيد السداد والترحيل للدفتر'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
