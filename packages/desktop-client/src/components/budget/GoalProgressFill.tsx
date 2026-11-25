import React from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { getGoalProgress } from './goalProgress';
import type { GoalTarget } from './goalProgress';

type GoalProgressFillProps = {
  target: GoalTarget | null;
};

/**
 * Draws a thin track along the bottom of its (relatively positioned) parent
 * cell, filled from the left in proportion to how much of the goal the cell's
 * value covers. Only shows while the goal isn't met, so the cells that need
 * attention stand out from the ones already on track.
 */
export function GoalProgressFill({ target }: GoalProgressFillProps) {
  if (!target) {
    return null;
  }

  const progress = getGoalProgress(target);
  if (progress >= 1) {
    return null;
  }

  return (
    <View
      aria-hidden
      data-testid="goal-progress"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        // Under the cell's hover background (the cell isolates it)
        zIndex: -1,
        height: 2,
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
