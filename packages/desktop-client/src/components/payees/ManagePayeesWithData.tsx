import React, { useEffect } from 'react';

import { listen, send } from '@actual-app/core/platform/client/connection';
import * as undo from '@actual-app/core/platform/client/undo';
import type { UndoState } from '@actual-app/core/server/undo';
import { applyChanges } from '@actual-app/core/shared/util';
import type { Diff } from '@actual-app/core/shared/util';
import type { NewRuleEntity, PayeeEntity } from '@actual-app/core/types/models';
import { useQueryClient } from '@tanstack/react-query';

import { useOrphanedPayees } from '#hooks/useOrphanedPayees';
import { usePayeeRuleCounts } from '#hooks/usePayeeRuleCounts';
import { usePayees } from '#hooks/usePayees';
import { pushModal } from '#modals/modalsSlice';
import { payeeQueries } from '#payees';
import { useDispatch } from '#redux';

import { ManagePayees } from './ManagePayees';

type ManagePayeesWithDataProps = {
  initialSelectedIds: string[];
};

export function ManagePayeesWithData({
  initialSelectedIds,
}: ManagePayeesWithDataProps) {
  const queryClient = useQueryClient();
  const { data: payees = [] } = usePayees();
  const { data: orphanedPayees = [] } = useOrphanedPayees();
  const dispatch = useDispatch();
  const { data: ruleCounts = new Map() } = usePayeeRuleCounts();

  useEffect(() => {
    // An undo's sync event refreshes the payee lists, so there's only the
    // pending undo to clear.
    function onUndo({ tables }: UndoState) {
      if (tables.includes('payees') || tables.includes('payee_mapping')) {
        undo.setUndoState('undoEvent', null);
      }
    }

    const lastUndoEvent = undo.getUndoState('undoEvent');
    if (lastUndoEvent) {
      onUndo(lastUndoEvent);
    }

    return listen('undo-event', onUndo);
  }, []);

  function onViewRules(id: PayeeEntity['id']) {
    dispatch(
      pushModal({ modal: { name: 'manage-rules', options: { payeeId: id } } }),
    );
  }

  function onCreateRule(id: PayeeEntity['id']) {
    const rule: NewRuleEntity = {
      stage: null,
      conditionsOp: 'and',
      conditions: [
        {
          field: 'payee',
          op: 'is',
          value: id,
          type: 'id',
        },
      ],
      actions: [
        {
          op: 'set',
          field: 'category',
          value: null,
          type: 'id',
        },
      ],
    };
    dispatch(pushModal({ modal: { name: 'edit-rule', options: { rule } } }));
  }

  return (
    <ManagePayees
      payees={payees}
      ruleCounts={ruleCounts}
      orphanedPayees={orphanedPayees}
      initialSelectedIds={initialSelectedIds}
      onBatchChange={async (changes: Diff<PayeeEntity>) => {
        await send('payees-batch-change', changes);
        queryClient.setQueryData(
          payeeQueries.listOrphaned().queryKey,
          existing => applyChanges(changes, existing ?? []),
        );
      }}
      onMerge={async ([targetId, ...mergeIds]) => {
        await send('payees-merge', { targetId, mergeIds });

        const targetIdIsOrphan = orphanedPayees
          .map(o => o.id)
          .includes(targetId);
        const mergeIdsOrphans = mergeIds.filter(m =>
          orphanedPayees.map(o => o.id).includes(m),
        );

        let filteredOrphans = orphanedPayees;
        if (targetIdIsOrphan && mergeIdsOrphans.length !== mergeIds.length) {
          // there is a non-orphan in mergeIds, target can be removed from orphan arr
          filteredOrphans = filteredOrphans.filter(o => o.id !== targetId);
        }
        filteredOrphans = filteredOrphans.filter(o => !mergeIds.includes(o.id));

        queryClient.setQueryData(
          payeeQueries.listOrphaned().queryKey,
          filteredOrphans,
        );
      }}
      onViewRules={onViewRules}
      onCreateRule={onCreateRule}
    />
  );
}
