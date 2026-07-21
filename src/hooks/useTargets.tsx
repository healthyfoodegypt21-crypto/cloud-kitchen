import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';

export interface Target {
  id: string;
  type: string;
  value: number;
  brand_id: string | null;
}

const LOCAL_TARGETS_STORAGE_KEY = 'cloud_kitchen_local_targets';
const DEFAULT_LOCAL_TARGETS: Target[] = [
  { id: 'local-daily-orders', type: 'daily_orders', value: 10, brand_id: null },
  { id: 'local-daily-sales', type: 'daily_sales', value: 5000, brand_id: null },
  { id: 'local-monthly-orders', type: 'monthly_orders', value: 200, brand_id: null },
  { id: 'local-monthly-sales', type: 'monthly_sales', value: 100000, brand_id: null },
];

function getLocalTargets() {
  const rawValue = localStorage.getItem(LOCAL_TARGETS_STORAGE_KEY);
  if (!rawValue) {
    return DEFAULT_LOCAL_TARGETS;
  }

  try {
    const parsed = JSON.parse(rawValue) as Target[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_LOCAL_TARGETS;
  } catch {
    return DEFAULT_LOCAL_TARGETS;
  }
}

function saveLocalTargets(targets: Target[]) {
  localStorage.setItem(LOCAL_TARGETS_STORAGE_KEY, JSON.stringify(targets));
}

export function useTargets() {
  const [targets, setTargets] = useState<Target[]>([]);

  const fetch = useCallback(async () => {
    if (isSupabaseUnavailable()) {
      setTargets(getLocalTargets());
      return;
    }

    const { data, error } = await supabase.from('targets').select('*');
    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
      }

      console.error(error);
      setTargets(getLocalTargets());
      return;
    }

    markSupabaseAvailable();
    setTargets((data ?? []).map(t => ({ ...t, value: Number(t.value) })));
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);

  useSupabaseReconnect(() => {
    void fetch();
  });

  useSupabaseRealtimeRefresh({
    channelName: 'targets-realtime',
    tables: [{ table: 'targets' }],
    onRefresh: fetch,
  });

  const getTarget = (type: string) => targets.find(t => t.type === type)?.value ?? 0;

  const updateTarget = async (type: string, value: number) => {
    if (isSupabaseUnavailable()) {
      const currentTargets = getLocalTargets();
      const existingLocalTarget = currentTargets.find((target) => target.type === type);
      const nextTargets = existingLocalTarget
        ? currentTargets.map((target) => target.type === type ? { ...target, value } : target)
        : [...currentTargets, { id: `local-${type}`, type, value, brand_id: null }];
      saveLocalTargets(nextTargets);
      setTargets(nextTargets);
      return;
    }

    const existing = targets.find(t => t.type === type);
    const response = existing
      ? await supabase.from('targets').update({ value }).eq('id', existing.id)
      : await supabase.from('targets').insert({ type, value });

    if (response.error) {
      if (isSupabaseNetworkError(response.error)) {
        markSupabaseUnavailable();
        const currentTargets = getLocalTargets();
        const existingLocalTarget = currentTargets.find((target) => target.type === type);
        const nextTargets = existingLocalTarget
          ? currentTargets.map((target) => target.type === type ? { ...target, value } : target)
          : [...currentTargets, { id: `local-${type}`, type, value, brand_id: null }];
        saveLocalTargets(nextTargets);
        setTargets(nextTargets);
        return;
      }

      console.error(response.error);
    } else {
      markSupabaseAvailable();
    }

    void fetch();
  };

  return { targets, getTarget, updateTarget };
}
