import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  PackageCheck,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBasket,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayoutHeaderPortal } from '@/components/AppLayout';
import ProcurementPriceAlert from '@/components/ProcurementPriceAlert';
import AutoReorderDialog from '@/components/procurement/AutoReorderDialog';
import DirectMultiPurchaseDialog, {
  type DirectMultiPurchaseSubmission,
} from '@/components/procurement/DirectMultiPurchaseDialog';
import PriceHistoryPanel from '@/components/procurement/PriceHistoryPanel';
import PurchaseOrderPrintDialog from '@/components/procurement/PurchaseOrderPrintDialog';
import SupplierDirectory from '@/components/procurement/SupplierDirectory';
import SupplierStatementPanel, {
  type LedgerInvoiceRow,
  type SupplierPaymentRow,
} from '@/components/procurement/SupplierStatementPanel';
import { useAuth } from '@/hooks/useAuth';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import { supabase } from '@/integrations/supabase/client';
import {
  buildSupplierWhatsAppPurchaseOrderUrl,
  classifyPurchaseSource,
  computeUnifiedProcurementKpis,
  DATE_PRESET_LABELS,
  evaluatePriceVariance,
  formatCairoDateTime,
  formatCleanUnitLabel,
  matchesCairoDateRange,
  type ProcurementDatePreset,
  resolveDateRangeForPreset,
  resolvePurchaseActor,
  toCairoDateString,
  type UserIdentityDirectoryEntry,
} from '@/lib/procurementEngine';
import { suggestPurchaseQuantity } from '@/lib/procurementUnits';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import { cn, formatEGPCurrency } from '@/lib/utils';

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
  itemCode: string;
  unit: string;
  quantity: string;
  unitCost: string;
  receivedQuantity: number;
  rejectedQuantity: number;
  rejectionReason: string;
  locationName: string;
  batchNo: string;
  expiryDate: string;
  referencePrice: number;
};

type PurchaseRequest = {
  id: string;
  requestNo: string;
  supplierId: string;
  supplierName: string;
  purchaserName: string;
  requestedBy: string;
  reviewedBy: string;
  reviewedAt: string;
  source: string;
  status: string;
  notes: string;
  createdAt: string;
  purchasedAt: string;
  invoiceDate: string;
  dueDate: string;
  effectiveDate: string;
  invoiceNumber: string;
  invoiceStoragePath: string;
  subtotalAmount: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: string;
  lines: PurchaseLine[];
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
  autoReceive: boolean;
};

type InlineReceiptLineDraft = {
  receivedQuantity: string;
  rejectedQuantity: string;
  rejectionReason: string;
  batchNo: string;
  expiryDate: string;
};

const PAGE_SIZE = 25;
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);
const number = (value: unknown) => Number(value ?? 0);
const isFiniteValue = (value: unknown) => Number.isFinite(Number(value ?? NaN));
const money = (value: number) => formatEGPCurrency(Number.isFinite(value) ? value : 0);
const today = () => toCairoDateString(new Date());

export default function ProcurementCenter({
  brandId,
  hubName,
  purchaserName,
  categories = [],
  externalRefreshTick = 0,
}: {
  brandId: string;
  hubName?: string;
  purchaserName: string;
  categories?: Array<{ code: string; name: string }>;
  externalRefreshTick?: number;
}) {
  const { user, role, displayName } = useAuth();
  const authenticatedName = displayName || purchaserName || user?.email || 'مستخدم النظام';
  const isOwner = role === 'owner';

  const [activeTab, setActiveTab] = useState<string>('history');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [allRequests, setAllRequests] = useState<PurchaseRequest[]>([]);
  const [invoices, setInvoices] = useState<LedgerInvoiceRow[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRow[]>([]);
  const [userDirectory, setUserDirectory] = useState<Map<string, UserIdentityDirectoryEntry>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);

  // History Smart Filters
  const [datePreset, setDatePreset] = useState<ProcurementDatePreset>('all');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Record<string, boolean>>({});

  // Shortages, Execution & Modals
  const [selectedShortages, setSelectedShortages] = useState<Record<string, string>>({});
  const [shortageSupplierId, setShortageSupplierId] = useState('');
  const [shortageNotes, setShortageNotes] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ExecutionDraft>>({});
  const [directOpen, setDirectOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState({
    id: '',
    name: '',
    phone: '',
    email: '',
    paymentTerms: '',
    leadTimeDays: '0',
    notes: '',
  });
  const [savingId, setSavingId] = useState('');
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [autoReorderOpen, setAutoReorderOpen] = useState(false);
  const [printOrderOpen, setPrintOrderOpen] = useState(false);

  // Inline Warehouse Receipt Dialog
  const [receiptTarget, setReceiptTarget] = useState<PurchaseRequest | null>(null);
  const [receiptLineDrafts, setReceiptLineDrafts] = useState<Record<string, InlineReceiptLineDraft>>({});
  const [receiptNotes, setReceiptNotes] = useState('');
  const [receiptDate, setReceiptDate] = useState(today);
  const [receivingSaving, setReceivingSaving] = useState(false);

  // Owner Return / Cancel Dialog
  const [cancelTarget, setCancelTarget] = useState<PurchaseRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingSaving, setCancellingSaving] = useState(false);

  const [pendingApprovals, setPendingApprovals] = useState<
    Array<{
      id: string;
      requestId: string;
      totalAmount: number;
      approvalLimit: number;
      requestedBy: string;
      notes: string;
      createdAt: string;
    }>
  >([]);

  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const requestVersion = ++loadVersion.current;
    const isStale = () => requestVersion !== loadVersion.current;
    if (!brandId) {
      setSuppliers([]);
      setItems([]);
      setAllRequests([]);
      setInvoices([]);
      setPayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const client = asSupabaseLooseClient(supabase);
    const [supplierResult, itemResult, balanceResult, profilesRes, rolesRes] = await Promise.all([
      client
        .from('suppliers')
        .select('id,name,phone,email,payment_terms,lead_time_days,notes,last_purchase_at,status')
        .eq('brand_id', brandId)
        .order('name')
        .limit(500),
      client
        .from('items_master')
        .select('id,name,item_code,purchase_unit,usage_unit,conversion_factor,min_stock,last_purchase_price,avg_cost')
        .eq('brand_id', brandId)
        .eq('status', 'active')
        .order('name')
        .limit(2000),
      client.from('inventory_balances').select('item_id,on_hand').eq('brand_id', brandId).limit(5000),
      client.from('profiles').select('id,display_name').limit(500),
      client.from('user_roles').select('user_id,role').limit(500),
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

    // Build verified user identity map (id -> display_name + role)
    const roleMap = new Map<string, string>();
    if (!rolesRes.error) {
      records(rolesRes.data).forEach((r) => {
        if (r.user_id) roleMap.set(String(r.user_id), String(r.role ?? ''));
      });
    }
    const dir = new Map<string, UserIdentityDirectoryEntry>();
    if (!profilesRes.error) {
      records(profilesRes.data).forEach((p) => {
        const uid = String(p.id ?? '');
        if (uid) {
          dir.set(uid, {
            id: uid,
            displayName: String(p.display_name ?? ''),
            role: roleMap.get(uid),
          });
        }
      });
    }
    if (user?.id && !dir.has(user.id)) {
      dir.set(user.id, {
        id: user.id,
        displayName: authenticatedName,
        role: role ?? undefined,
      });
    }
    setUserDirectory(dir);

    const balanceMap = new Map<string, number>();
    records(balanceResult.data).forEach((row) => {
      const itemId = String(row.item_id);
      balanceMap.set(itemId, (balanceMap.get(itemId) ?? 0) + number(row.on_hand));
    });

    const nextItems: CatalogItem[] = records(itemResult.data).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      code: String(row.item_code ?? ''),
      purchaseUnit: String(row.purchase_unit ?? ''),
      usageUnit: String(row.usage_unit ?? row.purchase_unit ?? ''),
      conversionFactor: number(row.conversion_factor ?? 1),
      minStock: number(row.min_stock),
      onHand: balanceMap.get(String(row.id)) ?? 0,
      lastPrice: number(row.last_purchase_price),
      averageCost: number(row.avg_cost),
    }));
    setItems(nextItems);

    const nextSuppliers: Supplier[] = records(supplierResult.data).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      phone: String(row.phone ?? ''),
      email: String(row.email ?? ''),
      paymentTerms: String(row.payment_terms ?? ''),
      leadTimeDays: number(row.lead_time_days),
      notes: String(row.notes ?? ''),
      lastPurchaseAt: String(row.last_purchase_at ?? ''),
      status: String(row.status ?? 'active'),
    }));
    setSuppliers(nextSuppliers);

    // Fetch up to 500 recent purchase requests so Cairo local date filtering ("مشتريات إمبارح / اليوم") & item search are instant and accurate
    const { data: requestData, error: requestError } = await client
      .from('inventory_purchase_requests')
      .select(
        'id,request_no,supplier_id,supplier_name,purchaser_name,requested_by,reviewed_by,reviewed_at,execution_source,status,notes,created_at,purchased_at,invoice_date,due_date,invoice_number,invoice_storage_path,subtotal,tax_amount,discount_amount,total_amount,paid_amount,payment_method',
      )
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (requestError) {
      if (!isStale()) {
        toast.error(requestError.message || 'تعذر تحميل سجل المشتريات');
        setLoading(false);
      }
      return;
    }
    if (isStale()) return;

    const requestRows = records(requestData);
    const requestIds = requestRows.map((row) => String(row.id));

    const { data: lineData, error: lineError } = requestIds.length
      ? await client
          .from('inventory_purchase_request_lines')
          .select(
            'id,purchase_request_id,item_id,quantity,unit_cost,received_quantity,rejected_quantity,rejection_reason,location_name,batch_no,expiry_date',
          )
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
    const linesByRequestId = new Map<string, PurchaseLine[]>();

    for (const line of records(lineData)) {
      const reqId = String(line.purchase_request_id);
      const item = itemMap.get(String(line.item_id));
      const factor = item && item.conversionFactor > 0 ? item.conversionFactor : 1;
      const refPrice = item ? item.averageCost * factor || item.lastPrice : 0;
      const list = linesByRequestId.get(reqId) ?? [];
      list.push({
        id: String(line.id),
        itemId: String(line.item_id),
        itemName: item?.name ?? 'صنف مخزون',
        itemCode: item?.code ?? '',
        unit: item?.purchaseUnit ?? '',
        quantity: String(line.quantity),
        unitCost: String(line.unit_cost),
        receivedQuantity: number(line.received_quantity),
        rejectedQuantity: number(line.rejected_quantity),
        rejectionReason: String(line.rejection_reason ?? ''),
        locationName: String(line.location_name ?? 'main'),
        batchNo: String(line.batch_no ?? ''),
        expiryDate: String(line.expiry_date ?? ''),
        referencePrice: refPrice,
      });
      linesByRequestId.set(reqId, list);
    }

    const nextRequests: PurchaseRequest[] = requestRows.map((row) => {
      const reqId = String(row.id);
      const reqLines = linesByRequestId.get(reqId) ?? [];
      const computedSubtotal = reqLines.reduce(
        (sum, l) => sum + number(l.quantity) * number(l.unitCost),
        0,
      );
      const totalVal = number(row.total_amount) || computedSubtotal;
      const invoiceDateStr = String(row.invoice_date ?? '');
      const purchasedAtStr = String(row.purchased_at ?? '');
      const createdAtStr = String(row.created_at ?? '');
      const effectiveDate =
        toCairoDateString(invoiceDateStr) ||
        toCairoDateString(purchasedAtStr) ||
        toCairoDateString(createdAtStr);

      return {
        id: reqId,
        requestNo: String(row.request_no),
        supplierId: String(row.supplier_id ?? ''),
        supplierName: String(row.supplier_name ?? ''),
        purchaserName: String(row.purchaser_name ?? ''),
        requestedBy: String(row.requested_by ?? ''),
        reviewedBy: String(row.reviewed_by ?? ''),
        reviewedAt: String(row.reviewed_at ?? ''),
        source: String(row.execution_source ?? 'procurement'),
        status: String(row.status),
        notes: String(row.notes ?? ''),
        createdAt: createdAtStr,
        purchasedAt: purchasedAtStr,
        invoiceDate: invoiceDateStr,
        dueDate: String(row.due_date ?? ''),
        effectiveDate,
        invoiceNumber: String(row.invoice_number ?? ''),
        invoiceStoragePath: String(row.invoice_storage_path ?? ''),
        subtotalAmount: number(row.subtotal) || computedSubtotal,
        taxAmount: number(row.tax_amount),
        discountAmount: number(row.discount_amount),
        totalAmount: totalVal,
        paidAmount: number(row.paid_amount),
        paymentMethod: String(row.payment_method ?? 'cash'),
        lines: reqLines,
      };
    });

    setAllRequests(nextRequests);

    setDrafts((current) =>
      Object.fromEntries(
        nextRequests
          .filter((r) => r.status === 'pending_procurement' || r.status === 'pending_store_approval')
          .map((request) => [
            request.id,
            current[request.id] ?? {
              supplierId: request.supplierId,
              purchaserName: request.purchaserName || authenticatedName,
              lines: request.lines,
              invoiceNumber: request.invoiceNumber,
              invoiceDate: today(),
              dueDate: '',
              taxAmount: '0',
              discountAmount: '0',
              paidAmount: String(
                request.lines.reduce((s, l) => s + number(l.quantity) * number(l.unitCost), 0),
              ),
              paymentMethod: 'cash' as const,
              notes: '',
              invoiceFile: null,
              autoReceive: true,
            },
          ]),
      ),
    );

    const [invoiceRes, paymentRes, approvalRes] = await Promise.all([
      client
        .from('supplier_invoices')
        .select(
          'id,purchase_request_id,supplier_id,invoice_number,invoice_date,due_date,total_amount,paid_amount,status,invoice_storage_path,created_by',
        )
        .eq('brand_id', brandId)
        .order('invoice_date', { ascending: false })
        .limit(300),
      client
        .from('supplier_payments')
        .select('id,supplier_invoice_id,payment_date,amount,payment_method,reference_no,created_by')
        .eq('brand_id', brandId)
        .order('payment_date', { ascending: false })
        .limit(500),
      client
        .from('inventory_purchase_approvals')
        .select('id,purchase_request_id,total_amount,approval_limit,requested_by,notes,created_at')
        .eq('brand_id', brandId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50),
    ]);

    if (isStale()) return;

    const supplierMap = new Map(nextSuppliers.map((s) => [s.id, s.name]));
    const formalRequestIds = new Set<string>();
    const ledgerInvoices: LedgerInvoiceRow[] = records(invoiceRes.data).map((row) => {
      const reqId = String(row.purchase_request_id ?? '');
      if (reqId) formalRequestIds.add(reqId);
      const actor = resolvePurchaseActor(String(row.created_by ?? ''), '', dir);
      return {
        id: String(row.id),
        requestId: reqId,
        supplierId: String(row.supplier_id ?? ''),
        supplierName: supplierMap.get(String(row.supplier_id ?? '')) ?? 'مورد',
        number: String(row.invoice_number ?? ''),
        date: String(row.invoice_date ?? ''),
        dueDate: String(row.due_date ?? ''),
        total: number(row.total_amount),
        paid: number(row.paid_amount),
        status: String(row.status ?? ''),
        storagePath: String(row.invoice_storage_path ?? ''),
        recordedByName: actor.displayName,
      };
    });

    // Also include executed cash/direct purchases that had no formal supplier_invoices row so Supplier Ledger is 100% complete
    for (const req of nextRequests) {
      if (
        (req.status === 'purchased_pending_receipt' || req.status === 'approved') &&
        !formalRequestIds.has(req.id) &&
        req.totalAmount > 0
      ) {
        const actor = resolvePurchaseActor(req.requestedBy, req.purchaserName, dir);
        ledgerInvoices.push({
          id: `req-only-${req.id}`,
          requestId: req.id,
          supplierId: req.supplierId,
          supplierName: req.supplierName || 'شراء نقدي / مباشر',
          number: req.invoiceNumber || req.requestNo,
          date: req.effectiveDate,
          dueDate: req.dueDate,
          total: req.totalAmount,
          paid: req.paidAmount,
          status: req.paidAmount >= req.totalAmount ? 'paid' : 'issued',
          storagePath: req.invoiceStoragePath,
          recordedByName: actor.displayName,
        });
      }
    }

    setInvoices(ledgerInvoices);

    if (!paymentRes.error) {
      setPayments(
        records(paymentRes.data).map((p) => {
          const actor = resolvePurchaseActor(String(p.created_by ?? ''), '', dir);
          return {
            id: String(p.id),
            invoiceId: String(p.supplier_invoice_id ?? ''),
            paymentDate: String(p.payment_date ?? ''),
            amount: number(p.amount),
            paymentMethod: String(p.payment_method ?? 'cash'),
            referenceNo: String(p.reference_no ?? ''),
            recordedByName: actor.displayName,
          };
        }),
      );
    }

    if (approvalRes.error) {
      setPendingApprovals([]);
    } else {
      setPendingApprovals(
        records(approvalRes.data).map((row) => ({
          id: String(row.id),
          requestId: String(row.purchase_request_id),
          totalAmount: number(row.total_amount),
          approvalLimit: number(row.approval_limit),
          requestedBy: String(row.requested_by ?? ''),
          notes: String(row.notes ?? ''),
          createdAt: String(row.created_at),
        })),
      );
    }

    setLoading(false);
  }, [authenticatedName, brandId, role, user?.id]);

  useEffect(() => {
    void load();
  }, [load, externalRefreshTick]);

  useSupabaseRealtimeRefresh({
    enabled: Boolean(brandId),
    channelName: `procurement-center-${brandId}`,
    tables: [
      { table: 'inventory_purchase_requests', filter: `brand_id=eq.${brandId}` },
      { table: 'inventory_purchase_request_lines' },
      { table: 'supplier_invoices', filter: `brand_id=eq.${brandId}` },
      { table: 'supplier_payments', filter: `brand_id=eq.${brandId}` },
    ],
    onRefresh: load,
  });

  const shortages = useMemo(
    () =>
      items
        .filter((item) => item.minStock > 0 && item.onHand <= item.minStock)
        .sort((left, right) => left.onHand - left.minStock - (right.onHand - right.minStock)),
    [items],
  );

  const pending = useMemo(
    () =>
      allRequests.filter(
        (request) =>
          request.status === 'pending_procurement' || request.status === 'pending_store_approval',
      ),
    [allRequests],
  );

  const unifiedKpis = useMemo(
    () =>
      computeUnifiedProcurementKpis({
        requests: allRequests,
        invoices,
        shortagesCount: shortages.length,
      }),
    [allRequests, invoices, shortages.length],
  );

  const recordedByOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const req of allRequests) {
      const actor = resolvePurchaseActor(req.requestedBy, req.purchaserName, userDirectory);
      const key = actor.userId || `name:${actor.displayName}`;
      if (!map.has(key)) {
        map.set(key, actor.displayName);
      }
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [allRequests, userDirectory]);

  const effectiveDateBounds = useMemo(
    () => resolveDateRangeForPreset(datePreset, customFromDate, customToDate),
    [customFromDate, customToDate, datePreset],
  );

  const filteredRequests = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return allRequests.filter((req) => {
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (
        !matchesCairoDateRange(req.effectiveDate, effectiveDateBounds.from, effectiveDateBounds.to)
      ) {
        return false;
      }
      if (actorFilter !== 'all') {
        const actor = resolvePurchaseActor(req.requestedBy, req.purchaserName, userDirectory);
        const key = actor.userId || `name:${actor.displayName}`;
        if (key !== actorFilter) return false;
      }
      if (!q) return true;
      const actor = resolvePurchaseActor(req.requestedBy, req.purchaserName, userDirectory);
      return (
        req.requestNo.toLowerCase().includes(q) ||
        req.supplierName.toLowerCase().includes(q) ||
        req.purchaserName.toLowerCase().includes(q) ||
        actor.displayName.toLowerCase().includes(q) ||
        req.invoiceNumber.toLowerCase().includes(q) ||
        req.lines.some((l) => l.itemName.toLowerCase().includes(q))
      );
    });
  }, [actorFilter, allRequests, effectiveDateBounds, searchText, statusFilter, userDirectory]);

  const filteredPeriodTotals = useMemo(() => {
    const valid = filteredRequests.filter((r) => r.status !== 'rejected');
    const total = valid.reduce((s, r) => s + r.totalAmount, 0);
    const paid = valid.reduce((s, r) => s + r.paidAmount, 0);
    const spikeCount = valid.reduce(
      (s, r) =>
        s +
        r.lines.filter(
          (l) => evaluatePriceVariance(number(l.unitCost), l.referencePrice).kind === 'spike',
        ).length,
      0,
    );
    return {
      count: valid.length,
      total: Math.round(total * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      remaining: Math.round(Math.max(0, total - paid) * 100) / 100,
      spikeCount,
    };
  }, [filteredRequests]);

  const paginatedRequests = useMemo(
    () => filteredRequests.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredRequests, page],
  );

  const latestPrices = useMemo(() => {
    const sorted = allRequests
      .filter((request) => request.purchasedAt || request.status === 'approved')
      .sort((left, right) =>
        (right.purchasedAt || right.createdAt).localeCompare(left.purchasedAt || left.createdAt),
      );
    const latestByItem = new Map<
      string,
      { itemName: string; supplierName: string; date: string; price: number }
    >();
    sorted.forEach((request) =>
      request.lines.forEach((line) => {
        if (!latestByItem.has(line.itemId) && number(line.unitCost) > 0) {
          latestByItem.set(line.itemId, {
            itemName: line.itemName,
            supplierName: request.supplierName,
            date: request.effectiveDate,
            price: number(line.unitCost),
          });
        }
      }),
    );
    return Array.from(latestByItem.values());
  }, [allRequests]);

  const setExecutionLine = (requestId: string, lineId: string, patch: Partial<PurchaseLine>) => {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...current[requestId],
        lines: (current[requestId]?.lines ?? []).map((line) =>
          line.id === lineId ? { ...line, ...patch } : line,
        ),
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
    if (
      !draft?.purchaserName.trim() ||
      draft.lines.length === 0 ||
      draft.lines.some(
        (line) =>
          !isFiniteValue(line.quantity) ||
          !isFiniteValue(line.unitCost) ||
          number(line.quantity) <= 0 ||
          number(line.unitCost) < 0,
      )
    ) {
      toast.error('أدخل اسم المشتري والكمية والسعر الفعلي لكل بند');
      return;
    }
    if (![draft.taxAmount, draft.discountAmount, draft.paidAmount].every(isFiniteValue)) {
      toast.error('أدخل أرقامًا صحيحة للضريبة والخصم والمبلغ المدفوع');
      return;
    }
    const subtotal = draft.lines.reduce(
      (sum, line) => sum + number(line.quantity) * number(line.unitCost),
      0,
    );
    const total = Math.max(0, subtotal + number(draft.taxAmount) - number(draft.discountAmount));
    const paid = number(draft.paidAmount);
    if (number(draft.taxAmount) < 0 || number(draft.discountAmount) < 0 || paid < 0 || paid > total) {
      toast.error('راجع الضريبة والخصم والمبلغ المدفوع؛ لا يجوز أن يتجاوز المدفوع إجمالي الفاتورة');
      return;
    }

    setSavingId(request.id);
    let storagePath = '';
    try {
      const invoiceNumber = draft.invoiceNumber.trim();
      if (invoiceNumber) {
        const { data: duplicateData } = await asSupabaseLooseClient(supabase)
          .from('supplier_invoices')
          .select('id')
          .eq('brand_id', brandId)
          .eq('invoice_number', invoiceNumber)
          .limit(1);
        if (records(duplicateData).length > 0) {
          throw new Error(
            `رقم الفاتورة "${invoiceNumber}" مسجل مسبقًا لهذه العلامة؛ راجع سجل الفواتير لتجنب التكرار.`,
          );
        }
      }
      storagePath = await uploadInvoice(draft.invoiceFile, brandId);
      const { error } = await asSupabaseLooseClient(supabase).rpc(
        'inventory_complete_procurement_purchase_v2',
        {
          _request_id: request.id,
          _supplier_id: draft.supplierId || null,
          _supplier_name:
            suppliers.find((supplier) => supplier.id === draft.supplierId)?.name ??
            request.supplierName,
          _purchaser_name: draft.purchaserName.trim(),
          _lines: draft.lines.map((line) => ({
            line_id: line.id,
            quantity: number(line.quantity),
            unit_cost: number(line.unitCost),
            batch_no: line.batchNo,
            expiry_date: line.expiryDate || null,
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
          _auto_receive: draft.autoReceive ?? true,
        },
      );
      if (error) throw new Error(error.message);
      toast.success(
        draft.autoReceive !== false
          ? 'تم تنفيذ الشراء وإضافة الكميات إلى رصيد المخزون المتاح فوراً'
          : 'تم تسجيل الشراء والفاتورة وإرسال البنود إلى استلام المخزن',
      );
      await load();
    } catch (error) {
      if (storagePath) await supabase.storage.from('supplier-invoices').remove([storagePath]);
      toast.error(error instanceof Error ? error.message : 'تعذر إكمال الشراء');
    } finally {
      setSavingId('');
    }
  };

  const handleDirectMultiPurchase = async (submission: DirectMultiPurchaseSubmission) => {
    if (!brandId) return false;
    let storagePath = '';
    try {
      if (submission.invoiceNumber) {
        const { data: dup } = await asSupabaseLooseClient(supabase)
          .from('supplier_invoices')
          .select('id')
          .eq('brand_id', brandId)
          .eq('invoice_number', submission.invoiceNumber)
          .limit(1);
        if (records(dup).length > 0) {
          toast.error(`رقم الفاتورة "${submission.invoiceNumber}" مسجل مسبقاً`);
          return false;
        }
      }

      // Create any inline new items first (deduplicating repeated names & matching existing catalog)
      const normKey = (v: string) =>
        v
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[\u064B-\u065F\u0670]/g, '')
          .replace(/[أإآ]/g, 'ا')
          .replace(/ى/g, 'ي')
          .replace(/ة/g, 'ه')
          .replace(/\s+/g, ' ')
          .trim();
      const normCat = (c?: string) =>
        c === 'protein'
          ? 'proteins'
          : c === 'vegetable'
            ? 'vegetables'
            : c === 'carbohydrate'
              ? 'carbohydrates'
              : c === 'sauce'
                ? 'sauces'
                : c === 'beverage'
                  ? 'beverages'
                  : c === 'finished_product'
                    ? 'finished_products'
                    : c || 'other';
      const existingItemByKey = new Map(items.map((it) => [normKey(it.name), it.id]));
      const createdInInvoice = new Map<string, string>();
      const resolvedLines: Array<{
        item_id: string;
        quantity: number;
        unit_cost: number;
        location_name: string;
        notes: string;
        batch_no: string;
        expiry_date: string | null;
      }> = [];

      for (const line of submission.lines) {
        let targetItemId = line.itemId;
        if (!targetItemId && line.newItemName) {
          const k = normKey(line.newItemName);
          const alreadyId = existingItemByKey.get(k) ?? createdInInvoice.get(k);
          if (alreadyId) {
            targetItemId = alreadyId;
          } else {
            const unit = line.newItemUnit ?? 'kg';
            const { data: newId, error: createErr } = await asSupabaseLooseClient(supabase).rpc(
              'inventory_create_item_v2',
              {
                _brand_id: brandId,
                _item_code:
                  line.newItemName.replace(/\s+/g, '-').slice(0, 10).toUpperCase() +
                  '-' +
                  Date.now().toString().slice(-5),
                _name: line.newItemName,
                _category: normCat(line.newItemCategory),
                _purchase_unit: unit,
                _usage_unit: unit,
                _conversion_factor: 1,
                _min_stock: Math.round(line.quantity * 0.2 * 1000) / 1000,
                _location_name: 'main',
                _opening_quantity: 0,
                _opening_unit_cost: line.unitCost,
                _notes: 'أُنشئ مباشرة من فاتورة شراء مباشر',
              },
            );
            if (createErr || !newId) {
              throw new Error(createErr?.message || `تعذر تعريف الصنف الجديد "${line.newItemName}"`);
            }
            targetItemId = String(newId);
            createdInInvoice.set(k, targetItemId);
          }
        }

        resolvedLines.push({
          item_id: targetItemId,
          quantity: line.quantity,
          unit_cost: line.unitCost,
          location_name: 'main',
          notes: submission.notes,
          batch_no: line.batchNo,
          expiry_date: line.expiryDate || null,
        });
      }

      storagePath = await uploadInvoice(submission.invoiceFile, brandId);
      const { error } = await asSupabaseLooseClient(supabase).rpc(
        'inventory_record_procurement_direct_purchase_v2',
        {
          _brand_id: brandId,
          _supplier_id: submission.supplierId || null,
          _supplier_name: submission.supplierName,
          _purchaser_name: submission.purchaserName,
          _lines: resolvedLines,
          _notes: submission.notes || 'شراء مباشر من مركز المشتريات',
          _invoice_number: submission.invoiceNumber,
          _invoice_date: submission.invoiceDate || null,
          _due_date: submission.dueDate || null,
          _tax_amount: submission.taxAmount,
          _discount_amount: submission.discountAmount,
          _paid_amount: submission.paidAmount,
          _payment_method: submission.paymentMethod,
          _invoice_storage_path: storagePath,
          _auto_receive: submission.autoReceive ?? true,
        },
      );
      if (error) throw new Error(error.message);
      toast.success(
        submission.autoReceive !== false
          ? 'تم حفظ فاتورة الشراء المباشر وإضافة الكميات إلى رصيد المخزون المتاح فوراً'
          : 'تم تسجيل فاتورة الشراء المباشر وإشعار المخزن لاعتماد الاستلام',
      );
      await load();
      return true;
    } catch (error) {
      if (storagePath) await supabase.storage.from('supplier-invoices').remove([storagePath]);
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل فاتورة الشراء المباشر');
      return false;
    }
  };

  const openInlineReceiptModal = (request: PurchaseRequest) => {
    const initial: Record<string, InlineReceiptLineDraft> = {};
    for (const line of request.lines) {
      const rem = Math.max(0, number(line.quantity) - line.receivedQuantity - line.rejectedQuantity);
      initial[line.id] = {
        receivedQuantity: String(rem),
        rejectedQuantity: '0',
        rejectionReason: '',
        batchNo: line.batchNo,
        expiryDate: line.expiryDate,
      };
    }
    setReceiptLineDrafts(initial);
    setReceiptNotes('');
    setReceiptDate(today());
    setReceiptTarget(request);
  };

  const submitInlineReceipt = async () => {
    if (!receiptTarget) return;
    const payloadLines = receiptTarget.lines
      .map((line) => {
        const d = receiptLineDrafts[line.id];
        return {
          line_id: line.id,
          itemName: line.itemName,
          remaining: Math.max(0, number(line.quantity) - line.receivedQuantity - line.rejectedQuantity),
          received_quantity: number(d?.receivedQuantity ?? 0),
          rejected_quantity: number(d?.rejectedQuantity ?? 0),
          rejection_reason: (d?.rejectionReason ?? '').trim(),
          batch_no: (d?.batchNo ?? '').trim(),
          expiry_date: d?.expiryDate || null,
          location_name: line.locationName || 'main',
        };
      })
      .filter((l) => l.received_quantity > 0 || l.rejected_quantity > 0);

    if (payloadLines.length === 0) {
      toast.error('أدخل كمية مقبولة أو مرفوضة لبند واحد على الأقل');
      return;
    }

    for (const l of payloadLines) {
      if (l.received_quantity < 0 || l.rejected_quantity < 0 || l.received_quantity + l.rejected_quantity > l.remaining + 0.0001) {
        toast.error(`الكمية المدخلة للصنف "${l.itemName}" تتجاوز المتبقي (${l.remaining})`);
        return;
      }
      if (l.rejected_quantity > 0 && !l.rejection_reason) {
        toast.error(`اكتب سبب رفض الكمية التالفة/المرفوضة للصنف "${l.itemName}"`);
        return;
      }
    }

    setReceivingSaving(true);
    const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_receive_purchase_request_v2', {
      _request_id: receiptTarget.id,
      _lines: payloadLines.map((l) => ({
        line_id: l.line_id,
        received_quantity: l.received_quantity,
        rejected_quantity: l.rejected_quantity,
        rejection_reason: l.rejection_reason,
        batch_no: l.batch_no,
        expiry_date: l.expiry_date,
        location_name: l.location_name,
      })),
      _received_by: authenticatedName,
      _receipt_date: receiptDate,
      _notes: receiptNotes.trim(),
    });
    setReceivingSaving(false);

    if (error) {
      toast.error(error.message || 'تعذر اعتماد استلام المخزن');
      return;
    }

    toast.success('تم اعتماد استلام المشتريات وإضافة الكميات المقبولة إلى رصيد المخزن');
    setReceiptTarget(null);
    await load();
  };

  const submitOwnerCancelOrReturn = async () => {
    if (!cancelTarget || !isOwner) return;
    if (!cancelReason.trim()) {
      toast.error('اكتب سبب الإلغاء أو المرتجع لتوثيقه في سجل المراجعة');
      return;
    }

    setCancellingSaving(true);
    const client = asSupabaseLooseClient(supabase);
    try {
      // If items already entered warehouse stock, deduct the received stock safely via inventory_apply_movement
      if (cancelTarget.status === 'approved' || cancelTarget.lines.some((l) => l.receivedQuantity > 0)) {
        for (const line of cancelTarget.lines) {
          if (line.receivedQuantity > 0) {
            const item = items.find((i) => i.id === line.itemId);
            const factor = item && item.conversionFactor > 0 ? item.conversionFactor : 1;
            const usageQtyToReverse = Math.round(line.receivedQuantity * factor * 1000) / 1000;
            const { error: movErr } = await client.rpc('inventory_apply_movement', {
              _brand_id: brandId,
              _item_id: line.itemId,
              _movement_type: 'adjustment',
              _quantity: usageQtyToReverse,
              _unit_cost: number(line.unitCost) / factor,
              _location_name: line.locationName || 'main',
              _notes: `مرتجع مشتريات للمورد (${cancelTarget.requestNo}): ${cancelReason.trim()}`,
              _reference_table: 'inventory_purchase_requests',
              _reference_id: cancelTarget.id,
            });
            if (movErr) {
              throw new Error(movErr.message || `تعذر خصم كمية المرتجع للصنف "${line.itemName}" من الرصيد المتاح`);
            }
          }
        }
      }

      const updatedNotes = [
        cancelTarget.notes,
        `[مرتجع / إلغاء بواسطة ${authenticatedName}: ${cancelReason.trim()}]`,
      ]
        .filter(Boolean)
        .join(' — ');

      const { error: updErr } = await client
        .from('inventory_purchase_requests')
        .update({
          status: 'rejected',
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          notes: updatedNotes,
        })
        .eq('id', cancelTarget.id);

      if (updErr) throw new Error(updErr.message);

      // Mark linked supplier invoice void/cancelled if any
      await client
        .from('supplier_invoices')
        .update({ status: 'cancelled', notes: updatedNotes })
        .eq('purchase_request_id', cancelTarget.id);

      toast.success('تم تنفيذ الإلغاء / المرتجع وتحديث المخزون والمصروفات وسجل المراجعة');
      setCancelTarget(null);
      setCancelReason('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إتمام عملية المرتجع / الإلغاء');
    } finally {
      setCancellingSaving(false);
    }
  };

  const sendShortagesViaWhatsApp = () => {
    const supplier = suppliers.find((s) => s.id === shortageSupplierId);
    if (!supplier || !supplier.phone.trim()) {
      toast.error('اختر مورداً مسجلاً له رقم هاتف أولاً لإرسال الطلب عبر واتساب');
      return;
    }
    const selectedLines = Object.entries(selectedShortages)
      .filter(([, q]) => number(q) > 0)
      .map(([itemId, q]) => {
        const item = items.find((i) => i.id === itemId);
        return {
          itemName: item?.name ?? 'صنف',
          quantity: number(q),
          unit: item?.purchaseUnit ?? '',
        };
      });
    if (selectedLines.length === 0) {
      toast.error('حدد صنفاً واحداً على الأقل من النواقص');
      return;
    }
    const waUrl = buildSupplierWhatsAppPurchaseOrderUrl({
      supplierName: supplier.name,
      supplierPhone: supplier.phone,
      hubName,
      notes: shortageNotes,
      lines: selectedLines,
    });
    if (!waUrl) {
      toast.error('رقم هاتف المورد غير صالح لإرسال واتساب');
      return;
    }
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const sendRequestViaWhatsApp = (request: PurchaseRequest) => {
    const supplier =
      suppliers.find((s) => s.id === request.supplierId) ??
      suppliers.find((s) => s.name.trim() === request.supplierName.trim());
    if (!supplier?.phone) {
      toast.error('لا يوجد رقم هاتف مسجل لهذا المورد في دليل الموردين');
      return;
    }
    const url = buildSupplierWhatsAppPurchaseOrderUrl({
      supplierName: supplier.name,
      supplierPhone: supplier.phone,
      hubName,
      requestNo: request.requestNo,
      notes: request.notes,
      lines: request.lines.map((l) => ({
        itemName: l.itemName,
        quantity: number(l.quantity),
        unit: l.unit,
      })),
    });
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const submitShortages = async () => {
    const selectedEntries = Object.entries(selectedShortages);
    if (selectedEntries.some(([, quantity]) => !isFiniteValue(quantity))) {
      toast.error('أدخل كميات رقمية صحيحة للأصناف المحددة');
      return;
    }
    const lines = selectedEntries
      .filter(([, quantity]) => number(quantity) > 0)
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
    setActiveTab('execution');
    await load();
  };

  const submitAutoReorder = async (
    lines: Array<{ itemId: string; quantity: number; unitCost: number; supplierId: string }>,
    orderNotes: string,
  ) => {
    if (!brandId || lines.length === 0) {
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
    setActiveTab('execution');
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
    setSupplierDraft({
      id: '',
      name: '',
      phone: '',
      email: '',
      paymentTerms: '',
      leadTimeDays: '0',
      notes: '',
    });
    await load();
  };

  const handleRecordSupplierPayment = async (
    invoice: LedgerInvoiceRow,
    amount: number,
    method: 'cash' | 'bank_transfer' | 'credit',
    reference: string,
  ) => {
    const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_record_supplier_payment', {
      _invoice_id: invoice.id,
      _amount: amount,
      _payment_method: method,
      _payment_date: today(),
      _reference_no: reference,
      _notes: '',
    });
    if (error) {
      toast.error(error.message || 'تعذر تسجيل دفعة المورد');
      return;
    }
    toast.success('تم تسجيل دفعة المورد وتحديث كشف الحساب');
    await load();
  };

  const exportHistoryExcelOrCsv = async () => {
    try {
      const XLSX = await import('xlsx');
      const rows = filteredRequests.map((req) => {
        const actor = resolvePurchaseActor(req.requestedBy, req.purchaserName, userDirectory);
        const receiver = req.reviewedBy
          ? resolvePurchaseActor(req.reviewedBy, '', userDirectory).displayName
          : '—';
        return {
          'التاريخ الفعلي': req.effectiveDate,
          'وقت التسجيل': formatCairoDateTime(req.createdAt),
          'رقم العملية': req.requestNo,
          'المورد': req.supplierName || '—',
          'سجّله على السيستم': actor.displayName,
          'القائم بالشراء': req.purchaserName || actor.displayName,
          'استلمه بالمخزن': receiver,
          'عدد الأصناف': req.lines.length,
          'تفاصيل الأصناف': req.lines
            .map((l) => `${l.itemName} (${l.quantity} ${formatCleanUnitLabel(l.unit).unitShort} × ${l.unitCost})`)
            .join(' | '),
          'الإجمالي (ج.م)': req.totalAmount,
          'المدفوع (ج.م)': req.paidAmount,
          'المتبقي (ج.م)': Math.max(0, req.totalAmount - req.paidAmount),
          'الحالة': statusLabel(req.status),
          'رقم الفاتورة': req.invoiceNumber || '—',
        };
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'سجل المشتريات');
      XLSX.writeFile(wb, `purchases-${datePreset}-${today()}.xlsx`);
      toast.success('تم تصدير سجل المشتريات التفصيلي إلى ملف Excel');
    } catch {
      toast.error('تعذر تصدير الملف');
    }
  };

  const openInvoice = async (path: string) => {
    const { data, error } = await supabase.storage.from('supplier-invoices').createSignedUrl(path, 60);
    if (error) {
      toast.error(error.message || 'تعذر فتح الفاتورة');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const cleanupOrphanInvoices = async () => {
    if (!brandId) return;
    setCleaningOrphans(true);
    try {
      const { data, error } = await asSupabaseLooseClient(supabase).rpc(
        'inventory_find_orphan_invoice_files',
        { _brand_id: brandId },
      );
      if (error) throw new Error(error.message);
      const paths = records(data)
        .map((row) => String(row.storage_path ?? ''))
        .filter(Boolean);
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

  const pages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === 'active');

  const toggleExpandRequest = (id: string) => {
    setExpandedRequestIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-5" dir="rtl">
      <AppLayoutHeaderPortal>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs font-semibold gap-1.5 rounded-lg"
            onClick={() => setPrintOrderOpen(true)}
          >
            <Printer className="h-3.5 w-3.5" />
            <span>طباعة طلب مشتريات</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs font-semibold gap-1.5 rounded-lg"
            onClick={() => void exportHistoryExcelOrCsv()}
            disabled={!filteredRequests.length}
          >
            <Download className="h-3.5 w-3.5" />
            <span>تصدير Excel تفصيلي</span>
          </Button>
          <Button
            size="sm"
            className="h-9 text-xs font-semibold gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            onClick={() => setDirectOpen(true)}
            disabled={!brandId}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ فاتورة شراء مباشر</span>
          </Button>
        </div>
      </AppLayoutHeaderPortal>

      {/* Unified Clean 5-Card Interactive Bento KPI Strip (Replaces duplicated 9 cards) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-stretch">
        <button
          type="button"
          onClick={() => {
            setActiveTab('history');
            setDatePreset(unifiedKpis.todayCount > 0 ? 'today' : 'yesterday');
            setPage(0);
          }}
          className="group rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/60 to-white p-4 text-right shadow-2xs transition-all hover:border-emerald-400 hover:shadow-sm cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900">مشتريات اليوم</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-extrabold text-slate-900 tabular-nums tracking-tight">
              {money(unifiedKpis.todaySpend)}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500 tabular-nums flex items-center justify-between">
              <span>إمبارح: {money(unifiedKpis.yesterdaySpend)}</span>
              <span className="text-emerald-700 font-bold group-hover:underline">مراجعة ←</span>
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('history');
            setDatePreset('this_month');
            setPage(0);
          }}
          className="group rounded-2xl border border-slate-200/90 bg-white p-4 text-right shadow-2xs transition-all hover:border-slate-300 hover:shadow-sm cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">مشتريات الشهر الحالي</span>
            <div className="h-8 w-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-extrabold text-slate-900 tabular-nums tracking-tight">
              {money(unifiedKpis.monthSpend)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
              {unifiedKpis.monthCount} فاتورة منفذة هذا الشهر
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('history');
            setDatePreset('all');
            setStatusFilter('purchased_pending_receipt');
            setPage(0);
          }}
          className={cn(
            'group rounded-2xl border p-4 text-right shadow-2xs transition-all hover:shadow-sm cursor-pointer flex flex-col justify-between',
            unifiedKpis.pendingReceiptCount > 0
              ? 'border-sky-300 bg-sky-50/40 hover:border-sky-400'
              : 'border-slate-200/90 bg-white hover:border-slate-300',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-900">بانتظار استلام المخزن</span>
            <div className="h-8 w-8 rounded-xl bg-sky-100/80 text-sky-700 flex items-center justify-center">
              <PackageCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-extrabold text-slate-900 tabular-nums tracking-tight">
              {unifiedKpis.pendingReceiptCount} شحنة
            </p>
            <p className="mt-1 text-[11px] text-sky-800/80 tabular-nums">
              بقيمة {money(unifiedKpis.pendingReceiptValue)}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={cn(
            'group rounded-2xl border p-4 text-right shadow-2xs transition-all hover:shadow-sm cursor-pointer flex flex-col justify-between',
            unifiedKpis.unpaidTotal > 0
              ? 'border-rose-200 bg-rose-50/30 hover:border-rose-300'
              : 'border-slate-200/90 bg-white hover:border-slate-300',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-900">مديونيات الموردين (الآجل)</span>
            <div className="h-8 w-8 rounded-xl bg-rose-100/70 text-rose-700 flex items-center justify-center">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-extrabold text-slate-900 tabular-nums tracking-tight">
              {money(unifiedKpis.unpaidTotal)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
              {unifiedKpis.dueSoonCount > 0
                ? `${unifiedKpis.dueSoonCount} فاتورة تستحق خلال 3 أيام`
                : 'لا توجد متأخرات قريبة'}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shortages')}
          className={cn(
            'group rounded-2xl border p-4 text-right shadow-2xs transition-all hover:shadow-sm cursor-pointer flex flex-col justify-between',
            unifiedKpis.shortagesCount > 0
              ? 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
              : 'border-slate-200/90 bg-white hover:border-slate-300',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-950">نواقص المخزن الحرجة</span>
            <div className="h-8 w-8 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center">
              <ShoppingBasket className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-extrabold text-slate-900 tabular-nums tracking-tight">
              {unifiedKpis.shortagesCount} صنف
            </p>
            <p className="mt-1 text-[11px] text-amber-800/90 tabular-nums">
              {pending.length > 0 ? `${pending.length} طلب شراء بانتظار التنفيذ` : 'جاهز لإنشاء طلب توريد'}
            </p>
          </div>
        </button>
      </div>

      {pendingApprovals.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-amber-600" />
              طلبات شراء بانتظار الاعتماد الإداري ({pendingApprovals.length})
            </CardTitle>
            <CardDescription className="text-xs">
              تتجاوز هذه الطلبات حد الاعتماد التلقائي وتحتاج مراجعة مدير مختلف عن مُنشئ الطلب.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {pendingApprovals.map((approval) => {
              const requester = resolvePurchaseActor(approval.requestedBy, '', userDirectory);
              return (
                <div
                  key={approval.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3"
                >
                  <div>
                    <strong className="text-sm">{money(approval.totalAmount)}</strong>
                    <span className="mx-2 text-xs text-slate-500">
                      (حد الاعتماد: {money(approval.approvalLimit)}) · طلب بواسطة: {requester.displayName}
                    </span>
                    <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                      {formatCairoDateTime(approval.createdAt)}
                      {approval.notes ? ` — ${approval.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={savingId === approval.id}
                      onClick={() => void reviewApproval(approval.id, true)}
                    >
                      اعتماد
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={savingId === approval.id}
                      onClick={() => void reviewApproval(approval.id, false)}
                    >
                      رفض
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1.5 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-2xs">
          <TabsTrigger value="history" className="rounded-xl px-3.5 py-2 text-xs font-bold gap-1.5">
            <span>سجل المشتريات والمتابعة</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 tabular-nums">
              {allRequests.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="shortages" className="rounded-xl px-3.5 py-2 text-xs font-bold gap-1.5">
            <span>النواقص وطلبات الشراء</span>
            {shortages.length > 0 && (
              <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 tabular-nums">
                {shortages.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="execution" className="rounded-xl px-3.5 py-2 text-xs font-bold gap-1.5">
            <span>تنفيذ أوامر الشراء</span>
            {pending.length > 0 && (
              <Badge className="bg-sky-600 text-white text-[10px] px-1.5 py-0 tabular-nums">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-xl px-3.5 py-2 text-xs font-bold">
            كشف حساب الموردين والفواتير
          </TabsTrigger>
          <TabsTrigger value="prices" className="rounded-xl px-3.5 py-2 text-xs font-bold">
            تحليل ومقارنة الأسعار
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="rounded-xl px-3.5 py-2 text-xs font-bold">
            دليل الموردين ({suppliers.length})
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* TAB 1: PURCHASE HISTORY, YESTERDAY REVIEW & VERIFIED ACTORS      */}
        {/* ================================================================ */}
        <TabsContent value="history" className="space-y-4">
          {/* Quick Date Presets ("مشتريات إمبارح" / "اليوم" / ...) + Filters */}
          <Card className="p-4 space-y-3.5 border-slate-200/90">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1 ml-1">
                  <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
                  مراجعة سريعة:
                </span>
                {(['all', 'today', 'yesterday', 'last_7_days', 'this_month', 'custom'] as ProcurementDatePreset[]).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setDatePreset(preset);
                        setPage(0);
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-bold transition-all cursor-pointer',
                        datePreset === preset
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-2xs'
                          : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100',
                      )}
                    >
                      {DATE_PRESET_LABELS[preset]}
                    </button>
                  ),
                )}
              </div>

              {statusFilter !== 'all' || actorFilter !== 'all' || datePreset !== 'all' || searchText ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-slate-500 hover:text-slate-900"
                  onClick={() => {
                    setDatePreset('all');
                    setStatusFilter('all');
                    setActorFilter('all');
                    setSearchText('');
                    setCustomFromDate('');
                    setCustomToDate('');
                    setPage(0);
                  }}
                >
                  إعادة ضبط الفلاتر
                </Button>
              ) : null}
            </div>

            {datePreset === 'custom' && (
              <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-slate-100">
                <div className="space-y-1">
                  <Label className="text-xs">من تاريخ</Label>
                  <Input
                    type="date"
                    className="h-9 text-xs tabular-nums"
                    value={customFromDate}
                    onChange={(e) => {
                      setCustomFromDate(e.target.value);
                      setPage(0);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">إلى تاريخ</Label>
                  <Input
                    type="date"
                    className="h-9 text-xs tabular-nums"
                    value={customToDate}
                    onChange={(e) => {
                      setCustomToDate(e.target.value);
                      setPage(0);
                    }}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3 pt-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  className="h-9 pr-9 text-xs"
                  placeholder="ابحث باسم صنف، مورد، رقم فاتورة، أو موظف..."
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(0);
                  }}
                />
              </div>

              <select
                aria-label="فلترة حسب الموظف المسجل"
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
                value={actorFilter}
                onChange={(e) => {
                  setActorFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">كل الموظفين (مُسجّلي العمليات)</option>
                {recordedByOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    سجّله: {opt.label}
                  </option>
                ))}
              </select>

              <select
                aria-label="تصفية حسب الحالة"
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">كل حالات الشراء والاستلام</option>
                <option value="purchased_pending_receipt">بانتظار استلام المخزن</option>
                <option value="approved">تم الاستلام في المخزن</option>
                <option value="pending_procurement">أمر شراء بانتظار التنفيذ</option>
                <option value="rejected">ملغي / مرتجع</option>
              </select>
            </div>

            {/* Filtered Period Live Totals Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2 text-xs tabular-nums">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold text-slate-700">
                  نتائج ({DATE_PRESET_LABELS[datePreset]}): {filteredPeriodTotals.count} عملية
                </span>
                <span className="text-slate-900 font-extrabold">
                  إجمالي المشتريات: {money(filteredPeriodTotals.total)}
                </span>
                <span className="text-emerald-700 font-bold">
                  المدفوع: {money(filteredPeriodTotals.paid)}
                </span>
                {filteredPeriodTotals.remaining > 0 && (
                  <span className="text-rose-700 font-bold">
                    آجل متبقي: {money(filteredPeriodTotals.remaining)}
                  </span>
                )}
              </div>
              {filteredPeriodTotals.spikeCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                  <AlertTriangle className="h-3 w-3 text-amber-700" />
                  {filteredPeriodTotals.spikeCount} بند بسعر أعلى من المعتاد
                </span>
              )}
            </div>
          </Card>

          {/* Expandable Rich Purchase History Cards/Table */}
          <Card className="overflow-hidden border-slate-200/90">
            <CardContent className="p-0">
              {loading ? (
                <div className="grid min-h-40 place-items-center">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                </div>
              ) : paginatedRequests.length === 0 ? (
                <div className="py-12 text-center space-y-1">
                  <p className="text-sm font-bold text-slate-800">
                    لا توجد مشتريات مسجلة في هذه الفترة ({DATE_PRESET_LABELS[datePreset]})
                  </p>
                  <p className="text-xs text-slate-500">
                    جرّب اختيار «كل الفترات» أو «إمبارح» أو سجل فاتورة جديدة من الأعلى.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-right text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/90 text-xs text-slate-600">
                        <th className="px-3.5 py-3 font-bold">التاريخ والوقت</th>
                        <th className="px-3.5 py-3 font-bold">رقم العملية والمصدر</th>
                        <th className="px-3.5 py-3 font-bold">المورد والأصناف</th>
                        <th className="px-3.5 py-3 font-bold">سجّله بالحساب (تلقائي)</th>
                        <th className="px-3.5 py-3 text-center font-bold">الإجمالي والسداد</th>
                        <th className="px-3.5 py-3 text-center font-bold">حالة المخزن</th>
                        <th className="px-3.5 py-3 text-center font-bold">تفاصيل وإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRequests.map((request) => {
                        const isExpanded = Boolean(expandedRequestIds[request.id]);
                        const recordedActor = resolvePurchaseActor(
                          request.requestedBy,
                          request.purchaserName,
                          userDirectory,
                        );
                        const receivedActor = request.reviewedBy
                          ? resolvePurchaseActor(request.reviewedBy, '', userDirectory)
                          : null;
                        const srcBadge = classifyPurchaseSource(request.source, request.notes);
                        const remainingAmt = Math.max(
                          0,
                          Math.round((request.totalAmount - request.paidAmount) * 100) / 100,
                        );
                        const spikeLinesCount = request.lines.filter(
                          (l) =>
                            evaluatePriceVariance(number(l.unitCost), l.referencePrice).kind ===
                            'spike',
                        ).length;

                        return (
                          <Fragment key={request.id}>
                            <tr
                              onClick={() => toggleExpandRequest(request.id)}
                              className={cn(
                                'border-b border-slate-100 transition-colors hover:bg-slate-50/80 cursor-pointer',
                                isExpanded && 'bg-emerald-50/25',
                                request.status === 'rejected' && 'opacity-60 bg-rose-50/20',
                              )}
                            >
                              <td className="px-3.5 py-3 tabular-nums whitespace-nowrap">
                                <div className="font-bold text-slate-900 text-xs">
                                  {request.effectiveDate}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  {formatCairoDateTime(request.purchasedAt || request.createdAt)}
                                </div>
                              </td>

                              <td className="px-3.5 py-3">
                                <div className="font-bold text-slate-900 text-xs tabular-nums">
                                  {request.requestNo}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <SourceBadge info={srcBadge} />
                                  {request.invoiceNumber && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 tabular-nums">
                                      فاتورة #{request.invoiceNumber}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="px-3.5 py-3 max-w-[240px]">
                                <div className="font-bold text-slate-900 text-xs truncate">
                                  {request.supplierName || 'مشتريات نقدية عامة'}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                                  {request.lines.length > 0
                                    ? `${request.lines.length} أصناف: ${request.lines
                                        .slice(0, 3)
                                        .map((l) => l.itemName)
                                        .join('، ')}${request.lines.length > 3 ? '...' : ''}`
                                    : 'بدون بنود'}
                                </div>
                                {spikeLinesCount > 0 && (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-300 px-2 py-0.2 text-[10px] font-bold text-amber-800">
                                    <TrendingUp className="h-3 w-3" />
                                    ارتفاع سعر ({spikeLinesCount})
                                  </span>
                                )}
                              </td>

                              <td className="px-3.5 py-3">
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50/90 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-900">
                                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                  <span>{recordedActor.displayName}</span>
                                  <span className="text-[10px] font-normal text-emerald-700">
                                    ({recordedActor.roleLabel})
                                  </span>
                                </div>
                                {request.purchaserName &&
                                  request.purchaserName.trim() !== recordedActor.displayName && (
                                    <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                                      <UserCheck className="h-3 w-3" />
                                      المندوب: {request.purchaserName}
                                    </div>
                                  )}
                                {receivedActor && request.status === 'approved' && (
                                  <div className="mt-0.5 text-[10px] text-sky-700 font-semibold">
                                    استلمه بالمخزن: {receivedActor.displayName}
                                  </div>
                                )}
                              </td>

                              <td className="px-3.5 py-3 text-center tabular-nums whitespace-nowrap">
                                <div className="text-sm font-extrabold text-slate-900">
                                  {money(request.totalAmount)}
                                </div>
                                {request.status !== 'pending_procurement' &&
                                  request.status !== 'rejected' && (
                                    <div className="mt-0.5 text-[10px] font-semibold">
                                      {remainingAmt <= 0.01 ? (
                                        <span className="text-emerald-700">مسددة بالكامل</span>
                                      ) : (
                                        <span className="text-rose-700">
                                          متبقي: {money(remainingAmt)}
                                        </span>
                                      )}
                                    </div>
                                  )}
                              </td>

                              <td className="px-3.5 py-3 text-center whitespace-nowrap">
                                <Status status={request.status} />
                              </td>

                              <td
                                className="px-3.5 py-3 text-center whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  {request.status === 'purchased_pending_receipt' && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-7 px-2.5 text-[11px] font-bold bg-sky-600 hover:bg-sky-700 text-white gap-1"
                                      onClick={() => openInlineReceiptModal(request)}
                                    >
                                      <ArrowDownToLine className="h-3 w-3" />
                                      استلام بالمخزن
                                    </Button>
                                  )}
                                  {request.invoiceStoragePath && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => void openInvoice(request.invoiceStoragePath)}
                                    >
                                      <FileText className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs gap-1"
                                    onClick={() => toggleExpandRequest(request.id)}
                                  >
                                    <span>البنود</span>
                                    {isExpanded ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Full Invoice & Items Detail Drawer */}
                            {isExpanded && (
                              <tr className="border-b border-slate-200 bg-slate-50/75">
                                <td colSpan={7} className="p-4 space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                      <span>
                                        <strong>توقيت التسجيل بالسيستم:</strong>{' '}
                                        {formatCairoDateTime(request.createdAt)}
                                      </span>
                                      {request.reviewedAt && (
                                        <span>
                                          <strong>توقيت اعتماد المخزن:</strong>{' '}
                                          {formatCairoDateTime(request.reviewedAt)}
                                        </span>
                                      )}
                                      {request.notes && (
                                        <span className="text-slate-700">
                                          <strong>الملاحظات:</strong> {request.notes}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 print:hidden">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1.5 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                                        onClick={() => sendRequestViaWhatsApp(request)}
                                      >
                                        <MessageCircle className="h-3.5 w-3.5" />
                                        مراسلة المورد واتساب
                                      </Button>
                                      {request.invoiceStoragePath && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-8 gap-1.5 text-xs"
                                          onClick={() => void openInvoice(request.invoiceStoragePath)}
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          فتح صورة / ملف الفاتورة
                                        </Button>
                                      )}
                                      {isOwner && request.status !== 'rejected' && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-8 gap-1.5 text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
                                          onClick={() => {
                                            setCancelTarget(request);
                                            setCancelReason('');
                                          }}
                                        >
                                          <RotateCcw className="h-3.5 w-3.5" />
                                          مرتجع للمورد / إلغاء العملية
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Itemized Lines Breakdown Table */}
                                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                    <table className="w-full text-right text-xs border-collapse">
                                      <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                                          <th className="px-3 py-2 font-bold">الصنف</th>
                                          <th className="px-3 py-2 text-center font-bold">الكمية المشتراة</th>
                                          <th className="px-3 py-2 text-center font-bold">سعر الوحدة</th>
                                          <th className="px-3 py-2 text-center font-bold">مؤشر السعر</th>
                                          <th className="px-3 py-2 text-center font-bold">إجمالي البند</th>
                                          <th className="px-3 py-2 text-center font-bold">المستلم بالمخزن</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {request.lines.map((line) => {
                                          const uFmt = formatCleanUnitLabel(line.unit);
                                          const qty = number(line.quantity);
                                          const cost = number(line.unitCost);
                                          const variance = evaluatePriceVariance(
                                            cost,
                                            line.referencePrice,
                                          );
                                          return (
                                            <tr
                                              key={line.id}
                                              className="border-b border-slate-100 last:border-0"
                                            >
                                              <td className="px-3 py-2.5 font-bold text-slate-900">
                                                {line.itemName}
                                                {line.itemCode && (
                                                  <span className="mr-1.5 text-[10px] font-normal text-slate-400">
                                                    ({line.itemCode})
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5 text-center tabular-nums font-semibold">
                                                <span>{qty.toLocaleString('en-US')}</span>{' '}
                                                <span>{uFmt.unitShort}</span>
                                              </td>
                                              <td className="px-3 py-2.5 text-center tabular-nums font-semibold">
                                                {money(cost)}
                                              </td>
                                              <td className="px-3 py-2.5 text-center">
                                                {variance.kind === 'spike' ? (
                                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                                    <ArrowUpRight className="h-3 w-3" />
                                                    {variance.label}
                                                  </span>
                                                ) : variance.kind === 'saving' ? (
                                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                                    <TrendingDown className="h-3 w-3" />
                                                    {variance.label}
                                                  </span>
                                                ) : (
                                                  <span className="text-[11px] text-slate-400">
                                                    {variance.label || '—'}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5 text-center tabular-nums font-extrabold text-slate-900">
                                                {money(qty * cost)}
                                              </td>
                                              <td className="px-3 py-2.5 text-center tabular-nums">
                                                {line.receivedQuantity > 0 || line.rejectedQuantity > 0 ? (
                                                  <div className="space-y-0.5">
                                                    <span className="text-emerald-700 font-bold">
                                                      مقبول: {line.receivedQuantity}
                                                    </span>
                                                    {line.rejectedQuantity > 0 && (
                                                      <span className="block text-rose-600 text-[10px]">
                                                        مرفوض: {line.rejectedQuantity} ({line.rejectionReason})
                                                      </span>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <span className="text-slate-400">لم يُستلم بعد</span>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredRequests.length > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                  >
                    السابق
                  </Button>
                  <span className="text-xs text-slate-500 tabular-nums">
                    صفحة {page + 1} من {pages} (إجمالي {filteredRequests.length} عملية)
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= pages || loading}
                    onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}
                  >
                    التالي
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 2: SHORTAGES & CLEAN RTL UNITS + 1-CLICK WHATSAPP PO         */}
        {/* ================================================================ */}
        <TabsContent value="shortages" className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPrintOrderOpen(true)}>
              <Printer className="ml-2 h-4 w-4" />
              طباعة ورقة طلب مشتريات
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              onClick={() => setAutoReorderOpen(true)}
              disabled={!brandId}
            >
              <ShoppingBasket className="ml-2 h-4 w-4" />
              إنشاء أوامر شراء ذكية تلقائياً حسب المورد
            </Button>
          </div>

          <Card className="border-slate-200/90">
            <CardHeader>
              <CardTitle className="text-base">النواقص واقتراح إعادة التوريد</CardTitle>
              <CardDescription className="text-xs">
                الكمية المقترحة تعيد الرصيد إلى ضعفي الحد الأدنى، مع تنسيق واضح للوحدات ومعاملات التحويل.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {shortages.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full text-right text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-50 text-xs text-slate-600">
                        <th className="p-3 font-bold">تحديد</th>
                        <th className="p-3 font-bold">الصنف</th>
                        <th className="p-3 text-center font-bold">الرصيد المتاح</th>
                        <th className="p-3 text-center font-bold">الحد الأدنى</th>
                        <th className="p-3 font-bold">الكمية المقترحة للشراء</th>
                        <th className="p-3 text-center font-bold">آخر تكلفة مسجلة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shortages.map((item) => {
                        const factor = item.conversionFactor > 0 ? item.conversionFactor : 1;
                        const suggested = suggestPurchaseQuantity(item.minStock, item.onHand, factor);
                        const usageFmt = formatCleanUnitLabel(item.usageUnit);
                        const purchaseFmt = formatCleanUnitLabel(item.purchaseUnit);
                        const refCost = item.lastPrice || item.averageCost * factor;

                        return (
                          <tr className="border-b last:border-0 hover:bg-slate-50/60" key={item.id}>
                            <td className="p-3">
                              <input
                                aria-label={`حدد ${item.name}`}
                                type="checkbox"
                                className="h-4 w-4 accent-emerald-600 cursor-pointer"
                                checked={item.id in selectedShortages}
                                onChange={(event) =>
                                  setSelectedShortages((current) => {
                                    const next = { ...current };
                                    if (event.target.checked)
                                      next[item.id] = String(Number(suggested.toFixed(3)));
                                    else delete next[item.id];
                                    return next;
                                  })
                                }
                              />
                            </td>
                            <td className="p-3">
                              <strong className="text-slate-900">{item.name}</strong>
                              <div className="text-[11px] text-slate-400 tabular-nums">
                                {item.code}
                                {purchaseFmt.packHint ? ` · العبوة: ${purchaseFmt.packHint}` : ''}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-800 tabular-nums">
                                <span>{item.onHand.toLocaleString('en-US')}</span>
                                <span>{usageFmt.unitShort}</span>
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 tabular-nums">
                                <span>{item.minStock.toLocaleString('en-US')}</span>
                                <span>{usageFmt.unitShort}</span>
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Input
                                  className="w-28 h-8 text-xs font-bold tabular-nums"
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  aria-label={`كمية شراء ${item.name}`}
                                  value={selectedShortages[item.id] ?? String(Number(suggested.toFixed(3)))}
                                  onChange={(event) =>
                                    setSelectedShortages((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                />
                                <Badge variant="outline" className="text-xs font-semibold">
                                  {purchaseFmt.unitShort}
                                </Badge>
                              </div>
                            </td>
                            <td className="p-3 text-center tabular-nums">
                              {refCost > 0 ? (
                                <span className="font-bold text-slate-800">{money(refCost)}</span>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] text-slate-500">
                                  لم يُشترَ من قبل
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="ممتاز — لا توجد نواقص حرجة تحت الحد الأدنى حالياً." />
              )}

              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                <Field
                  label="المورد المستهدف (للطلب أو الإرسال عبر واتساب)"
                  value={shortageSupplierId}
                  onChange={setShortageSupplierId}
                  options={activeSuppliers.map((supplier) => ({
                    value: supplier.id,
                    label: `${supplier.name}${supplier.phone ? ` (${supplier.phone})` : ''}`,
                  }))}
                  allowEmpty
                />
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">ملاحظات أمر الشراء</Label>
                  <Textarea
                    rows={1}
                    className="min-h-10 text-xs"
                    placeholder="مثال: التوريد غداً الساعة 9 صباحاً..."
                    value={shortageNotes}
                    onChange={(event) => setShortageNotes(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  onClick={() => void submitShortages()}
                  disabled={!brandId || Object.keys(selectedShortages).length === 0}
                >
                  <ShoppingBasket className="h-4 w-4" />
                  إنشاء أمر شراء مجمع
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  disabled={Object.keys(selectedShortages).length === 0 || !shortageSupplierId}
                  onClick={sendShortagesViaWhatsApp}
                >
                  <MessageCircle className="h-4 w-4" />
                  إرسال الطلب للمورد عبر واتساب
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 3: EXECUTION OF PENDING PURCHASE ORDERS                      */}
        {/* ================================================================ */}
        <TabsContent value="execution" className="space-y-4">
          {pending.length ? (
            pending.map((request) => {
              const draft = drafts[request.id];
              if (!draft) return null;
              const subtotal = draft.lines.reduce(
                (sum, line) => sum + number(line.quantity) * number(line.unitCost),
                0,
              );
              const creatorActor = resolvePurchaseActor(
                request.requestedBy,
                request.purchaserName,
                userDirectory,
              );

              return (
                <Card key={request.id} className="border-sky-200/90">
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b border-slate-100 pb-3">
                    <div>
                      <CardTitle className="text-base">
                        {request.requestNo} · {request.supplierName || 'مورد غير محدد'}
                      </CardTitle>
                      <CardDescription className="text-xs tabular-nums mt-0.5">
                        أُنشئ بواسطة: <strong>{creatorActor.displayName}</strong> في{' '}
                        {formatCairoDateTime(request.createdAt)} · {request.notes || 'بدون ملاحظات'}
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs border-emerald-300 text-emerald-800"
                      onClick={() => sendRequestViaWhatsApp(request)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      إرسال عبر واتساب للمورد
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field
                        label="المورد الفعلي"
                        value={draft.supplierId}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, supplierId: value },
                          }))
                        }
                        options={activeSuppliers.map((supplier) => ({
                          value: supplier.id,
                          label: supplier.name,
                        }))}
                        allowEmpty
                      />
                      <TextField
                        label="اسم من قام بالشراء *"
                        value={draft.purchaserName}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, purchaserName: value },
                          }))
                        }
                      />
                      <TextField
                        label="رقم الفاتورة"
                        value={draft.invoiceNumber}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, invoiceNumber: value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-3">
                      {draft.lines.map((line) => {
                        const item = items.find((entry) => entry.id === line.itemId);
                        const uFmt = formatCleanUnitLabel(line.unit);
                        return (
                          <div
                            key={line.id}
                            className="grid gap-3 rounded-xl border p-3 md:grid-cols-2 xl:grid-cols-5 bg-slate-50/40"
                          >
                            <div className="xl:col-span-1">
                              <strong>{line.itemName}</strong>
                              <p className="text-xs text-muted-foreground">
                                الوحدة: {uFmt.unitShort}
                              </p>
                            </div>
                            <NumberTextField
                              label="الكمية الفعلية"
                              value={line.quantity}
                              onChange={(value) =>
                                setExecutionLine(request.id, line.id, { quantity: value })
                              }
                            />
                            <NumberTextField
                              label="سعر وحدة الشراء"
                              value={line.unitCost}
                              onChange={(value) =>
                                setExecutionLine(request.id, line.id, { unitCost: value })
                              }
                              step="0.01"
                            />
                            <TextField
                              label="رقم الدفعة"
                              value={line.batchNo}
                              onChange={(value) =>
                                setExecutionLine(request.id, line.id, { batchNo: value })
                              }
                            />
                            <TextField
                              label="الصلاحية"
                              value={line.expiryDate}
                              type="date"
                              onChange={(value) =>
                                setExecutionLine(request.id, line.id, { expiryDate: value })
                              }
                            />
                            {item ? (
                              <div className="md:col-span-2 xl:col-span-5">
                                <ProcurementPriceAlert
                                  itemName={item.name}
                                  currentPrice={number(line.unitCost)}
                                  previousPrice={item.lastPrice}
                                  unit={item.purchaseUnit}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <NumberTextField
                        label="ضريبة الفاتورة"
                        value={draft.taxAmount}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, taxAmount: value },
                          }))
                        }
                        step="0.01"
                      />
                      <NumberTextField
                        label="الخصم"
                        value={draft.discountAmount}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, discountAmount: value },
                          }))
                        }
                        step="0.01"
                      />
                      <NumberTextField
                        label="المبلغ المدفوع"
                        value={draft.paidAmount}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, paidAmount: value },
                          }))
                        }
                        step="0.01"
                      />
                      <Field
                        label="طريقة الدفع"
                        value={draft.paymentMethod}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: {
                              ...draft,
                              paymentMethod: value as ExecutionDraft['paymentMethod'],
                            },
                          }))
                        }
                        options={paymentMethods}
                      />
                      <TextField
                        label="تاريخ الفاتورة"
                        value={draft.invoiceDate}
                        type="date"
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, invoiceDate: value },
                          }))
                        }
                      />
                      <TextField
                        label="تاريخ الاستحقاق"
                        value={draft.dueDate}
                        type="date"
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, dueDate: value },
                          }))
                        }
                      />
                      <FileField
                        label="الفاتورة (PDF أو صورة)"
                        onChange={(file) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, invoiceFile: file },
                          }))
                        }
                      />
                      <div className="self-end rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-sm tabular-nums">
                        الصافي المتوقع:{' '}
                        <strong>
                          {money(
                            Math.max(
                              0,
                              subtotal + number(draft.taxAmount) - number(draft.discountAmount),
                            ),
                          )}
                        </strong>
                      </div>
                    </div>
                    <Textarea
                      placeholder="ملاحظات التنفيذ"
                      value={draft.notes}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [request.id]: { ...draft, notes: event.target.value },
                        }))
                      }
                    />
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-right">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-emerald-600"
                        checked={draft.autoReceive ?? true}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [request.id]: { ...draft, autoReceive: event.target.checked },
                          }))
                        }
                      />
                      <div className="space-y-0.5 text-xs">
                        <div className="font-bold text-emerald-950">
                          إضافة الكميات الفعلية إلى رصيد المخزون المتاح فوراً عند الاعتماد
                        </div>
                        <p className="text-emerald-800/90">
                          يتم إيداع الأصناف في رصيد المخزن المركزي فوراً؛ ألغِ التحديد فقط إذا كانت البضاعة لم تصل بعد للمخزن.
                        </p>
                      </div>
                    </label>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={savingId === request.id}
                      onClick={() => void finishPurchase(request)}
                    >
                      {savingId === request.id ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="ml-2 h-4 w-4" />
                      )}
                      {draft.autoReceive !== false
                        ? 'اعتماد التنفيذ وإضافة الكميات للمخزون فوراً'
                        : 'اعتماد التنفيذ وإرسال للاستلام بالمخزن'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Empty text={loading ? 'جارٍ تحميل الطلبات...' : 'لا توجد أوامر شراء معلقة بانتظار التنفيذ.'} />
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 4: SUPPLIER STATEMENT & COMPLETE INVOICE ARCHIVE             */}
        {/* ================================================================ */}
        <TabsContent value="invoices">
          <SupplierStatementPanel
            suppliers={suppliers}
            invoices={invoices}
            payments={payments}
            cleaningOrphans={cleaningOrphans}
            onCleanupOrphans={() => void cleanupOrphanInvoices()}
            onOpenInvoiceFile={(path) => void openInvoice(path)}
            onRecordPayment={handleRecordSupplierPayment}
          />
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 5: PRICE INTELLIGENCE                                        */}
        {/* ================================================================ */}
        <TabsContent value="prices" className="space-y-4">
          <PriceHistoryPanel
            brandId={brandId}
            items={items.map((item) => ({
              id: item.id,
              name: item.name,
              purchaseUnit: formatCleanUnitLabel(item.purchaseUnit).unitShort,
            }))}
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                آخر سعر شراء فعلي لكل صنف
              </CardTitle>
              <CardDescription className="text-xs">
                مرتبة حسب آخر توريد فعلي لمراجعة الأسعار السريعة.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {latestPrices.length ? (
                <DataTable
                  headers={['الصنف', 'آخر سعر للوحدة', 'المورد', 'التاريخ']}
                  rows={latestPrices.map((entry) => [
                    entry.itemName,
                    money(entry.price),
                    entry.supplierName || '—',
                    entry.date,
                  ])}
                />
              ) : (
                <Empty text="لا تتوفر بيانات أسعار للمشتريات المحملة." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 6: SUPPLIERS DIRECTORY                                       */}
        {/* ================================================================ */}
        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex justify-end">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setSupplierDraft({
                  id: '',
                  name: '',
                  phone: '',
                  email: '',
                  paymentTerms: '',
                  leadTimeDays: '0',
                  notes: '',
                });
                setSupplierOpen(true);
              }}
            >
              <Plus className="ml-2 h-4 w-4" />
              إضافة مورد جديد
            </Button>
          </div>
          <SupplierDirectory brandId={brandId} suppliers={suppliers} onRefresh={() => void load()} />
        </TabsContent>
      </Tabs>

      {/* Multi-Item Direct Purchase Dialog */}
      <DirectMultiPurchaseDialog
        open={directOpen}
        onOpenChange={setDirectOpen}
        items={items}
        suppliers={activeSuppliers}
        categories={categories}
        authenticatedAccountName={authenticatedName}
        onSubmit={handleDirectMultiPurchase}
      />

      <AutoReorderDialog
        open={autoReorderOpen}
        onOpenChange={setAutoReorderOpen}
        brandId={brandId}
        onSubmit={submitAutoReorder}
      />

      {/* Inline Warehouse Receipt Confirmation Modal */}
      <Dialog open={Boolean(receiptTarget)} onOpenChange={(o) => !o && setReceiptTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-sky-600" />
              فحص واعتماد استلام المخزن · {receiptTarget?.requestNo}
            </DialogTitle>
            <DialogDescription className="text-xs">
              سيُسجّل الاستلام باسم حسابك تلقائياً (<strong>{authenticatedName}</strong>) وتُضاف الكميات المقبولة فقط إلى رصيد المخزن المركزي.
            </DialogDescription>
          </DialogHeader>

          {receiptTarget && (
            <div className="space-y-3 py-1">
              {receiptTarget.lines.map((line) => {
                const rem = Math.max(
                  0,
                  number(line.quantity) - line.receivedQuantity - line.rejectedQuantity,
                );
                const d = receiptLineDrafts[line.id] ?? {
                  receivedQuantity: String(rem),
                  rejectedQuantity: '0',
                  rejectionReason: '',
                  batchNo: line.batchNo,
                  expiryDate: line.expiryDate,
                };
                const uFmt = formatCleanUnitLabel(line.unit);

                return (
                  <div key={line.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <strong className="text-slate-900">{line.itemName}</strong>
                      <span className="text-slate-500 tabular-nums">
                        المطلوب استلامه: {rem} {uFmt.unitShort}
                      </span>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-4">
                      <NumberTextField
                        label={`المقبول (${uFmt.unitShort})`}
                        value={d.receivedQuantity}
                        onChange={(val) =>
                          setReceiptLineDrafts((prev) => ({
                            ...prev,
                            [line.id]: { ...d, receivedQuantity: val },
                          }))
                        }
                      />
                      <NumberTextField
                        label="المرفوض / التالف"
                        value={d.rejectedQuantity}
                        onChange={(val) =>
                          setReceiptLineDrafts((prev) => ({
                            ...prev,
                            [line.id]: { ...d, rejectedQuantity: val },
                          }))
                        }
                      />
                      <TextField
                        label="سبب الرفض (إن وُجد)"
                        value={d.rejectionReason}
                        onChange={(val) =>
                          setReceiptLineDrafts((prev) => ({
                            ...prev,
                            [line.id]: { ...d, rejectionReason: val },
                          }))
                        }
                      />
                      <TextField
                        label="تاريخ الصلاحية"
                        type="date"
                        value={d.expiryDate}
                        onChange={(val) =>
                          setReceiptLineDrafts((prev) => ({
                            ...prev,
                            [line.id]: { ...d, expiryDate: val },
                          }))
                        }
                      />
                    </div>
                  </div>
                );
              })}

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="تاريخ الاستلام الفعلي"
                  type="date"
                  value={receiptDate}
                  onChange={setReceiptDate}
                />
                <div className="space-y-1">
                  <Label className="text-xs">ملاحظات الفحص والاستلام</Label>
                  <Input
                    value={receiptNotes}
                    onChange={(e) => setReceiptNotes(e.target.value)}
                    placeholder="اختياري..."
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReceiptTarget(null)} disabled={receivingSaving}>
              إلغاء
            </Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5"
              disabled={receivingSaving}
              onClick={() => void submitInlineReceipt()}
            >
              {receivingSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-4 w-4" />
              )}
              تأكيد الاستلام وإضافة الرصيد للمخزن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Owner-Only Cancel / Supplier Return Dialog */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-rose-700 flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              مرتجع للمورد / إلغاء فاتورة شراء
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {cancelTarget?.status === 'approved'
                ? 'تم استلام هذه الفاتورة مسبقاً بالمخزن. سيقوم النظام بخصم الكميات المرتجعة من رصيد المخزن وإلغاء الفاتورة من المصروفات وتوثيق العملية باسمك في سجل المراجعة.'
                : 'سيتم إلغاء هذه العملية وإيقاف استلامها في المخزن وحذف أثرها المالي مع توثيق السبب.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label className="text-xs font-bold">سبب الإلغاء أو المرتجع للمورد *</Label>
            <Textarea
              rows={3}
              placeholder="مثال: خطأ في تسجيل السعر / بضاعة مرتجعة للمورد لعدم مطابقة المواصفات..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancellingSaving}>
              تراجع
            </Button>
            <Button
              variant="destructive"
              disabled={cancellingSaving || !cancelReason.trim()}
              onClick={() => void submitOwnerCancelOrReturn()}
            >
              {cancellingSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              تأكيد الإلغاء وعكس العملية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{supplierDraft.id ? 'تعديل المورد' : 'إضافة مورد'}</DialogTitle>
            <DialogDescription>بيانات المورد للمخزن المركزي الموحد.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="اسم المورد *"
              value={supplierDraft.name}
              onChange={(name) => setSupplierDraft((current) => ({ ...current, name }))}
            />
            <TextField
              label="الهاتف (لإرسال طلبات واتساب)"
              value={supplierDraft.phone}
              onChange={(phone) => setSupplierDraft((current) => ({ ...current, phone }))}
            />
            <TextField
              label="البريد الإلكتروني"
              value={supplierDraft.email}
              onChange={(email) => setSupplierDraft((current) => ({ ...current, email }))}
            />
            <TextField
              label="شروط الدفع"
              value={supplierDraft.paymentTerms}
              onChange={(paymentTerms) => setSupplierDraft((current) => ({ ...current, paymentTerms }))}
            />
            <NumberTextField
              label="مدة التوريد بالأيام"
              value={supplierDraft.leadTimeDays}
              onChange={(leadTimeDays) => setSupplierDraft((current) => ({ ...current, leadTimeDays }))}
              step="1"
            />
            <Textarea
              className="sm:col-span-2"
              placeholder="ملاحظات المورد"
              value={supplierDraft.notes}
              onChange={(event) =>
                setSupplierDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={supplierSaving}
            onClick={() => void saveSupplier()}
          >
            {supplierSaving ? 'جارٍ الحفظ...' : 'حفظ المورد'}
          </Button>
        </DialogContent>
      </Dialog>

      <PurchaseOrderPrintDialog
        open={printOrderOpen}
        onOpenChange={setPrintOrderOpen}
        hubName={hubName}
        purchaserName={authenticatedName}
        shortages={shortages}
      />
    </div>
  );
}

const paymentMethods = [
  { value: 'cash', label: 'نقدًا' },
  { value: 'bank_transfer', label: 'تحويل بنكي / محفظة' },
  { value: 'credit', label: 'آجل' },
];

function SourceBadge({ info }: { info: { label: string; tone: string } }) {
  const styles: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    sky: 'bg-sky-50 text-sky-800 border-sky-200',
    violet: 'bg-violet-50 text-violet-800 border-violet-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.2 text-[10px] font-bold',
        styles[info.tone] ?? styles.slate,
      )}
    >
      {info.label}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs font-medium text-slate-500">
      {text}
    </div>
  );
}

function Status({ status }: { status: string }) {
  const [label, className] =
    status === 'pending_procurement' || status === 'pending_store_approval'
      ? ['بانتظار التنفيذ', 'bg-amber-50 text-amber-800 border border-amber-200']
      : status === 'purchased_pending_receipt'
        ? ['بانتظار استلام المخزن', 'bg-sky-50 text-sky-800 border border-sky-200']
        : status === 'approved'
          ? ['دخلت المخزن', 'bg-emerald-50 text-emerald-800 border border-emerald-200']
          : status === 'rejected'
            ? ['ملغي / مرتجع', 'bg-rose-50 text-rose-800 border border-rose-200']
            : [status, 'bg-slate-100 text-slate-600'];
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-xs text-slate-600">
            {headers.map((header) => (
              <th className="p-2.5 font-bold" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="border-b last:border-0" key={index}>
              {row.map((cell, cellIndex) => (
                <td className="p-2.5 text-xs tabular-nums" key={`${index}-${cellIndex}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  options,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
  allowEmpty?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold">{label}</Label>
      {options ? (
        <select
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {allowEmpty ? <option value="">بدون اختيار</option> : <option value="">اختر</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input className="h-9 text-xs" value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type={type}
        className="h-9 text-xs tabular-nums"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NumberTextField({
  label,
  value,
  onChange,
  step = '0.001',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type="number"
        min="0"
        step={step}
        className="h-9 text-xs font-bold tabular-nums"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function FileField({ label, onChange }: { label: string; onChange: (file: File | null) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type="file"
        className="h-9 text-xs"
        accept=".pdf,image/jpeg,image/png,image/webp"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function statusLabel(status: string) {
  if (status === 'pending_procurement' || status === 'pending_store_approval') return 'بانتظار التنفيذ';
  if (status === 'purchased_pending_receipt') return 'بانتظار استلام المخزن';
  if (status === 'approved') return 'دخلت المخزن';
  if (status === 'rejected') return 'ملغي / مرتجع';
  return status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
