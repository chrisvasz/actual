import React from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { getGoalProgress } from './goalProgress';
import type { GoalTarget } from './goalProgress';

type GoalProgressFillProps = {
  target: GoalTarget | null;
  column: 'budgeted' | 'balance';
};

// Inset from the cell's bottom edge so the cell's own 1px bottom border (in the
// budgeted column, where the track sits outside the bordered cell) doesn't
// paint over the track's last row.
const BOTTOM_BORDER_WIDTH = 1;

/**
 * Draws a thin track along the bottom of its (relatively positioned) parent
 * cell, filled from the left in proportion to how much of the goal the cell's
 * value covers. The track shows a goal exists even when nothing is met yet.
 */
export function GoalProgressFill({ target, column }: GoalProgressFillProps) {
  if (!target) {
    return null;
  }

  const progress = Math.min(getGoalProgress(target), 1);

  return (
    <View
      aria-hidden
      data-testid="goal-progress"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: column === 'budgeted' ? BOTTOM_BORDER_WIDTH : 0,
        height: 3,
        backgroundColor: theme.budgetGoalTrack,
        pointerEvents: 'none',
      }}
    >
      <View
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          backgroundColor: theme.budgetGoalProgress,
        }}
      />
    </View>
  );
}
