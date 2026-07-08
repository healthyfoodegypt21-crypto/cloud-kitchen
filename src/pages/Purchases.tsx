import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, Boxes, Check, ChevronsUpDown, Loader2, PackageCheck, Phone, Plus, Repeat2, ShoppingBasket, Star, Store } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { usePurchases } from '@/hooks/usePurchases';
import { cn, formatEGPCurrency } from '@/lib/utils';
import { InventoryItem, INVENTORY_CATEGORY_LABELS, INVENTORY_CATEGORY_ORDER, INVENTORY_UNIT_LABELS, INVENTORY_UNIT_ORDER } from '@/types/inventory';
import { ConfirmReceiptInput, RecordPurchaseInput } from '@/types/purchases';

type Props = {
  inventoryItems: InventoryItem[];
  inventoryLoading: boolean;
  storageMode: 'local';
  fallbackReason: string;
};

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'كاش' },
  { value: 'bank_transfer', label: 'تحويل' },
  { value: 'credit', label: 'آجل' },
] as const;

const PAYMENT_STATUS_OPTIONS = [
  { value: 'paid', label: 'مدفوع' },
  { value: 'partial', label: 'مدفوع جزئيًا' },
  { value: 'unpaid', label: 'غير مدفوع' },
] as const;

const QUALITY_OPTIONS = [
  { value: 'accepted', label: 'مقبول' },
  { value: 'rejected', label: 'مرفوض' },
  { value: 'partial', label: 'مقبول جزئيًا' },
] as const;

function createPurchaseForm(orderId = '', lineId = '', itemId = '', supplierName = '', purchaseUnit: InventoryItem['unit'] = 'kg'): RecordPurchaseInput {
  return {
    orderId,
    lineId,
    itemId,
    purchasedQuantity: 0,
    purchaseUnit,
    purchasedUnitPrice: 0,
    purchasedSupplierName: supplierName,
    paymentMethod: null,
    paymentStatus: null,
    paidAmount: null,
    dueDate: null,
  };
}

function createReceiptForm(orderId: string, lineId: string): ConfirmReceiptInput {
  return {
    orderId,
    lineId,
    receiptDate: new Date().toISOString().slice(0, 10),
    receivedBy: '',
    qualityStatus: 'accepted',
    rejectedQuantity: 0,
    rejectionReason: '',
    receiptNotes: '',
    receivedStorageQuantity: 0,
  };
}

function formatPurchaseMetric(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : formatEGPCurrency(value);
}

function rankPurchaseItemMatch(item: InventoryItem, normalizedSearch: string) {
  const normalizedName = item.name.toLowerCase();
  const normalizedSku = item.sku.toLowerCase();

  if (!normalizedSearch) {
    return 0;
  }

  if (normalizedName.startsWith(normalizedSearch)) {
    return 0;
  }

  if (normalizedSku.startsWith(normalizedSearch)) {
    return 1;
  }

  if (normalizedName.includes(normalizedSearch)) {
    return 2;
  }

  if (normalizedSku.includes(normalizedSearch)) {
    return 3;
  }

  return 4;
}

type QuickBuyLine = RecordPurchaseInput & {
  id: string;
  itemName: string;
  sku: string;
};

function normalizeSupplierKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getWhatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

function buildStars(rating: number) {
  const safeRating = Math.max(0, Math.min(5, Math.round(rating)));
  return Array.from({ length: 5 }, (_, index) => index < safeRating);
}

function calculatePriceChange(currentPrice: number, previousPrice: number | null | undefined) {
  if (!currentPrice || !previousPrice) {
    return null;
  }

  const percent = ((currentPrice - previousPrice) / previousPrice) * 100;
  if (Math.abs(percent) < 0.5) {
    return null;
  }

  return {
    direction: percent > 0 ? 'up' : 'down',
    percent: Math.abs(percent),
  };
}

export default function Purchases({ inventoryItems, inventoryLoading, storageMode, fallbackReason }: Props) {
  const { isDemoMode } = useAuth();
  const [periodDays, setPeriodDays] = useState('30');
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [quickBuyDialogOpen, setQuickBuyDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [quickItemPickerOpen, setQuickItemPickerOpen] = useState(false);
  const [purchaseItemSearch, setPurchaseItemSearch] = useState('');
  const [quickItemSearch, setQuickItemSearch] = useState('');
  const [purchaseAccountingOpen, setPurchaseAccountingOpen] = useState(false);
  const [quickAccountingOpen, setQuickAccountingOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<RecordPurchaseInput>(() => createPurchaseForm('', ''));
  const [quickBuyDraft, setQuickBuyDraft] = useState<RecordPurchaseInput>(() => createPurchaseForm('', ''));
  const [quickBuyLines, setQuickBuyLines] = useState<QuickBuyLine[]>([]);
  const [receiptForm, setReceiptForm] = useState<ConfirmReceiptInput>(() => createReceiptForm('', ''));
  const [supplierForm, setSupplierForm] = useState({
    id: '',
    name: '',
    phone: '',
    categories: [] as InventoryItem['category'][],
    rating: 0,
    notes: '',
    is_preferred: false,
  });

  const purchaseTotal = useMemo(
    () => purchaseForm.purchasedQuantity * purchaseForm.purchasedUnitPrice,
    [purchaseForm.purchasedQuantity, purchaseForm.purchasedUnitPrice],
  );

  useEffect(() => {
    setPurchaseForm((current) => {
      const autoPaid = current.paymentStatus === 'paid'
        ? purchaseTotal
        : current.paymentStatus === 'unpaid'
          ? 0
          : current.paidAmount > purchaseTotal
            ? purchaseTotal
            : current.paidAmount;

      if (autoPaid === current.paidAmount) {
        return current;
      }

      return {
        ...current,
        paidAmount: autoPaid,
      };
    });
  }, [purchaseTotal, purchaseForm.paymentStatus]);

  const {
    order,
    suppliers,
    notifications,
    analytics,
    dailySpend,
    insights,
    loading,
    removeLine,
    registerPurchase,
    registerQuickPurchase,
    registerReceipt,
    saveSupplier,
    readNotification,
  } = usePurchases(inventoryItems, Number(periodDays));

  const activeOrderLines = useMemo(() => order.lines.filter((line) => line.status === 'review' || line.status === 'sent_to_procurement'), [order.lines]);
  const pendingReceiptLines = useMemo(() => order.lines.filter((line) => line.status === 'purchased_pending_receipt'), [order.lines]);
  const todaySpend = dailySpend[0]?.total_spend ?? 0;
  const unreadStoreNotifications = notifications.filter((notification) => notification.audience === 'store_manager' && !notification.is_read).length;
  const selectedPurchaseItem = useMemo(
    () => inventoryItems.find((item) => item.id === purchaseForm.itemId) ?? null,
    [inventoryItems, purchaseForm.itemId],
  );
  const selectedQuickItem = useMemo(
    () => inventoryItems.find((item) => item.id === quickBuyDraft.itemId) ?? null,
    [inventoryItems, quickBuyDraft.itemId],
  );
  const purchaseHistory = useMemo(
    () => [...order.lines].filter((line) => line.purchased_at).sort((left, right) => (right.purchased_at ?? '').localeCompare(left.purchased_at ?? '')),
    [order.lines],
  );
  const filteredPurchaseItems = useMemo(() => {
    const normalizedSearch = purchaseItemSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return [...inventoryItems].sort((left, right) => left.name.localeCompare(right.name, 'ar'));
    }

    return inventoryItems
      .filter((item) => item.name.toLowerCase().includes(normalizedSearch) || item.sku.toLowerCase().includes(normalizedSearch))
      .sort((left, right) => {
        const leftRank = rankPurchaseItemMatch(left, normalizedSearch);
        const rightRank = rankPurchaseItemMatch(right, normalizedSearch);

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return left.name.localeCompare(right.name, 'ar');
      });
  }, [inventoryItems, purchaseItemSearch]);
  const filteredQuickItems = useMemo(() => {
    const normalizedSearch = quickItemSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return [...inventoryItems].sort((left, right) => left.name.localeCompare(right.name, 'ar'));
    }

    return inventoryItems
      .filter((item) => item.name.toLowerCase().includes(normalizedSearch) || item.sku.toLowerCase().includes(normalizedSearch))
      .sort((left, right) => {
        const leftRank = rankPurchaseItemMatch(left, normalizedSearch);
        const rightRank = rankPurchaseItemMatch(right, normalizedSearch);

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return left.name.localeCompare(right.name, 'ar');
      });
  }, [inventoryItems, quickItemSearch]);
  const selectedPurchaseAnalytics = useMemo(
    () => analytics.find((item) => item.item_id === purchaseForm.itemId) ?? null,
    [analytics, purchaseForm.itemId],
  );
  const selectedQuickAnalytics = useMemo(
    () => analytics.find((item) => item.item_id === quickBuyDraft.itemId) ?? null,
    [analytics, quickBuyDraft.itemId],
  );
  const latestPurchaseByItemId = useMemo(() => {
    const map = new Map<string, typeof order.lines[number]>();

    purchaseHistory.forEach((line) => {
      if (!map.has(line.item_id)) {
        map.set(line.item_id, line);
      }
    });

    return map;
  }, [purchaseHistory]);
  const supplierSummaries = useMemo(() => {
    return suppliers
      .map((supplier) => {
        const history = purchaseHistory.filter((line) => normalizeSupplierKey(line.purchased_supplier_name ?? line.best_supplier_name) === normalizeSupplierKey(supplier.name));
        const totalSpend = history.reduce((sum, line) => sum + ((line.purchased_quantity ?? 0) * (line.purchased_unit_price ?? 0)), 0);
        const lastPurchase = history[0] ?? null;
        const uniqueRecentLines = Array.from(new Map(
          history
            .filter((line) => line.purchased_quantity && line.purchased_unit_price)
            .map((line) => [line.item_id, line]),
        ).values()).slice(0, 5);

        return {
          supplier,
          history,
          totalSpend,
          purchaseCount: history.length,
          lastPurchase,
          lastHighlightedItem: uniqueRecentLines[0] ?? null,
          uniqueRecentLines,
        };
      })
      .sort((left, right) => {
        if (left.supplier.is_preferred !== right.supplier.is_preferred) {
          return left.supplier.is_preferred ? -1 : 1;
        }

        return (right.lastPurchase?.purchased_at ?? '').localeCompare(left.lastPurchase?.purchased_at ?? '');
      });
  }, [purchaseHistory, suppliers]);
  const purchaseMetrics = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayKey = now.toISOString().slice(0, 10);
    const weekSpend = purchaseHistory.reduce((sum, line) => {
      const purchasedAt = line.purchased_at ? new Date(line.purchased_at) : null;
      if (!purchasedAt || purchasedAt < startOfWeek) {
        return sum;
      }

      return sum + ((line.purchased_quantity ?? 0) * (line.purchased_unit_price ?? 0));
    }, 0);
    const monthSpend = purchaseHistory.reduce((sum, line) => {
      const purchasedAt = line.purchased_at ? new Date(line.purchased_at) : null;
      if (!purchasedAt || purchasedAt < startOfMonth) {
        return sum;
      }

      return sum + ((line.purchased_quantity ?? 0) * (line.purchased_unit_price ?? 0));
    }, 0);
    const todaySpendValue = purchaseHistory.reduce((sum, line) => {
      if ((line.purchased_at ?? '').slice(0, 10) !== todayKey) {
        return sum;
      }

      return sum + ((line.purchased_quantity ?? 0) * (line.purchased_unit_price ?? 0));
    }, 0);
    const topSupplier = supplierSummaries
      .filter((summary) => summary.purchaseCount > 0)
      .sort((left, right) => right.totalSpend - left.totalSpend)[0] ?? null;

    return {
      todaySpendValue,
      weekSpend,
      monthSpend,
      topSupplier,
      lastPurchase: purchaseHistory[0] ?? null,
    };
  }, [purchaseHistory, supplierSummaries]);
  const suggestedSuppliers = useMemo(() => {
    if (!selectedPurchaseItem) {
      return [] as string[];
    }

    const itemLevelSuppliers = suppliers
      .filter((supplier) => supplier.supplied_item_names.includes(selectedPurchaseItem.name))
      .map((supplier) => supplier.name);
    const categorySuppliers = suppliers
      .filter((supplier) => supplier.categories.includes(selectedPurchaseItem.category))
      .map((supplier) => supplier.name);

    return Array.from(new Set([
      selectedPurchaseItem.supplier_name,
      selectedPurchaseItem.alternate_supplier_name ?? '',
      latestPurchaseByItemId.get(selectedPurchaseItem.id)?.purchased_supplier_name ?? '',
      ...itemLevelSuppliers,
      ...categorySuppliers,
    ].filter(Boolean))).slice(0, 6);
  }, [latestPurchaseByItemId, selectedPurchaseItem, suppliers]);
  const quickSuggestedSuppliers = useMemo(() => {
    if (!selectedQuickItem) {
      return [] as string[];
    }

    const itemLevelSuppliers = suppliers
      .filter((supplier) => supplier.supplied_item_names.includes(selectedQuickItem.name))
      .map((supplier) => supplier.name);
    const categorySuppliers = suppliers
      .filter((supplier) => supplier.categories.includes(selectedQuickItem.category))
      .map((supplier) => supplier.name);

    return Array.from(new Set([
      selectedQuickItem.supplier_name,
      selectedQuickItem.alternate_supplier_name ?? '',
      latestPurchaseByItemId.get(selectedQuickItem.id)?.purchased_supplier_name ?? '',
      ...itemLevelSuppliers,
      ...categorySuppliers,
    ].filter(Boolean))).slice(0, 6);
  }, [latestPurchaseByItemId, selectedQuickItem, suppliers]);
  const purchasePriceChange = useMemo(() => calculatePriceChange(
    purchaseForm.purchasedUnitPrice,
    selectedPurchaseAnalytics?.average_unit_price ?? latestPurchaseByItemId.get(purchaseForm.itemId)?.purchased_unit_price ?? selectedPurchaseItem?.last_purchase_price,
  ), [latestPurchaseByItemId, purchaseForm.itemId, purchaseForm.purchasedUnitPrice, selectedPurchaseAnalytics?.average_unit_price, selectedPurchaseItem?.last_purchase_price]);
  const quickPriceChange = useMemo(() => calculatePriceChange(
    quickBuyDraft.purchasedUnitPrice,
    selectedQuickAnalytics?.average_unit_price ?? latestPurchaseByItemId.get(quickBuyDraft.itemId)?.purchased_unit_price ?? selectedQuickItem?.last_purchase_price,
  ), [latestPurchaseByItemId, quickBuyDraft.itemId, quickBuyDraft.purchasedUnitPrice, selectedQuickAnalytics?.average_unit_price, selectedQuickItem?.last_purchase_price]);

  const hydratePurchaseDraft = (item: InventoryItem, current: RecordPurchaseInput) => {
    const latest = latestPurchaseByItemId.get(item.id);

    return {
      ...current,
      itemId: item.id,
      purchasedSupplierName: current.purchasedSupplierName || latest?.purchased_supplier_name || item.supplier_name,
      purchaseUnit: latest?.purchase_unit ?? item.purchase_unit ?? item.unit ?? current.purchaseUnit,
      purchasedUnitPrice: current.purchasedUnitPrice || latest?.purchased_unit_price || item.last_purchase_price || 0,
    };
  };

  const addQuickBuyLine = () => {
    if (!selectedQuickItem || quickBuyDraft.purchasedQuantity <= 0 || quickBuyDraft.purchasedUnitPrice <= 0) {
      return;
    }

    setQuickBuyLines((current) => ([
      ...current,
      {
        ...quickBuyDraft,
        id: crypto.randomUUID(),
        itemName: selectedQuickItem.name,
        sku: selectedQuickItem.sku,
      },
    ]));
    setQuickBuyDraft(createPurchaseForm('', '', '', '', selectedQuickItem.purchase_unit ?? selectedQuickItem.unit ?? 'kg'));
    setQuickItemSearch('');
    setQuickItemPickerOpen(false);
    setQuickAccountingOpen(false);
  };

  const openQuickBuyFromSupplier = (supplierName: string, lines: typeof order.lines) => {
    const deduped = Array.from(new Map(
      lines
        .filter((line) => line.purchased_quantity && line.purchased_unit_price)
        .map((line) => [line.item_id, line]),
    ).values()).slice(0, 6);

    setQuickBuyLines(deduped.map((line) => ({
      ...createPurchaseForm('', '', line.item_id, supplierName, line.purchase_unit),
      purchasedQuantity: line.purchased_quantity ?? line.requested_quantity,
      purchasedUnitPrice: line.purchased_unit_price ?? line.expected_unit_price ?? 0,
      paymentMethod: line.payment_method,
      paymentStatus: line.payment_status,
      paidAmount: line.paid_amount,
      dueDate: line.due_date,
      id: crypto.randomUUID(),
      itemName: line.item_name,
      sku: line.sku,
    })));
    setQuickBuyDraft(createPurchaseForm('', '', '', supplierName));
    setQuickItemSearch('');
    setQuickItemPickerOpen(false);
    setQuickAccountingOpen(false);
    setQuickBuyDialogOpen(true);
  };

  if (inventoryLoading || loading) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">المشتريات</h1>
          <p className="text-muted-foreground">أمر شراء موحد للخامات المشتركة، مع تسجيل شراء مباشر ثم تأكيد استلام من مسؤول المخازن قبل إضافة الكميات للمخزن.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setSupplierDialogOpen(true)}>
            <Store className="h-4 w-4" />
            إضافة مورد
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => { setQuickBuyDraft(createPurchaseForm()); setQuickBuyLines([]); setQuickItemSearch(''); setQuickItemPickerOpen(false); setQuickAccountingOpen(false); setQuickBuyDialogOpen(true); }}>
            <ShoppingBasket className="h-4 w-4" />
            Quick Buy
          </Button>
          <Button className="gap-2" onClick={() => { setPurchaseItemSearch(''); setItemPickerOpen(false); setPurchaseForm(createPurchaseForm()); setPurchaseDialogOpen(true); }}>
            تسجيل عملية شراء
          </Button>
        </div>
      </div>

      <Alert>
        <Boxes className="h-4 w-4" />
        <AlertTitle>مشتريات على مستوى الخامات المشتركة</AlertTitle>
        <AlertDescription>
          {storageMode === 'local'
            ? `${fallbackReason} تم إلغاء ربط قائمة الشراء بالبراند، لأنها الآن تعمل على خامات المطبخ المشتركة.`
            : 'المشتريات تعمل على مخزون موحد للخامات المشتركة.'}
        </AlertDescription>
      </Alert>

      {isDemoMode ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>وضع تجريبي</AlertTitle>
          <AlertDescription>
            دورة الشراء متاحة محليًا للمعاينة: حذف من أمر الشراء، تسجيل شراء، ثم إشعار واستلام مؤكد قبل إضافة الكميات للمخزون.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>مشتريات اليوم</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">{formatEGPCurrency(purchaseMetrics.todaySpendValue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">صرف فعلي مسجل اليوم.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>مشتريات الأسبوع</CardDescription>
            <CardTitle className="text-3xl">{formatEGPCurrency(purchaseMetrics.weekSpend)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">من أول الأسبوع حتى الآن.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>مشتريات الشهر</CardDescription>
            <CardTitle className="text-3xl">{formatEGPCurrency(purchaseMetrics.monthSpend)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">اتجاه الصرف الشهري الحالي.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>المورد الأكثر شراءً</CardDescription>
            <CardTitle className="text-xl leading-tight">{purchaseMetrics.topSupplier?.supplier.name ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{purchaseMetrics.topSupplier ? `${purchaseMetrics.topSupplier.purchaseCount} عملية • ${formatEGPCurrency(purchaseMetrics.topSupplier.totalSpend)}` : 'ابدأ التسجيل ليظهر الأعلى شراءً.'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>آخر عملية شراء</CardDescription>
            <CardTitle className="text-xl leading-tight">{purchaseMetrics.lastPurchase?.item_name ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{purchaseMetrics.lastPurchase ? `${formatShortDate(purchaseMetrics.lastPurchase.purchased_at)} • ${formatEGPCurrency((purchaseMetrics.lastPurchase.purchased_quantity ?? 0) * (purchaseMetrics.lastPurchase.purchased_unit_price ?? 0))}` : 'لا توجد عملية مسجلة بعد.'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>أصناف تحتاج شراء</CardDescription>
            <CardTitle className="text-3xl text-amber-600">{activeOrderLines.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">بانتظار الاستلام الآن: {pendingReceiptLines.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="order" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="order">أمر الشراء</TabsTrigger>
          <TabsTrigger value="receipts">الاستلام</TabsTrigger>
          <TabsTrigger value="suppliers">الموردون</TabsTrigger>
          <TabsTrigger value="analytics">التحليلات</TabsTrigger>
          <TabsTrigger value="notifications">الإشعارات</TabsTrigger>
        </TabsList>

        <TabsContent value="order" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>أمر الشراء الحالي</CardTitle>
              <CardDescription>أي صنف يصل للحد الأدنى يدخل تلقائيًا تحت ملاحظة مراجعة مدير المخزن، ويمكن حذفه أو تسجيل شرائه مباشرة من هنا.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeOrderLines.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-muted-foreground">لا توجد أصناف مفتوحة حاليًا في أمر الشراء.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead>الفئة</TableHead>
                        <TableHead>المتاح / الأدنى</TableHead>
                        <TableHead>الكمية المطلوبة</TableHead>
                        <TableHead>الوحدة شراء / تخزين</TableHead>
                        <TableHead>أقل / أعلى سعر</TableHead>
                        <TableHead>أفضل مورد</TableHead>
                        <TableHead>ملاحظة</TableHead>
                        <TableHead className="text-left">إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeOrderLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{line.item_name}</div>
                              <div className="text-xs text-muted-foreground">{line.sku}</div>
                            </div>
                          </TableCell>
                          <TableCell>{INVENTORY_CATEGORY_LABELS[line.category]}</TableCell>
                          <TableCell>{line.current_quantity} / {line.minimum_stock}</TableCell>
                          <TableCell>{line.requested_quantity}</TableCell>
                          <TableCell>{line.purchase_unit} / {line.storage_unit}</TableCell>
                          <TableCell>{line.lowest_price === null ? '—' : formatEGPCurrency(line.lowest_price)} / {line.highest_price === null ? '—' : formatEGPCurrency(line.highest_price)}</TableCell>
                          <TableCell>{line.best_supplier_name}</TableCell>
                          <TableCell><Badge variant="outline">{line.review_note}</Badge></TableCell>
                          <TableCell className="space-x-2 whitespace-nowrap text-left">
                            <Button size="sm" onClick={() => { setPurchaseItemSearch(''); setItemPickerOpen(false); setPurchaseForm(createPurchaseForm(order.id, line.id, line.item_id, line.best_supplier_name, line.purchase_unit)); setPurchaseDialogOpen(true); }}>
                              تسجيل عملية شراء
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void removeLine(line.id)}>حذف</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>عمليات بانتظار الاستلام</CardTitle>
              <CardDescription>مدير المشتريات سجّل الشراء، والآن مسؤول المخازن يؤكد الاستلام وجودة الصنف قبل الإضافة للمخزون.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingReceiptLines.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-muted-foreground">لا توجد عمليات شراء بانتظار تأكيد الاستلام.</div>
              ) : pendingReceiptLines.map((line) => (
                <div key={line.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="font-semibold">{line.item_name}</div>
                      <div className="text-sm text-muted-foreground">{line.purchased_supplier_name} • {line.purchased_quantity} {line.purchase_unit}</div>
                      <div className="text-sm text-muted-foreground">طريقة الدفع: {line.payment_method ?? '—'} • حالة الدفع: {line.payment_status ?? '—'} • المتبقي: {line.remaining_amount === null ? formatEGPCurrency(0) : formatEGPCurrency(line.remaining_amount)}</div>
                    </div>
                    <Button className="gap-2" onClick={() => { setReceiptForm(createReceiptForm(order.id, line.id)); setReceiptDialogOpen(true); }}>
                      <PackageCheck className="h-4 w-4" />
                      تم الاستلام
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>دليل الموردين</CardTitle>
              <CardDescription>بطاقات سريعة للموردين بدل الجداول، مع تاريخ التعامل وإعادة الشراء بضغطة.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {supplierSummaries.map(({ supplier, history, totalSpend, purchaseCount, lastPurchase, lastHighlightedItem, uniqueRecentLines }) => (
                <Card key={supplier.id} className="border-dashed">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-xl">{supplier.name}</CardTitle>
                          {supplier.is_preferred ? <Badge variant="outline">مورد مفضل</Badge> : null}
                        </div>
                        <div className="flex items-center gap-1 text-amber-500">
                          {buildStars(supplier.rating).map((filled, index) => (
                            <Star key={index} className={cn('h-4 w-4', filled ? 'fill-current' : 'text-muted-foreground')} />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {supplier.phone ? (
                          <>
                            <Button variant="outline" size="icon" asChild>
                              <a href={`tel:${supplier.phone}`} aria-label={`اتصال مع ${supplier.name}`}>
                                <Phone className="h-4 w-4" />
                              </a>
                            </Button>
                            {getWhatsAppLink(supplier.phone) ? (
                              <Button variant="outline" size="sm" asChild>
                                <a href={getWhatsAppLink(supplier.phone)} target="_blank" rel="noreferrer">واتساب</a>
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                    <CardDescription>{supplier.categories.map((category) => INVENTORY_CATEGORY_LABELS[category]).join('، ') || 'بدون فئات مسجلة'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">آخر شراء</div>
                        <div className="font-medium">{formatShortDate(lastPurchase?.purchased_at)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">إجمالي التعامل</div>
                        <div className="font-medium">{formatEGPCurrency(totalSpend)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">عدد مرات الشراء</div>
                        <div className="font-medium">{purchaseCount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">آخر سعر مهم</div>
                        <div className="font-medium">{lastHighlightedItem ? `${lastHighlightedItem.item_name} • ${formatEGPCurrency(lastHighlightedItem.purchased_unit_price ?? 0)}` : '—'}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-muted-foreground">يورد</div>
                      <div className="mt-1 text-sm">{supplier.supplied_item_names.join('، ') || '—'}</div>
                    </div>

                    {supplier.notes ? (
                      <div>
                        <div className="text-xs text-muted-foreground">ملاحظات</div>
                        <div className="mt-1 text-sm">{supplier.notes}</div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => openQuickBuyFromSupplier(supplier.name, history)} disabled={uniqueRecentLines.length === 0}>
                        <Repeat2 className="ml-1 h-4 w-4" />
                        إعادة شراء
                      </Button>
                    </div>

                    <Accordion type="single" collapsible>
                      <AccordionItem value="history">
                        <AccordionTrigger>المشتريات السابقة</AccordionTrigger>
                        <AccordionContent className="space-y-2">
                          {history.length === 0 ? (
                            <div className="text-sm text-muted-foreground">لا توجد مشتريات سابقة لهذا المورد.</div>
                          ) : history.slice(0, 6).map((line) => (
                            <div key={line.id} className="rounded-xl border p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-medium">{line.item_name}</div>
                                  <div className="text-xs text-muted-foreground">{formatShortDate(line.purchased_at)}</div>
                                </div>
                                <div className="text-left">
                                  <div className="font-medium">{formatEGPCurrency(line.purchased_unit_price ?? 0)}</div>
                                  <div className="text-xs text-muted-foreground">{line.purchased_quantity ?? 0} {INVENTORY_UNIT_LABELS[line.purchase_unit]}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="flex justify-end">
            <div className="w-full md:w-56">
              <Label>الفترة</Label>
              <Select value={periodDays} onValueChange={setPeriodDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">آخر 7 أيام</SelectItem>
                  <SelectItem value="30">آخر 30 يوم</SelectItem>
                  <SelectItem value="90">آخر 90 يوم</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>تحليل الصرف على الأصناف</CardTitle>
                <CardDescription>متوسط السعر، أقل وأعلى سعر، المورد، والكمية المطلوبة لكل صنف.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead>المورد</TableHead>
                        <TableHead>إجمالي الصرف</TableHead>
                        <TableHead>متوسط / أقل / أعلى</TableHead>
                        <TableHead>الكمية المطلوبة</TableHead>
                        <TableHead>شراء / تخزين</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد بيانات شراء مسجلة في الفترة الحالية.</TableCell></TableRow>
                      ) : analytics.map((item) => (
                        <TableRow key={item.item_id}>
                          <TableCell><div className="space-y-1"><div className="font-medium">{item.item_name}</div><div className="text-xs text-muted-foreground">{item.sku}</div></div></TableCell>
                          <TableCell>{item.supplier_name}</TableCell>
                          <TableCell>{formatEGPCurrency(item.total_spend)}</TableCell>
                          <TableCell>{item.average_unit_price === null ? '—' : formatEGPCurrency(item.average_unit_price)} / {item.lowest_unit_price === null ? '—' : formatEGPCurrency(item.lowest_unit_price)} / {item.highest_unit_price === null ? '—' : formatEGPCurrency(item.highest_unit_price)}</TableCell>
                          <TableCell>{item.required_quantity}</TableCell>
                          <TableCell>{item.purchase_unit} / {item.storage_unit}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>الصرف اليومي</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {dailySpend.length === 0 ? (
                    <div className="text-sm text-muted-foreground">لا توجد مشتريات مسجلة في الفترة الحالية.</div>
                  ) : dailySpend.map((entry) => (
                    <div key={entry.day} className="flex items-center justify-between rounded-xl border p-3">
                      <div><div className="font-medium">{entry.day}</div><div className="text-xs text-muted-foreground">{entry.purchase_count} عملية</div></div>
                      <div className="font-semibold">{formatEGPCurrency(entry.total_spend)}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>نصائح وإرشادات التوفر</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {insights.length === 0 ? (
                    <div className="text-sm text-muted-foreground">سجّل عمليات شراء أكثر لتظهر نصائح التوفر المبنية على التاريخ.</div>
                  ) : insights.map((insight) => (
                    <div key={insight.id} className="rounded-xl border p-3">
                      <div className="font-medium">{insight.title}</div>
                      <div className="text-sm text-muted-foreground">{insight.description}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>إشعارات workflow</CardTitle>
              <CardDescription>إشعارات متابعة الشراء والاستلام بعد تسجيل العملية وحتى اعتماد المخزن.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Bell className="h-4 w-4" />غير المقروء لمسؤول المخازن: {unreadStoreNotifications}</div>
              {notifications.length === 0 ? (
                <div className="text-sm text-muted-foreground">لا توجد إشعارات بعد.</div>
              ) : notifications.map((notification) => (
                <div key={notification.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2"><div className="font-medium">{notification.title}</div>{!notification.is_read ? <Badge variant="outline">جديد</Badge> : null}</div>
                    <div className="text-sm text-muted-foreground">{notification.message}</div>
                    <div className="text-xs text-muted-foreground">{notification.audience === 'procurement_manager' ? 'إلى مدير المشتريات' : 'إلى مسؤول المخازن'} • {new Date(notification.created_at).toLocaleString('ar-EG')}</div>
                  </div>
                  {!notification.is_read ? <Button variant="outline" size="sm" onClick={() => void readNotification(notification)}>تمت القراءة</Button> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={purchaseDialogOpen} onOpenChange={(open) => {
        setPurchaseDialogOpen(open);
        if (!open) {
          setPurchaseItemSearch('');
          setItemPickerOpen(false);
          setPurchaseAccountingOpen(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل عملية شراء</DialogTitle>
            <DialogDescription>المسار الأساسي الآن أسرع: صنف، كمية، وحدة، سعر، ثم حفظ. بيانات الدفع اختيارية فقط عند الحاجة.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void registerPurchase(purchaseForm); setPurchaseItemSearch(''); setItemPickerOpen(false); setPurchaseDialogOpen(false); }}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>الصنف</Label>
                <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={itemPickerOpen} className="w-full justify-between">
                      {selectedPurchaseItem ? `${selectedPurchaseItem.name} - ${selectedPurchaseItem.sku}` : 'ابحث عن الصنف بالاسم أو الـ SKU'}
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        value={purchaseItemSearch}
                        onValueChange={setPurchaseItemSearch}
                        placeholder="اكتب أول حرف من اسم الصنف أو الـ SKU"
                      />
                      <CommandList>
                        <CommandEmpty>لا توجد أصناف مطابقة.</CommandEmpty>
                        {filteredPurchaseItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={item.id}
                            onSelect={() => {
                              setPurchaseForm((current) => hydratePurchaseDraft(item, current));
                              setPurchaseItemSearch(item.name);
                              setItemPickerOpen(false);
                            }}
                            className="flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1 text-right">
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{item.sku} • {INVENTORY_CATEGORY_LABELS[item.category]}</div>
                            </div>
                            <Check className={cn('mt-0.5 h-4 w-4', purchaseForm.itemId === item.id ? 'opacity-100' : 'opacity-0')} />
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedPurchaseItem ? (
                  <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 text-sm md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="text-muted-foreground">الفئة</div>
                      <div className="font-medium">{INVENTORY_CATEGORY_LABELS[selectedPurchaseItem.category]}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">القسم</div>
                      <div className="font-medium">{selectedPurchaseItem.subcategory || 'قسم عام'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">متوسط السعر المسجل</div>
                      <div className="font-medium">{formatPurchaseMetric(selectedPurchaseAnalytics?.average_unit_price ?? selectedPurchaseItem.avg_cost ?? selectedPurchaseItem.last_purchase_price)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">أقل سعر</div>
                      <div className="font-medium">{formatPurchaseMetric(selectedPurchaseAnalytics?.lowest_unit_price ?? selectedPurchaseItem.min_purchase_price ?? selectedPurchaseItem.last_purchase_price)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">أعلى سعر</div>
                      <div className="font-medium">{formatPurchaseMetric(selectedPurchaseAnalytics?.highest_unit_price ?? selectedPurchaseItem.max_purchase_price ?? selectedPurchaseItem.last_purchase_price)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">آخر سعر شراء</div>
                      <div className="font-medium">{formatPurchaseMetric(selectedPurchaseItem.last_purchase_price)}</div>
                    </div>
                  </div>
                ) : null}
                {purchasePriceChange ? (
                  <Alert className={purchasePriceChange.direction === 'up' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {purchasePriceChange.direction === 'up' ? 'ارتفع السعر' : 'انخفض السعر'} {purchasePriceChange.percent.toFixed(0)}% مقارنة بآخر سعر معروف.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>نوع الوحدة</Label>
                <Select value={purchaseForm.purchaseUnit} onValueChange={(value) => setPurchaseForm((current) => ({ ...current, purchaseUnit: value as RecordPurchaseInput['purchaseUnit'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVENTORY_UNIT_ORDER.map((unit) => <SelectItem key={unit} value={unit}>{INVENTORY_UNIT_LABELS[unit]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>الكمية المشتراة</Label><Input type="number" min="0" step="0.01" value={purchaseForm.purchasedQuantity} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchasedQuantity: Number(event.target.value) }))} required /></div>
              <div className="space-y-2"><Label>سعر الوحدة</Label><Input type="number" min="0" step="0.01" value={purchaseForm.purchasedUnitPrice} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchasedUnitPrice: Number(event.target.value) }))} required /></div>
              <div className="space-y-2"><Label>إجمالي العملية</Label><Input value={purchaseTotal ? formatEGPCurrency(purchaseTotal) : ''} readOnly /></div>
              <div className="space-y-2 md:col-span-2">
                <Label>اسم المورد</Label>
                <Input value={purchaseForm.purchasedSupplierName} onChange={(event) => setPurchaseForm((current) => ({ ...current, purchasedSupplierName: event.target.value }))} placeholder="اكتب اسم المورد المستخدم في هذه العملية" required />
                {suggestedSuppliers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {suggestedSuppliers.map((supplier) => (
                      <Button key={supplier} type="button" variant="outline" size="sm" onClick={() => setPurchaseForm((current) => ({ ...current, purchasedSupplierName: supplier }))}>
                        {supplier}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <Accordion type="single" collapsible value={purchaseAccountingOpen ? 'accounting' : ''} onValueChange={(value) => setPurchaseAccountingOpen(value === 'accounting')}>
              <AccordionItem value="accounting">
                <AccordionTrigger>تفاصيل محاسبية اختيارية</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>طريقة الدفع</Label><Select value={purchaseForm.paymentMethod ?? 'cash'} onValueChange={(value) => setPurchaseForm((current) => ({ ...current, paymentMethod: value as NonNullable<RecordPurchaseInput['paymentMethod']> }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHOD_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>حالة الدفع</Label><Select value={purchaseForm.paymentStatus ?? 'paid'} onValueChange={(value) => setPurchaseForm((current) => ({ ...current, paymentStatus: value as NonNullable<RecordPurchaseInput['paymentStatus']> }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>المبلغ المدفوع</Label><Input type="number" min="0" step="0.01" value={purchaseForm.paidAmount ?? ''} onChange={(event) => setPurchaseForm((current) => ({ ...current, paidAmount: Number(event.target.value) }))} /></div>
                    <div className="space-y-2"><Label>تاريخ السداد</Label><Input type="date" value={purchaseForm.dueDate ?? ''} onChange={(event) => setPurchaseForm((current) => ({ ...current, dueDate: event.target.value || null }))} /></div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <Button type="submit" className="w-full">تسجيل الشراء</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={quickBuyDialogOpen} onOpenChange={(open) => {
        setQuickBuyDialogOpen(open);
        if (!open) {
          setQuickItemSearch('');
          setQuickItemPickerOpen(false);
          setQuickAccountingOpen(false);
        }
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Quick Buy</DialogTitle>
            <DialogDescription>شاشة فاتورة سريعة: أضف سطرًا وراء سطر ثم احفظ الكل مرة واحدة.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4 lg:grid-cols-[2fr,0.8fr,0.8fr,0.9fr,auto]">
              <div className="space-y-2">
                <Label>الصنف</Label>
                <Popover open={quickItemPickerOpen} onOpenChange={setQuickItemPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={quickItemPickerOpen} className="w-full justify-between">
                      {selectedQuickItem ? `${selectedQuickItem.name} - ${selectedQuickItem.sku}` : 'اكتب مثل صد أو زيت للوصول السريع'}
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput value={quickItemSearch} onValueChange={setQuickItemSearch} placeholder="اكتب أول حرف من اسم الصنف أو الـ SKU" />
                      <CommandList>
                        <CommandEmpty>لا توجد أصناف مطابقة.</CommandEmpty>
                        {filteredQuickItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={item.id}
                            onSelect={() => {
                              setQuickBuyDraft((current) => hydratePurchaseDraft(item, current));
                              setQuickItemSearch(item.name);
                              setQuickItemPickerOpen(false);
                            }}
                            className="flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1 text-right">
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{item.sku} • {INVENTORY_CATEGORY_LABELS[item.category]}</div>
                            </div>
                            <Check className={cn('mt-0.5 h-4 w-4', quickBuyDraft.itemId === item.id ? 'opacity-100' : 'opacity-0')} />
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>الكمية</Label>
                <Input type="number" min="0" step="0.01" value={quickBuyDraft.purchasedQuantity} onChange={(event) => setQuickBuyDraft((current) => ({ ...current, purchasedQuantity: Number(event.target.value) }))} />
              </div>

              <div className="space-y-2">
                <Label>الوحدة</Label>
                <Select value={quickBuyDraft.purchaseUnit} onValueChange={(value) => setQuickBuyDraft((current) => ({ ...current, purchaseUnit: value as RecordPurchaseInput['purchaseUnit'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVENTORY_UNIT_ORDER.map((unit) => <SelectItem key={unit} value={unit}>{INVENTORY_UNIT_LABELS[unit]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>السعر</Label>
                <Input type="number" min="0" step="0.01" value={quickBuyDraft.purchasedUnitPrice} onChange={(event) => setQuickBuyDraft((current) => ({ ...current, purchasedUnitPrice: Number(event.target.value) }))} />
              </div>

              <div className="flex items-end">
                <Button type="button" onClick={addQuickBuyLine} disabled={!selectedQuickItem || quickBuyDraft.purchasedQuantity <= 0 || quickBuyDraft.purchasedUnitPrice <= 0}>
                  <Plus className="ml-1 h-4 w-4" />
                  إضافة
                </Button>
              </div>
            </div>

            {selectedQuickItem ? (
              <div className="space-y-3 rounded-xl border p-3 text-sm">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-muted-foreground">آخر سعر</div>
                    <div className="font-medium">{formatPurchaseMetric(latestPurchaseByItemId.get(selectedQuickItem.id)?.purchased_unit_price ?? selectedQuickItem.last_purchase_price)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">المورد الأخير</div>
                    <div className="font-medium">{latestPurchaseByItemId.get(selectedQuickItem.id)?.purchased_supplier_name ?? selectedQuickItem.supplier_name}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">إجمالي السطر</div>
                    <div className="font-medium">{formatEGPCurrency(quickBuyDraft.purchasedQuantity * quickBuyDraft.purchasedUnitPrice)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">متوسط السعر</div>
                    <div className="font-medium">{formatPurchaseMetric(selectedQuickAnalytics?.average_unit_price ?? selectedQuickItem.avg_cost ?? selectedQuickItem.last_purchase_price)}</div>
                  </div>
                </div>

                {quickSuggestedSuppliers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {quickSuggestedSuppliers.map((supplier) => (
                      <Button key={supplier} type="button" variant="outline" size="sm" onClick={() => setQuickBuyDraft((current) => ({ ...current, purchasedSupplierName: supplier }))}>
                        {supplier}
                      </Button>
                    ))}
                  </div>
                ) : null}

                {quickPriceChange ? (
                  <Alert className={quickPriceChange.direction === 'up' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {quickPriceChange.direction === 'up' ? 'ارتفع السعر' : 'انخفض السعر'} {quickPriceChange.percent.toFixed(0)}% مقارنة بآخر سعر معروف.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Accordion type="single" collapsible value={quickAccountingOpen ? 'accounting' : ''} onValueChange={(value) => setQuickAccountingOpen(value === 'accounting')}>
                  <AccordionItem value="accounting">
                    <AccordionTrigger>تفاصيل محاسبية اختيارية للسطر الحالي</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>اسم المورد</Label>
                          <Input value={quickBuyDraft.purchasedSupplierName} onChange={(event) => setQuickBuyDraft((current) => ({ ...current, purchasedSupplierName: event.target.value }))} />
                        </div>
                        <div className="space-y-2"><Label>طريقة الدفع</Label><Select value={quickBuyDraft.paymentMethod ?? 'cash'} onValueChange={(value) => setQuickBuyDraft((current) => ({ ...current, paymentMethod: value as NonNullable<RecordPurchaseInput['paymentMethod']> }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHOD_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-2"><Label>حالة الدفع</Label><Select value={quickBuyDraft.paymentStatus ?? 'paid'} onValueChange={(value) => setQuickBuyDraft((current) => ({ ...current, paymentStatus: value as NonNullable<RecordPurchaseInput['paymentStatus']> }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-2"><Label>المبلغ المدفوع</Label><Input type="number" min="0" step="0.01" value={quickBuyDraft.paidAmount ?? ''} onChange={(event) => setQuickBuyDraft((current) => ({ ...current, paidAmount: Number(event.target.value) }))} /></div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            ) : null}

            <Separator />

            {quickBuyLines.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-muted-foreground">أضف سطور الشراء ثم اضغط حفظ مرة واحدة.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصنف</TableHead>
                      <TableHead>الكمية</TableHead>
                      <TableHead>الوحدة</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>المورد</TableHead>
                      <TableHead>الإجمالي</TableHead>
                      <TableHead className="text-left">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quickBuyLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{line.itemName}</div>
                            <div className="text-xs text-muted-foreground">{line.sku}</div>
                          </div>
                        </TableCell>
                        <TableCell>{line.purchasedQuantity}</TableCell>
                        <TableCell>{INVENTORY_UNIT_LABELS[line.purchaseUnit]}</TableCell>
                        <TableCell>{formatEGPCurrency(line.purchasedUnitPrice)}</TableCell>
                        <TableCell>{line.purchasedSupplierName || '—'}</TableCell>
                        <TableCell>{formatEGPCurrency(line.purchasedQuantity * line.purchasedUnitPrice)}</TableCell>
                        <TableCell className="text-left">
                          <Button variant="outline" size="sm" onClick={() => setQuickBuyLines((current) => current.filter((currentLine) => currentLine.id !== line.id))}>حذف</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => {
                void registerQuickPurchase(quickBuyLines.map(({ id, itemName, sku, ...line }) => line));
                setQuickBuyLines([]);
                setQuickBuyDraft(createPurchaseForm());
                setQuickBuyDialogOpen(false);
              }}
              disabled={quickBuyLines.length === 0}
            >
              حفظ كل السطور
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الاستلام</DialogTitle>
            <DialogDescription>لن تضاف الكمية إلى المخزن قبل هذا الاعتماد.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void registerReceipt(receiptForm); setReceiptDialogOpen(false); }}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>تاريخ الاستلام</Label><Input type="date" value={receiptForm.receiptDate} onChange={(event) => setReceiptForm((current) => ({ ...current, receiptDate: event.target.value }))} required /></div>
              <div className="space-y-2"><Label>الموظف المستلم</Label><Input value={receiptForm.receivedBy} onChange={(event) => setReceiptForm((current) => ({ ...current, receivedBy: event.target.value }))} required /></div>
              <div className="space-y-2"><Label>نتيجة فحص الجودة</Label><Select value={receiptForm.qualityStatus} onValueChange={(value) => setReceiptForm((current) => ({ ...current, qualityStatus: value as ConfirmReceiptInput['qualityStatus'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{QUALITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>الكمية المضافة للمخزن</Label><Input type="number" min="0" step="0.01" value={receiptForm.receivedStorageQuantity} onChange={(event) => setReceiptForm((current) => ({ ...current, receivedStorageQuantity: Number(event.target.value) }))} required /></div>
              <div className="space-y-2"><Label>الكميات المرفوضة</Label><Input type="number" min="0" step="0.01" value={receiptForm.rejectedQuantity} onChange={(event) => setReceiptForm((current) => ({ ...current, rejectedQuantity: Number(event.target.value) }))} /></div>
              <div className="space-y-2"><Label>سبب الرفض</Label><Input value={receiptForm.rejectionReason} onChange={(event) => setReceiptForm((current) => ({ ...current, rejectionReason: event.target.value }))} /></div>
              <div className="space-y-2 md:col-span-2"><Label>ملاحظات الاستلام</Label><Textarea rows={4} value={receiptForm.receiptNotes} onChange={(event) => setReceiptForm((current) => ({ ...current, receiptNotes: event.target.value }))} /></div>
            </div>
            <Button type="submit" className="w-full">اعتماد الاستلام</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مورد</DialogTitle>
            <DialogDescription>تسجيل المورد، هاتفه، والفئات التي يوردها.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveSupplier(supplierForm); setSupplierForm({ id: '', name: '', phone: '', categories: [], notes: '', is_preferred: false }); setSupplierDialogOpen(false); }}>
            <div className="grid gap-4">
              <div className="space-y-2"><Label>اسم المورد</Label><Input value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} required /></div>
              <div className="space-y-2"><Label>رقم التليفون</Label><Input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} /></div>
              <div className="space-y-2">
                <Label>التقييم</Label>
                <Select value={String(supplierForm.rating)} onValueChange={(value) => setSupplierForm((current) => ({ ...current, rating: Number(value) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5].map((rating) => (
                      <SelectItem key={rating} value={String(rating)}>{rating === 0 ? 'بدون تقييم' : `${rating} نجوم`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الفئات التي يوردها</Label>
                <div className="grid gap-2 md:grid-cols-2">
                  {INVENTORY_CATEGORY_ORDER.map((category) => (
                    <label key={category} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <input type="checkbox" checked={supplierForm.categories.includes(category)} onChange={(event) => setSupplierForm((current) => ({ ...current, categories: event.target.checked ? [...current.categories, category] : current.categories.filter((value) => value !== category) }))} />
                      {INVENTORY_CATEGORY_LABELS[category]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2"><Label>ملاحظات</Label><Textarea rows={3} value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={supplierForm.is_preferred} onChange={(event) => setSupplierForm((current) => ({ ...current, is_preferred: event.target.checked }))} />مورد مفضل</label>
            </div>
            <Button type="submit" className="w-full">حفظ المورد</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}