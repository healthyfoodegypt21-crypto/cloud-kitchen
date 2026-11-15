import { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  History,
  Loader2,
  Printer,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatEGPCurrency } from '@/lib/utils';

export interface LedgerInvoiceRow {
  id: string;
  requestId: string;
  supplierId: string;
  supplierName: string;
  number: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  status: string;
  storagePath: string;
  recordedByName?: string;
}

export interface SupplierPaymentRow {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  referenceNo: string;
  recordedByName: string;
}

interface Props {
  suppliers: Array<{ id: string; name: string }>;
  invoices: LedgerInvoiceRow[];
  payments: SupplierPaymentRow[];
  cleaningOrphans: boolean;
  onCleanupOrphans: () => void;
  onOpenInvoiceFile: (storagePath: string) => void;
  onRecordPayment: (
    invoice: LedgerInvoiceRow,
    amount: number,
    method: 'cash' | 'bank_transfer' | 'credit',
    reference: string,
  ) => Promise<void>;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقداً',
  bank_transfer: 'تحويل بنكي / محفظة',
  credit: 'آجل',
};

export default function SupplierStatementPanel({
  suppliers,
  invoices,
  payments,
  cleaningOrphans,
  onCleanupOrphans,
  onOpenInvoiceFile,
  onRecordPayment,
}: Props) {
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState('');
  const [payingId, setPayingId] = useState('');
  const [paymentDrafts, setPaymentDrafts] = useState<
    Record<string, { amount: string; method: 'cash' | 'bank_transfer' | 'credit'; reference: string }>
  >({});

  const paymentsByInvoiceId = useMemo(() => {
    const map = new Map<string, SupplierPaymentRow[]>();
    for (const p of payments) {
      const arr = map.get(p.invoiceId) ?? [];
      arr.push(p);
      map.set(p.invoiceId, arr);
    }
    return map;
  }, [payments]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (
        selectedSupplierFilter !== 'all' &&
        inv.supplierId !== selectedSupplierFilter &&
        inv.supplierName !== selectedSupplierFilter
      ) {
        return false;
      }
      const remaining = Math.max(0, inv.total - inv.paid);
      if (statusFilter === 'unpaid' && remaining <= 0.01) return false;
      if (statusFilter === 'paid' && remaining > 0.01) return false;
      return true;
    });
  }, [invoices, selectedSupplierFilter, statusFilter]);

  const statementTotals = useMemo(() => {
    let totalPurchased = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    for (const inv of filteredInvoices) {
      totalPurchased += inv.total;
      totalPaid += inv.paid;
      totalRemaining += Math.max(0, inv.total - inv.paid);
    }
    return {
      totalPurchased: Math.round(totalPurchased * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalRemaining: Math.round(totalRemaining * 100) / 100,
    };
  }, [filteredInvoices]);

  const submitPayment = async (inv: LedgerInvoiceRow) => {
    const remaining = Math.max(0, Math.round((inv.total - inv.paid) * 100) / 100);
    const draft = paymentDrafts[inv.id] ?? {
      amount: String(remaining),
      method: 'cash' as const,
      reference: '',
    };
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.01) return;
    setPayingId(inv.id);
    try {
      await onRecordPayment(inv, amount, draft.method, draft.reference);
      setPaymentDrafts((prev) => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      });
    } finally {
      setPayingId('');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Controls & Supplier Statement Picker */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[220px]">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                كشف حساب المورد
              </Label>
              <select
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
                value={selectedSupplierFilter}
                onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              >
                <option value="all">كل الموردين (كشف مجمع)</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { key: 'all' as const, label: 'كل الفواتير (المسددة والآجلة)' },
                { key: 'unpaid' as const, label: 'مستحقة السداد فقط' },
                { key: 'paid' as const, label: 'مسددة بالكامل' },
              ].map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setStatusFilter(pill.key)}
                  className={cn(
                    'h-9 rounded-lg border px-3 text-xs font-bold transition-colors cursor-pointer',
                    statusFilter === pill.key
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              طباعة كشف الحساب
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              disabled={cleaningOrphans}
              onClick={onCleanupOrphans}
            >
              {cleaningOrphans ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 text-slate-500" />
              )}
              تنظيف مرفقات غير مرتبطة
            </Button>
          </div>
        </div>
      </Card>

      {/* Account Statement Summary Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 border-slate-200/80">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>إجمالي التعاملات والفواتير</span>
            <FileText className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-1.5 text-xl font-extrabold text-slate-900 tabular-nums">
            {formatEGPCurrency(statementTotals.totalPurchased)}
          </p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            عدد الفواتير: {filteredInvoices.length}
          </p>
        </Card>

        <Card className="p-4 border-emerald-200/80 bg-emerald-50/30">
          <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold">
            <span>إجمالي المسدد للموردين</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1.5 text-xl font-extrabold text-emerald-800 tabular-nums">
            {formatEGPCurrency(statementTotals.totalPaid)}
          </p>
          <p className="text-[11px] text-emerald-700/80">نقداً وتحويلات ودفعات مسجلة</p>
        </Card>

        <Card
          className={cn(
            'p-4',
            statementTotals.totalRemaining > 0
              ? 'border-rose-200 bg-rose-50/40'
              : 'border-slate-200/80',
          )}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-rose-900">
            <span>الرصيد المتبقي المستحق (مديونية)</span>
            <CreditCard className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-1.5 text-xl font-extrabold text-rose-800 tabular-nums">
            {formatEGPCurrency(statementTotals.totalRemaining)}
          </p>
          <p className="text-[11px] text-slate-500">يُحدث فورياً عند تسجيل أي دفعة</p>
        </Card>
      </div>

      {/* Invoices List */}
      {filteredInvoices.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-slate-500">
          لا توجد فواتير مطابقة لفلتر كشف الحساب الحالي.
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map((inv) => {
            const remaining = Math.max(0, Math.round((inv.total - inv.paid) * 100) / 100);
            const isPaid = remaining <= 0.01;
            const isPartial = !isPaid && inv.paid > 0;
            const invPayments = paymentsByInvoiceId.get(inv.id) ?? [];
            const isExpanded = expandedInvoiceId === inv.id;
            const draft = paymentDrafts[inv.id] ?? {
              amount: String(remaining),
              method: 'cash' as const,
              reference: '',
            };

            return (
              <Card
                key={inv.id}
                className={cn(
                  'overflow-hidden transition-colors',
                  !isPaid ? 'border-amber-200/90' : 'border-slate-200/80',
                )}
              >
                <CardHeader className="p-4 pb-3 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 bg-slate-50/60 border-b border-slate-100">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-sm font-extrabold text-slate-900">
                        {inv.supplierName || 'مورد نقدي'} · فاتورة {inv.number || 'بدون رقم'}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[11px] font-bold',
                          isPaid
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : isPartial
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : 'border-rose-300 bg-rose-50 text-rose-800',
                        )}
                      >
                        {isPaid ? 'مسددة بالكامل' : isPartial ? 'مسددة جزئياً' : 'آجلة غير مسددة'}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1 text-xs tabular-nums">
                      تاريخ الفاتورة: {inv.date || '—'}
                      {inv.dueDate && !isPaid ? ` · الاستحقاق: ${inv.dueDate}` : ''}
                      {inv.recordedByName ? ` · سجّلها: ${inv.recordedByName}` : ''}
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 tabular-nums text-xs">
                    <span className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 font-bold text-slate-800">
                      الإجمالي: {formatEGPCurrency(inv.total)}
                    </span>
                    <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 font-bold text-emerald-800">
                      المدفوع: {formatEGPCurrency(inv.paid)}
                    </span>
                    {!isPaid && (
                      <span className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 font-extrabold text-rose-800">
                        المتبقي: {formatEGPCurrency(remaining)}
                      </span>
                    )}
                    {inv.storagePath && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => onOpenInvoiceFile(inv.storagePath)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        المرفق
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-xs"
                      onClick={() => setExpandedInvoiceId(isExpanded ? '' : inv.id)}
                    >
                      <History className="h-3.5 w-3.5" />
                      الدفعات ({invPayments.length})
                    </Button>
                  </div>
                </CardHeader>

                {(!isPaid || isExpanded) && (
                  <CardContent className="p-4 space-y-3">
                    {!isPaid && !inv.id.startsWith('req-only-') && (
                      <div className="grid gap-2.5 sm:grid-cols-4 items-end rounded-xl border border-amber-200/70 bg-amber-50/30 p-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold">مبلغ الدفعة الجديدة</Label>
                          <Input
                            type="number"
                            min="0.01"
                            max={remaining}
                            step="0.01"
                            className="h-8 text-xs font-bold tabular-nums bg-white"
                            value={draft.amount}
                            onChange={(e) =>
                              setPaymentDrafts((prev) => ({
                                ...prev,
                                [inv.id]: { ...draft, amount: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold">طريقة السداد</Label>
                          <select
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
                            value={draft.method}
                            onChange={(e) =>
                              setPaymentDrafts((prev) => ({
                                ...prev,
                                [inv.id]: {
                                  ...draft,
                                  method: e.target.value as 'cash' | 'bank_transfer' | 'credit',
                                },
                              }))
                            }
                          >
                            <option value="cash">نقداً</option>
                            <option value="bank_transfer">تحويل بنكي / انستاباي</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold">رقم مرجعي / إيصال</Label>
                          <Input
                            className="h-8 text-xs bg-white"
                            placeholder="اختياري..."
                            value={draft.reference}
                            onChange={(e) =>
                              setPaymentDrafts((prev) => ({
                                ...prev,
                                [inv.id]: { ...draft, reference: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          disabled={payingId === inv.id}
                          onClick={() => void submitPayment(inv)}
                        >
                          {payingId === inv.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wallet className="h-3.5 w-3.5" />
                          )}
                          تسجيل سداد للمورد
                        </Button>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-slate-700">سجل الدفعات المسجلة:</p>
                        {invPayments.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            {inv.paid > 0
                              ? `سُدد مبلغ ${formatEGPCurrency(inv.paid)} مباشرة عند تسجيل الفاتورة.`
                              : 'لم تُسجّل دفعات على هذه الفاتورة بعد.'}
                          </p>
                        ) : (
                          <div className="divide-y rounded-lg border border-slate-200/80 bg-slate-50/40 text-xs">
                            {invPayments.map((pmt) => (
                              <div
                                key={pmt.id}
                                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 tabular-nums"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-emerald-700">
                                    {formatEGPCurrency(pmt.amount)}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {PAYMENT_METHOD_LABELS[pmt.paymentMethod] ?? pmt.paymentMethod}
                                  </Badge>
                                  {pmt.referenceNo && (
                                    <span className="text-slate-500">مرجع: {pmt.referenceNo}</span>
                                  )}
                                </div>
                                <div className="text-slate-500 text-[11px]">
                                  {pmt.paymentDate} · سجّلها: {pmt.recordedByName}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
