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
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
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
});