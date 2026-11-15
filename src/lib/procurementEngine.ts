import { INVENTORY_UNIT_LABELS } from '@/types/inventory';
import { compactWhitespace, formatEGPCurrency } from '@/lib/utils';

export type ProcurementDatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'this_month'
  | 'custom';

export const DATE_PRESET_LABELS: Record<ProcurementDatePreset, string> = {
  today: 'اليوم',
  yesterday: 'إمبارح (أمس)',
  last_7_days: 'آخر 7 أيام',
  this_month: 'هذا الشهر',
  all: 'كل الفترات',
  custom: 'فترة مخصصة',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'المالك',
  admin: 'مدير',
  manager: 'مشرف',
  procurement: 'مشتريات',
  inventory: 'أمين مخزن',
  accountant: 'محاسب',
  sales: 'مبيعات',
  kitchen: 'مطبخ',
};

/**
 * Converts an ISO timestamp or YYYY-MM-DD string into a Cairo-local YYYY-MM-DD date string
 * so late-night Egyptian purchases always land on the true local day.
 */
export function toCairoDateString(value?: string | Date | null): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(dt);
    const y = parts.find((p) => p.type === 'year')?.value ?? '';
    const m = parts.find((p) => p.type === 'month')?.value ?? '';
    const d = parts.find((p) => p.type === 'day')?.value ?? '';
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback if Intl timezone unavailable
  }
  return dt.toISOString().slice(0, 10);
}

export function formatCairoDateTime(value?: string | null): string {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return dt.toLocaleString('en-US');
  }
}

export function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function resolveDateRangeForPreset(
  preset: ProcurementDatePreset,
  customFrom = '',
  customTo = '',
  now: Date = new Date(),
): { from: string; to: string } {
  const todayCairo = toCairoDateString(now);
  switch (preset) {
    case 'today':
      return { from: todayCairo, to: todayCairo };
    case 'yesterday': {
      const yest = addDaysIso(todayCairo, -1);
      return { from: yest, to: yest };
    }
    case 'last_7_days':
      return { from: addDaysIso(todayCairo, -6), to: todayCairo };
    case 'this_month':
      return { from: `${todayCairo.slice(0, 7)}-01`, to: todayCairo };
    case 'custom':
      return { from: customFrom, to: customTo };
    case 'all':
    default:
      return { from: '', to: '' };
  }
}

export function matchesCairoDateRange(
  effectiveDateIso: string,
  fromDate: string,
  toDate: string,
): boolean {
  if (!fromDate && !toDate) return true;
  if (!effectiveDateIso) return false;
  if (fromDate && effectiveDateIso < fromDate) return false;
  if (toDate && effectiveDateIso > toDate) return false;
  return true;
}

export interface UserIdentityDirectoryEntry {
  id: string;
  displayName: string;
  role?: string;
}

export interface ResolvedPurchaseActor {
  userId: string;
  displayName: string;
  roleLabel: string;
  isVerifiedAccount: boolean;
}

export function resolvePurchaseActor(
  userId: string | null | undefined,
  fallbackName: string | null | undefined,
  directory: Map<string, UserIdentityDirectoryEntry>,
): ResolvedPurchaseActor {
  const cleanId = (userId ?? '').trim();
  const entry = cleanId ? directory.get(cleanId) : undefined;
  if (entry && entry.displayName.trim()) {
    const roleKey = (entry.role ?? '').toLowerCase();
    return {
      userId: cleanId,
      displayName: entry.displayName.trim(),
      roleLabel: ROLE_LABELS[roleKey] ?? (entry.role || 'حساب موثق'),
      isVerifiedAccount: true,
    };
  }
  const cleanFallback = compactWhitespace(fallbackName ?? '');
  return {
    userId: cleanId,
    displayName: cleanFallback || 'مستخدم النظام',
    roleLabel: cleanId ? 'حساب مسجل' : 'إدخال يدوي',
    isVerifiedAccount: Boolean(cleanId),
  };
}

export type PurchaseSourceBadgeInfo = {
  label: string;
  tone: 'emerald' | 'sky' | 'violet' | 'amber' | 'slate';
};

export function classifyPurchaseSource(
  executionSource: string,
  notes: string,
): PurchaseSourceBadgeInfo {
  const normSource = (executionSource ?? '').toLowerCase();
  const normNotes = (notes ?? '').toLowerCase();

  if (normNotes.includes('إدخال سريع ذكي') || normNotes.includes('allie')) {
    return { label: 'إدخال ذكي Allie', tone: 'emerald' };
  }
  if (normSource === 'store_direct' || normNotes.includes('مباشر من المخزن')) {
    return { label: 'شراء من المخزن', tone: 'violet' };
  }
  if (normNotes.includes('شراء مباشر')) {
    return { label: 'شراء مباشر', tone: 'sky' };
  }
  if (normNotes.includes('تلقائي من النواقص') || normNotes.includes('إعادة توريد')) {
    return { label: 'توريد نواقص', tone: 'amber' };
  }
  return { label: 'أمر شراء', tone: 'slate' };
}

/**
 * Formats units and quantities cleanly without RTL/LTR number scrambling
 * (fixes issues like "جيركن ٤.٢٤ كيلو 0" -> "0 جيركن").
 */
export function formatCleanUnitLabel(rawUnit: string): {
  unitShort: string;
  packHint?: string;
} {
  const trimmed = compactWhitespace(rawUnit ?? '');
  if (!trimmed) return { unitShort: 'وحدة' };

  const mapped = INVENTORY_UNIT_LABELS[trimmed as keyof typeof INVENTORY_UNIT_LABELS];
  if (mapped) return { unitShort: mapped };

  // Split compound unit descriptions like "جيركن ٤.٢٤ كيلو" into main unit + pack hint
  const compoundMatch = trimmed.match(/^([^\d٠-٩]+?)\s+([\d٠-٩.,]+\s*.+)$/u);
  if (compoundMatch) {
    return {
      unitShort: compactWhitespace(compoundMatch[1]),
      packHint: compactWhitespace(compoundMatch[2]),
    };
  }

  return { unitShort: trimmed };
}

export interface PriceVarianceBadge {
  kind: 'spike' | 'saving' | 'normal' | 'first_time';
  deltaPct: number;
  label: string;
  referencePrice: number;
}

export function evaluatePriceVariance(
  unitCost: number,
  referencePrice: number,
): PriceVarianceBadge {
  if (!Number.isFinite(unitCost) || unitCost <= 0) {
    return { kind: 'normal', deltaPct: 0, label: '', referencePrice: 0 };
  }
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    return { kind: 'first_time', deltaPct: 0, label: 'أول تسعير', referencePrice: 0 };
  }
  const diff = unitCost - referencePrice;
  const pct = Math.round((diff / referencePrice) * 100);
  if (pct >= 5) {
    return {
      kind: 'spike',
      deltaPct: pct,
      label: `أعلى +${pct}% عن المعتاد (${formatEGPCurrency(referencePrice)})`,
      referencePrice,
    };
  }
  if (pct <= -5) {
    return {
      kind: 'saving',
      deltaPct: pct,
      label: `توفير ${Math.abs(pct)}% عن المعتاد`,
      referencePrice,
    };
  }
  return { kind: 'normal', deltaPct: pct, label: 'سعر طبيعي', referencePrice };
}

export interface UnifiedProcurementKpiSummary {
  todaySpend: number;
  todayCount: number;
  yesterdaySpend: number;
  yesterdayCount: number;
  monthSpend: number;
  monthCount: number;
  pendingReceiptCount: number;
  pendingReceiptValue: number;
  pendingExecutionCount: number;
  unpaidTotal: number;
  dueSoonCount: number;
  shortagesCount: number;
}

export function computeUnifiedProcurementKpis(params: {
  requests: Array<{
    status: string;
    effectiveDate: string;
    totalAmount: number;
    paidAmount: number;
  }>;
  invoices: Array<{
    status: string;
    total: number;
    paid: number;
    dueDate: string;
  }>;
  shortagesCount: number;
  now?: Date;
}): UnifiedProcurementKpiSummary {
  const now = params.now ?? new Date();
  const todayStr = toCairoDateString(now);
  const yesterdayStr = addDaysIso(todayStr, -1);
  const monthPrefix = todayStr.slice(0, 7);
  const dueSoonLimit = addDaysIso(todayStr, 3);

  let todaySpend = 0;
  let todayCount = 0;
  let yesterdaySpend = 0;
  let yesterdayCount = 0;
  let monthSpend = 0;
  let monthCount = 0;
  let pendingReceiptCount = 0;
  let pendingReceiptValue = 0;
  let pendingExecutionCount = 0;

  for (const req of params.requests) {
    if (req.status === 'pending_procurement') {
      pendingExecutionCount += 1;
      continue;
    }
    if (req.status === 'rejected') {
      continue;
    }
    if (req.status === 'purchased_pending_receipt') {
      pendingReceiptCount += 1;
      pendingReceiptValue += req.totalAmount;
    }

    if (req.status === 'purchased_pending_receipt' || req.status === 'approved') {
      if (req.effectiveDate === todayStr) {
        todaySpend += req.totalAmount;
        todayCount += 1;
      }
      if (req.effectiveDate === yesterdayStr) {
        yesterdaySpend += req.totalAmount;
        yesterdayCount += 1;
      }
      if (req.effectiveDate.startsWith(monthPrefix)) {
        monthSpend += req.totalAmount;
        monthCount += 1;
      }
    }
  }

  let unpaidTotal = 0;
  let dueSoonCount = 0;

  for (const inv of params.invoices) {
    const remaining = Math.max(0, inv.total - inv.paid);
    if (remaining <= 0.01 || inv.status === 'paid') continue;
    unpaidTotal += remaining;
    if (inv.dueDate && inv.dueDate.slice(0, 10) <= dueSoonLimit) {
      dueSoonCount += 1;
    }
  }

  // Also include unpaid credit purchases that had no formal invoice number in supplier_invoices
  if (params.invoices.length === 0) {
    for (const req of params.requests) {
      if (req.status === 'purchased_pending_receipt' || req.status === 'approved') {
        const rem = Math.max(0, req.totalAmount - req.paidAmount);
        if (rem > 0.01) unpaidTotal += rem;
      }
    }
  }

  return {
    todaySpend: Math.round(todaySpend * 100) / 100,
    todayCount,
    yesterdaySpend: Math.round(yesterdaySpend * 100) / 100,
    yesterdayCount,
    monthSpend: Math.round(monthSpend * 100) / 100,
    monthCount,
    pendingReceiptCount,
    pendingReceiptValue: Math.round(pendingReceiptValue * 100) / 100,
    pendingExecutionCount,
    unpaidTotal: Math.round(unpaidTotal * 100) / 100,
    dueSoonCount,
    shortagesCount: params.shortagesCount,
  };
}

export function normalizeWhatsAppPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0020')) return digits.slice(2);
  if (digits.startsWith('20') && digits.length >= 12) return digits;
  if (digits.startsWith('01') && digits.length === 11) return `2${digits}`;
  if (digits.startsWith('1') && digits.length === 10) return `20${digits}`;
  return digits.length >= 10 ? digits : null;
}

export function buildSupplierWhatsAppPurchaseOrderUrl(params: {
  supplierName: string;
  supplierPhone: string;
  hubName?: string;
  requestNo?: string;
  notes?: string;
  lines: Array<{ itemName: string; quantity: number; unit: string }>;
}): string | null {
  const intlPhone = normalizeWhatsAppPhone(params.supplierPhone);
  if (!intlPhone || params.lines.length === 0) return null;

  const header = `السلام عليكم أ/ ${params.supplierName || 'المورد المحترم'}،\nنرجو توريد الأصناف التالية${
    params.hubName ? ` لصالح (${params.hubName})` : ''
  }${params.requestNo ? ` — رقم الطلب: ${params.requestNo}` : ''}:`;

  const body = params.lines
    .map(
      (line, idx) =>
        `${idx + 1}. ${line.itemName}: *${line.quantity}* ${formatCleanUnitLabel(line.unit).unitShort}`,
    )
    .join('\n');

  const footer = params.notes?.trim() ? `\nملاحظات: ${params.notes.trim()}` : '';
  const text = `${header}\n\n${body}${footer}\n\nشكراً لكم.`;
  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`;
}
