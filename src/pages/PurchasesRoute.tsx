import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import SmartPurchaseImportDialog, { type SmartPurchaseSubmission } from '@/components/SmartPurchaseImportDialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useBrands } from '@/hooks/useBrands';
import { supabase } from '@/integrations/supabase/client';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';
import Procurement from '@/pages/Procurement';

export default function PurchasesRoute() {
  const { brands } = useBrands();
  const { displayName } = useAuth();
  const [brandId, setBrandId] = useState('');
  const [inventoryItems, setInventoryItems] = useState<Array<{ id: string; name: string; unit: string }>>([]);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!brandId && brands[0]) {
      setBrandId(brands[0].id);
    }
  }, [brandId, brands]);

  useEffect(() => {
    if (!brandId) {
      setInventoryItems([]);
      return;
    }

    let active = true;
    setInventoryItems([]);
    const loadItems = async () => {
      const { data, error } = await asSupabaseLooseClient(supabase)
        .from('items_master')
        .select('id,name,purchase_unit')
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
            unit: String(item.purchase_unit ?? ''),
          };
        }));
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

    try {
      const { error } = await asSupabaseLooseClient(supabase).rpc('inventory_record_procurement_direct_purchase', {
        _brand_id: brandId,
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
      });

      if (error) {
        toast.error(error.message || 'تعذر تسجيل الشراء');
        return false;
      }

      toast.success('تم تسجيل الشراء وإشعار المخزن لاعتماد الاستلام وإضافة الكميات');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تسجيل الشراء');
      return false;
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button className="gap-2" onClick={() => setImportOpen(true)} disabled={!brandId}>
          <Sparkles className="h-4 w-4" />
          إدخال سريع ذكي
        </Button>
      </div>
      <Procurement />
      <SmartPurchaseImportDialog
        open={importOpen}
        inventoryItems={inventoryItems}
        defaultPurchaserName={displayName}
        onOpenChange={setImportOpen}
        onSubmit={submitSmartPurchase}
      />
    </>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}