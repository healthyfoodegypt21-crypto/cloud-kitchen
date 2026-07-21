import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseUnavailable } from '@/integrationssupabase/runtime';

type RealtimeTable = {
  table: string;
  filter?: string;
};

export function useSupabaseRealtimeRefresh(options: {
  enabled?: boolean;
  channelName: string;
  tables: RealtimeTable[];
  onRefresh: () => void | Promise<void>;
}) {
  const { enabled = true, channelName, tables, onRefresh } = options;

  useEffect(() => {
    if (!enabled || isSupabaseUnavailable() || tables.length === 0) {
      return;
    }

    const channel = tables.reduce((current, entry) => {
      const config = entry.filter
        ? { event: '*', schema: 'public', table: entry.table, filter: entry.filter }
        : { event: '*', schema: 'public', table: entry.table };
      return current.on('postgres_changes', config, () => {
        void onRefresh();
      });
    }, (supabase as any).channel(channelName));

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName, enabled, onRefresh, tables]);
}