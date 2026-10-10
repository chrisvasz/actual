import { q } from '@actual-app/core/shared/query';
import type {
  AccountEntity,
  AccountGroupEntity,
  CategoryEntity,
} from '@actual-app/core/types/models';

import { uncategorizedTransactions } from '#queries';

import { parametrizedField } from '.';
import type { Binding, SheetFields, SheetNames } from '.';

type BudgetType<SheetName extends SheetNames> = Record<
  string,
  SheetFields<SheetName> | ((id: string) => SheetFields<SheetName>)
>;

const accountParametrizedField = parametrizedField<'account'>();
const categoryParametrizedField = parametrizedField<'category'>();
const envelopeParametrizedField = parametrizedField<'envelope-budget'>();
const trackingParametrizedField = parametrizedField<'tracking-budget'>();

export function accountBalance(accountId: AccountEntity['id']) {
  return {
    name: accountParametrizedField('balance')(accountId),
    query: q('transactions')
      .filter({ account: accountId })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<'account', 'balance'>;
}

export function accountBalanceCleared(accountId: AccountEntity['id']) {
  return {
    name: accountParametrizedField('balanceCleared')(accountId),
    query: q('transactions')
      .filter({ account: accountId, cleared: true })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<'account', 'balanceCleared'>;
}

export function accountBalanceUncleared(accountId: AccountEntity['id']) {
  return {
    name: accountParametrizedField('balanceUncleared')(accountId),
    query: q('transactions')
      .filter({ account: accountId, cleared: false })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<'account', 'balanceUncleared'>;
}

export function allAccountBalance() {
  return {
    query: q('transactions')
      .filter({ 'account.closed': false })
      .calculate({ $sum: '$amount' }),
    name: 'accounts-balance',
  } satisfies Binding<'account', 'accounts-balance'>;
}

// Which transactions a sidebar balance sums: only cleared ones, or all of them.
export type SidebarBalanceMode = 'cleared' | 'all';

function clearedFilter(mode: SidebarBalanceMode) {
  return mode === 'cleared' ? { cleared: true } : {};
}

export function accountBalanceByMode(
  accountId: AccountEntity['id'],
  mode: SidebarBalanceMode,
) {
  return mode === 'cleared'
    ? accountBalanceCleared(accountId)
    : accountBalance(accountId);
}

export function allAccountBalanceByMode(mode: SidebarBalanceMode) {
  return mode === 'cleared' ? allAccountBalanceCleared() : allAccountBalance();
}

export function allAccountBalanceCleared() {
  return {
    name: 'accounts-balance-cleared',
    query: q('transactions')
      .filter({ 'account.closed': false, cleared: true })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<'account', 'accounts-balance-cleared'>;
}

function sideAccountBalanceByMode<
  Side extends 'onbudget' | 'offbudget',
  Mode extends SidebarBalanceMode,
>(side: Side, mode: Mode) {
  return {
    name: `${side}-accounts-balance${mode === 'cleared' ? '-cleared' : ''}` as
      | `${Side}-accounts-balance`
      | `${Side}-accounts-balance-cleared`,
    query: q('transactions')
      .filter({
        'account.offbudget': side === 'offbudget',
        'account.closed': false,
        ...clearedFilter(mode),
      })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<
    'account',
    `${Side}-accounts-balance` | `${Side}-accounts-balance-cleared`
  >;
}

export function onBudgetAccountBalanceByMode(mode: SidebarBalanceMode) {
  return sideAccountBalanceByMode('onbudget', mode);
}

export function offBudgetAccountBalanceByMode(mode: SidebarBalanceMode) {
  return sideAccountBalanceByMode('offbudget', mode);
}

export function onBudgetAccountBalanceCleared() {
  return {
    ...onBudgetAccountBalanceByMode('cleared'),
    name: 'onbudget-accounts-balance-cleared',
  } satisfies Binding<'account', 'onbudget-accounts-balance-cleared'>;
}

export function offBudgetAccountBalanceCleared() {
  return {
    ...offBudgetAccountBalanceByMode('cleared'),
    name: 'offbudget-accounts-balance-cleared',
  } satisfies Binding<'account', 'offbudget-accounts-balance-cleared'>;
}

export function accountGroupBalanceByMode(
  groupId: AccountGroupEntity['id'],
  offbudget: boolean,
  mode: SidebarBalanceMode,
) {
  return {
    name: `account-group-balance-${groupId}-${offbudget ? 'off' : 'on'}${mode === 'cleared' ? '-cleared' : ''}`,
    query: q('transactions')
      .filter({
        'account.account_group_id': groupId,
        'account.offbudget': offbudget,
        'account.closed': false,
        ...clearedFilter(mode),
      })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<'account', `account-group-balance-${string}`>;
}

export function accountGroupBalanceCleared(
  groupId: AccountGroupEntity['id'],
  offbudget: boolean,
) {
  return accountGroupBalanceByMode(groupId, offbudget, 'cleared');
}

export function categoryBalance(
  categoryId: CategoryEntity['id'],
  month: string,
) {
  return {
    name: categoryParametrizedField('balance')(categoryId),
    query: q('transactions')
      .filter({
        category: categoryId,
        date: { $transform: '$month', $eq: month },
      })
      .options({ splits: 'inline' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<'category', 'balance'>;
}

export function categoryBalanceCleared(
  categoryId: CategoryEntity['id'],
  month: string,
) {
  return {
    name: categoryParametrizedField('balanceCleared')(categoryId),
    query: q('transactions')
      .filter({
        category: categoryId,
        date: { $transform: '$month', $eq: month },
        cleared: true,
      })
      .options({ splits: 'inline' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<'category', 'balanceCleared'>;
}

export function categoryBalanceUncleared(
  categoryId: CategoryEntity['id'],
  month: string,
) {
  return {
    name: categoryParametrizedField('balanceUncleared')(categoryId),
    query: q('transactions')
      .filter({
        category: categoryId,
        date: { $transform: '$month', $eq: month },
        cleared: false,
      })
      .options({ splits: 'inline' })
      .calculate({ $sum: '$amount' }),
  } satisfies Binding<'category', 'balanceUncleared'>;
}

export function uncategorizedBalance<SheetName extends SheetNames>() {
  return {
    name: 'uncategorized-balance',
    query: uncategorizedTransactions().calculate({ $sum: '$amount' }),
  } satisfies Binding<SheetName, 'uncategorized-balance'>;
}

export function uncategorizedCount<SheetName extends SheetNames>() {
  return {
    name: 'uncategorized-amount',
    query: uncategorizedTransactions().calculate({ $count: '$id' }),
  } satisfies Binding<SheetName, 'uncategorized-amount'>;
}

export const envelopeBudget = {
  incomeAvailable: 'available-funds',
  lastMonthOverspent: 'last-month-overspent',
  forNextMonth: 'buffered-selected',
  totalBudgeted: 'total-budgeted',
  toBudget: 'to-budget',

  fromLastMonth: 'from-last-month',
  manualBuffered: 'buffered',
  autoBuffered: 'buffered-auto',
  totalIncome: 'total-income',
  totalSpent: 'total-spent',
  totalBalance: 'total-leftover',

  groupSumAmount: envelopeParametrizedField('group-sum-amount'),
  groupIncomeReceived: 'total-income',

  groupBudgeted: envelopeParametrizedField('group-budget'),
  groupBalance: envelopeParametrizedField('group-leftover'),

  catBudgeted: envelopeParametrizedField('budget'),
  catSumAmount: envelopeParametrizedField('sum-amount'),
  catBalance: envelopeParametrizedField('leftover'),
  catCarryover: envelopeParametrizedField('carryover'),
} satisfies BudgetType<'envelope-budget'>;

export const trackingBudget = {
  totalBudgetedExpense: 'total-budgeted',
  totalBudgetedIncome: 'total-budget-income',
  totalBudgetedSaved: 'total-saved',

  totalIncome: 'total-income',
  totalSpent: 'total-spent',
  totalSaved: 'real-saved',

  totalLeftover: 'total-leftover',
  groupSumAmount: trackingParametrizedField('group-sum-amount'),
  groupIncomeReceived: 'total-income',

  groupBudgeted: trackingParametrizedField('group-budget'),
  groupBalance: trackingParametrizedField('group-leftover'),

  catBudgeted: trackingParametrizedField('budget'),
  catSumAmount: trackingParametrizedField('sum-amount'),
  catBalance: trackingParametrizedField('leftover'),
  catCarryover: trackingParametrizedField('carryover'),
} satisfies BudgetType<'tracking-budget'>;
