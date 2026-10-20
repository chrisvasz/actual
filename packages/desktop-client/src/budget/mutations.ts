import { send } from '@actual-app/core/platform/client/connection';
import { readSync } from '@actual-app/core/platform/client/live-reads';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { useMutation } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

import { useReportErrors } from '#hooks/useReportErrors';
import { pushModal } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import type { AppDispatch } from '#redux/store';

// Live reads pick up each change once it's applied, so these only send it.
// A change is applied, and the categories read again on the next render,
// by the time its call resolves.

function readCategories(): {
  grouped: CategoryGroupEntity[];
  list: CategoryEntity[];
} {
  return readSync('get-categories').data;
}

function dispatchErrorNotification(
  dispatch: AppDispatch,
  message: string,
  error?: Error,
) {
  dispatch(
    addNotification({
      notification: {
        id: uuidv4(),
        type: 'error',
        message,
        pre: error ? error.message : undefined,
      },
    }),
  );
}

function dispatchCategoryNameAlreadyExistsNotification(
  dispatch: AppDispatch,
  name: CategoryEntity['name'],
) {
  dispatch(
    addNotification({
      notification: {
        type: 'error',
        message: `Category "${name}" already exists in group (it may be hidden)`,
      },
    }),
  );
}

type CreateCategoryPayload = {
  name: CategoryEntity['name'];
  groupId: CategoryGroupEntity['id'];
  isIncome: boolean;
  isHidden: boolean;
};

export function useCreateCategory() {
  return useReportErrors(
    'There was an error creating the category. Please try again.',
    ({ name, groupId, isIncome, isHidden }: CreateCategoryPayload) =>
      send('category-create', {
        name,
        groupId,
        isIncome,
        hidden: isHidden,
      }),
  );
}

type UpdateCategoryPayload = {
  category: CategoryEntity;
};

export function useUpdateCategory() {
  return useReportErrors(
    'There was an error updating the category. Please try again.',
    async ({ category }: UpdateCategoryPayload) => {
      await send('category-update', category);
    },
  );
}

type SaveCategoryPayload = {
  category: CategoryEntity;
};

export function useSaveCategory() {
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const dispatch = useDispatch();

  return async ({ category }: SaveCategoryPayload) => {
    const group = readCategories().grouped.find(g => g.id === category.group);
    const categoriesInGroup = group?.categories ?? [];
    const exists = categoriesInGroup.some(
      c =>
        c.id !== category.id &&
        c.name.toUpperCase() === category.name.toUpperCase(),
    );

    if (exists) {
      dispatchCategoryNameAlreadyExistsNotification(dispatch, category.name);
      return;
    }

    if (category.id === 'new') {
      await createCategory({
        name: category.name,
        groupId: category.group,
        isIncome: !!category.is_income,
        isHidden: !!category.hidden,
      });
    } else {
      await updateCategory({ category });
    }
  };
}

type DeleteCategoryPayload = {
  id: CategoryEntity['id'];
};

export function useDeleteCategory() {
  const dispatch = useDispatch();

  return useReportErrors(
    'There was an error deleting the category. Please try again.',
    async ({ id }: DeleteCategoryPayload) => {
      const mustTransfer = await send('must-category-transfer', { id });

      if (mustTransfer) {
        dispatch(
          pushModal({
            modal: {
              name: 'confirm-category-delete',
              options: {
                category: id,
                onDelete: async transferCategory => {
                  if (id !== transferCategory) {
                    await send('category-delete', {
                      id,
                      transferId: transferCategory,
                    });
                  }
                },
              },
            },
          }),
        );
      } else {
        await send('category-delete', { id });
      }
    },
  );
}

type MoveCategoryPayload = {
  id: CategoryEntity['id'];
  groupId: CategoryGroupEntity['id'];
  targetId: CategoryEntity['id'] | null;
};

export function useMoveCategory() {
  return useReportErrors(
    'There was an error moving the category. Please try again.',
    async ({ id, groupId, targetId }: MoveCategoryPayload) => {
      await send('category-move', { id, groupId, targetId });
    },
  );
}

export function useReorderCategory() {
  const moveCategory = useMoveCategory();
  const dispatch = useDispatch();

  return async ({ id, groupId, targetId }: MoveCategoryPayload) => {
    const { grouped: categoryGroups, list: categories } = readCategories();

    const moveCandidate = categories.filter(c => c.id === id)[0];
    const group = categoryGroups.find(g => g.id === groupId);
    const categoriesInGroup = group?.categories ?? [];
    const exists = categoriesInGroup.some(
      c =>
        c.id !== moveCandidate.id &&
        c.name.toUpperCase() === moveCandidate.name.toUpperCase(),
    );

    if (exists) {
      dispatchCategoryNameAlreadyExistsNotification(
        dispatch,
        moveCandidate.name,
      );
      return;
    }

    await moveCategory({ id, groupId, targetId });
  };
}

type CreateCategoryGroupPayload = {
  name: CategoryGroupEntity['name'];
};

export function useCreateCategoryGroup() {
  return useReportErrors(
    'There was an error creating the category group. Please try again.',
    ({ name }: CreateCategoryGroupPayload) =>
      send('category-group-create', { name }),
  );
}

type UpdateCategoryGroupPayload = {
  group: CategoryGroupEntity;
};

export function useUpdateCategoryGroup() {
  return useReportErrors(
    'There was an error updating the category group. Please try again.',
    async ({ group }: UpdateCategoryGroupPayload) => {
      // Strip off the categories field if it exist. It's not a real db
      // field but groups have this extra field in the client most of the time
      const { categories: _, ...groupNoCategories } = group;
      await send('category-group-update', groupNoCategories);
    },
  );
}

type SaveCategoryGroupPayload = {
  group: CategoryGroupEntity;
};

export function useSaveCategoryGroup() {
  const createCategoryGroup = useCreateCategoryGroup();
  const updateCategoryGroup = useUpdateCategoryGroup();
  const dispatch = useDispatch();

  return async ({ group }: SaveCategoryGroupPayload) => {
    const exists = readCategories().grouped.some(
      g =>
        g.id !== group.id && g.name.toUpperCase() === group.name.toUpperCase(),
    );

    if (exists) {
      dispatchErrorNotification(
        dispatch,
        `A category group with name "${group.name}" already exists.`,
      );
      return;
    }

    if (group.id === 'new') {
      await createCategoryGroup({ name: group.name });
    } else {
      await updateCategoryGroup({ group });
    }
  };
}

type DeleteCategoryGroupPayload = {
  id: CategoryGroupEntity['id'];
};

export function useDeleteCategoryGroup() {
  const dispatch = useDispatch();

  return useReportErrors(
    'There was an error deleting the category group. Please try again.',
    async ({ id }: DeleteCategoryGroupPayload) => {
      const group = readCategories().grouped.find(g => g.id === id);

      if (!group) {
        return;
      }

      const categories = group.categories ?? [];

      let mustTransfer = false;
      for (const category of categories) {
        if (await send('must-category-transfer', { id: category.id })) {
          mustTransfer = true;
          break;
        }
      }

      if (mustTransfer) {
        dispatch(
          pushModal({
            modal: {
              name: 'confirm-category-delete',
              options: {
                group: id,
                onDelete: async transferCategory => {
                  await send('category-group-delete', {
                    id,
                    transferId: transferCategory,
                  });
                },
              },
            },
          }),
        );
      } else {
        await send('category-group-delete', { id });
      }
    },
  );
}

type MoveCategoryGroupPayload = {
  id: CategoryGroupEntity['id'];
  targetId: CategoryGroupEntity['id'] | null;
};

export function useMoveCategoryGroup() {
  return useReportErrors(
    'There was an error moving the category group. Please try again.',
    async ({ id, targetId }: MoveCategoryGroupPayload) => {
      await send('category-group-move', { id, targetId });
    },
  );
}

type SortCategoriesPayload = {
  groupId: CategoryGroupEntity['id'];
  direction: 'asc' | 'desc';
};

export function useSortCategories() {
  return useReportErrors(
    'There was an error sorting the categories. Please try again.',
    async ({ groupId, direction }: SortCategoriesPayload) => {
      await send('categories-sort', { groupId, direction });
    },
  );
}

type ApplyBudgetActionPayload =
  | {
      type: 'budget-amount';
      month: string;
      args: {
        category: CategoryEntity['id'];
        amount: number;
      };
    }
  | {
      type: 'copy-last';
      month: string;
      args?: never;
    }
  | {
      type: 'set-zero';
      month: string;
      args?: never;
    }
  | {
      type: 'set-3-avg';
      month: string;
      args?: never;
    }
  | {
      type: 'set-6-avg';
      month: string;
      args?: never;
    }
  | {
      type: 'set-12-avg';
      month: string;
      args?: never;
    }
  | {
      type: 'hold';
      month: string;
      args: {
        amount: number;
      };
    }
  | {
      type: 'reset-hold';
      month: string;
      args?: never;
    }
  | {
      type: 'cover-overspending';
      month: string;
      args: {
        to: CategoryEntity['id'];
        from: CategoryEntity['id'];
        amount?: IntegerAmount;
      };
    }
  | {
      type: 'transfer-available';
      month: string;
      args: {
        amount: number;
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'cover-overbudgeted';
      month: string;
      args: {
        category: CategoryEntity['id'];
        amount?: IntegerAmount;
      };
    }
  | {
      type: 'transfer-category';
      month: string;
      args: {
        amount: number;
        from: CategoryEntity['id'];
        to: CategoryEntity['id'];
      };
    }
  | {
      type: 'carryover';
      month: string;
      args: {
        category: CategoryEntity['id'];
        flag: boolean;
      };
    }
  | {
      type: 'reset-income-carryover';
      month: string;
      args?: never;
    }
  | {
      type: 'set-single-3-avg';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'set-single-6-avg';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'set-single-12-avg';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    }
  | {
      type: 'copy-single-last';
      month: string;
      args: {
        category: CategoryEntity['id'];
      };
    };

export function useBudgetActions() {
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async ({ month, type, args }: ApplyBudgetActionPayload) => {
      switch (type) {
        case 'budget-amount':
          await send('budget/budget-amount', {
            month,
            category: args.category,
            amount: args.amount,
          });
          break;
        case 'copy-last':
          await send('budget/copy-previous-month', { month });
          break;
        case 'set-zero':
          await send('budget/set-zero', { month });
          break;
        case 'set-3-avg':
          await send('budget/set-3month-avg', { month });
          break;
        case 'set-6-avg':
          await send('budget/set-6month-avg', { month });
          break;
        case 'set-12-avg':
          await send('budget/set-12month-avg', { month });
          break;
        case 'hold':
          await send('budget/hold-for-next-month', {
            month,
            amount: args.amount,
          });
          break;
        case 'reset-hold':
          await send('budget/reset-hold', { month });
          break;
        case 'cover-overspending':
          await send('budget/cover-overspending', {
            month,
            to: args.to,
            from: args.from,
            amount: args.amount,
          });
          break;
        case 'transfer-available':
          await send('budget/transfer-available', {
            month,
            amount: args.amount,
            category: args.category,
          });
          break;
        case 'cover-overbudgeted':
          await send('budget/cover-overbudgeted', {
            month,
            category: args.category,
            amount: args.amount,
          });
          break;
        case 'transfer-category':
          await send('budget/transfer-category', {
            month,
            amount: args.amount,
            from: args.from,
            to: args.to,
          });
          break;
        case 'carryover': {
          await send('budget/set-carryover', {
            startMonth: month,
            category: args.category,
            flag: args.flag,
          });
          break;
        }
        case 'reset-income-carryover':
          await send('budget/reset-income-carryover', { month });
          break;
        case 'set-single-3-avg':
          await send('budget/set-n-month-avg', {
            month,
            N: 3,
            category: args.category,
          });
          break;
        case 'set-single-6-avg':
          await send('budget/set-n-month-avg', {
            month,
            N: 6,
            category: args.category,
          });
          break;
        case 'set-single-12-avg':
          await send('budget/set-n-month-avg', {
            month,
            N: 12,
            category: args.category,
          });
          break;
        case 'copy-single-last':
          await send('budget/copy-single-month', {
            month,
            category: args.category,
          });
          break;
        default:
          throw new Error(`Unknown budget action type: ${String(type)}`);
      }
    },
    onError: error => {
      console.error('Error applying budget action:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error applying the budget action. Please try again.',
        error,
      );
    },
  });
}
