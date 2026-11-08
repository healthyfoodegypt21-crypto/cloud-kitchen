let cachedOffsetMs: number | null = null;
let lastSyncAt = 0;

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

// Reads the Date header of a lightweight Supabase REST request so time-based
// logic (expiry alerts, due dates) does not depend on the user's device clock.
export async function syncServerTime(force = false) {
  if (!force && cachedOffsetMs !== null && Date.now() - lastSyncAt < RESYNC_INTERVAL_MS) {
    return;
  }

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return;

  try {
    const startedAt = Date.now();
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: key },
      cache: 'no-store',
    });
    const dateHeader = response.headers.get('date');
    if (!dateHeader) return;

    const serverMs = new Date(dateHeader).getTime();
    if (!Number.isFinite(serverMs)) return;

    const midpoint = startedAt + Math.round((Date.now() - startedAt) / 2);
    cachedOffsetMs = serverMs - midpoint;
    lastSyncAt = Date.now();
  } catch {
    // Keep the previous offset (or local time) when the server is unreachable.
  }
}

export function serverNow() {
  return Date.now() + (cachedOffsetMs ?? 0);
}

export function serverToday() {
  const date = new Date(serverNow());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
