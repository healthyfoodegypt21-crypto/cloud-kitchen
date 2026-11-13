import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  isSupabaseNetworkError,
  isSupabaseUnavailable,
  markSupabaseAvailable,
  markSupabaseUnavailable,
} from '@/integrationssupabase/runtime';
import type { Brand } from '@/hooks/useBrands';
import { isUuidBrandId } from '@/hooks/useBrands';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';
import {
  advanceNextDueDate,
  buildDefaultLocalCategories,
  calculateBrandAllocations,
  PurchasePricePoint,
} from '@/lib/financeEngine';
import { InventoryCostItem } from '@/lib/menuHub';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { compactWhitespace, getTodayDateValue } from '@/lib/utils';
import {
  AllocationType,
  ExpenseAllocation,
  ExpenseCategory,
  ExpenseInput,
  ExpensePaymentMethod,
  ExpensePaymentStatus,
  ExpenseRecord,
  ExpenseSourceType,
  ExpenseType,
  RecurringExpense,
  RecurringExpenseInput,
} from '@/types/finance';
import { Order } from '@/types/order';

const LOCAL_FINANCE_STORAGE_KEY = 'cloud_kitchen_finance_ledger_v1';

interface LocalFinanceStore {
  categories: ExpenseCategory[];
  expenses: ExpenseRecord[];
  recurring: RecurringExpense[];
}

function makeLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readLocalFinanceStore(): LocalFinanceStore {
  try {
    const raw = localStorage.getItem(LOCAL_FINANCE_STORAGE_KEY);
    if (!raw) {
      return {
        categories: buildDefaultLocalCategories(),
        expenses: [],
        recurring: buildDefaultRecurringTemplates(buildDefaultLocalCategories()),
      };
    }
    const parsed = JSON.parse(raw) as Partial<LocalFinanceStore>;
    const categories =
      Array.isArray(parsed.categories) && parsed.categories.length > 0
        ? parsed.categories
        : buildDefaultLocalCategories();
    return {
      categories,
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      recurring:
        Array.isArray(parsed.recurring) && parsed.recurring.length > 0
          ? parsed.recurring
          : buildDefaultRecurringTemplates(categories),
    };
  } catch {
    const categories = buildDefaultLocalCategories();
    return {
      categories,
      expenses: [],
      recurring: buildDefaultRecurringTemplates(categories),
    };
  }
}

function writeLocalFinanceStore(store: LocalFinanceStore) {
  try {
    localStorage.setItem(LOCAL_FINANCE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}

function buildDefaultRecurringTemplates(categories: ExpenseCategory[]): RecurringExpense[] {
  const findCat = (slug: string) => categories.find((c) => c.slug === slug)?.id ?? null;
  const today = new Date();
  const nextMonthStr = (day: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), Math.min(day, 28));
    if (d.getTime() < today.getTime() - 5 * 86400000) {
      d.setMonth(d.getMonth() + 1);
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return [
    {
      id: 'rec-rent',
      title: 'إيجار المطبخ والمخزن المركزي',
      estimated_amount: 18000,
      category_id: findCat('facility-rent'),
      company_id: null,
      allocation_rule: 'shared_revenue',
      frequency: 'monthly',
      due_day: 1,
      next_due_date: nextMonthStr(1),
      remind_days_before: 3,
      is_active: true,
      notes: 'إيجار شهري ثابت للمقر',
      created_at: today.toISOString(),
    },
    {
      id: 'rec-electricity',
      title: 'فاتورة كهرباء المطبخ والثلاجات',
      estimated_amount: 4500,
      category_id: findCat('facility-electricity'),
      company_id: null,
      allocation_rule: 'shared_orders',
      frequency: 'monthly',
      due_day: 10,
      next_due_date: nextMonthStr(10),
      remind_days_before: 3,
      is_active: true,
      notes: 'قيمة متغيرة حسب قراءة العداد الشهري',
      created_at: today.toISOString(),
    },
    {
      id: 'rec-gas',
      title: 'فاتورة الغاز الطبيعي لتشغيل الأفران',
      estimated_amount: 2800,
      category_id: findCat('facility-gas'),
      company_id: null,
      allocation_rule: 'shared_orders',
      frequency: 'monthly',
      due_day: 15,
      next_due_date: nextMonthStr(15),
      remind_days_before: 3,
      is_active: true,
      notes: 'قيمة متغيرة حسب استهلاك المطبخ',
      created_at: today.toISOString(),
    },
    {
      id: 'rec-water-internet',
      title: 'فاتورة المياه والإنترنت والاتصالات',
      estimated_amount: 1200,
      category_id: findCat('facility-water-internet'),
      company_id: null,
      allocation_rule: 'shared_revenue',
      frequency: 'monthly',
      due_day: 5,
      next_due_date: nextMonthStr(5),
      remind_days_before: 3,
      is_active: true,
      notes: 'خطوط الإنترنت للكول سنتر والمياه',
      created_at: today.toISOString(),
    },
  ];
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

export function useFinance(brands: Brand[], orders: Order[]) {
  const [categories, setCategories] = useState<ExpenseCategory[]>(() => buildDefaultLocalCategories());
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchasePricePoint[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryCostItem[]>([]);
  const [actualFoodUsageCost, setActualFoodUsageCost] = useState(0);
  const [storageMode, setStorageMode] = useState<'database' | 'local'>('database');
  const [loading, setLoading] = useState(true);

  const loadOperationalEnrichment = useCallback(async () => {
    if (isSupabaseUnavailable()) return;
    try {
      const loose = asSupabaseLooseClient(supabase);
      if (typeof loose?.from !== 'function') return;

      const [itemsRes, reqsRes, reqLinesRes, withdrawalsRes, wasteRes] = await Promise.all([
        loose
          .from('items_master')
          .select('id, name, usage_unit, avg_cost, last_purchase_price, conversion_factor')
          .eq('status', 'active')
          .limit(500),
        loose
          .from('inventory_purchase_requests')
          .select('id, request_no, supplier_name, status, total_amount, tax_amount, paid_amount, payment_method, payment_status, invoice_date, invoice_storage_path, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
        loose
          .from('inventory_purchase_request_lines')
          .select('purchase_request_id, item_id, quantity, unit_cost, created_at')
          .order('created_at', { ascending: false })
          .limit(600),
        loose
          .from('inventory_daily_withdrawal_lines')
          .select('quantity, unit_cost, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        loose
          .from('inventory_movements')
          .select('id, item_id, movement_type, quantity, unit_cost, notes, created_at')
          .eq('movement_type', 'waste')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const itemNameById = new Map<string, string>();
      const itemCostById = new Map<string, number>();

      if (!itemsRes.error && Array.isArray(itemsRes.data)) {
        const mappedInv: InventoryCostItem[] = [];
        for (const r of itemsRes.data) {
          if (!isRecord(r)) continue;
          const id = String(r.id ?? '');
          const name = String(r.name ?? '');
          const avg = Number(r.avg_cost ?? 0);
          const last = Number(r.last_purchase_price ?? 0);
          const conv = Math.max(1, Number(r.conversion_factor ?? 1));
          const unitCost = avg > 0 ? avg : last > 0 ? last / conv : 0;
          if (id && name) {
            itemNameById.set(id, name);
            itemCostById.set(id, unitCost);
            mappedInv.push({
              id,
              name,
              usageUnit: String(r.usage_unit ?? 'kg'),
              avgCostPerUsageUnit: unitCost,
            });
          }
        }
        setInventoryItems(mappedInv);
      }

      const reqMap = new Map<string, Record<string, unknown>>();
      if (!reqsRes.error && Array.isArray(reqsRes.data)) {
        for (const req of reqsRes.data) {
          if (isRecord(req) && typeof req.id === 'string') {
            reqMap.set(req.id, req);
          }
        }
      }

      if (!reqLinesRes.error && Array.isArray(reqLinesRes.data)) {
        const points: PurchasePricePoint[] = [];
        for (const line of reqLinesRes.data) {
          if (!isRecord(line)) continue;
          const req = reqMap.get(String(line.purchase_request_id ?? ''));
          const status = String(req?.status ?? '');
          if (req && !['purchased_pending_receipt', 'approved'].includes(status)) continue;
          const itemId = String(line.item_id ?? '');
          const unitCost = Number(line.unit_cost ?? 0);
          if (!itemId || unitCost <= 0) continue;
          points.push({
            itemId,
            itemName: itemNameById.get(itemId) ?? 'صنف مخزون',
            supplierName: String(req?.supplier_name ?? ''),
            unitCost,
            purchasedAt: String(req?.invoice_date ?? line.created_at ?? new Date().toISOString()),
          });
        }
        setPurchaseHistory(points);
      }

      const currentMonthPrefix = new Date().toISOString().slice(0, 7);
      let monthUsageTotal = 0;
      if (!withdrawalsRes.error && Array.isArray(withdrawalsRes.data)) {
        for (const w of withdrawalsRes.data) {
          if (!isRecord(w)) continue;
          if (String(w.created_at ?? '').slice(0, 7) === currentMonthPrefix) {
            monthUsageTotal += Number(w.quantity ?? 0) * Number(w.unit_cost ?? 0);
          }
        }
      }
      if (!wasteRes.error && Array.isArray(wasteRes.data)) {
        for (const wm of wasteRes.data) {
          if (!isRecord(wm)) continue;
          if (String(wm.created_at ?? '').slice(0, 7) === currentMonthPrefix) {
            const c = Number(wm.unit_cost ?? 0) || (itemCostById.get(String(wm.item_id ?? '')) ?? 0);
            monthUsageTotal += Math.abs(Number(wm.quantity ?? 0)) * c;
          }
        }
      }
      setActualFoodUsageCost(Math.round(monthUsageTotal * 100) / 100);

      return {
        reqMap,
        reqLines: Array.isArray(reqLinesRes.data) ? reqLinesRes.data.filter(isRecord) : [],
        wasteRows: Array.isArray(wasteRes.data) ? wasteRes.data.filter(isRecord) : [],
        itemNameById,
        itemCostById,
      };
    } catch {
      return undefined;
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const enrichment = await loadOperationalEnrichment();

    if (isSupabaseUnavailable()) {
      const local = readLocalFinanceStore();
      setCategories(local.categories);
      setExpenses(local.expenses);
      setRecurring(local.recurring);
      setStorageMode('local');
      setLoading(false);
      return;
    }

    const loose = asSupabaseLooseClient(supabase);
    const [catRes, expRes, allocRes, recRes] = await Promise.all([
      loose.from('expense_categories').select('*').order('created_at', { ascending: true }),
      loose.from('expenses').select('*').order('expense_date', { ascending: false }).limit(1000),
      loose.from('expense_allocations').select('*').limit(3000),
      loose.from('recurring_expenses').select('*').order('due_day', { ascending: true }),
    ]);

    if (
      isSupabaseNetworkError(catRes.error) ||
      isSupabaseNetworkError(expRes.error)
    ) {
      markSupabaseUnavailable();
      const local = readLocalFinanceStore();
      setCategories(local.categories);
      setExpenses(local.expenses);
      setRecurring(local.recurring);
      setStorageMode('local');
      setLoading(false);
      return;
    }

    // Fallback gracefully to local mode + live auto-derived entries if migration hasn't been applied on remote DB yet
    if (catRes.error || expRes.error || (expRes.data && Array.isArray(expRes.data) && expRes.data.length > 0 && isRecord(expRes.data[0]) && !('source_type' in expRes.data[0]))) {
      const local = readLocalFinanceStore();
      const derivedAuto: ExpenseRecord[] = [];

      if (enrichment) {
        const cogsCatId = local.categories.find((c) => c.slug === 'cogs-produce-dry')?.id ?? null;
        const wasteCatId = local.categories.find((c) => c.slug === 'cogs-waste')?.id ?? null;

        for (const [reqId, req] of enrichment.reqMap.entries()) {
          const st = String(req.status ?? '');
          if (!['purchased_pending_receipt', 'approved'].includes(st)) continue;
          let amt = Number(req.total_amount ?? 0);
          if (amt <= 0) {
            amt = enrichment.reqLines
              .filter((l) => String(l.purchase_request_id) === reqId)
              .reduce((s, l) => s + Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0), 0);
          }
          if (amt <= 0) continue;
          const expDate = String(req.invoice_date ?? req.created_at ?? getTodayDateValue()).slice(0, 10);
          derivedAuto.push({
            id: `auto-pur-${reqId}`,
            brand_id: null,
            title: `فاتورة مشتريات ${String(req.request_no ?? '')}${req.supplier_name ? ` · ${String(req.supplier_name)}` : ''}`,
            amount: amt,
            tax_amount: Number(req.tax_amount ?? 0),
            expense_date: expDate,
            category_id: cogsCatId,
            source_type: 'purchase',
            source_ref_id: reqId,
            payment_method: (req.payment_method as ExpensePaymentMethod) || 'cash',
            payment_status: req.payment_status === 'paid' ? 'paid' : req.payment_status === 'partial' ? 'partial' : 'pending',
            receipt_url: req.invoice_storage_path ? String(req.invoice_storage_path) : null,
            notes: String(req.notes ?? ''),
            created_by: null,
            created_at: String(req.created_at ?? new Date().toISOString()),
            allocations: [],
          });
        }

        for (const wm of enrichment.wasteRows) {
          const wmId = String(wm.id ?? '');
          const itemId = String(wm.item_id ?? '');
          const unitCost = Number(wm.unit_cost ?? 0) || (enrichment.itemCostById.get(itemId) ?? 0);
          const wasteAmt = Math.round(Math.abs(Number(wm.quantity ?? 0)) * unitCost * 100) / 100;
          if (wasteAmt <= 0) continue;
          derivedAuto.push({
            id: `auto-waste-${wmId}`,
            brand_id: null,
            title: `هالك مخزون: ${enrichment.itemNameById.get(itemId) ?? 'صنف'}`,
            amount: wasteAmt,
            tax_amount: 0,
            expense_date: String(wm.created_at ?? getTodayDateValue()).slice(0, 10),
            category_id: wasteCatId,
            source_type: 'waste',
            source_ref_id: wmId,
            payment_method: 'cash',
            payment_status: 'paid',
            receipt_url: null,
            notes: String(wm.notes ?? ''),
            created_by: null,
            created_at: String(wm.created_at ?? new Date().toISOString()),
            allocations: [],
          });
        }
      }

      const existingIds = new Set(local.expenses.map((e) => `${e.source_type}:${e.source_ref_id ?? e.id}`));
      const combinedExpenses = [
        ...local.expenses,
        ...derivedAuto.filter((d) => !existingIds.has(`${d.source_type}:${d.source_ref_id}`)),
      ].sort((a, b) => b.expense_date.localeCompare(a.expense_date));

      setCategories(local.categories);
      setExpenses(combinedExpenses);
      setRecurring(local.recurring);
      setStorageMode('local');
      setLoading(false);
      return;
    }

    markSupabaseAvailable();

    const mappedCategories: ExpenseCategory[] = Array.isArray(catRes.data) && catRes.data.length > 0
      ? catRes.data.filter(isRecord).map((row) => ({
          id: String(row.id),
          name: String(row.name ?? ''),
          slug: String(row.slug ?? ''),
          expense_type: row.expense_type === 'capex' ? 'capex' : 'opex',
          parent_id: typeof row.parent_id === 'string' ? row.parent_id : null,
          default_allocation_rule: (row.default_allocation_rule as AllocationType) || 'shared_revenue',
          is_system: Boolean(row.is_system ?? true),
          created_at: String(row.created_at ?? new Date().toISOString()),
        }))
      : buildDefaultLocalCategories();

    const allocsByExpenseId = new Map<string, ExpenseAllocation[]>();
    if (!allocRes.error && Array.isArray(allocRes.data)) {
      for (const a of allocRes.data) {
        if (!isRecord(a)) continue;
        const expId = String(a.expense_id ?? '');
        const list = allocsByExpenseId.get(expId) ?? [];
        list.push({
          id: String(a.id),
          expense_id: expId,
          company_id: String(a.company_id),
          allocation_type: (a.allocation_type as AllocationType) || 'shared_revenue',
          allocated_amount: Number(a.allocated_amount ?? 0),
          percentage: Number(a.percentage ?? 0),
        });
        allocsByExpenseId.set(expId, list);
      }
    }

    const mappedExpenses: ExpenseRecord[] = Array.isArray(expRes.data)
      ? expRes.data.filter(isRecord).map((row) => {
          const id = String(row.id);
          return {
            id,
            brand_id: typeof row.brand_id === 'string' ? row.brand_id : null,
            title: String(row.title || row.description || 'مصروف'),
            amount: Number(row.amount ?? 0),
            tax_amount: Number(row.tax_amount ?? 0),
            expense_date: String(row.expense_date ?? getTodayDateValue()).slice(0, 10),
            category_id: typeof row.category_id === 'string' ? row.category_id : null,
            source_type: (row.source_type as ExpenseSourceType) || 'manual',
            source_ref_id: typeof row.source_ref_id === 'string' ? row.source_ref_id : null,
            payment_method: (row.payment_method as ExpensePaymentMethod) || 'cash',
            payment_status: (row.payment_status as ExpensePaymentStatus) || 'paid',
            receipt_url: typeof row.receipt_url === 'string' ? row.receipt_url : null,
            notes: String(row.notes ?? ''),
            created_by: typeof row.created_by === 'string' ? row.created_by : null,
            created_at: String(row.created_at ?? new Date().toISOString()),
            allocations: allocsByExpenseId.get(id) ?? [],
          };
        })
      : [];

    const mappedRecurring: RecurringExpense[] =
      !recRes.error && Array.isArray(recRes.data) && recRes.data.length > 0
        ? recRes.data.filter(isRecord).map((row) => ({
            id: String(row.id),
            title: String(row.title ?? ''),
            estimated_amount: Number(row.estimated_amount ?? 0),
            category_id: typeof row.category_id === 'string' ? row.category_id : null,
            company_id: typeof row.company_id === 'string' ? row.company_id : null,
            allocation_rule: (row.allocation_rule as AllocationType) || 'shared_revenue',
            frequency: (row.frequency as RecurringExpense['frequency']) || 'monthly',
            due_day: Number(row.due_day ?? 1),
            next_due_date: String(row.next_due_date ?? getTodayDateValue()).slice(0, 10),
            remind_days_before: Number(row.remind_days_before ?? 3),
            is_active: Boolean(row.is_active ?? true),
            notes: String(row.notes ?? ''),
            created_at: String(row.created_at ?? new Date().toISOString()),
          }))
        : buildDefaultRecurringTemplates(mappedCategories);

    setCategories(mappedCategories);
    setExpenses(mappedExpenses);
    setRecurring(mappedRecurring);
    setStorageMode('database');
    setLoading(false);
  }, [loadOperationalEnrichment]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useSupabaseReconnect(() => {
    void refresh();
  });

  useSupabaseRealtimeRefresh({
    channelName: 'unified-finance-realtime',
    tables: [
      { table: 'expenses' },
      { table: 'expense_allocations' },
      { table: 'expense_categories' },
      { table: 'recurring_expenses' },
      { table: 'inventory_purchase_requests' },
      { table: 'inventory_movements' },
      { table: 'hr_bonuses' },
      { table: 'hr_month_locks' },
    ],
    onRefresh: refresh,
  });

  const uploadReceipt = async (file: File): Promise<string | null> => {
    if (storageMode === 'local' || isSupabaseUnavailable()) {
      return URL.createObjectURL(file);
    }
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('expense-receipts').upload(path, file, {
      upsert: false,
    });
    if (error) {
      toast.error('تعذر رفع صورة الإيصال؛ تم حفظ المصروف بدون مرفق.');
      return null;
    }
    return path;
  };

  const openReceipt = async (receiptPathOrUrl: string) => {
    if (receiptPathOrUrl.startsWith('blob:') || receiptPathOrUrl.startsWith('http')) {
      window.open(receiptPathOrUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const bucket = receiptPathOrUrl.includes('/') && !receiptPathOrUrl.startsWith('20')
      ? 'supplier-invoices'
      : 'expense-receipts';
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(receiptPathOrUrl, 300);
    if (error || !data?.signedUrl) {
      toast.error('تعذر فتح صورة الإيصال');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const saveExpense = async (input: ExpenseInput) => {
    const cleanTitle = compactWhitespace(input.title);
    if (!cleanTitle || input.amount <= 0) {
      toast.error('أدخل عنوان المصروف ومبلغاً أكبر من صفر');
      return false;
    }

    const totalWithTax = input.amount + (input.tax_amount || 0);
    const tempId = input.id ?? makeLocalId('exp');

    const computedAllocs = calculateBrandAllocations({
      expenseId: tempId,
      totalAmount: totalWithTax,
      expenseDate: input.expense_date,
      allocationType: input.allocation_type,
      brands,
      orders,
      directCompanyId: input.direct_company_id,
      fixedPercentages: input.fixed_percentages,
    });

    if (storageMode === 'local') {
      const store = readLocalFinanceStore();
      const record: ExpenseRecord = {
        id: tempId,
        brand_id:
          input.allocation_type === 'direct' && input.direct_company_id
            ? input.direct_company_id
            : null,
        title: cleanTitle,
        amount: input.amount,
        tax_amount: input.tax_amount || 0,
        expense_date: input.expense_date,
        category_id: input.category_id,
        source_type: input.source_type ?? 'manual',
        source_ref_id: input.source_ref_id ?? null,
        payment_method: input.payment_method,
        payment_status: input.payment_status,
        receipt_url: input.receipt_url ?? null,
        notes: compactWhitespace(input.notes ?? ''),
        created_by: null,
        created_at: new Date().toISOString(),
        allocations: computedAllocs.map((a, idx) => ({ id: `${tempId}-al-${idx}`, ...a })),
      };
      const nextExpenses = [record, ...store.expenses.filter((e) => e.id !== tempId)];
      writeLocalFinanceStore({ ...store, expenses: nextExpenses });
      await refresh();
      toast.success(input.id ? 'تم تحديث المصروف' : 'تم تسجيل المصروف وتوزيعه على الشركات');
      return true;
    }

    const loose = asSupabaseLooseClient(supabase);
    const dbBrandId =
      input.allocation_type === 'direct' && isUuidBrandId(input.direct_company_id)
        ? input.direct_company_id
        : null;

    const payload = {
      brand_id: dbBrandId,
      title: cleanTitle,
      description: cleanTitle,
      amount: input.amount,
      tax_amount: input.tax_amount || 0,
      expense_date: input.expense_date,
      category_id: input.category_id,
      source_type: input.source_type ?? 'manual',
      source_ref_id: input.source_ref_id ?? null,
      payment_method: input.payment_method,
      payment_status: input.payment_status,
      receipt_url: input.receipt_url ?? null,
      notes: compactWhitespace(input.notes ?? ''),
    };

    const res = input.id
      ? await loose.from('expenses').update(payload).eq('id', input.id).select('id').single()
      : await loose.from('expenses').insert(payload).select('id').single();

    if (res.error || !isRecord(res.data)) {
      toast.error(res.error?.message || 'تعذر حفظ المصروف');
      return false;
    }

    const savedId = String(res.data.id);
    await loose.from('expense_allocations').delete().eq('expense_id', savedId);

    const validUuidAllocs = calculateBrandAllocations({
      expenseId: savedId,
      totalAmount: totalWithTax,
      expenseDate: input.expense_date,
      allocationType: input.allocation_type,
      brands: brands.filter((b) => isUuidBrandId(b.id)),
      orders,
      directCompanyId: isUuidBrandId(input.direct_company_id) ? input.direct_company_id : null,
      fixedPercentages: input.fixed_percentages,
    });

    if (validUuidAllocs.length > 0) {
      await loose.from('expense_allocations').insert(validUuidAllocs);
    }

    await refresh();
    toast.success(input.id ? 'تم تحديث المصروف' : 'تم تسجيل المصروف وتوزيعه بنجاح');
    return true;
  };

  const deleteExpense = async (expenseId: string) => {
    if (storageMode === 'local' || expenseId.startsWith('exp-')) {
      const store = readLocalFinanceStore();
      writeLocalFinanceStore({
        ...store,
        expenses: store.expenses.filter((e) => e.id !== expenseId),
      });
      await refresh();
      toast.success('تم حذف المصروف');
      return true;
    }

    const loose = asSupabaseLooseClient(supabase);
    const { error } = await loose.from('expenses').delete().eq('id', expenseId);
    if (error) {
      toast.error(error.message || 'تعذر حذف المصروف');
      return false;
    }
    await refresh();
    toast.success('تم حذف المصروف');
    return true;
  };

  const saveSubcategory = async (input: {
    id?: string;
    name: string;
    parent_id: string;
    expense_type: ExpenseType;
    default_allocation_rule: AllocationType;
  }): Promise<ExpenseCategory | null> => {
    const cleanName = compactWhitespace(input.name);
    if (!cleanName) {
      toast.error('اسم التصنيف الفرعي مطلوب');
      return null;
    }

    const slug = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (storageMode === 'local') {
      const store = readLocalFinanceStore();
      const newCat: ExpenseCategory = {
        id: input.id ?? `cat-${slug}`,
        name: cleanName,
        slug,
        expense_type: input.expense_type,
        parent_id: input.parent_id,
        default_allocation_rule: input.default_allocation_rule,
        is_system: false,
        created_at: new Date().toISOString(),
      };
      const nextCats = input.id
        ? store.categories.map((c) =>
            c.id === input.id
              ? { ...c, name: cleanName, expense_type: input.expense_type, default_allocation_rule: input.default_allocation_rule }
              : c,
          )
        : [...store.categories, newCat];
      writeLocalFinanceStore({ ...store, categories: nextCats });
      setCategories(nextCats);
      toast.success(input.id ? 'تم تحديث البند' : 'تمت إضافة التصنيف الفرعي');
      return newCat;
    }

    const loose = asSupabaseLooseClient(supabase);
    const res = input.id
      ? await loose
          .from('expense_categories')
          .update({
            name: cleanName,
            expense_type: input.expense_type,
            default_allocation_rule: input.default_allocation_rule,
          })
          .eq('id', input.id)
          .select('*')
          .single()
      : await loose
          .from('expense_categories')
          .insert({
            name: cleanName,
            slug,
            expense_type: input.expense_type,
            parent_id: input.parent_id,
            default_allocation_rule: input.default_allocation_rule,
            is_system: false,
          })
          .select('*')
          .single();

    if (res.error || !isRecord(res.data)) {
      toast.error(res.error?.message || 'تعذر حفظ التصنيف');
      return null;
    }

    await refresh();
    toast.success(input.id ? 'تم تحديث البند' : 'تمت إضافة التصنيف الفرعي');
    return {
      id: String(res.data.id),
      name: String(res.data.name),
      slug: String(res.data.slug),
      expense_type: res.data.expense_type === 'capex' ? 'capex' : 'opex',
      parent_id: typeof res.data.parent_id === 'string' ? res.data.parent_id : null,
      default_allocation_rule: (res.data.default_allocation_rule as AllocationType) || 'shared_revenue',
      is_system: Boolean(res.data.is_system),
      created_at: String(res.data.created_at),
    };
  };

  const deleteSubcategory = async (catId: string) => {
    const target = categories.find((c) => c.id === catId);
    if (target?.is_system) {
      toast.error('لا يمكن حذف التصنيفات الأساسية للنظام');
      return false;
    }

    if (storageMode === 'local') {
      const store = readLocalFinanceStore();
      writeLocalFinanceStore({
        ...store,
        categories: store.categories.filter((c) => c.id !== catId),
      });
      await refresh();
      toast.success('تم حذف التصنيف الفرعي');
      return true;
    }

    const loose = asSupabaseLooseClient(supabase);
    const { error } = await loose.from('expense_categories').delete().eq('id', catId);
    if (error) {
      toast.error(error.message || 'تعذر حذف التصنيف');
      return false;
    }
    await refresh();
    toast.success('تم حذف التصنيف الفرعي');
    return true;
  };

  const saveRecurringObligation = async (input: RecurringExpenseInput) => {
    const cleanTitle = compactWhitespace(input.title);
    if (!cleanTitle || input.estimated_amount <= 0) {
      toast.error('أدخل اسم الالتزام والقيمة التقديرية');
      return false;
    }

    if (storageMode === 'local' || (input.id && input.id.startsWith('rec-'))) {
      const store = readLocalFinanceStore();
      const item: RecurringExpense = {
        id: input.id ?? makeLocalId('rec'),
        title: cleanTitle,
        estimated_amount: input.estimated_amount,
        category_id: input.category_id,
        company_id: input.company_id,
        allocation_rule: input.allocation_rule,
        frequency: input.frequency,
        due_day: input.due_day,
        next_due_date: input.next_due_date,
        remind_days_before: input.remind_days_before,
        is_active: input.is_active,
        notes: compactWhitespace(input.notes ?? ''),
        created_at: new Date().toISOString(),
      };
      const nextRec = input.id
        ? store.recurring.map((r) => (r.id === input.id ? item : r))
        : [...store.recurring, item];
      writeLocalFinanceStore({ ...store, recurring: nextRec });
      await refresh();
      toast.success(input.id ? 'تم تحديث الالتزام المتكرر' : 'تمت إضافة الالتزام المتكرر');
      return true;
    }

    const loose = asSupabaseLooseClient(supabase);
    const payload = {
      title: cleanTitle,
      estimated_amount: input.estimated_amount,
      category_id: input.category_id,
      company_id: isUuidBrandId(input.company_id) ? input.company_id : null,
      allocation_rule: input.allocation_rule,
      frequency: input.frequency,
      due_day: input.due_day,
      next_due_date: input.next_due_date,
      remind_days_before: input.remind_days_before,
      is_active: input.is_active,
      notes: compactWhitespace(input.notes ?? ''),
    };

    const res = input.id
      ? await loose.from('recurring_expenses').update(payload).eq('id', input.id)
      : await loose.from('recurring_expenses').insert(payload);

    if (res.error) {
      toast.error(res.error.message || 'تعذر حفظ الالتزام المتكرر');
      return false;
    }
    await refresh();
    toast.success(input.id ? 'تم تحديث الالتزام المتكرر' : 'تمت إضافة الالتزام المتكرر');
    return true;
  };

  const confirmRecurringPayment = async (params: {
    obligation: RecurringExpense;
    actualAmount: number;
    taxAmount?: number;
    paymentDate: string;
    paymentMethod: ExpensePaymentMethod;
    notes?: string;
    receiptUrl?: string | null;
  }) => {
    const { obligation, actualAmount, taxAmount = 0, paymentDate, paymentMethod, notes, receiptUrl } = params;
    if (actualAmount <= 0) {
      toast.error('أدخل قيمة الفاتورة الفعلية');
      return false;
    }

    const defaultCatId =
      obligation.category_id ??
      categories.find((c) => c.slug === 'facility')?.id ??
      categories[0]?.id ??
      '';

    const ok = await saveExpense({
      title: `${obligation.title} (${paymentDate.slice(0, 7)})`,
      amount: actualAmount,
      tax_amount: taxAmount,
      expense_date: paymentDate,
      category_id: defaultCatId,
      source_type: 'recurring',
      payment_method: paymentMethod,
      payment_status: 'paid',
      receipt_url: receiptUrl ?? null,
      notes: notes ?? obligation.notes,
      allocation_type: obligation.company_id ? 'direct' : obligation.allocation_rule,
      direct_company_id: obligation.company_id,
    });

    if (!ok) return false;

    const nextDue = advanceNextDueDate(
      obligation.next_due_date,
      obligation.frequency,
      obligation.due_day,
    );

    if (storageMode === 'local' || obligation.id.startsWith('rec-')) {
      const store = readLocalFinanceStore();
      const updatedRec = store.recurring.map((r) =>
        r.id === obligation.id ? { ...r, next_due_date: nextDue } : r,
      );
      writeLocalFinanceStore({ ...store, recurring: updatedRec });
      await refresh();
    } else {
      const loose = asSupabaseLooseClient(supabase);
      await loose
        .from('recurring_expenses')
        .update({ next_due_date: nextDue })
        .eq('id', obligation.id);
      await refresh();
    }

    toast.success(`تم ترحيل الفاتورة للسجل وتحديث الاستحقاق القادم إلى ${nextDue}`);
    return true;
  };

  const deleteRecurringObligation = async (id: string) => {
    if (storageMode === 'local' || id.startsWith('rec-')) {
      const store = readLocalFinanceStore();
      writeLocalFinanceStore({
        ...store,
        recurring: store.recurring.filter((r) => r.id !== id),
      });
      await refresh();
      toast.success('تم حذف الالتزام المتكرر');
      return true;
    }
    const loose = asSupabaseLooseClient(supabase);
    const { error } = await loose.from('recurring_expenses').delete().eq('id', id);
    if (error) {
      toast.error(error.message || 'تعذر حذف الالتزام');
      return false;
    }
    await refresh();
    toast.success('تم حذف الالتزام المتكرر');
    return true;
  };

  return {
    categories,
    expenses,
    recurring,
    purchaseHistory,
    inventoryItems,
    actualFoodUsageCost,
    storageMode,
    loading,
    refresh,
    uploadReceipt,
    openReceipt,
    saveExpense,
    deleteExpense,
    saveSubcategory,
    deleteSubcategory,
    saveRecurringObligation,
    confirmRecurringPayment,
    deleteRecurringObligation,
  };
}
