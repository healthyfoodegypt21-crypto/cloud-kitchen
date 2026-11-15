import { describe, expect, it } from 'vitest';
import {
  buildSupplierWhatsAppPurchaseOrderUrl,
  classifyPurchaseSource,
  computeUnifiedProcurementKpis,
  evaluatePriceVariance,
  formatCleanUnitLabel,
  matchesCairoDateRange,
  resolveDateRangeForPreset,
  resolvePurchaseActor,
  toCairoDateString,
  type UserIdentityDirectoryEntry,
} from '@/lib/procurementEngine';

describe('procurementEngine', () => {
  it('resolves Cairo local dates accurately including late-night UTC boundaries for Today and Yesterday', () => {
    // 2026-11-14T22:30:00Z is 2026-11-15 00:30 AM in Cairo (+02:00)!
    const cairoPastMidnight = new Date('2026-11-14T22:30:00.000Z');
    expect(toCairoDateString(cairoPastMidnight)).toBe('2026-11-15');

    const yesterdayBounds = resolveDateRangeForPreset('yesterday', '', '', cairoPastMidnight);
    expect(yesterdayBounds).toEqual({ from: '2026-11-14', to: '2026-11-14' });
    expect(matchesCairoDateRange('2026-11-14', yesterdayBounds.from, yesterdayBounds.to)).toBe(true);
    expect(matchesCairoDateRange('2026-11-15', yesterdayBounds.from, yesterdayBounds.to)).toBe(false);
  });

  it('resolves verified user account display name and role automatically from profiles directory', () => {
    const dir = new Map<string, UserIdentityDirectoryEntry>([
      ['uid-1', { id: 'uid-1', displayName: 'Maikel', role: 'owner' }],
      ['uid-2', { id: 'uid-2', displayName: 'أحمد حسن', role: 'inventory' }],
    ]);

    const ownerActor = resolvePurchaseActor('uid-1', 'مندوب خارجي', dir);
    expect(ownerActor).toEqual({
      userId: 'uid-1',
      displayName: 'Maikel',
      roleLabel: 'المالك',
      isVerifiedAccount: true,
    });

    const storeActor = resolvePurchaseActor('uid-2', '', dir);
    expect(storeActor.displayName).toBe('أحمد حسن');
    expect(storeActor.roleLabel).toBe('أمين مخزن');
  });

  it('splits compound unit labels cleanly to prevent RTL number scrambling', () => {
    expect(formatCleanUnitLabel('جيركن ٤.٢٤ كيلو')).toEqual({
      unitShort: 'جيركن',
      packHint: '٤.٢٤ كيلو',
    });
    expect(formatCleanUnitLabel('kg')).toEqual({
      unitShort: 'كجم',
    });
  });

  it('flags price spikes (>= +5%) and savings (<= -5%) accurately', () => {
    const spike = evaluatePriceVariance(230, 190);
    expect(spike.kind).toBe('spike');
    expect(spike.deltaPct).toBe(21);

    const saving = evaluatePriceVariance(160, 200);
    expect(saving.kind).toBe('saving');
    expect(saving.deltaPct).toBe(-20);

    const first = evaluatePriceVariance(120, 0);
    expect(first.kind).toBe('first_time');
  });

  it('computes unified non-duplicated KPIs for today, yesterday, month, pending receipts, and supplier debt', () => {
    const refNow = new Date('2026-11-15T10:00:00.000Z');
    const kpis = computeUnifiedProcurementKpis({
      now: refNow,
      shortagesCount: 3,
      requests: [
        { status: 'approved', effectiveDate: '2026-11-15', totalAmount: 500, paidAmount: 500 },
        { status: 'purchased_pending_receipt', effectiveDate: '2026-11-14', totalAmount: 718.5, paidAmount: 500 },
        { status: 'rejected', effectiveDate: '2026-11-14', totalAmount: 999, paidAmount: 999 },
      ],
      invoices: [
        { status: 'partially_paid', total: 718.5, paid: 500, dueDate: '2026-11-16' },
      ],
    });

    expect(kpis).toMatchObject({
      todaySpend: 500,
      todayCount: 1,
      yesterdaySpend: 718.5,
      yesterdayCount: 1,
      monthSpend: 1218.5,
      monthCount: 2,
      pendingReceiptCount: 1,
      pendingReceiptValue: 718.5,
      unpaidTotal: 218.5,
      dueSoonCount: 1,
      shortagesCount: 3,
    });
  });

  it('generates formatted Egyptian WhatsApp purchase order URLs and classifies purchase sources', () => {
    expect(classifyPurchaseSource('procurement', 'إدخال سريع ذكي من رسالة أو صورة فاتورة').label).toBe(
      'إدخال ذكي Allie',
    );
    expect(classifyPurchaseSource('store_direct', '').label).toBe('شراء من المخزن');

    const url = buildSupplierWhatsAppPurchaseOrderUrl({
      supplierName: 'أولاد رجب',
      supplierPhone: '01012345678',
      hubName: 'المخزن المركزي',
      requestNo: 'PUR-001',
      lines: [{ itemName: 'كاتشب', quantity: 2, unit: 'جيركن ٤.٢٤ كيلو' }],
    });
    expect(url).toContain('https://wa.me/201012345678?text=');
    expect(decodeURIComponent(url ?? '')).toContain('1. كاتشب: *2* جيركن');
  });
});
