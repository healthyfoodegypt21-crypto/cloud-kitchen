import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import ProcurementPriceAlert from '@/components/ProcurementPriceAlert';
import PurchasesAssistant from '@/components/PurchasesAssistant';
import SmartPurchaseImportDialog, { type SmartPurchaseSubmission } from '@/components/SmartPurchaseImportDialog';
import ProcurementCenter from '@/pages/ProcurementCenter';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';

export default function PurchasesRoute() {
  const { displayName } = useAuth();
  // Procurement buys for the shared central store that serves every brand, so
  // the page always works on the hub's stock brand — no brand picker.
  const [brandId, setBrandId] = useState('');
  const [hubName, setHubName] = useState('');
  const [hubError, setHubError] = useState('');
  const [inventoryItems, setInventoryItems] = useState<Array<{ id: string; name: string; sku: string; purchaseUnit: string; usageUnit: string; conversionFactor: number; lastPurchasePrice: number }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importSource, setImportSource] = useState<'message' | 'image'>('message');

  const startImport = (source: 'message' | 'image') => {
    setImportSource(source);
    setImportOpen(true);
  };

  useEffect(() => {
    let active = true;
    const loadHub = async () => {
      const { data, error } = await asSupabaseLooseClient(supabase).rpc('inventory_get_shared_hub');
      if (!active) return;
      if (error) {
        setHubError(error.message || 'تعذر تحميل إعداد المخزن المركزي.');
        return;
      }
      const rows = Array.isArray(data) ? data.filter(isRecord) : [];
      if (rows.length === 0) {
        setHubError('لا يوجد مخزن مركزي مهيأ لهذا الحساب. يرجى مراجعة مدير النظام.');
        return;
      }
      setBrandId(String(rows[0].stock_brand_id));
      setHubName(String(rows[0].hub_name ?? ''));
    };
    void loadHub();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!brandId) {
      setInventoryItems([]);
      setSuppliers([]);
      return;
    }

    let active = true;
    setInventoryItems([]);
    setSuppliers([]);
    const loadItems = async () => {
      const { data, error } = await asSupabaseLooseClient(supabase)
        .from('items_master')
        .select('id,name,item_code,purchase_unit,usage_unit,conversion_factor,last_purchase_price')
        .eq('brand_id', brandId)
        .eq('status', 'active')
        .order('name');

      if (error) {
        if (active) {
          toast.error(error.message || 'تعذر تحميل أصناف المخزون');
        }
        return;
      }

      if (active) {
        setInventoryItems((Array.isArray(data) ? data.filter(isRecord) : []).map((item) => {
          return {
            id: String(item.id),
            name: String(item.name ?? ''),
            sku: String(item.item_code ?? ''),
            purchaseUnit: String(item.purchase_unit ?? ''),
            usageUnit: String(item.usage_unit ?? item.purchase_unit ?? ''),
            conversionFactor: Number(item.conversion_factor ?? 1),
            lastPurchasePrice: Number(item.last_purchase_price ?? 0),
          };
        }));
      }
      const supplierResult = await asSupabaseLooseClient(supabase)
        .from('suppliers')
        .select('id,name')
        .eq('brand_id', brandId)
        .eq('status', 'active')
        .order('name')
        .limit(500);
      if (supplierResult.error) {
        if (active) toast.error(supplierResult.error.message || 'تعذر تحميل دليل الموردين');
        return;
      }
      if (active) {
        setSuppliers((Array.isArray(supplierResult.data) ? supplierResult.data.filter(isRecord) : []).map((supplier) => ({
          id: String(supplier.id),
          name: String(supplier.name ?? ''),
        })));
      }
    };

    void loadItems();
    return () => {
      active = false;
    };
  }, [brandId]);

  const submitSmartPurchase = async (submission: SmartPurchaseSubmission) => {
    if (!brandId || submission.lines.length === 0 || !submission.purchaserName.trim()) {
      toast.error('تحقق من اختيار البراند واسم المشتري والأصناف');
      return false;
    }

    let storagePath = '';
    try {
      const invoiceNumber = submission.invoiceNumber.trim();
      if (invoiceNumber) {
        const { data: duplicateData } = await asSupabaseLooseClient(supabase)
          .from('supplier_invoices')
          .select('id')
          .eq('brand_id', brandId)
          .eq('invoice_number', invoiceNumber)
          .limit(1);
        if (Array.isArray(duplicateData) && duplicateData.length > 0) {
          toast.error(`رقم الفاتورة "${invoiceNumber}" مسجل مسبقًا لهذه العلامة؛ راجع سجل الفواتير لتجنب التكرار.`);
          return false;
        }
      }

      if (submission.invoiceFile) {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(submission.invoiceFile.type) || submission.invoiceFile.size > 12 * 1024 * 1024) {
          toast.error('الفاتورة يجب أن تكون PDF أو صورة معتمدة وحجمها لا يتجاوز 12 ميجابايت');
          return false;
        }
        storagePath = `${brandId}/${crypto.randomUUID()}-${submission.invoiceFile.name.replace(/[^\w.-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('supplier-invoices').upload(storagePath, submission.invoiceFile, {
          contentType: submission.invoiceFile.type,
          upsert: false,
        });
        if (uploadError) {
          toast.error(uploadError.message || 'تعذر رفع الفاتورة');
          return false;
        }
      }

      const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_record_procurement_direct_purchase_v2', {
        _brand_id: brandId,
        _supplier_id: submission.supplierId || null,
        _supplier_name: submission.supplierName,
        _purchaser_name: submission.purchaserName,
        _lines: submission.lines.map((line) => ({
          item_id: line.itemId,
          quantity: line.quantity,
          unit_cost: line.unitPrice,
          location_name: 'main',
          notes: 'إدخال سريع ذكي من رسالة أو صورة فاتورة',
          batch_no: '',
          expiry_date: null,
        })),
        _notes: submission.notes || 'إدخال سريع ذكي من رسالة أو صورة فاتورة',
        _invoice_number: submission.invoiceNumber,
        _invoice_date: submission.invoiceDate || null,
        _due_date: submission.dueDate || null,
        _tax_amount: submission.taxAmount,
        _discount_amount: submission.discountAmount,
        _paid_amount: submission.paidAmount,
        _payment_method: submission.paymentMethod,
        _invoice_storage_path: storagePath,
      });

      if (error) {
        if (storagePath) await supabase.storage.from('supplier-invoices').remove([storagePath]);
        toast.error(error.message || 'تعذر تسجيل الشراء');
        return false;
      }

      toast.success('تم تسجيل الشراء وإشعار المخزن لاعتماد الاستلام وإضافة الكميات');
      return true;
    } catch (error) {
      if (storagePath) await supabase.storage.from('supplier-invoices').remove([storagePath]);
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الشراء');
      return false;
    }
  };

  return (
    <>
      <div className="purchases-modern space-y-5">
        <PurchasesAssistant displayName={displayName} onStartImport={startImport} />
        {hubError ? (
          <div className="rounded-2xl border bg-card p-6 text-center" role="alert">
            <h1 className="text-xl font-semibold">تعذر فتح مركز المشتريات</h1>
            <p className="mt-2 text-sm text-muted-foreground">{hubError}</p>
          </div>
        ) : (
          <ProcurementCenter brandId={brandId} hubName={hubName} purchaserName={displayName} />
        )}
      </div>
      <SmartPurchaseImportDialog
        open={importOpen}
        inventoryItems={inventoryItems}
        suppliers={suppliers}
        defaultPurchaserName={displayName}
        startWith={importSource}
        onOpenChange={setImportOpen}
        onSubmit={submitSmartPurchase}
      />
    </>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}