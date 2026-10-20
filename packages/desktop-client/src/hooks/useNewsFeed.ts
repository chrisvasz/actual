import { useEffect, useState } from 'react';

import { fetchNewsFeed } from '#news/fetchNewsFeed';
import type { NewsEntry, NewsFeed } from '#news/types';
import { getNewestDate, getUnseenEntries } from '#news/utils';

import { useGlobalPref } from './useGlobalPref';

const EMPTY_ENTRIES: NewsEntry[] = [];

export function useNewsFeed() {
  // The setting (on by default) lets the user opt out of the feed and of the
  // request it makes to GitHub.
  const [showNewsFeed] = useGlobalPref('showNewsFeed');
  const isEnabled = Boolean(showNewsFeed);
  const [lastSeenNewsDate, setLastSeenNewsDate] =
    useGlobalPref('lastSeenNewsDate');

  const [feed, setFeed] = useState<NewsFeed>();
  const [error, setError] = useState<Error | null>(null);

  // No request is ever made while the feature is off.
  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    let isCurrent = true;
    // Being offline is a normal state for a local-first app, not an error
    // worth retrying repeatedly.
    fetchNewsFeed()
      .catch(() => fetchNewsFeed())
      .then(
        result => {
          if (isCurrent) {
            setFeed(result);
            setError(null);
          }
        },
        (loadError: Error) => {
          if (isCurrent) {
            setError(loadError);
          }
        },
      );
    return () => {
      isCurrent = false;
    };
  }, [isEnabled]);

  const entries = (isEnabled && feed?.entries) || EMPTY_ENTRIES;
  const unseenCount = getUnseenEntries(entries, lastSeenNewsDate).length;

  const markAllSeen = () => {
    const newestDate = getNewestDate(entries);
    if (newestDate && newestDate !== lastSeenNewsDate) {
      setLastSeenNewsDate(newestDate);
    }
  };

  return {
    isEnabled,
    entries,
    unseenCount,
    lastSeenNewsDate,
    markAllSeen,
    isLoading: isEnabled && !feed && !error,
    error: isEnabled ? error : null,
  };
}
