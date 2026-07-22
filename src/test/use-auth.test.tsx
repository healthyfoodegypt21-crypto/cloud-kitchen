import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { resetSupabaseRuntimeState } from '@/integrationssupabase/runtime';

const mockOnAuthStateChange = vi.fn();
const mockGetSession = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', 'true');
    sessionStorage.clear();
    resetSupabaseRuntimeState();

    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    mockGetSession.mockResolvedValue({
      data: {
        session: null,
      },
    });

    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    });
    mockRemoveChannel.mockResolvedValue(undefined);
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    sessionStorage.clear();
    resetSupabaseRuntimeState();
  });

  it('hydrates demo mode from sessionStorage when there is no active Supabase session', async () => {
    sessionStorage.setItem('cloud_kitchen_demo_session', JSON.stringify({
      role: 'owner',
      displayName: 'مالك تجريبي',
      email: 'demo@cloudkitchen.local',
    }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isDemoMode).toBe(true);
    expect(result.current.authMode).toBe('demo');
    expect(result.current.displayName).toBe('مالك تجريبي');
    expect(result.current.role).toBe('owner');
    expect(result.current.user?.email).toBe('demo@cloudkitchen.local');
  });

  it('clears the demo session on sign out', async () => {
    sessionStorage.setItem('cloud_kitchen_demo_session', JSON.stringify({
      role: 'owner',
      displayName: 'مالك تجريبي',
      email: 'demo@cloudkitchen.local',
    }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isDemoMode).toBe(true);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isDemoMode).toBe(false);
    expect(result.current.user).toBeNull();
    expect(sessionStorage.getItem('cloud_kitchen_demo_session')).toBeNull();
  });

  it('keeps loading true until session permissions finish loading', async () => {
    const roleDeferred = createDeferred<{ data: string | null; error: null }>();
    const profileDeferred = createDeferred<{ data: { display_name: string } | null; error: null }>();
    const pagesDeferred = createDeferred<{ data: Array<{ page: string }>; error: null }>();

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'user@example.com' },
        },
      },
    });

    mockRpc.mockReturnValue(roleDeferred.promise);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockReturnValue(profileDeferred.promise),
        };
      }

      if (table === 'user_page_permissions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue(pagesDeferred.promise),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user?.id).toBe('user-1');
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.role).toBeNull();

    roleDeferred.resolve({ data: 'call_center', error: null });
    profileDeferred.resolve({ data: { display_name: 'موظف الطلبات' }, error: null });
    pagesDeferred.resolve({ data: [{ page: 'orders' }], error: null });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.role).toBe('call_center');
    expect(result.current.displayName).toBe('موظف الطلبات');
    expect(result.current.pagePermissions).toEqual(['orders']);
  });

  it('stops loading even when user permission hydration throws', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'user@example.com' },
        },
      },
    });

    mockRpc.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user?.id).toBe('user-1');
    expect(result.current.role).toBeNull();
    expect(result.current.displayName).toBe('');
    expect(result.current.pagePermissions).toEqual([]);
  });
});