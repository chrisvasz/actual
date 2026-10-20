import { useMemo } from 'react';

import type { TagEntity } from '@actual-app/core/types/models';
import { byLengthAsc, byStartAsc, Fzf } from 'fzf';

import { useLiveRead } from './useLiveRead';
import { useSyncedPref } from './useSyncedPref';

const NO_TAGS: TagEntity[] = [];

/** Every tag, by name; hidden ones only with `show-hidden-tags` on. */
export function useTags(): TagEntity[] {
  const [showHiddenTags] = useSyncedPref('show-hidden-tags');
  const tags = useLiveRead('tags-get').data ?? NO_TAGS;
  return useMemo(
    () => (showHiddenTags === 'true' ? tags : tags.filter(tag => !tag.hidden)),
    [tags, showHiddenTags],
  );
}

export function filterTags<T extends TagEntity>(
  tags: T[],
  filterStr: string,
): T[] {
  return new Fzf(tags as TagEntity[], {
    selector: tag => tag.tag,
    limit: 100,
    tiebreakers: [byLengthAsc, byStartAsc],
  })
    .find(filterStr.replace(/^#/, ''))
    .map(item => item.item as T);
}

export function useFilteredTags(
  filterStr: string,
  requireHashInFilter?: boolean,
): TagEntity[] {
  const tags = useTags();
  return useMemo(() => {
    if (!filterStr) return [];
    if (requireHashInFilter && !filterStr.startsWith('#')) return [];
    return new Fzf(tags, {
      selector: tag => tag.tag,
      limit: 100,
      tiebreakers: [byLengthAsc, byStartAsc],
      casing: 'case-insensitive',
    })
      .find(filterStr.replace(/^#/, ''))
      .map(item => item.item);
  }, [tags, filterStr, requireHashInFilter]);
}
