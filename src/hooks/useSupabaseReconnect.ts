import { useEffect } from 'react';

export function useSupabaseReconnect(onReconnect: () => void) {
  useEffect(() => {
    const handleOnline = () => {
      onReconnect();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onReconnect();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onReconnect]);
}