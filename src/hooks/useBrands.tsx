import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidBrandId(id: string | null | undefined): boolean {
  return Boolean(id && UUID_REGEX.test(id));
}

function isAbortLockError(error: { message?: string } | null | undefined): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('aborterror') || msg.includes('lock broken') || msg.includes('request was aborted');
}

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
    let { data, error } = await supabase.from('brands').select('*');
    if (error && isAbortLockError(error)) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const retry = await supabase.from('brands').select('*');
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        setBrands(LOCAL_DEMO_BRANDS);
      } else {
        console.error(error);
        setBrands((prev) => (prev.length > 0 ? prev : LOCAL_DEMO_BRANDS));
      }
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

  useSupabaseRealtimeRefresh({
    channelName: 'brands-realtime',
    tables: [{ table: 'brands' }],
    onRefresh: fetchBrands,
  });

  return { brands, loading, refresh: fetchBrands };
}
