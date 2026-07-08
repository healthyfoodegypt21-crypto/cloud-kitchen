import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';

export interface Brand {
  id: string;
  name: string;
  color: string;
}

export const LOCAL_DEMO_BRANDS: Brand[] = [
  { id: 'brand-1', name: 'Healthy Food', color: '#22c55e' },
  { id: 'brand-2', name: 'Healthy Station', color: '#3b82f6' },
  { id: 'brand-3', name: 'Protein Box', color: '#f59e0b' },
];

export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBrands = useCallback(async () => {
    if (isSupabaseUnavailable()) {
      setBrands(LOCAL_DEMO_BRANDS);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.from('brands').select('*');
    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
      }

      console.error(error);
      setBrands(LOCAL_DEMO_BRANDS);
      setLoading(false);
      return;
    }

    markSupabaseAvailable();
    setBrands((data ?? []) as Brand[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchBrands();
  }, [fetchBrands]);

  useSupabaseReconnect(() => {
    void fetchBrands();
  });

  return { brands, loading };
}
