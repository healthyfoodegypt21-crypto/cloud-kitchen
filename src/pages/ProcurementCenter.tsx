import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileText, Loader2, PackagePlus, Plus, Printer, Search, ShoppingBasket, Trash2, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { supabase } from '@/integrations/supabase/client';
import { suggestPurchaseQuantity } from '@/lib/procurementUnits';
import ProcurementPriceAlert from '@/components/ProcurementPriceAlert';
import AutoReorderDialog from '@/components/procurement/AutoReorderDialog';
import PriceHistoryPanel from '@/components/procurement/PriceHistoryPanel';
import ProcurementKpis from '@/components/procurement/ProcurementKpis';
import SupplierDirectory from '@/components/procurement/SupplierDirectory';
import PurchaseOrderPrintDialog from '@/components/procurement/PurchaseOrderPrintDialog';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';

type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  paymentTerms: string;
  leadTimeDays: number;
  notes: string;
  lastPurchaseAt: string;
  status: string;
};

type CatalogItem = {
  id: string;
  name: string;
  code: string;
  purchaseUnit: string;
  usageUnit: string;
  conversionFactor: number;
  minStock: number;
  onHand: number;
  lastPrice: number;
  averageCost: number;
};

type PurchaseLine = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
  unitCost: string;
  batchNo: string;
  expiryDate: string;
};

type PurchaseRequest = {
  id: string;
  requestNo: string;
  supplierId: string;
  supplierName: string;
  purchaserName: string;
  source: string;
  status: string;
  notes: string;
  createdAt: string;
  purchasedAt: string;
  invoiceNumber: string;
  invoiceStoragePath: string;
  totalAmount: number;
  paidAmount: number;
  lines: PurchaseLine[];
};

type Invoice = {
  id: string;
  requestId: string;
  supplierName: string;
  number: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  status: string;
  storagePath: string;
};

type ExecutionDraft = {
  supplierId: string;
  purchaserName: string;
  lines: PurchaseLine[];
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  taxAmount: string;
  discountAmount: string;
  paidAmount: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  notes: string;
  invoiceFile: File | null;
};

type DirectDraft = {
  itemId: string;
  quantity: string;
  unitCost: string;
  supplierId: string;
  purchaserName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  taxAmount: string;
  discountAmount: string;
  paidAmount: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  invoiceFile: File | null;
};

const PAGE_SIZE = 20;
const records = (value: unknown) => Array.isArray(value) ? value.filter(isRecord) : [];
const number = (value: unknown) => Number(value ?? 0);
const isFiniteValue = (value: unknown) => Number.isFinite(Number(value ?? NaN));
const money = (value: number) => `${(Number.isFinite(value) ? value : 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م.`;
const today = () => new Date().toISOString().slice(0, 10);
const emptyDirectDraft = (): DirectDraft => ({
  itemId: '', quantity: '', unitCost: '', supplierId: '', purchaserName: '',
  invoiceNumber: '', invoiceDate: today(), dueDate: '', taxAmount: '0',
  discountAmount: '0', paidAmount: '0', paymentMethod: 'cash', invoiceFile: null,
});

export default function ProcurementCenter({ brandId, hubName, purchaserName }: {
  brandId: string;
  hubName?: string;
  purchaserName: string;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedShortages, setSelectedShortages] = useState<Record<string, string>>({});
  const [shortageSupplierId, setShortageSupplierId] = useState('');
  const [shortageNotes, setShortageNotes] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ExecutionDraft>>({});
  const [directDraft, setDirectDraft] = useState<DirectDraft>(emptyDirectDraft);
  const [directOpen, setDirectOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState({ id: '', name: '', phone: '', email: '', paymentTerms: '', leadTimeDays: '0', notes: '' });
  const [savingId, setSavingId] = useState('');
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, { amount: string; method: 'cash' | 'bank_transfer' | 'credit'; reference: string }>>({});
  const [totalSpend, setTotalSpend] = useState(0);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [autoReorderOpen, setAutoReorderOpen] = useState(false);
  const [printOrderOpen, setPrintOrderOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<Array<{ id: string; requestId: string; totalAmount: number; approvalLimit: number; requestedBy: string; notes: string; createdAt: string }>>([]);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const requestVersion = ++loadVersion.current;
    const isStale = () => requestVersion !== loadVersion.current;
    if (!brandId) {
      setSuppliers([]);
      setItems([]);
      setRequests([]);
      setInvoices([]);
      setTotalCount(0);
      setTotalSpend(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const client = asSupabaseLooseClient(supabase);
    const [supplierResult, itemResult, balanceResult] = await Promise.all([
      client.from('suppliers').select('id,name,phone,email,payment_terms,lead_time_days,notes,last_purchase_at,status')
        .eq('brand_id', brandId).order('name').limit(500),
      client.from('items_master').select('id,name,item_code,purchase_unit,usage_unit,conversion_factor,min_stock,last_purchase_price,avg_cost')
        .eq('brand_id', brandId).eq('status', 'active').order('name').limit(2000),
      client.from('inventory_balances').select('item_id,on_hand').eq('brand_id', brandId).limit(5000),
    ]);
    const initialError = supplierResult.error || itemResult.error || balanceResult.error;
    if (initialError) {
      if (!isStale()) {
        toast.error(initialError.message || 'تعذر تحميل بيانات الموردين أو الأصناف');
        setLoading(false);
      }
      return;
    }
    if (isStale()) return;

    const balanceMap = new Map<string, number>();
    records(balanceResult.data).forEach((row) => {
      const itemId = String(row.item_id);
      balanceMap.set(itemId, (balanceMap.get(itemId) ?? 0) + number(row.on_hand));
    });
    const nextItems = records(itemResult.data).map((row) => ({
      id: String(row.id), name: String(row.name), code: String(row.item_code ?? ''),
      purchaseUnit: String(row.purchase_unit ?? ''), usageUnit: String(row.usage_unit ?? row.purchase_unit ?? ''),
      conversionFactor: number(row.conversion_factor ?? 1), minStock: number(row.min_stock),
      onHand: balanceMap.get(String(row.id)) ?? 0, lastPrice: number(row.last_purchase_price), averageCost: number(row.avg_cost),
    }));
    setItems(nextItems);
    setSuppliers(records(supplierResult.data).map((row) => ({
      id: String(row.id), name: String(row.name), phone: String(row.phone ?? ''), email: String(row.email ?? ''),
      paymentTerms: String(row.payment_terms ?? ''), leadTimeDays: number(row.lead_time_days),
      notes: String(row.notes ?? ''), lastPurchaseAt: String(row.last_purchase_at ?? ''),
      status: String(row.status ?? 'active'),
    })));

    let requestQuery = client.from('inventory_purchase_requests')
      .select('id,request_no,supplier_id,supplier_name,purchaser_name,execution_source,status,notes,created_at,purchased_at,invoice_number,invoice_storage_path,total_amount,paid_amount', { count: 'exact' })
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') requestQuery = requestQuery.eq('status', statusFilter);
    if (fromDate) requestQuery = requestQuery.gte('created_at', `${fromDate}T00:00:00`);
    if (toDate) requestQuery = requestQuery.lte('created_at', `${toDate}T23:59:59.999`);
    if (search.trim()) {
      const escaped = search.trim().replace(/[\\,()]/g, ' ');
      requestQuery = requestQuery.or(`request_no.ilike.%${escaped}%,supplier_name.ilike.%${escaped}%,purchaser_name.ilike.%${escaped}%`);
    }
    const { data: requestData, error: requestError, count } = await requestQuery.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (requestError) {
      if (!isStale()) {
        toast.error(requestError.message || 'تعذر تحميل سجل المشتريات');
        setLoading(false);
      }
      return;
    }
    if (isStale()) return;

    const requestRows = records(requestData);
    setTotalCount(count ?? 0);
    const requestIds = requestRows.map((row) => String(row.id));
    const { data: lineData, error: lineError } = requestIds.length
      ? await client.from('inventory_purchase_request_lines')
        .select('id,purchase_request_id,item_id,quantity,unit_cost,batch_no,expiry_date')
        .in('purchase_request_id', requestIds)
      : { data: [], error: null };
    if (lineError) {
      if (!isStale()) {
        toast.error(lineError.message || 'تعذر تحميل بنود المشتريات');
        setLoading(false);
      }
      return;
    }
    if (isStale()) return;

    const itemMap = new Map(nextItems.map((item) => [item.id, item]));
    const nextRequests = requestRows.map((row) => ({
      id: String(row.id), requestNo: String(row.request_no), supplierId: String(row.supplier_id ?? ''),
      supplierName: String(row.supplier_name ?? ''), purchaserName: String(row.purchaser_name ?? ''),
      source: String(row.execution_source ?? 'procurement'), status: String(row.status),
      notes: String(row.notes ?? ''), createdAt: String(row.created_at), purchasedAt: String(row.purchased_at ?? ''),
      invoiceNumber: String(row.invoice_number ?? ''), invoiceStoragePath: String(row.invoice_storage_path ?? ''),
      totalAmount: number(row.total_amount), paidAmount: number(row.paid_amount),
      lines: records(lineData).filter((line) => String(line.purchase_request_id) === String(row.id)).map((line) => {
        const item = itemMap.get(String(line.item_id));
        return {
          id: String(line.id), itemId: String(line.item_id), itemName: item?.name ?? 'صنف',
          unit: item?.purchaseUnit ?? '', quantity: String(line.quantity), unitCost: String(line.unit_cost),
          batchNo: String(line.batch_no ?? ''), expiryDate: String(line.expiry_date ?? ''),
        };
      }),
    }));
    setRequests(nextRequests);
    setDrafts((current) => Object.fromEntries(nextRequests.map((request) => [
      request.id,
      current[request.id] ?? {
        supplierId: request.supplierId,
        purchaserName: request.purchaserName || purchaserName,
        lines: request.lines,
        invoiceNumber: request.invoiceNumber,
        invoiceDate: today(),
        dueDate: '',
        taxAmount: '0',
        discountAmount: '0',
        paidAmount: String(request.paidAmount),
        paymentMethod: 'cash' as const,
        notes: '',
        invoiceFile: null,
      },
    ])));

    const { data: invoiceData, error: invoiceError } = await client.from('supplier_invoices')
      .select('id,purchase_request_id,supplier_id,invoice_number,invoice_date,due_date,total_amount,paid_amount,status,invoice_storage_path')
      .eq('brand_id', brandId).order('invoice_date', { ascending: false }).limit(200);
    if (invoiceError) {
      if (!isStale()) {
        toast.error(invoiceError.message || 'تعذر تحميل فواتير الموردين');
        setLoading(false);
      }
      return;
    }
    if (isStale()) return;
    const supplierMap = new Map(records(supplierResult.data).map((row) => [String(row.id), String(row.name)]));
    setInvoices(records(invoiceData).map((row) => ({
      id: String(row.id), requestId: String(row.purchase_request_id ?? ''), supplierName: supplierMap.get(String(row.supplier_id)) ?? 'مورد',
      number: String(row.invoice_number), date: String(row.invoice_date ?? ''), dueDate: String(row.due_date ?? ''),
      total: number(row.total_amount), paid: number(row.paid_amount), status: String(row.status),
      storagePath: String(row.invoice_storage_path ?? ''),
    })));

    // Aggregate spend across ALL purchased requests (single-column payload),
    // so the KPI is not limited to the currently rendered page.
    const { data: spendData } = await client.from('inventory_purchase_requests')
      .select('total_amount')
      .eq('brand_id', brandId)
      .not('purchased_at', 'is', null)
      .limit(5000);
    if (isStale()) return;
    setTotalSpend(records(spendData).reduce((sum, row) => sum + number(row.total_amount), 0));

    const { data: approvalData, error: approvalError } = await client.from('inventory_purchase_approvals')
      .select('id,purchase_request_id,total_amount,approval_limit,requested_by,notes,created_at')
      .eq('brand_id', brandId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50);
    if (isStale()) return;
    // The approvals table ships with a later migration; until it is applied the
    // section simply stays hidden instead of breaking the whole page.
    if (approvalError) {
      setPendingApprovals([]);
    } else {
      setPendingApprovals(records(approvalData).map((row) => ({
        id: String(row.id), requestId: String(row.purchase_request_id), totalAmount: number(row.total_amount),
        approvalLimit: number(row.approval_limit), requestedBy: String(row.requested_by ?? ''),
        notes: String(row.notes ?? ''), createdAt: String(row.created_at),
      })));
    }
    setLoading(false);
  }, [brandId, fromDate, page, purchaserName, search, statusFilter, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0);
      setSearch(searchText.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const shortages = useMemo(
    () => items.filter((item) => item.minStock > 0 && item.onHand <= item.minStock)
      .sort((left, right) => (left.onHand - left.minStock) - (right.onHand - right.minStock)),
    [items],
  );
  const pending = requests.filter((request) => request.status === 'pending_procurement');
  const directItem = items.find((item) => item.id === directDraft.itemId);
  const latestPrices = useMemo(() => {
    const sorted = requests.filter((request) => request.purchasedAt)
      .sort((left, right) => right.purchasedAt.localeCompare(left.purchasedAt));
    const latestByItem = new Map<string, { itemName: string; supplierName: string; date: string; price: number }>();
    sorted.forEach((request) => request.lines.forEach((line) => {
      if (!latestByItem.has(line.itemId)) {
        latestByItem.set(line.itemId, {
          itemName: line.itemName, supplierName: request.supplierName,
          date: request.purchasedAt, price: number(line.unitCost),
        });
      }
    }));
    return Array.from(latestByItem.values());
  }, [requests]);

  const setExecutionLine = (requestId: string, lineId: string, patch: Partial<PurchaseLine>) => {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...current[requestId],
        lines: (current[requestId]?.lines ?? []).map((line) => line.id === lineId ? { ...line, ...patch } : line),
      },
    }));
  };

  const uploadInvoice = async (file: File | null, currentBrandId: string) => {
    if (!file) return '';
    const accepted = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!accepted.includes(file.type) || file.size > 12 * 1024 * 1024) {
      throw new Error('الفاتورة يجب أن تكون PDF أو صورة معتمدة وحجمها لا يتجاوز 12 ميجابايت.');
    }
    const path = `${currentBrandId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error } = await supabase.storage.from('supplier-invoices').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return path;
  };

  const finishPurchase = async (request: PurchaseRequest) => {
    const draft = drafts[request.id];
    if (!draft?.purchaserName.trim() || draft.lines.length === 0
      || draft.lines.some((line) => !isFiniteValue(line.quantity) || !isFiniteValue(line.unitCost) || number(line.quantity) <= 0 || number(line.unitCost) < 0)) {
      toast.error('أدخل اسم المشتري والكمية والسعر الفعلي لكل بند');
      return;
    }
    if (![draft.taxAmount, draft.discountAmount, draft.paidAmount].every(isFiniteValue)) {
      toast.error('أدخل أرقامًا صحيحة للضريبة والخصم والمبلغ المدفوع');
      return;
    }
    const subtotal = draft.lines.reduce((sum, line) => sum + number(line.quantity) * number(line.unitCost), 0);
    const total = Math.max(0, subtotal + number(draft.taxAmount) - number(draft.discountAmount));
    const paid = number(draft.paidAmount);
    if (number(draft.taxAmount) < 0 || number(draft.discountAmount) < 0 || paid < 0 || paid > total) {
      toast.error('راجع الضريبة والخصم والمبلغ المدفوع؛ لا يجوز أن يتجاوز المدفوع إجمالي الفاتورة');
      return;
    }

    setSavingId(request.id);
    let storagePath = '';
    try {
      // Client-side duplicate invoice guard (the DB unique index enforces it too).
      const invoiceNumber = draft.invoiceNumber.trim();
      if (invoiceNumber) {
        const { data: duplicateData } = await asSupabaseLooseClient(supabase)
          .from('supplier_invoices')
          .select('id')
          .eq('brand_id', brandId)
          .eq('invoice_number', invoiceNumber)
          .limit(1);
        if (records(duplicateData).length > 0) {
          throw new Error(`رقم الفاتورة "${invoiceNumber}" مسجل مسبقًا لهذه العلامة؛ راجع سجل الفواتير لتجنب التكرار.`);
        }
      }
      storagePath = await uploadInvoice(draft.invoiceFile, brandId);
      const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_complete_procurement_purchase_v2', {
        _request_id: request.id,
        _supplier_id: draft.supplierId || null,
        _supplier_name: suppliers.find((supplier) => supplier.id === draft.supplierId)?.name ?? request.supplierName,
        _purchaser_name: draft.purchaserName.trim(),
        _lines: draft.lines.map((line) => ({
          line_id: line.id, quantity: number(line.quantity), unit_cost: number(line.unitCost),
          batch_no: line.batchNo, expiry_date: line.expiryDate || null,
        })),
        _notes: draft.notes,
        _invoice_number: draft.invoiceNumber,
        _invoice_date: draft.invoiceDate || null,
        _due_date: draft.dueDate || null,
        _tax_amount: number(draft.taxAmount),
        _discount_amount: number(draft.discountAmount),
        _paid_amount: paid,
        _payment_method: draft.paymentMethod,
        _invoice_storage_path: storagePath,
      });
      if (error) throw new Error(error.message);
      toast.success('تم تسجيل الشراء والفاتورة وإرسال البنود إلى استلام المخزن');
      await load();
    } catch (error) {
      if (storagePath) await supabase.storage.from('supplier-invoices').remove([storagePath]);
      toast.error(error instanceof Error ? error.message : 'تعذر إكمال الشراء');
    } finally {
      setSavingId('');
    }
  };

  const recordDirectPurchase = async () => {
    const item = items.find((entry) => entry.id === directDraft.itemId);
    if (!brandId || !item || !isFiniteValue(directDraft.quantity) || !isFiniteValue(directDraft.unitCost)
      || number(directDraft.quantity) <= 0 || number(directDraft.unitCost) < 0 || !directDraft.purchaserName.trim()) {
      toast.error('اختر الصنف وأدخل كمية وسعرًا صحيحين واسم المشتري');
      return;
    }
    const subtotal = number(directDraft.quantity) * number(directDraft.unitCost);
    const total = Math.max(0, subtotal + number(directDraft.taxAmount) - number(directDraft.discountAmount));
    const paid = number(directDraft.paidAmount);
    if (number(directDraft.taxAmount) < 0 || number(directDraft.discountAmount) < 0 || paid < 0 || paid > total) {
      toast.error('راجع الضريبة والخصم والمبلغ المدفوع');
      return;
    }

    setSavingId('direct');
    let storagePath = '';
    try {
      storagePath = await uploadInvoice(directDraft.invoiceFile, brandId);
      const supplier = suppliers.find((entry) => entry.id === directDraft.supplierId);
      const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_record_procurement_direct_purchase_v2', {
        _brand_id: brandId,
        _supplier_id: directDraft.supplierId || null,
        _supplier_name: supplier?.name ?? '',
        _purchaser_name: directDraft.purchaserName.trim(),
        _lines: [{
          item_id: item.id, quantity: number(directDraft.quantity), unit_cost: number(directDraft.unitCost),
          location_name: 'main', notes: '', batch_no: '', expiry_date: null,
        }],
        _notes: 'شراء مباشر من مركز المشتريات',
        _invoice_number: directDraft.invoiceNumber,
        _invoice_date: directDraft.invoiceDate || null,
        _due_date: directDraft.dueDate || null,
        _tax_amount: number(directDraft.taxAmount),
        _discount_amount: number(directDraft.discountAmount),
        _paid_amount: paid,
        _payment_method: directDraft.paymentMethod,
        _invoice_storage_path: storagePath,
      });
      if (error) throw new Error(error.message);
      toast.success('تم تسجيل الشراء المباشر والفاتورة؛ الكمية بانتظار استلام المخزن');
      setDirectDraft(emptyDirectDraft());
      setDirectOpen(false);
      await load();
    } catch (error) {
      if (storagePath) await supabase.storage.from('supplier-invoices').remove([storagePath]);
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الشراء المباشر');
    } finally {
      setSavingId('');
    }
  };

  const submitShortages = async () => {
    const selectedEntries = Object.entries(selectedShortages);
    if (selectedEntries.some(([, quantity]) => !isFiniteValue(quantity))) {
      toast.error('أدخل كميات رقمية صحيحة للأصناف المحددة');
      return;
    }
    const lines = selectedEntries.filter(([, quantity]) => number(quantity) > 0)
      .map(([itemId, quantity]) => {
        const item = items.find((candidate) => candidate.id === itemId);
        const factor = item && item.conversionFactor > 0 ? item.conversionFactor : 1;
        return {
          item_id: itemId,
          quantity: number(quantity),
          unit_cost: item ? item.lastPrice || item.averageCost * factor : 0,
          location_name: 'main',
          notes: 'طلب إعادة توريد من قائمة النواقص',
        };
      });
    if (!lines.length) {
      toast.error('حدد صنفًا واحدًا على الأقل وأدخل كمية شراء');
      return;
    }
    const supplier = suppliers.find((entry) => entry.id === shortageSupplierId);
    const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_submit_purchase_request_v2', {
      _brand_id: brandId,
      _supplier_id: shortageSupplierId || null,
      _supplier_name: supplier?.name ?? '',
      _lines: lines,
      _notes: shortageNotes,
    });
    if (error) {
      toast.error(error.message || 'تعذر إنشاء أمر الشراء');
      return;
    }
    toast.success(`تم إنشاء أمر شراء مجمع من ${lines.length} صنف`);
    setSelectedShortages({});
    setShortageNotes('');
    setPage(0);
    setStatusFilter('all');
    await load();
  };

  // Auto reorder: one purchase request per preferred supplier.
  const submitAutoReorder = async (lines: Array<{ itemId: string; quantity: number; unitCost: number; supplierId: string }>, orderNotes: string) => {    if (!brandId || lines.length === 0) {
      toast.error('لا توجد أصناف صالحة لإنشاء أمر الشراء');
      return false;
    }

    const bySupplier = new Map<string, typeof lines>();
    for (const line of lines) {
      const key = line.supplierId || '';
      const group = bySupplier.get(key) ?? [];
      group.push(line);
      bySupplier.set(key, group);
    }

    for (const [supplierId, group] of bySupplier) {
      const supplier = suppliers.find((entry) => entry.id === supplierId);
      const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_submit_purchase_request_v2', {
        _brand_id: brandId,
        _supplier_id: supplierId || null,
        _supplier_name: supplier?.name ?? '',
        _lines: group.map((line) => ({
          item_id: line.itemId,
          quantity: line.quantity,
          unit_cost: line.unitCost,
          location_name: 'main',
          notes: 'أمر شراء تلقائي من النواقص',
        })),
        _notes: orderNotes,
      });
      if (error) {
        toast.error(error.message || 'تعذر إنشاء أمر الشراء التلقائي');
        return false;
      }
    }

    toast.success(`تم إنشاء ${bySupplier.size} أمر شراء تلقائي من ${lines.length} صنف`);
    setPage(0);
    setStatusFilter('all');
    await load();
    return true;
  };

  const reviewApproval = async (approvalId: string, approve: boolean) => {
    const reviewNotes = approve ? '' : window.prompt('اكتب سبب رفض الاعتماد:')?.trim() ?? '';
    if (!approve && !reviewNotes) return;
    setSavingId(approvalId);
    const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_review_purchase_approval', {
      _approval_id: approvalId,
      _approve: approve,
      _notes: reviewNotes,
    });
    setSavingId('');
    if (error) {
      toast.error(error.message || 'تعذر مراجعة الاعتماد');
      return;
    }
    toast.success(approve ? 'تم اعتماد طلب الشراء' : 'تم رفض طلب الشراء');
    await load();
  };

  const saveSupplier = async () => {
    if (!brandId || !supplierDraft.name.trim()) {
      toast.error('اسم المورد مطلوب');
      return;
    }
    if (!isFiniteValue(supplierDraft.leadTimeDays)) {
      toast.error('أدخل مدة توريد رقمية صحيحة');
      return;
    }
    setSupplierSaving(true);
    const client = asSupabaseLooseClient(supabase);
    const payload = {
      brand_id: brandId,
      name: supplierDraft.name.trim(),
      phone: supplierDraft.phone.trim(),
      email: supplierDraft.email.trim(),
      payment_terms: supplierDraft.paymentTerms.trim(),
      lead_time_days: Math.max(0, Math.floor(number(supplierDraft.leadTimeDays))),
      notes: supplierDraft.notes.trim(),
      status: 'active',
    };
    const { error } = supplierDraft.id
      ? await client.from('suppliers').update(payload).eq('id', supplierDraft.id)
      : await client.from('suppliers').insert({
        ...payload,
        supplier_code: `SUP-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      });
    setSupplierSaving(false);
    if (error) {
      toast.error(error.message || 'تعذر حفظ المورد');
      return;
    }
    toast.success(supplierDraft.id ? 'تم تحديث بيانات المورد' : 'تمت إضافة المورد');
    setSupplierOpen(false);
    setSupplierDraft({ id: '', name: '', phone: '', email: '', paymentTerms: '', leadTimeDays: '0', notes: '' });
    await load();
  };

  const setSupplierStatus = async (supplier: Supplier, status: 'active' | 'inactive') => {
    const { error } = await asSupabaseLooseClient(supabase).from('suppliers').update({ status }).eq('id', supplier.id);
    if (error) {
      toast.error(error.message || 'تعذر تحديث حالة المورد');
      return;
    }
    toast.success(status === 'inactive' ? 'تم إيقاف المورد' : 'تم تفعيل المورد');
    await load();
  };

  const recordPayment = async (invoice: Invoice) => {
    const draft = paymentDrafts[invoice.id] ?? { amount: '', method: 'cash' as const, reference: '' };
    const amount = number(draft.amount);
    if (amount <= 0 || amount > invoice.total - invoice.paid) {
      toast.error('أدخل مبلغًا صحيحًا لا يتجاوز الرصيد المستحق');
      return;
    }
    const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_record_supplier_payment', {
      _invoice_id: invoice.id, _amount: amount, _payment_method: draft.method,
      _payment_date: today(), _reference_no: draft.reference, _notes: '',
    });
    if (error) {
      toast.error(error.message || 'تعذر تسجيل دفعة المورد');
      return;
    }
    toast.success('تم تسجيل الدفعة وتحديث الرصيد المستحق');
    await load();
  };

  const exportPage = () => {
    const columns = ['رقم الطلب', 'التاريخ', 'المورد', 'المشتري', 'الحالة', 'رقم الفاتورة', 'الإجمالي', 'المدفوع'];
    const body = requests.map((request) => [
      request.requestNo, request.purchasedAt || request.createdAt, request.supplierName,
      request.purchaserName, statusLabel(request.status), request.invoiceNumber,
      request.totalAmount, request.paidAmount,
    ]);
    const csv = `\uFEFF${[columns, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `procurement-${brandId}-${today()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openInvoice = async (path: string) => {
    const { data, error } = await supabase.storage.from('supplier-invoices').createSignedUrl(path, 60);
    if (error) {
      toast.error(error.message || 'تعذر فتح الفاتورة');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  // Deletes storage files that no invoice or purchase request references
  // anymore (left behind when an RPC failed after a successful upload).
  const cleanupOrphanInvoices = async () => {
    if (!brandId) return;
    setCleaningOrphans(true);
    try {
      const { data, error } = await asSupabaseLooseClient(supabase).rpc('inventory_find_orphan_invoice_files', { _brand_id: brandId });
      if (error) throw new Error(error.message);
      const paths = records(data).map((row) => String(row.storage_path ?? '')).filter(Boolean);
      if (paths.length === 0) {
        toast.success('لا توجد ملفات فواتير غير مرتبطة');
        return;
      }
      const { error: removeError } = await supabase.storage.from('supplier-invoices').remove(paths);
      if (removeError) throw new Error(removeError.message);
      toast.success(`تم حذف ${paths.length} ملف فاتورة غير مرتبط`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تنظيف ملفات الفواتير');
    } finally {
      setCleaningOrphans(false);
    }
  };

  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const dueInvoices = invoices.filter((invoice) => invoice.total > invoice.paid);
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === 'active');

  return (
    <div className="space-y-5" dir="rtl">
      <AppLayoutHeaderPortal>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-9 text-xs font-semibold gap-1.5 rounded-lg" onClick={() => setPrintOrderOpen(true)}>
            <Printer className="h-3.5 w-3.5" />
            <span>طباعة طلب مشتريات</span>
          </Button>
          <Button size="sm" variant="outline" className="h-9 text-xs font-semibold gap-1.5 rounded-lg" onClick={exportPage} disabled={!requests.length}>
            <Download className="h-3.5 w-3.5" />
            <span>تصدير نتائج الصفحة</span>
          </Button>
          <Button
            size="sm"
            className="h-9 text-xs font-semibold gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => { setDirectDraft({ ...emptyDirectDraft(), purchaserName }); setDirectOpen(true); }}
            disabled={!brandId}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>شراء مباشر</span>
          </Button>
        </div>
      </AppLayoutHeaderPortal>

      <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          طلبات موحدة للمخزن المركزي{hubName ? ` (${hubName})` : ''} الذي يخدم كل العلامات، متابعة أسعار وفواتير الموردين، واستلام موثق للمخزون.
        </span>
        <span className="rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
          إدارة المشتريات والموردين
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="نواقص المخزن" value={String(shortages.length)} />
        <Metric title="بانتظار التنفيذ" value={String(pending.length)} />
        <Metric title="إجمالي المصروفات" value={money(totalSpend)} />
        <Metric title="فواتير مستحقة" value={money(dueInvoices.reduce((sum, invoice) => sum + invoice.total - invoice.paid, 0))} />
      </div>

      <ProcurementKpis brandId={brandId} />

      {pendingApprovals.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-amber-600" />طلبات شراء بانتظار الاعتماد ({pendingApprovals.length})</CardTitle>
            <CardDescription>تتجاوز هذه الطلبات حد الاعتماد التلقائي وتحتاج مراجعة مدير مختلف عن مُنشئ الطلب.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals.map((approval) => (
              <div key={approval.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <strong>{money(approval.totalAmount)}</strong>
                  <span className="mx-2 text-sm text-muted-foreground">حد الاعتماد {money(approval.approvalLimit)}</span>
                  <p className="text-xs text-muted-foreground tabular-nums">{new Date(approval.createdAt).toLocaleString('en-US')}{approval.notes ? ` — ${approval.notes}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={savingId === approval.id} onClick={() => void reviewApproval(approval.id, true)}>اعتماد</Button>
                  <Button size="sm" variant="outline" className="text-destructive" disabled={savingId === approval.id} onClick={() => void reviewApproval(approval.id, false)}>رفض</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="shortages" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1.5 rounded-2xl border bg-card p-1.5">
          <TabsTrigger value="shortages">النواقص وطلبات الشراء</TabsTrigger>
          <TabsTrigger value="execution">تنفيذ الطلبات ({pending.length})</TabsTrigger>
          <TabsTrigger value="history">سجل المشتريات</TabsTrigger>
          <TabsTrigger value="prices">تحليل الأسعار</TabsTrigger>
          <TabsTrigger value="suppliers">الموردون</TabsTrigger>
          <TabsTrigger value="invoices">الفواتير والمدفوعات</TabsTrigger>
        </TabsList>

        <TabsContent value="shortages" className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPrintOrderOpen(true)}>
              <Printer className="ml-2 h-4 w-4" />طباعة طلب مشتريات
            </Button>
            <Button variant="outline" onClick={() => setAutoReorderOpen(true)} disabled={!brandId}>
              <ShoppingBasket className="ml-2 h-4 w-4" />إنشاء أمر شراء تلقائي من النواقص
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>النواقص واقتراح إعادة التوريد</CardTitle>
              <CardDescription>الكمية المقترحة تعيد الرصيد إلى ضعفي الحد الأدنى، وتحول إلى وحدة الشراء وفق معامل الصنف.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {shortages.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead><tr className="border-b text-muted-foreground"><th className="p-2">تحديد</th><th className="p-2">الصنف</th><th className="p-2">المتاح</th><th className="p-2">الحد الأدنى</th><th className="p-2">الكمية المقترحة للشراء</th><th className="p-2">آخر تكلفة</th></tr></thead>
                    <tbody>{shortages.map((item) => {
                      const factor = item.conversionFactor > 0 ? item.conversionFactor : 1;
                      const suggested = suggestPurchaseQuantity(item.minStock, item.onHand, factor);
                      return <tr className="border-b" key={item.id}>
                        <td className="p-2"><input aria-label={`حدد ${item.name}`} type="checkbox" checked={item.id in selectedShortages} onChange={(event) => setSelectedShortages((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[item.id] = String(suggested.toFixed(3));
                          else delete next[item.id];
                          return next;
                        })} /></td>
                        <td className="p-2"><strong>{item.name}</strong><div className="text-xs text-muted-foreground">{item.code}</div></td>
                        <td className="p-2">{item.onHand} {item.usageUnit}</td>
                        <td className="p-2">{item.minStock} {item.usageUnit}</td>
                        <td className="p-2"><div className="flex items-center gap-2"><Input className="w-28" type="number" min="0.001" step="0.001" aria-label={`كمية شراء ${item.name}`} value={selectedShortages[item.id] ?? suggested.toFixed(3)} onChange={(event) => setSelectedShortages((current) => ({ ...current, [item.id]: event.target.value }))} /><span>{item.purchaseUnit}</span></div></td>
                        <td className="p-2">{money(item.lastPrice || item.averageCost * (item.conversionFactor > 0 ? item.conversionFactor : 1))}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              ) : <Empty text="لا توجد نواقص في العلامة المحددة." />}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المورد المفضل (اختياري)" value={shortageSupplierId} onChange={setShortageSupplierId} options={activeSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} />
                <Textarea placeholder="ملاحظات أمر الشراء" value={shortageNotes} onChange={(event) => setShortageNotes(event.target.value)} />
              </div>
              <Button onClick={() => void submitShortages()} disabled={!brandId || Object.keys(selectedShortages).length === 0}>
                <ShoppingBasket className="ml-2 h-4 w-4" />إنشاء أمر شراء مجمع
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="execution" className="space-y-4">
          {pending.length ? pending.map((request) => {
            const draft = drafts[request.id];
            if (!draft) return null;
            const subtotal = draft.lines.reduce((sum, line) => sum + number(line.quantity) * number(line.unitCost), 0);
            return <Card key={request.id}>
              <CardHeader><CardTitle>{request.requestNo} · {request.supplierName || 'مورد غير محدد'}</CardTitle><CardDescription className="tabular-nums">{new Date(request.createdAt).toLocaleString('en-US')} · {request.notes || 'بدون ملاحظات'}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="المورد" value={draft.supplierId} onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, supplierId: value } }))} options={activeSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} allowEmpty />
                  <TextField label="اسم من قام بالشراء *" value={draft.purchaserName} onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, purchaserName: value } }))} />
                  <TextField label="رقم الفاتورة" value={draft.invoiceNumber} onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, invoiceNumber: value } }))} />
                </div>
                <div className="space-y-3">
                  {draft.lines.map((line) => {
                    const item = items.find((entry) => entry.id === line.itemId);
                    return <div key={line.id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-2 xl:grid-cols-5">
                      <div className="xl:col-span-1"><strong>{line.itemName}</strong><p className="text-xs text-muted-foreground">وحدة الشراء: {line.unit}</p></div>
                      <NumberTextField label="الكمية الفعلية" value={line.quantity} onChange={(value) => setExecutionLine(request.id, line.id, { quantity: value })} />
                      <NumberTextField label="سعر وحدة الشراء" value={line.unitCost} onChange={(value) => setExecutionLine(request.id, line.id, { unitCost: value })} step="0.01" />
                      <TextField label="رقم الدفعة" value={line.batchNo} onChange={(value) => setExecutionLine(request.id, line.id, { batchNo: value })} />
                      <TextField label="الصلاحية" value={line.expiryDate} type="date" onChange={(value) => setExecutionLine(request.id, line.id, { expiryDate: value })} />
                      {item ? <div className="md:col-span-2 xl:col-span-5"><ProcurementPriceAlert itemName={item.name} currentPrice={number(line.unitCost)} previousPrice={item.lastPrice} unit={item.purchaseUnit} /></div> : null}
                    </div>;
                  })}
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <NumberTextField label="ضريبة الفاتورة" value={draft.taxAmount} onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, taxAmount: value } }))} step="0.01" />
                  <NumberTextField label="الخصم" value={draft.discountAmount} onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, discountAmount: value } }))} step="0.01" />
                  <NumberTextField label="المبلغ المدفوع" value={draft.paidAmount} onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, paidAmount: value } }))} step="0.01" />
                  <Field label="طريقة الدفع" value={draft.paymentMethod} onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, paymentMethod: value as ExecutionDraft['paymentMethod'] } }))} options={paymentMethods} />
                  <TextField label="تاريخ الفاتورة" value={draft.invoiceDate} type="date" onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, invoiceDate: value } }))} />
                  <TextField label="تاريخ الاستحقاق" value={draft.dueDate} type="date" onChange={(value) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, dueDate: value } }))} />
                  <FileField label="الفاتورة (PDF أو صورة)" onChange={(file) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, invoiceFile: file } }))} />
                  <div className="self-end rounded-lg bg-muted p-3 text-sm">الإجمالي المتوقع: <strong>{money(Math.max(0, subtotal + number(draft.taxAmount) - number(draft.discountAmount)))}</strong></div>
                </div>
                <Textarea placeholder="ملاحظات التنفيذ" value={draft.notes} onChange={(event) => setDrafts((current) => ({ ...current, [request.id]: { ...draft, notes: event.target.value } }))} />
                <Button disabled={savingId === request.id} onClick={() => void finishPurchase(request)}>
                  {savingId === request.id ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}
                  اعتماد التنفيذ وإرسال للاستلام
                </Button>
              </CardContent>
            </Card>;
          }) : <Empty text={loading ? 'جارٍ تحميل الطلبات...' : 'لا توجد طلبات بانتظار التنفيذ.'} />}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Filters
            searchText={searchText} onSearchText={setSearchText}
            status={statusFilter} onStatus={(value) => { setPage(0); setStatusFilter(value); }}
            from={fromDate} to={toDate}
            onFrom={(value) => { setPage(0); setFromDate(value); }}
            onTo={(value) => { setPage(0); setToDate(value); }}
          />
          <Card>
            <CardHeader><CardTitle>سجل المشتريات</CardTitle><CardDescription>عرض {requests.length} من إجمالي {totalCount} طلبًا · {PAGE_SIZE} طلبًا في الصفحة</CardDescription></CardHeader>
            <CardContent>
              {loading ? <div className="grid min-h-32 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : requests.length ? (
                <div className="overflow-x-auto"><table className="w-full text-right text-sm">
                  <thead><tr className="border-b text-muted-foreground">{['التاريخ', 'رقم الطلب', 'المورد', 'المشتري', 'البنود', 'الإجمالي', 'المدفوع', 'الحالة', 'الفاتورة'].map((head) => <th className="p-2" key={head}>{head}</th>)}</tr></thead>
                  <tbody>{requests.map((request) => <tr className="border-b" key={request.id}>
                    <td className="p-2 tabular-nums">{new Date(request.purchasedAt || request.createdAt).toLocaleDateString('en-US')}</td>
                    <td className="p-2 font-semibold">{request.requestNo}</td>
                    <td className="p-2">{request.supplierName || '—'}</td>
                    <td className="p-2">{request.purchaserName || '—'}</td>
                    <td className="p-2">{request.lines.length}</td>
                    <td className="p-2">{money(request.totalAmount || request.lines.reduce((sum, line) => sum + number(line.quantity) * number(line.unitCost), 0))}</td>
                    <td className="p-2">{money(request.paidAmount)}</td>
                    <td className="p-2"><Status status={request.status} /></td>
                    <td className="p-2">{request.invoiceStoragePath ? <Button size="sm" variant="outline" onClick={() => void openInvoice(request.invoiceStoragePath)}><FileText className="ml-1 h-4 w-4" />فتح</Button> : request.invoiceNumber || '—'}</td>
                  </tr>)}</tbody>
                </table></div>
              ) : <Empty text="لا توجد مشتريات مطابقة للفلاتر." />}
              <div className="mt-4 flex items-center justify-between gap-2">
                <Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>السابق</Button>
                <span className="text-sm text-muted-foreground">صفحة {page + 1} من {pages}</span>
                <Button variant="outline" disabled={page + 1 >= pages || loading} onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}>التالي</Button>
              </div>
              <div className="mt-4 print:hidden"><Button variant="outline" onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" />طباعة الصفحة</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prices" className="space-y-4">
          <PriceHistoryPanel brandId={brandId} items={items.map((item) => ({ id: item.id, name: item.name, purchaseUnit: item.purchaseUnit }))} />
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />آخر سعر شراء ضمن النتائج المحملة</CardTitle><CardDescription>مرتبة حسب وقت التنفيذ الفعلي، وليس ترتيب إنشاء الطلب.</CardDescription></CardHeader>
            <CardContent>{latestPrices.length ? <DataTable headers={['الصنف', 'آخر سعر للوحدة', 'المورد', 'التاريخ']} rows={latestPrices.map((entry) => [entry.itemName, money(entry.price), entry.supplierName || '—', new Date(entry.date).toLocaleDateString('en-US')])} /> : <Empty text="لا تتوفر بيانات أسعار للمشتريات المحملة." />}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => { setSupplierDraft({ id: '', name: '', phone: '', email: '', paymentTerms: '', leadTimeDays: '0', notes: '' }); setSupplierOpen(true); }}><Plus className="ml-2 h-4 w-4" />إضافة مورد</Button></div>
          <SupplierDirectory brandId={brandId} suppliers={suppliers} onRefresh={() => void load()} />
        </TabsContent>

        <TabsContent value="invoices" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" disabled={cleaningOrphans} onClick={() => void cleanupOrphanInvoices()}>
              {cleaningOrphans ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Trash2 className="ml-2 h-4 w-4" />}
              تنظيف ملفات الفواتير غير المرتبطة
            </Button>
          </div>
          {dueInvoices.length ? dueInvoices.map((invoice) => {
            const draft = paymentDrafts[invoice.id] ?? { amount: '', method: 'cash' as const, reference: '' };
            const remaining = invoice.total - invoice.paid;
            return <Card key={invoice.id}><CardHeader><CardTitle>فاتورة {invoice.number} · {invoice.supplierName}</CardTitle><CardDescription>إجمالي {money(invoice.total)} · مدفوع {money(invoice.paid)} · مستحق {money(remaining)}{invoice.dueDate ? ` · الاستحقاق ${invoice.dueDate}` : ''}</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-4">
                <NumberTextField label="مبلغ الدفعة" value={draft.amount} onChange={(amount) => setPaymentDrafts((current) => ({ ...current, [invoice.id]: { ...draft, amount } }))} step="0.01" />
                <Field label="طريقة الدفع" value={draft.method} onChange={(method) => setPaymentDrafts((current) => ({ ...current, [invoice.id]: { ...draft, method: method as typeof draft.method } }))} options={paymentMethods} />
                <TextField label="رقم مرجعي" value={draft.reference} onChange={(reference) => setPaymentDrafts((current) => ({ ...current, [invoice.id]: { ...draft, reference } }))} />
                <Button className="self-end" onClick={() => void recordPayment(invoice)}>تسجيل الدفعة</Button>
                {invoice.storagePath ? <Button className="sm:col-span-4" variant="outline" onClick={() => void openInvoice(invoice.storagePath)}><FileText className="ml-2 h-4 w-4" />فتح مستند الفاتورة</Button> : null}
              </CardContent>
            </Card>;
          }) : <Empty text="لا توجد فواتير مستحقة مسجلة." />}
        </TabsContent>
      </Tabs>

      <Dialog open={directOpen} onOpenChange={setDirectOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>تسجيل شراء مباشر</DialogTitle><DialogDescription>يسجل عملية شراء غير مخططة مع فاتورتها وبيانات الدفع؛ لا تضاف الكمية قبل فحص المخزن.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الصنف" value={directDraft.itemId} onChange={(itemId) => {
              const item = items.find((entry) => entry.id === itemId);
              const factor = item && item.conversionFactor > 0 ? item.conversionFactor : 1;
              setDirectDraft((current) => ({ ...current, itemId, unitCost: String(item ? item.lastPrice || item.averageCost * factor : '') }));
            }} options={items.map((item) => ({ value: item.id, label: `${item.name} (${item.purchaseUnit})` }))} />
            <NumberTextField label="الكمية بوحدة الشراء" value={directDraft.quantity} onChange={(quantity) => setDirectDraft((current) => ({ ...current, quantity }))} />
            <NumberTextField label="سعر وحدة الشراء" value={directDraft.unitCost} onChange={(unitCost) => setDirectDraft((current) => ({ ...current, unitCost }))} step="0.01" />
            {directItem ? <div className="sm:col-span-2"><ProcurementPriceAlert itemName={directItem.name} currentPrice={number(directDraft.unitCost)} previousPrice={directItem.lastPrice} unit={directItem.purchaseUnit} /></div> : null}
            <Field label="المورد" value={directDraft.supplierId} onChange={(supplierId) => setDirectDraft((current) => ({ ...current, supplierId }))} options={activeSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} allowEmpty />
            <TextField label="اسم من قام بالشراء" value={directDraft.purchaserName || purchaserName} onChange={(value) => setDirectDraft((current) => ({ ...current, purchaserName: value }))} />
            <TextField label="رقم الفاتورة" value={directDraft.invoiceNumber} onChange={(invoiceNumber) => setDirectDraft((current) => ({ ...current, invoiceNumber }))} />
            <NumberTextField label="الضريبة" value={directDraft.taxAmount} onChange={(taxAmount) => setDirectDraft((current) => ({ ...current, taxAmount }))} step="0.01" />
            <NumberTextField label="الخصم" value={directDraft.discountAmount} onChange={(discountAmount) => setDirectDraft((current) => ({ ...current, discountAmount }))} step="0.01" />
            <NumberTextField label="المبلغ المدفوع" value={directDraft.paidAmount} onChange={(paidAmount) => setDirectDraft((current) => ({ ...current, paidAmount }))} step="0.01" />
            <Field label="طريقة الدفع" value={directDraft.paymentMethod} onChange={(value) => setDirectDraft((current) => ({ ...current, paymentMethod: value as DirectDraft['paymentMethod'] }))} options={paymentMethods} />
            <TextField label="تاريخ الفاتورة" value={directDraft.invoiceDate} type="date" onChange={(invoiceDate) => setDirectDraft((current) => ({ ...current, invoiceDate }))} />
            <TextField label="تاريخ الاستحقاق" value={directDraft.dueDate} type="date" onChange={(dueDate) => setDirectDraft((current) => ({ ...current, dueDate }))} />
            <FileField label="الفاتورة (PDF أو صورة)" onChange={(invoiceFile) => setDirectDraft((current) => ({ ...current, invoiceFile }))} />
          </div>
          <Button disabled={savingId === 'direct'} onClick={() => void recordDirectPurchase()}>{savingId === 'direct' ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <PackagePlus className="ml-2 h-4 w-4" />}تسجيل الشراء</Button>
        </DialogContent>
      </Dialog>

      <AutoReorderDialog open={autoReorderOpen} onOpenChange={setAutoReorderOpen} brandId={brandId} onSubmit={submitAutoReorder} />

      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{supplierDraft.id ? 'تعديل المورد' : 'إضافة مورد'}</DialogTitle><DialogDescription>بيانات المورد مرتبطة بالعلامة التجارية المحددة.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="اسم المورد *" value={supplierDraft.name} onChange={(name) => setSupplierDraft((current) => ({ ...current, name }))} />
            <TextField label="الهاتف" value={supplierDraft.phone} onChange={(phone) => setSupplierDraft((current) => ({ ...current, phone }))} />
            <TextField label="البريد الإلكتروني" value={supplierDraft.email} onChange={(email) => setSupplierDraft((current) => ({ ...current, email }))} />
            <TextField label="شروط الدفع" value={supplierDraft.paymentTerms} onChange={(paymentTerms) => setSupplierDraft((current) => ({ ...current, paymentTerms }))} />
            <NumberTextField label="مدة التوريد بالأيام" value={supplierDraft.leadTimeDays} onChange={(leadTimeDays) => setSupplierDraft((current) => ({ ...current, leadTimeDays }))} step="1" />
            <Textarea className="sm:col-span-2" placeholder="ملاحظات المورد" value={supplierDraft.notes} onChange={(event) => setSupplierDraft((current) => ({ ...current, notes: event.target.value }))} />
          </div>
          <Button disabled={supplierSaving} onClick={() => void saveSupplier()}>{supplierSaving ? 'جارٍ الحفظ...' : 'حفظ المورد'}</Button>
        </DialogContent>
      </Dialog>

      <PurchaseOrderPrintDialog
        open={printOrderOpen}
        onOpenChange={setPrintOrderOpen}
        hubName={hubName}
        purchaserName={purchaserName}
        shortages={shortages}
      />
    </div>
  );
}

const paymentMethods = [
  { value: 'cash', label: 'نقدًا' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'credit', label: 'آجل' },
];

function Metric({ title, value }: { title: string; value: string }) {
  return <Card><CardHeader className="p-4"><CardDescription>{title}</CardDescription><CardTitle className="text-xl">{value}</CardTitle></CardHeader></Card>;
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function Status({ status }: { status: string }) {
  const [label, className] = status === 'pending_procurement' ? ['بانتظار التنفيذ', 'bg-amber-100 text-amber-800']
    : status === 'purchased_pending_receipt' ? ['بانتظار الاستلام', 'bg-blue-100 text-blue-800']
      : status === 'approved' ? ['مستلم', 'bg-emerald-100 text-emerald-800']
        : status === 'rejected' ? ['مرفوض', 'bg-red-100 text-red-800']
          : [status, 'bg-muted text-muted-foreground'];
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr className="border-b text-muted-foreground">{headers.map((header) => <th className="p-2" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr className="border-b" key={index}>{row.map((cell, cellIndex) => <td className="p-2" key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Filters({ searchText, onSearchText, status, onStatus, from, to, onFrom, onTo }: {
  searchText: string; onSearchText: (value: string) => void; status: string; onStatus: (value: string) => void;
  from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void;
}) {
  return <Card><CardContent className="grid gap-3 p-4 md:grid-cols-4">
    <div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pr-9" placeholder="بحث بالطلب أو المورد أو المشتري" value={searchText} onChange={(event) => onSearchText(event.target.value)} /></div>
    <select aria-label="تصفية حسب الحالة" className="h-10 rounded-md border bg-background px-3" value={status} onChange={(event) => onStatus(event.target.value)}>
      <option value="all">كل الحالات</option><option value="pending_procurement">بانتظار التنفيذ</option><option value="purchased_pending_receipt">بانتظار الاستلام</option><option value="approved">مستلم</option><option value="rejected">مرفوض</option>
    </select>
    <Input aria-label="من تاريخ" type="date" value={from} onChange={(event) => onFrom(event.target.value)} />
    <Input aria-label="إلى تاريخ" type="date" value={to} onChange={(event) => onTo(event.target.value)} />
  </CardContent></Card>;
}

function Field({ label, value, onChange, options, allowEmpty = false }: {
  label: string; value: string; onChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>; allowEmpty?: boolean;
}) {
  return <div className="space-y-1"><Label>{label}</Label>{options
    ? <select className="h-10 w-full rounded-md border bg-background px-3" value={value} onChange={(event) => onChange(event.target.value)}>
      {allowEmpty ? <option value="">بدون اختيار</option> : <option value="">اختر</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    : <Input value={value} onChange={(event) => onChange(event.target.value)} />}</div>;
}

function TextField({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (value: string) => void; type?: string;
}) {
  return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function NumberTextField({ label, value, onChange, step = '0.001' }: {
  label: string; value: string; onChange: (value: string) => void; step?: string;
}) {
  return <div className="space-y-1"><Label>{label}</Label><Input type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function FileField({ label, onChange }: { label: string; onChange: (file: File | null) => void }) {
  return <div className="space-y-1"><Label>{label}</Label><Input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => onChange(event.target.files?.[0] ?? null)} /></div>;
}

function statusLabel(status: string) {
  if (status === 'pending_procurement') return 'بانتظار التنفيذ';
  if (status === 'purchased_pending_receipt') return 'بانتظار الاستلام';
  if (status === 'approved') return 'مستلم';
  if (status === 'rejected') return 'مرفوض';
  return status;
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
