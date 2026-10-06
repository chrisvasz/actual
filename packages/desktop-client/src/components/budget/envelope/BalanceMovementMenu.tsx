import React, { useCallback, useRef, useState } from 'react';

import { theme } from '@actual-app/components/theme';

import type { GoalTarget } from '#components/budget/goalProgress';
import { GoalProgressSummary } from '#components/budget/GoalProgressSummary';
import { envelopeBudget } from '#spreadsheet/bindings';

import { BalanceMenu } from './BalanceMenu';
import { CoverMenu } from './CoverMenu';
import { useEnvelopeSheetValue } from './EnvelopeBudgetComponents';
import { TransferMenu } from './TransferMenu';

type BalanceMovementMenuProps = {
  categoryId: string;
  goalTarget?: GoalTarget | null;
  month: string;
  onBudgetAction: (month: string, action: string, arg?: unknown) => void;
  onClose: () => void;
};

export function BalanceMovementMenu({
  categoryId,
  goalTarget,
  month,
  onBudgetAction,
  onClose,
}: BalanceMovementMenuProps) {
  const catBalance =
    useEnvelopeSheetValue(envelopeBudget.catBalance(categoryId)) ?? 0;

  const [menu, _setMenu] = useState('menu');

  const ref = useRef<HTMLSpanElement>(null);
  // Keep focus inside the popover on menu change
  const setMenu = useCallback(
    (menu: string) => {
      ref.current?.focus();
      _setMenu(menu);
    },
    [ref],
  );

  return (
    <span tabIndex={-1} ref={ref}>
      {menu === 'menu' && (
        <>
          <GoalProgressSummary
            target={goalTarget ?? null}
            style={{ borderBottom: `1px solid ${theme.menuBorder}` }}
          />
          <BalanceMenu
            categoryId={categoryId}
            onCarryover={carryover => {
              onBudgetAction(month, 'carryover', {
                category: categoryId,
                flag: carryover,
              });
              onClose();
            }}
            onTransfer={() => setMenu('transfer')}
            onCover={() => setMenu('cover')}
          />
        </>
      )}

      {menu === 'transfer' && (
        <TransferMenu
          categoryId={categoryId}
          initialAmount={catBalance}
          showToBeBudgeted
          onClose={onClose}
          onSubmit={(amount, toCategoryId) => {
            onBudgetAction(month, 'transfer-category', {
              amount,
              from: categoryId,
              to: toCategoryId,
            });
          }}
        />
      )}

      {menu === 'cover' && (
        <CoverMenu
          categoryId={categoryId}
          initialAmount={catBalance}
          onClose={onClose}
          onSubmit={(amount, fromCategoryId) => {
            onBudgetAction(month, 'cover-overspending', {
              to: categoryId,
              from: fromCategoryId,
              amount,
            });
          }}
        />
      )}
    </span>
  );
}
