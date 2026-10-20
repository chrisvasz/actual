import type * as PlatformModule from '@actual-app/core/shared/platform';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TestProviders } from '#mocks';
import { getNewsFeedUrl } from '#news/fetchNewsFeed';
import { newsFeedFixture } from '#news/fixtures';

import { useNewsFeed } from './useNewsFeed';

let mockLastSeenNewsDate: string | undefined = undefined;
const mockSetLastSeenNewsDate = vi.fn();

let mockShowNewsFeed = true;

vi.mock('#hooks/useGlobalPref', () => ({
  useGlobalPref: (key: string) =>
    key === 'showNewsFeed'
      ? [mockShowNewsFeed, vi.fn()]
      : [mockLastSeenNewsDate, mockSetLastSeenNewsDate],
}));

vi.mock('@actual-app/core/shared/platform', async () => {
  const actual = await vi.importActual<typeof PlatformModule>(
    '@actual-app/core/shared/platform',
  );
  return { ...actual, isPlaywright: false };
});

describe('useNewsFeed', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLastSeenNewsDate = undefined;
    mockShowNewsFeed = true;
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(newsFeedFixture),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the feed and reports unseen entries when enabled', async () => {
    mockLastSeenNewsDate = '2025-12-15';

    const { result } = renderHook(() => useNewsFeed(), {
      wrapper: TestProviders,
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledWith(await getNewsFeedUrl());
    expect(result.current.unseenCount).toBe(1);

    result.current.markAllSeen();
    expect(mockSetLastSeenNewsDate).toHaveBeenCalledWith('2026-01-01');
  });

  it('never fetches while the user has turned the news feed off', () => {
    mockShowNewsFeed = false;

    const { result } = renderHook(() => useNewsFeed(), {
      wrapper: TestProviders,
    });

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.entries).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a failed request once', async () => {
    fetchMock.mockRejectedValueOnce(new Error('flaky'));

    const { result } = renderHook(() => useNewsFeed(), {
      wrapper: TestProviders,
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('reports loading until the feed arrives', async () => {
    const { result } = renderHook(() => useNewsFeed(), {
      wrapper: TestProviders,
    });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('starts loading when the user turns the news feed on', async () => {
    mockShowNewsFeed = false;
    const { result, rerender } = renderHook(() => useNewsFeed(), {
      wrapper: TestProviders,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    mockShowNewsFeed = true;
    rerender();

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an error after one retry fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useNewsFeed(), {
      wrapper: TestProviders,
    });

    await waitFor(() => expect(result.current.error?.message).toBe('offline'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.entries).toEqual([]);
  });
});
