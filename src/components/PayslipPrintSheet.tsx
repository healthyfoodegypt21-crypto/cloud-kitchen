import { HrEmployee, PayrollResult } from '@/store/hr';
import { formatEGPCurrency } from '@/lib/utils';

interface Props {
  payroll: PayrollResult | null;
  employee: HrEmployee | null;
}

const MONTH_LABELS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm ${strong ? 'font-bold' : ''}`}>
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  );
}

export default function PayslipPrintSheet({ payroll, employee }: Props) {
  if (!payroll || !employee) return null;

  return (
    <div className="hidden print:block" dir="rtl">
      <style media="print">{`
        @page { size: A4 portrait; margin: 12mm; }
      `}</style>
      <div className="mx-auto max-w-[720px] text-slate-900">
        <div className="mb-4 flex items-center justify-between border-b-2 border-slate-900 pb-3">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 132 74" className="h-10 w-14" fill="none" aria-label="Cloud Kitchens">
              <path d="M24 63h76c12.7 0 23-10.3 23-23 0-12-9.3-21.9-21.1-22.9C98.6 7.1 89.4 1 79 1 65.3 1 53.9 10.4 51 23c-2.8-1.9-6.2-3-9.9-3C31.6 20 23.8 27.3 22.4 36.6 12.9 38.2 5 46.5 5 56.6c0 2.3.3 4.5 1 6.4h18Z" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="text-lg font-black">Cloud Kitchens</p>
              <p className="text-xs text-slate-500">مفردات المرتب — Payslip</p>
            </div>
          </div>
          <div className="text-left text-sm">
            <p className="font-semibold">{MONTH_LABELS[payroll.month - 1]} {payroll.year}</p>
            <p className="text-slate-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 text-sm">
          <div><span className="text-slate-500">اسم الموظف: </span><strong>{payroll.employeeName}</strong></div>
          <div><span className="text-slate-500">الوظيفة: </span>{payroll.jobTitle || '—'}</div>
          <div><span className="text-slate-500">الكود: </span>{employee.employee_code}</div>
          <div><span className="text-slate-500">القسم: </span>{employee.department || '—'}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200">
            <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-bold">المستحقات</p>
            <Row label="الراتب الأساسي" value={formatEGPCurrency(payroll.baseSalary)} />
            <Row label={`الإضافي (${payroll.overtimeHours} س)`} value={formatEGPCurrency(payroll.overtimeValue)} />
            <Row label="المكافآت" value={formatEGPCurrency(payroll.totalBonuses)} />
          </div>
          <div className="rounded-lg border border-slate-200">
            <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-bold">الاستقطاعات</p>
            <Row label="الخصومات" value={formatEGPCurrency(payroll.totalDeductions)} />
            <Row label="السلف المستحقة" value={formatEGPCurrency(payroll.advancesDue)} />
            <Row label={`الغياب (${payroll.absentDays} يوم)`} value={formatEGPCurrency(payroll.absenceValue)} />
            <Row label={`التأخير (${payroll.lateHours} س)`} value={formatEGPCurrency(payroll.lateValue)} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
          <div className="rounded-lg border border-slate-200 p-2">أيام العمل المتوقعة<br /><strong className="text-slate-900">{payroll.expectedWorkDays}</strong></div>
          <div className="rounded-lg border border-slate-200 p-2">أيام العمل الفعلية<br /><strong className="text-slate-900">{payroll.actualWorkDays}</strong></div>
          <div className="rounded-lg border border-slate-200 p-2">أيام الجمعة<br /><strong className="text-slate-900">{payroll.fridaysCount}</strong></div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
          <span className="text-lg font-bold">صافي المرتب</span>
          <span className="text-2xl font-black">{formatEGPCurrency(payroll.netSalary)}</span>
        </div>

        <div className="mt-10 flex items-center justify-between text-sm">
          <div className="text-center">
            <p className="mb-8 text-slate-500">توقيع الموظف</p>
            <p className="border-t border-slate-400 px-8 pt-1">{payroll.employeeName}</p>
          </div>
          <div className="text-center">
            <p className="mb-8 text-slate-500">اعتماد الإدارة</p>
            <p className="border-t border-slate-400 px-8 pt-1">&nbsp;</p>
          </div>
        </div>
      </div>
    </div>
  );
}
