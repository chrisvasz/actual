import * as monthUtils from '@actual-app/core/shared/months';
import type {
  AccountEntity,
  AccountGroupEntity,
} from '@actual-app/core/types/models';

/** One account's transactions in one month, summed. */
export type MonthlyAccountSum = {
  account: AccountEntity['id'];
  /** `yyyy-MM` */
  month: string;
  amount: number;
};

export type NetWorthRow = {
  id: string;
  name: string;
  /** Balance at the end of each month in the range */
  history: number[];
  /** Balance at the end of the range */
  balance: number;
  /**
   * This row's part of the positive balances at its level (groups or
   * accounts); null when it isn't positive
   */
  share: number | null;
  /** Change over the range as a fraction of the starting size; null when that's meaningless */
  change: number | null;
  /** Signed change over the range: positive means net worth went up */
  changeAmount: number;
};

export type NetWorthGroup = NetWorthRow & {
  accounts: NetWorthRow[];
};

export type NetWorthData = {
  months: string[];
  /** The month whose end changes are measured from */
  baselineMonth: string;
  /** Net worth at the end of each month in the range */
  history: number[];
  netWorth: number;
  /** Change over the range as a fraction; null when net worth started at or below zero */
  change: number | null;
  /** Assets first, largest first; then debts, largest first */
  groups: NetWorthGroup[];
};

/** Accounts outside any group are split the way the sidebar splits them */
export const UNGROUPED_ON_BUDGET_ID = 'ungrouped-on-budget';
export const UNGROUPED_OFF_BUDGET_ID = 'ungrouped-off-budget';

/**
 * Month-end balances over `months`, by account group. `sums` must hold every
 * month up to the range's end, before it included: a balance is everything
 * before it.
 *
 * Changes are measured from the end of the month before the range. When no
 * transaction predates the range (as with "All"), they're measured from the
 * end of its first month instead, so the whole history isn't a change from
 * zero.
 */
export function computeNetWorth({
  months,
  sums,
  accounts,
  groups,
}: {
  months: string[];
  sums: readonly MonthlyAccountSum[];
  accounts: readonly AccountEntity[];
  groups: readonly AccountGroupEntity[];
}): NetWorthData {
  const start = months[0];
  const monthIndex = new Map(months.map((month, i) => [month, i]));
  const accountsById = new Map(accounts.map(account => [account.id, account]));

  // Per account: the balance before the range, then each month's activity
  const before = new Map<string, number>();
  const activity = new Map<string, number[]>();
  for (const sum of sums) {
    if (!accountsById.has(sum.account)) {
      continue;
    }
    if (sum.month < start) {
      before.set(sum.account, (before.get(sum.account) ?? 0) + sum.amount);
      continue;
    }
    const i = monthIndex.get(sum.month);
    if (i === undefined) {
      continue;
    }
    let amounts = activity.get(sum.account);
    if (!amounts) {
      amounts = months.map(() => 0);
      activity.set(sum.account, amounts);
    }
    amounts[i] += sum.amount;
  }
  const hasHistoryBeforeRange = before.size > 0;

  type Series = { history: number[]; baseline: number };
  const accountSeries = new Map<string, Series>();
  for (const account of accounts) {
    let balance = before.get(account.id) ?? 0;
    const amounts = activity.get(account.id);
    const history = months.map((_, i) => {
      balance += amounts?.[i] ?? 0;
      return balance;
    });
    const baseline = hasHistoryBeforeRange
      ? (before.get(account.id) ?? 0)
      : history[0];
    if (baseline !== 0 || history.some(value => value !== 0)) {
      accountSeries.set(account.id, { history, baseline });
    }
  }

  const groupNames = new Map(groups.map(group => [group.id, group.name]));
  type Member = { account: AccountEntity; series: Series };
  const accountsByGroup = new Map<string, Member[]>();
  for (const account of accounts) {
    const series = accountSeries.get(account.id);
    if (!series) {
      continue;
    }
    const groupId =
      account.account_group_id && groupNames.has(account.account_group_id)
        ? account.account_group_id
        : account.offbudget
          ? UNGROUPED_OFF_BUDGET_ID
          : UNGROUPED_ON_BUDGET_ID;
    const members = accountsByGroup.get(groupId) ?? [];
    members.push({ account, series });
    accountsByGroup.set(groupId, members);
  }

  const groupSeries = [...accountsByGroup].map(([groupId, members]) => {
    const series = members.map(member => member.series);
    return {
      id: groupId,
      name:
        groupNames.get(groupId) ??
        (groupId === UNGROUPED_OFF_BUDGET_ID ? 'Off budget' : 'On budget'),
      members,
      history: months.map((_, i) => sumOf(series.map(s => s.history[i]))),
      baseline: sumOf(series.map(s => s.baseline)),
    };
  });

  // Shares compare like with like: a group against the groups with a
  // positive balance, an account against the accounts with one. A group that
  // nets a house against its mortgage would otherwise make its house look
  // larger than all assets.
  const groupAssets = sumOf(
    groupSeries.map(group => Math.max(0, last(group.history))),
  );
  const accountAssets = sumOf(
    [...accountSeries.values()].map(series =>
      Math.max(0, last(series.history)),
    ),
  );

  function makeRow(
    id: string,
    name: string,
    { history, baseline }: Series,
    totalAssets: number,
  ): NetWorthRow {
    const balance = last(history);
    return {
      id,
      name,
      history,
      balance,
      share: balance > 0 && totalAssets > 0 ? balance / totalAssets : null,
      change: balanceChange(baseline, balance),
      changeAmount: balance - baseline,
    };
  }

  const netWorthGroups = groupSeries
    .map(group => {
      const row = makeRow(group.id, group.name, group, groupAssets);
      const memberRows = group.members.map(({ account, series }) =>
        makeRow(account.id, account.name, series, accountAssets),
      );
      return { ...row, accounts: sortRows(memberRows, row.balance >= 0) };
    })
    .sort(compareGroups);

  const history = months.map((_, i) =>
    sumOf(groupSeries.map(group => group.history[i])),
  );
  const baseline = sumOf(groupSeries.map(group => group.baseline));
  const netWorth = last(history);
  return {
    months,
    baselineMonth: hasHistoryBeforeRange ? monthUtils.prevMonth(start) : start,
    history,
    netWorth,
    change: baseline > 0 ? (netWorth - baseline) / baseline : null,
    groups: netWorthGroups,
  };
}

/**
 * How much a balance grew or shrank, as a fraction of its starting size: a
 * debt going from -130 to -128 shrank 1.5%. Null when it started at zero or
 * crossed zero, where a percentage means nothing.
 */
export function balanceChange(start: number, end: number): number | null {
  if (start === 0 || (end !== 0 && start > 0 !== end > 0)) {
    return null;
  }
  return (Math.abs(end) - Math.abs(start)) / Math.abs(start);
}

function compareGroups(a: NetWorthRow, b: NetWorthRow) {
  const aIsAsset = a.balance >= 0;
  const bIsAsset = b.balance >= 0;
  if (aIsAsset !== bIsAsset) {
    return aIsAsset ? -1 : 1;
  }
  return Math.abs(b.balance) - Math.abs(a.balance);
}

function sortRows(rows: NetWorthRow[], isAssetGroup: boolean) {
  return rows.sort((a, b) =>
    isAssetGroup ? b.balance - a.balance : a.balance - b.balance,
  );
}

function sumOf(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function last(values: number[]) {
  return values[values.length - 1] ?? 0;
}
