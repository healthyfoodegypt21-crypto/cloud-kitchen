import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useOrders } from '@/hooks/useOrders';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import Leaderboard from '@/pages/Leaderboard';

const LOCAL_DEMO_PROFILES = [
  { id: 'local-demo-owner', display_name: 'مالك تجريبي' },
];

export default function LeaderboardRoute() {
  const { orders } = useOrders();
  const [profiles, setProfiles] = useState<{ id: string; display_name: string }[]>([]);

  const loadProfiles = async () => {
    if (isSupabaseUnavailable()) {
      setProfiles(LOCAL_DEMO_PROFILES);
      return;
    }

    const { data, error } = await supabase.from('profiles').select('id, display_name');
    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
      }

      setProfiles(LOCAL_DEMO_PROFILES);
      return;
    }

    markSupabaseAvailable();
    setProfiles(data ?? []);
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  useSupabaseRealtimeRefresh({
    channelName: 'leaderboard-profiles-realtime',
    tables: [{ table: 'profiles' }],
    onRefresh: loadProfiles,
  });

  return <Leaderboard orders={orders} profiles={profiles} />;
}
