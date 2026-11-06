import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBrands } from '@/hooks/useBrands';
import InventoryPage from '@/pages/Inventory';
import { supabase } from '@/integrations/supabase/client';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';

export default function InventoryRoute() {
  const { brands, loading } = useBrands();
  const [hub, setHub] = useState<{ id: string; name: string; stockBrandId: string; brandIds: string[] } | null>(null);
  const [hubLoading, setHubLoading] = useState(true);
  const [hubError, setHubError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const loadHub = useCallback(async () => {
    setHubLoading(true);
    setHubError('');
    const { data, error } = await asSupabaseLooseClient(supabase).rpc('inventory_get_shared_hub');
    if (error) {
      setHubError(error.message || 'تعذر تحميل إعداد المخزن المركزي.');
      setHub(null);
      setHubLoading(false);
      return;
    }

    const rows = Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null) : [];
    if (rows.length === 0) {
      setHubError('لا يوجد مخزن مركزي مهيأ لهذا الحساب. يرجى مراجعة مدير النظام.');
      setHub(null);
      setHubLoading(false);
      return;
    }

    setHub({
      id: String(rows[0].hub_id),
      name: String(rows[0].hub_name),
      stockBrandId: String(rows[0].stock_brand_id),
      brandIds: [...new Set(rows.map((row) => String(row.brand_id)))],
    });
    setHubLoading(false);
  }, []);

  useEffect(() => { void loadHub(); }, [loadHub, retryCount]);

  if (loading || hubLoading) {
    return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (hubError || !hub) {
    return <div className="mx-auto mt-10 max-w-xl rounded-2xl border bg-card p-6 text-center" role="alert">
      <h1 className="text-xl font-semibold">تعذر فتح المخزون المركزي</h1>
      <p className="mt-2 text-sm text-muted-foreground">{hubError || 'تعذر تحديد المخزن.'}</p>
      <Button className="mt-4" onClick={() => setRetryCount((current) => current + 1)}>إعادة المحاولة</Button>
    </div>;
  }

  return <InventoryPage brands={brands} brandsLoading={loading} hub={hub} />;
}
