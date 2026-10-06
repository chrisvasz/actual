import React from 'react';
import { Trans } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import type { CSSProperties } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { TransObjectLiteral } from '@actual-app/core/types/util';

import { useFormat } from '#hooks/useFormat';

import { formatGoalAmount, getGoalProgress } from './goalProgress';
import type { GoalTarget } from './goalProgress';

type GoalProgressSummaryProps = {
  target: GoalTarget | null;
  style?: CSSProperties;
};

/** How much of a goal is met, as a percentage over a progress bar. */
export function GoalProgressSummary({
  target,
  style,
}: GoalProgressSummaryProps) {
  const format = useFormat();

  if (!target) {
    return null;
  }

  const progress = getGoalProgress(target);
  const percent = Math.round(progress * 100);
  const goal = formatGoalAmount(format, target.goal);

  return (
    <View
      data-testid="goal-progress-summary"
      style={{ padding: '8px 10px 10px', gap: 6, ...style }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: theme.budgetGoalChipText,
          ...styles.tnum,
        }}
      >
        <Trans>
          {{ percent }}%{' '}
          <span
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: theme.pageText,
            }}
          >
            of {{ goal } as TransObjectLiteral} goal
          </span>
        </Trans>
      </Text>
      <View
        aria-hidden
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.budgetGoalTrack,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.min(progress, 1) * 100}%`,
            height: '100%',
            borderRadius: 3,
            backgroundColor: theme.budgetGoalProgress,
          }}
        />
      </View>
    </View>
  );
}
