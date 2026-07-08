import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SUPABASE_UNAVAILABLE_COOLDOWN_MS,
  isSupabaseNetworkError,
  isSupabaseUnavailable,
  markSupabaseAvailable,
  markSupabaseUnavailable,
  resetSupabaseRuntimeState,
} from '@/integrationssupabase/runtime';

describe('supabase runtime state', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetSupabaseRuntimeState();
  });

  it('treats network failures as temporary and retries after cooldown', () => {
    vi.useFakeTimers();

    markSupabaseUnavailable();
    expect(isSupabaseUnavailable()).toBe(true);

    vi.advanceTimersByTime(SUPABASE_UNAVAILABLE_COOLDOWN_MS - 1);
    expect(isSupabaseUnavailable()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isSupabaseUnavailable()).toBe(false);
  });

  it('clears the unavailable state immediately when availability is restored', () => {
    markSupabaseUnavailable();
    expect(isSupabaseUnavailable()).toBe(true);

    markSupabaseAvailable();
    expect(isSupabaseUnavailable()).toBe(false);
  });

  it('detects common network error shapes', () => {
    expect(isSupabaseNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(isSupabaseNetworkError({ details: 'ERR_NAME_NOT_RESOLVED' })).toBe(true);
    expect(isSupabaseNetworkError({ message: 'permission denied for table profiles' })).toBe(false);
  });
});