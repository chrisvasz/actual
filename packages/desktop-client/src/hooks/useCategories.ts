import { useMemo } from 'react';

import { groupById } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import { useLiveRead } from './useLiveRead';

type CategoryViews = {
  grouped: CategoryGroupEntity[];
  list: CategoryEntity[];
};

const NO_CATEGORIES: CategoryViews = { grouped: [], list: [] };

/** Every category group with its categories, and every category, in order. */
export function useCategories(): CategoryViews {
  return useLiveRead('get-categories').data ?? NO_CATEGORIES;
}

export function useCategoriesById() {
  const { list, grouped } = useCategories();
  return useMemo(
    () => ({ list: groupById(list), grouped: groupById(grouped) }),
    [list, grouped],
  );
}
