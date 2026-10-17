import React from 'react';

import { send } from '@actual-app/core/platform/client/connection';
import type { Diff } from '@actual-app/core/shared/util';
import type { NewRuleEntity, PayeeEntity } from '@actual-app/core/types/models';

import { useOrphanedPayees } from '#hooks/useOrphanedPayees';
import { usePayeeRuleCounts } from '#hooks/usePayeeRuleCounts';
import { usePayees } from '#hooks/usePayees';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { ManagePayees } from './ManagePayees';

type ManagePayeesWithDataProps = {
  initialSelectedIds: string[];
};

export function ManagePayeesWithData({
  initialSelectedIds,
}: ManagePayeesWithDataProps) {
  // Live reads: each follows the changes (merges, renames, undo, sync) that
  // concern it
  const payees = usePayees();
  const orphanedPayees = useOrphanedPayees();
  const ruleCounts = usePayeeRuleCounts();
  const dispatch = useDispatch();

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
      }}
      onMerge={async ([targetId, ...mergeIds]) => {
        await send('payees-merge', { targetId, mergeIds });
      }}
      onViewRules={onViewRules}
      onCreateRule={onCreateRule}
    />
  );
}
