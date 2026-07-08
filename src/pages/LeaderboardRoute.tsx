import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useOrders } from '@/hooks/useOrders';
import Leaderboard from '@/pages/Leaderboard';

const LOCAL_DEMO_PROFILES = [
  { id: 'local-demo-owner', display_name: 'مالك تجريبي' },
];

export default function LeaderboardRoute() {
  const { orders } = useOrders();
  const [profiles, setProfiles] = useState<{ id: string; display_name: string }[]>([]);

  useEffect(() => {
    if (isSupabaseUnavailable()) {
      setProfiles(LOCAL_DEMO_PROFILES);
      return;
    }

    supabase.from('profiles').select('id, display_name').then(({ data, error }) => {
      if (error) {
        if (isSupabaseNetworkError(error)) {
          markSupabaseUnavailable();
        }

        setProfiles(LOCAL_DEMO_PROFILES);
        return;
      }

      markSupabaseAvailable();
      setProfiles(data ?? []);
    });
  }, []);

  return <Leaderboard orders={orders} profiles={profiles} />;
}
