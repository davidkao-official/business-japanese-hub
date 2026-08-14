import { act, render, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import type { AuthClient, SessionUser } from './types';

function createMockAuthClient(initialSession: SessionUser | null) {
  const listeners: Array<(user: SessionUser | null) => void> = [];
  const authClient: AuthClient = {
    getSession: vi.fn().mockResolvedValue(initialSession),
    signInWithPassword: vi.fn().mockResolvedValue({
      user: { id: 'u-1', email: 'reader@example.com' },
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn((listener) => {
      listeners.push(listener);
      return () => {};
    }),
  };
  return { authClient, listeners };
}

function renderAuth(authClient: AuthClient) {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider authClient={authClient}>{children}</AuthProvider>,
  });
}

describe('AuthProvider', () => {
  it('restores the persisted session on mount', async () => {
    const { authClient } = createMockAuthClient({ id: 'u-1', email: 'reader@example.com' });
    const { result } = renderAuth(authClient);

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(authClient.getSession).toHaveBeenCalledOnce();
    expect(result.current.user).toEqual({ id: 'u-1', email: 'reader@example.com' });
  });

  it('starts signed-out when there is no persisted session', async () => {
    const { authClient } = createMockAuthClient(null);
    const { result } = renderAuth(authClient);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('signs in with email/password and exposes the user', async () => {
    const { authClient } = createMockAuthClient(null);
    const { result } = renderAuth(authClient);

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signIn('reader@example.com', 'secret');
    });

    expect(authClient.signInWithPassword).toHaveBeenCalledWith({
      email: 'reader@example.com',
      password: 'secret',
    });
    expect(result.current.user).toEqual({ id: 'u-1', email: 'reader@example.com' });
  });

  it('signs out and clears the user', async () => {
    const { authClient } = createMockAuthClient({ id: 'u-1', email: 'reader@example.com' });
    const { result } = renderAuth(authClient);

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });

    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(result.current.user).toBeNull();
  });

  it('reacts to auth state change events (e.g. another tab signs in)', async () => {
    const { authClient, listeners } = createMockAuthClient(null);
    const { result } = renderAuth(authClient);

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      listeners[0]?.({ id: 'u-2', email: 'other@example.com' });
    });

    expect(result.current.user).toEqual({ id: 'u-2', email: 'other@example.com' });
  });

  it('does not crash when session restore fails; degrades to signed-out', async () => {
    const authClient: AuthClient = {
      getSession: vi.fn().mockRejectedValue(new Error('network down')),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => () => {}),
    };
    const { result } = renderAuth(authClient);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });
});

describe('useAuth', () => {
  it('throws when used outside an AuthProvider', () => {
    // useAuth throws during render; rendering outside the provider surfaces it.
    function Probe() {
      useAuth();
      return null;
    }

    expect(() => render(<Probe />)).toThrow(/must be used within an <AuthProvider>/);
  });
});
