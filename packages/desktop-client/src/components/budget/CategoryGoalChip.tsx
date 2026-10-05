import React, { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Popover } from '@actual-app/components/popover';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  CategoryEntity,
  CategoryGoalType,
} from '@actual-app/core/types/models';

import { useUpdateCategoryMutation } from '#budget/mutations';
import { FinancialText } from '#components/FinancialText';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import {
  formatGoalAmount,
  formatTargetMonth,
  getGoalType,
} from './goalProgress';

type CategoryGoalChipProps = {
  category: CategoryEntity;
};

export function CategoryGoalChip({ category }: CategoryGoalChipProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const triggerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [typeDraft, setTypeDraft] = useState<CategoryGoalType>('balance');
  // '' means no target month
  const [targetDraft, setTargetDraft] = useState('');
  const { mutate: updateCategory } = useUpdateCategoryMutation();

  const goal = category.goal_amount ?? null;
  const hasGoal = goal != null;
  const locale = useLocale();
  const goalType = getGoalType(category);
  const targetMonth =
    goalType === 'balance' ? category.goal_target_month : null;

  function getLabel(amount: number) {
    const formatted = formatGoalAmount(format, amount);
    if (goalType === 'budgeted') {
      return t('{{amount}}/mo', { amount: formatted });
    }
    if (targetMonth) {
      return t('{{amount}} by {{month}}', {
        amount: formatted,
        month: formatTargetMonth(targetMonth, locale),
      });
    }
    return formatted;
  }

  // The next five years of months, plus the current target if it's passed
  const currentMonth = monthUtils.currentMonth();
  const targetMonths = monthUtils.rangeInclusive(
    currentMonth,
    monthUtils.addMonths(currentMonth, 60),
  );
  if (
    category.goal_target_month &&
    !targetMonths.includes(category.goal_target_month)
  ) {
    targetMonths.unshift(category.goal_target_month);
  }
  const targetOptions: Array<readonly [string, string]> = [
    ['', t('No target date')],
    ...targetMonths.map(
      month => [month, monthUtils.format(month, 'MMMM yyyy', locale)] as const,
    ),
  ];

  function open() {
    setDraft(hasGoal ? format.forEdit(goal) : '');
    setTypeDraft(goalType);
    setTargetDraft(category.goal_target_month ?? '');
    setIsOpen(true);
  }

  function save(value: string) {
    const parsed = value.trim() === '' ? null : format.fromEdit(value, null);
    const next = parsed != null && parsed > 0 ? parsed : null;
    const nextType = next == null ? null : typeDraft;
    const nextTarget =
      nextType === 'balance' && targetDraft ? targetDraft : null;
    setIsOpen(false);
    if (
      next !== goal ||
      nextType !== (category.goal_type ?? null) ||
      nextTarget !== (category.goal_target_month ?? null)
    ) {
      updateCategory({
        category: {
          ...category,
          goal_amount: next,
          goal_type: nextType,
          goal_target_month: nextTarget,
        },
      });
    }
  }

  return (
    <View style={{ flexShrink: 0 }}>
      <Button
        ref={triggerRef}
        variant="bare"
        aria-label={hasGoal ? t('Edit goal') : t('Set goal')}
        className={hasGoal || isOpen ? undefined : 'hover-visible'}
        onPress={open}
        style={{
          padding: '0 6px',
          marginRight: 2,
          height: 16,
          borderRadius: 8,
          fontSize: 11,
          lineHeight: '16px',
          ...(hasGoal
            ? {
                backgroundColor: theme.budgetGoalChipBackground,
                color: theme.budgetGoalChipText,
              }
            : {
                color: theme.pageTextLight,
                boxShadow: `inset 0 0 0 1px ${theme.tableBorder}`,
              }),
        }}
      >
        {hasGoal ? (
          <FinancialText style={styles.tnum}>{getLabel(goal)}</FinancialText>
        ) : (
          <Trans>Goal</Trans>
        )}
      </Button>

      <Popover
        triggerRef={triggerRef}
        isOpen={isOpen}
        onOpenChange={() => save(draft)}
        placement="bottom start"
        style={{ padding: 10, width: 200 }}
      >
        <Text style={{ fontWeight: 600, marginBottom: 6 }}>
          <Trans>Goal</Trans>
        </Text>
        <Input
          autoFocus
          value={draft}
          placeholder={t('No goal')}
          onChangeValue={setDraft}
          onEnter={value => save(value)}
          style={styles.tnum}
        />
        <View
          role="radiogroup"
          aria-label={t('Goal type')}
          style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}
        >
          {GOAL_TYPES.map(type => (
            <label
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name={`goal-type-${category.id}`}
                checked={typeDraft === type}
                onChange={() => setTypeDraft(type)}
                style={{ margin: 0, accentColor: theme.budgetGoalChipText }}
              />
              {type === 'budgeted' ? t('Budgeted') : t('Balance')}
            </label>
          ))}
        </View>
        {typeDraft === 'balance' && (
          <>
            <Text
              style={{
                marginTop: 8,
                marginBottom: 4,
                color: theme.pageTextSubdued,
              }}
            >
              <Trans>Reach it by</Trans>
            </Text>
            <Select
              value={targetDraft}
              options={targetOptions}
              onChange={setTargetDraft}
              popoverStyle={{ maxHeight: 240 }}
            />
          </>
        )}
      </Popover>
    </View>
  );
}

const GOAL_TYPES: CategoryGoalType[] = ['budgeted', 'balance'];
