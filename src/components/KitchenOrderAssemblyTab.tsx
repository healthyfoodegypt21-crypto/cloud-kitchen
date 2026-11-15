import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCheck,
  ClipboardCheck,
  PackageCheck,
  Printer,
  RotateCcw,
  Search,
  Snowflake,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Brand } from '@/hooks/useBrands';
import { compareKitchenMealLabels } from '@/lib/kitchen';
import {
  CompanyAssemblyBlock,
  KitchenOrderAssemblyReport,
  loadQcCheckedState,
  saveQcCheckedState,
  UNASSIGNED_COMPANY_KEY,
  UNASSIGNED_COMPANY_LABEL,
} from '@/lib/kitchenOrderAssembly';
import { cn, formatArabicDate, getArabicWeekday } from '@/lib/utils';

interface Props {
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  selectedCompanyFilter: string;
  onSelectedCompanyFilterChange: (companyKey: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  brands: Brand[];
  report: KitchenOrderAssemblyReport;
  loading: boolean;
  onPrintAll: () => void;
  onPrintSingleCompany: (companyKey: string) => void;
}

export default function KitchenOrderAssemblyTab({
  selectedDate,
  onSelectedDateChange,
  selectedCompanyFilter,
  onSelectedCompanyFilterChange,
  searchQuery,
  onSearchQueryChange,
  brands,
  report,
  loading,
  onPrintAll,
  onPrintSingleCompany,
}: Props) {
  const [qcChecked, setQcChecked] = useState<Record<string, boolean>>(() =>
    loadQcCheckedState(selectedDate),
  );

  useEffect(() => {
    setQcChecked(loadQcCheckedState(selectedDate));
  }, [selectedDate]);

  const sortedBrands = useMemo(
    () => [...brands].sort((a, b) => compareKitchenMealLabels(a.name, b.name)),
    [brands],
  );

  const weekdayLabel = getArabicWeekday(selectedDate);
  const formattedDate = formatArabicDate(selectedDate);

  const toggleOrderChecked = (orderId: string, nextVal: boolean) => {
    setQcChecked((prev) => {
      const updated = { ...prev };
      if (nextVal) updated[orderId] = true;
      else delete updated[orderId];
      saveQcCheckedState(selectedDate, updated);
      return updated;
    });
  };

  const resetAllQcChecks = () => {
    setQcChecked({});
    saveQcCheckedState(selectedDate, {});
  };

  const totalCheckedInView = useMemo(
    () =>
      report.companies.reduce(
        (sum, c) => sum + c.orders.filter((o) => Boolean(qcChecked[o.orderId])).length,
        0,
      ),
    [qcChecked, report.companies],
  );

  return (
    <div className="space-y-5 print:hidden" dir="rtl">
      {/* 1. Top Filters & Controls Bar */}
      <Card className="p-4 border-slate-200/90 shadow-2xs">
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-[210px_220px_1fr_auto] xl:items-end">
          {/* Date Picker */}
          <div className="space-y-1.5">
            <label htmlFor="assembly-date-picker" className="text-xs font-bold text-slate-700 block">
              تاريخ التنفيذ
            </label>
            <Input
              id="assembly-date-picker"
              type="date"
              className="h-9 text-xs tabular-nums font-semibold"
              value={selectedDate}
              onChange={(e) => onSelectedDateChange(e.target.value)}
            />
            <p className="text-[11px] text-slate-500">
              {weekdayLabel ? `${weekdayLabel} · ${formattedDate}` : 'اختر تاريخاً صالحاً'}
            </p>
          </div>

          {/* Company Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">فلتر الشركة</label>
            <Select value={selectedCompanyFilter} onValueChange={onSelectedCompanyFilterChange}>
              <SelectTrigger className="h-9 text-xs font-semibold" aria-label="فلتر الشركة">
                <SelectValue placeholder="كل الشركات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الشركات</SelectItem>
                {sortedBrands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
                {report.hasUnassignedOrders && (
                  <SelectItem value={UNASSIGNED_COMPANY_KEY}>{UNASSIGNED_COMPANY_LABEL}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500">الشركات مرتبة أبجدياً</p>
          </div>

          {/* Quick Search */}
          <div className="space-y-1.5">
            <label htmlFor="assembly-quick-search" className="text-xs font-bold text-slate-700 block">
              بحث سريع (باسم العميل أو الصنف)
            </label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="assembly-quick-search"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="ابحث باسم العميل أو اسم الوجبة..."
                className="h-9 pr-9 text-xs"
              />
            </div>
            <p className="text-[11px] text-slate-500 tabular-nums">
              المعروض: {report.totalCompanies} شركة · {report.totalCustomerOrders} عميل · {report.totalMeals} وجبة
            </p>
          </div>

          {/* Top Print All Action + QC Reset */}
          <div className="flex flex-wrap items-center gap-2 pb-4 xl:pb-5">
            {totalCheckedInView > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-lg gap-1.5 text-xs"
                onClick={resetAllQcChecks}
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                <span>تصفير المراجعة ({totalCheckedInView})</span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-lg gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
              disabled={report.companies.length === 0}
              onClick={onPrintAll}
            >
              <Printer className="h-4 w-4" />
              <span>طباعة كل الكشوفات ({report.companies.length})</span>
            </Button>
          </div>
        </div>

        {/* Live QC Progress Bar */}
        {report.totalCustomerOrders > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <ClipboardCheck className="h-4 w-4 text-emerald-600" />
              <span>
                تقدم التقفيل والمراجعة النهائية (QC): تمت مراجعة{' '}
                <strong className="text-emerald-700 tabular-nums">{totalCheckedInView}</strong> من{' '}
                <strong className="tabular-nums">{report.totalCustomerOrders}</strong> طلب فعال
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              يتم استبعاد الطلبات الملغاة تلقائياً · عند الطباعة تبدأ كل شركة في صفحة جديدة مستقلة
            </span>
          </div>
        )}
      </Card>

      {/* 2. Company Assembly Blocks */}
      {loading ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          جارٍ تجهيز كشوفات تجميع ومراجعة الطلبات...
        </Card>
      ) : report.companies.length === 0 ? (
        <Card className="border-dashed p-12 text-center">
          <PackageCheck className="h-9 w-9 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-900">
            لا توجد طلبات فعالة لتجميعها في هذا اليوم
          </p>
          <p className="mt-1 text-xs text-slate-500">
            جرّب تغيير التاريخ أو اختيار «كل الشركات» أو مسح نص البحث السريع.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {report.companies.map((company) => (
            <CompanyAssemblyCard
              key={company.key}
              company={company}
              dateLabel={formattedDate}
              weekdayLabel={weekdayLabel}
              qcChecked={qcChecked}
              onToggleOrderChecked={toggleOrderChecked}
              onPrintCompany={() => onPrintSingleCompany(company.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyAssemblyCard({
  company,
  dateLabel,
  weekdayLabel,
  qcChecked,
  onToggleOrderChecked,
  onPrintCompany,
}: {
  company: CompanyAssemblyBlock;
  dateLabel: string;
  weekdayLabel?: string;
  qcChecked: Record<string, boolean>;
  onToggleOrderChecked: (orderId: string, checked: boolean) => void;
  onPrintCompany: () => void;
}) {
  const checkedCount = company.orders.filter((o) => Boolean(qcChecked[o.orderId])).length;
  const allChecked = company.orders.length > 0 && checkedCount === company.orders.length;

  return (
    <Card
      className={cn(
        'overflow-hidden shadow-xs transition-colors',
        company.isUnassigned
          ? 'border-amber-300/90'
          : allChecked
            ? 'border-emerald-400'
            : 'border-slate-200/90',
      )}
    >
      {/* أ) رأس الكشف (Company Header) */}
      <CardHeader
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-4 space-y-0 border-b p-5',
          company.isUnassigned
            ? 'bg-amber-50/60 border-amber-200/70'
            : 'bg-gradient-to-l from-slate-50 via-white to-emerald-50/40 border-slate-200/80',
        )}
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className={cn(
                'h-9 w-9 rounded-xl flex items-center justify-center border shrink-0',
                company.isUnassigned
                  ? 'bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-emerald-600 border-emerald-700 text-white',
              )}
            >
              {company.isUnassigned ? (
                <Users className="h-4 w-4" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
            </div>
            <CardTitle className="text-xl font-extrabold text-slate-900 tracking-tight">
              {company.companyName}
            </CardTitle>
            {allChecked && (
              <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                <CheckCheck className="h-3.5 w-3.5" />
                مكتمل المراجعة
              </Badge>
            )}
          </div>
          <p className="text-xs font-medium text-slate-600">
            تاريخ اليوم: <strong>{weekdayLabel ? `${weekdayLabel} · ` : ''}{dateLabel}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 tabular-nums">
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-center shadow-2xs">
              <div className="text-[10px] font-bold text-slate-500">إجمالي العملاء</div>
              <div className="text-base font-extrabold text-slate-900">
                {company.customerCount.toLocaleString('en-US')}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-1.5 text-center shadow-2xs">
              <div className="text-[10px] font-bold text-emerald-800">إجمالي الوجبات</div>
              <div className="text-base font-extrabold text-emerald-800">
                {company.totalMealCount.toLocaleString('en-US')}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-center shadow-2xs">
              <div className="text-[10px] font-bold text-slate-500">المراجعة (QC)</div>
              <div className="text-sm font-extrabold text-slate-800">
                {checkedCount}/{company.customerCount}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 rounded-xl gap-1.5 border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold shadow-2xs"
            onClick={onPrintCompany}
          >
            <Printer className="h-4 w-4 text-emerald-700" />
            <span>طباعة كشف هذه الشركة فقط</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* ب) جدول ملخص الأصناف للشركة (Company Item Summary) */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-100/70 px-4 py-2.5">
            <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <PackageCheck className="h-4 w-4 text-emerald-600" />
              ملخص أصناف الشركة لعدّ العلب قبل التوزيع على الأكياس ({company.itemSummary.length} صنف)
            </h3>
            <span className="rounded-full bg-white border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 tabular-nums">
              المجموع: {company.totalMealCount.toLocaleString('en-US')} علبة
            </span>
          </div>

          <div className="max-w-2xl overflow-x-auto bg-white">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-600">
                  <th className="px-4 py-2 font-bold">الصنف</th>
                  <th className="px-4 py-2 text-center font-bold w-36">إجمالي العدد</th>
                </tr>
              </thead>
              <tbody>
                {company.itemSummary.map((item) => (
                  <tr
                    key={item.key}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-2 font-bold text-slate-900">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{item.label}</span>
                        {item.isFrozen && (
                          <Badge
                            variant="outline"
                            className="border-sky-300 bg-sky-50 text-sky-800 text-[10px] font-bold gap-1"
                          >
                            <Snowflake className="h-2.5 w-2.5" />
                            Frozen / نيء
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums">
                      <span className="inline-flex min-w-[2.25rem] items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-extrabold text-emerald-800">
                        {item.totalQuantity.toLocaleString('en-US')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ج) جدول تفاصيل الطلبات والمراجعة (Customer Orders & QC Table) */}
        <div className="rounded-xl border border-slate-200/90 overflow-hidden">
          <div className="border-b border-slate-200/80 bg-slate-100/70 px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-slate-800">
              جدول تفاصيل طلبات العملاء والمراجعة (مرتب أبجدياً باسم العميل)
            </h3>
            <span className="text-[11px] text-slate-500">
              اضغط على مربع المراجعة (QC) عند الانتهاء من تجهيز ومراجعة كيس العميل
            </span>
          </div>

          <div className="overflow-x-auto bg-white">
            <table className="w-full min-w-[720px] text-right text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th className="px-3 py-3 text-center font-bold w-14">#</th>
                  <th className="px-4 py-3 font-bold w-56">اسم العميل</th>
                  <th className="px-4 py-3 font-bold">الوجبات / الأصناف المطلوبة</th>
                  <th className="px-4 py-3 font-bold w-72">التعليقات والملاحظات</th>
                  <th className="px-3 py-3 text-center font-bold w-24">مراجعة (QC)</th>
                </tr>
              </thead>
              <tbody>
                {company.orders.map((order, idx) => {
                  const isChecked = Boolean(qcChecked[order.orderId]);
                  return (
                    <tr
                      key={order.orderId}
                      className={cn(
                        'border-b border-slate-100 last:border-0 transition-colors',
                        isChecked ? 'bg-emerald-50/45' : 'hover:bg-slate-50/70',
                      )}
                    >
                      <td className="px-3 py-3.5 text-center font-bold text-slate-500 tabular-nums align-top">
                        {idx + 1}
                      </td>

                      <td className="px-4 py-3.5 align-top">
                        <div
                          className={cn(
                            'font-extrabold text-slate-900',
                            isChecked && 'line-through text-emerald-900/70',
                          )}
                        >
                          {order.customerName}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                          إجمالي: {order.totalMealCount} وجبة
                        </div>
                      </td>

                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1.5">
                          {order.mealLines.map((line) => (
                            <div
                              key={line.key}
                              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/75 bg-slate-50/60 px-2.5 py-1.5 text-xs"
                            >
                              <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-800">
                                <span>{line.label}</span>
                                {line.isFrozen && (
                                  <Badge
                                    variant="outline"
                                    className="border-sky-300 bg-sky-50 text-sky-800 text-[10px] font-bold"
                                  >
                                    Frozen / نيء
                                  </Badge>
                                )}
                              </div>
                              <span className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-extrabold text-white tabular-nums">
                                × {line.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 align-top">
                        {order.notes.length === 0 ? (
                          <span className="text-slate-300 text-xs">—</span>
                        ) : (
                          <div className="space-y-1.5">
                            {order.notes.map((note) => (
                              <div
                                key={note.key}
                                className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-950 shadow-2xs"
                              >
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                                <span className="leading-relaxed">
                                  {note.mealLabel ? (
                                    <strong className="text-rose-800">{note.mealLabel}: </strong>
                                  ) : null}
                                  {note.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3.5 text-center align-middle">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            aria-label={`مراجعة طلب ${order.customerName}`}
                            checked={isChecked}
                            onCheckedChange={(val) =>
                              onToggleOrderChecked(order.orderId, val === true)
                            }
                            className="h-5 w-5 border-2 border-slate-400 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
