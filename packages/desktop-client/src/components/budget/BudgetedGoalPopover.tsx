import React from 'react';
import type { RefObject } from 'react';

import { Popover } from '@actual-app/components/popover';

import { useFormat } from '#hooks/useFormat';

import type { GoalTarget } from './goalProgress';
import { GoalProgressSummary } from './GoalProgressSummary';

type BudgetedGoalPopoverProps = {
  triggerRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  target: GoalTarget | null;
  /** What's typed in the budget input, so the percentage updates live. */
  draft: string | null;
};

/**
 * Shows how much of the budgeted goal the amount being typed covers, under the
 * budget cell while it's being edited. It never takes focus from the input.
 */
export function BudgetedGoalPopover({
  triggerRef,
  isOpen,
  target,
  draft,
}: BudgetedGoalPopoverProps) {
  const format = useFormat();

  if (!target) {
    return null;
  }

  const draftValue = draft == null ? null : format.fromEdit(draft, null);

  return (
    <Popover
      triggerRef={triggerRef}
      isOpen={isOpen}
      isNonModal
      placement="bottom end"
      style={{ minWidth: 190 }}
    >
      <GoalProgressSummary
        target={{ ...target, value: draftValue ?? target.value }}
      />
    </Popover>
  );
}
