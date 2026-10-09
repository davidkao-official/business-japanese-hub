import { act, renderHook, waitFor } from '@testing-library/react';
import { AuthProvider } from '@business-japanese-hub/platform-auth';
import type { AuthClient, SessionUser } from '@business-japanese-hub/platform-auth';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { UserStateRepository } from './repository';
import { UserStateProvider } from './UserStateContext';
import { useSaveReadingState } from './useBookState';

const ownerA: SessionUser = { id: 'user-a' };
const ownerB: SessionUser = { id: 'user-b' };

function createAuth(initialUser: SessionUser | null) {
  let currentUser = initialUser;
  const listeners: Array<(user: SessionUser | null) => void> = [];
  const authClient: AuthClient = {
    getSession: vi.fn(async () => currentUser),
    signInWithPassword: vi.fn(async () => ({ user: ownerA })),
    signUpWithPassword: vi.fn(async () => ({ user: ownerA, signedIn: true })),
    signOut: vi.fn(async () => {}),
    onAuthStateChange: vi.fn((listener: (user: SessionUser | null) => void) => {
      listeners.push(listener);
      return () => {};
    }),
  };
  return {
    authClient,
    changeUser(user: SessionUser | null) {
      currentUser = user;
      for (const listener of listeners) listener(user);
    },
  };
}

function createRepository(saveReadingState: UserStateRepository['saveReadingState']) {
  return {
    getEntitlement: vi.fn(async () => null),
    getReadingState: vi.fn(async () => null),
    saveReadingState,
    listBookmarks: vi.fn(async () => []),
    saveBookmark: vi.fn(async () => ({
      id: 'bookmark-1',
      bookId: 'book-a',
      chapterId: 'chapter-a',
      createdAt: '2026-10-08T00:00:00.000Z',
    })),
  } satisfies UserStateRepository;
}

function wrapperFor(authClient: AuthClient, repository: UserStateRepository) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider authClient={authClient}>
      <UserStateProvider repository={repository}>{children}</UserStateProvider>
    </AuthProvider>
  );
}

const state = { bookId: 'book-a', chapterId: 'chapter-a', blockId: 'anchor-a', offset: 17 };

describe('useSaveReadingState initiating owner', () => {
  it('keeps the callback owner when auth changes from A to B before invocation', async () => {
    const auth = createAuth(ownerA);
    const save = vi.fn(async () => {});
    const repository = createRepository(save);
    const { result } = renderHook(() => useSaveReadingState(), {
      wrapper: wrapperFor(auth.authClient, repository),
    });
    const beforeRestore = result.current;
    await waitFor(() => expect(result.current).not.toBe(beforeRestore));
    const callbackForA = result.current;

    act(() => auth.changeUser(ownerB));
    await act(async () => callbackForA(state));
    await act(async () => result.current(state));

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls).toEqual([[state, ownerA.id], [state, ownerB.id]]);
  });

  it('does not save while signed out', async () => {
    const auth = createAuth(null);
    const save = vi.fn(async () => {});
    const repository = createRepository(save);
    const { result } = renderHook(() => useSaveReadingState(), {
      wrapper: wrapperFor(auth.authClient, repository),
    });

    await waitFor(() => expect(auth.authClient.getSession).toHaveBeenCalledOnce());
    act(() => result.current(state));

    expect(save).not.toHaveBeenCalled();
  });

  it('swallows a failed position save without retrying it', async () => {
    const auth = createAuth(ownerA);
    let rejectSave!: (reason: Error) => void;
    const save = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    }));
    const repository = createRepository(save);
    const { result } = renderHook(() => useSaveReadingState(), {
      wrapper: wrapperFor(auth.authClient, repository),
    });
    const beforeRestore = result.current;
    await waitFor(() => expect(result.current).not.toBe(beforeRestore));

    act(() => result.current(state));
    await act(async () => {
      rejectSave(new Error('synthetic save failure'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(save).toHaveBeenCalledOnce();
  });
});
