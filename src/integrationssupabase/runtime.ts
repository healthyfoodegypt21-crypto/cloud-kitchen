type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

type SupabaseBackendMode = 'unknown' | 'available' | 'unreachable';

let supabaseBackendMode: SupabaseBackendMode = 'unknown';
let supabaseUnavailableUntil = 0;

export const SUPABASE_UNAVAILABLE_COOLDOWN_MS = 30_000;

const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'fetch failed',
  'load failed',
  'network request failed',
  'networkerror',
  'network error',
  'err_name_not_resolved',
  'name_not_resolved',
  'err_internet_disconnected',
  'dns_error',
];

function normalizeErrorText(error: SupabaseErrorLike) {
  return [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function isSupabaseNetworkError(error: SupabaseErrorLike) {
  const text = normalizeErrorText(error);
  return NETWORK_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

export function markSupabaseAvailable() {
  supabaseBackendMode = 'available';
  supabaseUnavailableUntil = 0;
}

export function markSupabaseUnavailable() {
  supabaseBackendMode = 'unreachable';
  supabaseUnavailableUntil = Date.now() + SUPABASE_UNAVAILABLE_COOLDOWN_MS;
}

export function isSupabaseUnavailable() {
  if (supabaseBackendMode !== 'unreachable') {
    return false;
  }

  if (Date.now() >= supabaseUnavailableUntil) {
    supabaseBackendMode = 'unknown';
    supabaseUnavailableUntil = 0;
    return false;
  }

  return true;
}

export function getSupabaseOfflineReason(scope: string) {
  return `يتم تشغيل ${scope} محليًا لأن الاتصال بقاعدة البيانات غير متاح حاليًا.`;
}

export function resetSupabaseRuntimeState() {
  supabaseBackendMode = 'unknown';
  supabaseUnavailableUntil = 0;
}