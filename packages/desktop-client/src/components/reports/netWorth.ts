import * as monthUtils from '@actual-app/core/shared/months';
import type {
  AccountEntity,
  AccountGroupEntity,
} from '@actual-app/core/types/models';

/** One account's transactions in one `yyyy-MM` month, summed. */
export type MonthlyAccountSum = {
  account: AccountEntity['id'];
  month: string;
  amount: number;
};

export type NetWorthRow = {
  id: string;
  name: string;
  /** Balance at the end of each month in the range */
  history: number[];
  balance: number;
  /** Part of the positive balances at this row's level; null unless positive */
  share: number | null;
  /** Change as a fraction of the starting size; null when meaningless */
  change: number | null;
  /** Signed change: positive means net worth went up */
  changeAmount: number;
};

export type NetWorthGroup = NetWorthRow & { accounts: NetWorthRow[] };

export type NetWorthData = {
  months: string[];
  /** The month whose end changes are measured from */
  baselineMonth: string;
  /** Net worth; its change is null when it started at or below zero */
  total: NetWorthRow;
  /** Assets largest first, then debts largest first */
  groups: NetWorthGroup[];
};

/** Accounts outside any group are split the way the sidebar splits them */
export const UNGROUPED_ON_BUDGET_ID = 'ungrouped-on-budget';
export const UNGROUPED_OFF_BUDGET_ID = 'ungrouped-off-budget';

type Series = { history: number[]; baseline: number };

/**
 * Month-end balances over `months`, by account group. `sums` must cover every
 * month up to the range's end. Changes are measured from the end of the month
 * before the range, or from its first month when nothing predates it.
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
  const column = new Map(months.map((month, i) => [month, i + 1]));

  // Per account: the balance before the range, then each month's activity
  const accountAmounts = accounts.map(account => ({
    account,
    amounts: new Array<number>(months.length + 1).fill(0),
  }));
  const amountsById = new Map(
    accountAmounts.map(({ account, amounts }) => [account.id, amounts]),
  );
  for (const { account, month, amount } of sums) {
    const amounts = amountsById.get(account);
    const i = month < start ? 0 : column.get(month);
    if (amounts && i !== undefined) {
      amounts[i] += amount;
    }
  }
  const hasHistoryBeforeRange = accountAmounts.some(
    ({ amounts }) => amounts[0] !== 0,
  );

  const groupNames = new Map(groups.map(group => [group.id, group.name]));
  type Member = { account: AccountEntity; series: Series };
  const membersByGroup = new Map<string, Member[]>();
  for (const { account, amounts } of accountAmounts) {
    let balance = amounts[0];
    const history = months.map((_, i) => {
      balance += amounts[i + 1];
      return balance;
    });
    const baseline = hasHistoryBeforeRange ? amounts[0] : history[0];
    if (baseline === 0 && history.every(value => value === 0)) {
      continue;
    }
    const groupId =
      account.account_group_id && groupNames.has(account.account_group_id)
        ? account.account_group_id
        : account.offbudget
          ? UNGROUPED_OFF_BUDGET_ID
          : UNGROUPED_ON_BUDGET_ID;
    const members = membersByGroup.get(groupId) ?? [];
    members.push({ account, series: { history, baseline } });
    membersByGroup.set(groupId, members);
  }

  const groupSeries = [...membersByGroup].map(([id, members]) => ({
    id,
    name:
      groupNames.get(id) ??
      (id === UNGROUPED_OFF_BUDGET_ID ? 'Off budget' : 'On budget'),
    members,
    series: sumSeries(
      members.map(member => member.series),
      months.length,
    ),
  }));

  // Shares compare like with like, so a group netting a house against its
  // mortgage doesn't make the house look larger than all assets
  const groupAssets = positiveTotal(groupSeries.map(group => group.series));
  const accountAssets = positiveTotal(
    groupSeries.flatMap(group => group.members.map(member => member.series)),
  );

  const totalSeries = sumSeries(
    groupSeries.map(group => group.series),
    months.length,
  );
  const total = makeRow('net-worth', 'Net worth', totalSeries, 0);
  const { baseline } = totalSeries;
  return {
    months,
    baselineMonth: hasHistoryBeforeRange ? monthUtils.prevMonth(start) : start,
    total: {
      ...total,
      change: baseline > 0 ? total.changeAmount / baseline : null,
    },
    groups: groupSeries
      .map(group => ({
        ...makeRow(group.id, group.name, group.series, groupAssets),
        accounts: group.members
          .map(({ account, series }) =>
            makeRow(account.id, account.name, series, accountAssets),
          )
          .sort(compareRows),
      }))
      .sort(compareRows),
  };
}

/**
 * How much a balance grew or shrank, as a fraction of its starting size: a
 * debt going from -130 to -128 shrank 1.5%. Null when it started at or
 * crossed zero.
 */
export function balanceChange(start: number, end: number): number | null {
  if (start === 0 || (end !== 0 && start > 0 !== end > 0)) {
    return null;
  }
  return (Math.abs(end) - Math.abs(start)) / Math.abs(start);
}

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

/** Assets first, then debts, each largest first */
function compareRows(a: NetWorthRow, b: NetWorthRow) {
  const aIsAsset = a.balance >= 0;
  if (aIsAsset !== b.balance >= 0) {
    return aIsAsset ? -1 : 1;
  }
  return Math.abs(b.balance) - Math.abs(a.balance);
}

function sumSeries(series: Series[], length: number): Series {
  return {
    history: Array.from({ length }, (_, i) =>
      sumOf(series.map(s => s.history[i])),
    ),
    baseline: sumOf(series.map(s => s.baseline)),
  };
}

function positiveTotal(series: Series[]) {
  return sumOf(series.map(s => Math.max(0, last(s.history))));
}

function sumOf(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function last(values: number[]) {
  return values[values.length - 1] ?? 0;
}
