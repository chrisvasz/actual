import type {
  AccountEntity,
  AccountGroupEntity,
} from '@actual-app/core/types/models';

import {
  balanceChange,
  computeNetWorth,
  UNGROUPED_OFF_BUDGET_ID,
  UNGROUPED_ON_BUDGET_ID,
} from './netWorth';

function account(
  id: string,
  groupId: string | null = null,
  extra: Partial<AccountEntity> = {},
): AccountEntity {
  return {
    id,
    name: id,
    offbudget: 0,
    closed: 0,
    sort_order: 0,
    last_reconciled: null,
    tombstone: 0,
    account_group_id: groupId,
    ...extra,
  };
}

const groups: AccountGroupEntity[] = [
  { id: 'cash', name: 'Cash', sort_order: 1 },
  { id: 'debt', name: 'Loans', sort_order: 2 },
];

describe('computeNetWorth', () => {
  it('accumulates month-end balances and measures change from before the range', () => {
    const data = computeNetWorth({
      months: ['2026-02', '2026-03'],
      sums: [
        { account: 'checking', month: '2026-01', amount: 1000 },
        { account: 'checking', month: '2026-02', amount: 100 },
        { account: 'checking', month: '2026-03', amount: 400 },
        { account: 'loan', month: '2026-01', amount: -2000 },
        { account: 'loan', month: '2026-03', amount: 500 },
      ],
      accounts: [account('checking', 'cash'), account('loan', 'debt')],
      groups,
    });

    expect(data.baselineMonth).toBe('2026-01');
    expect(data.history).toEqual([-900, 0]);
    expect(data.netWorth).toBe(0);
    // Net worth started below zero
    expect(data.change).toBeNull();

    const [cash, loans] = data.groups;
    expect(cash).toMatchObject({
      id: 'cash',
      history: [1100, 1500],
      balance: 1500,
      share: 1,
      change: 0.5,
      changeAmount: 500,
    });
    expect(loans).toMatchObject({
      id: 'debt',
      balance: -1500,
      share: null,
      change: -0.25,
      changeAmount: 500,
    });
  });

  it('measures from the first month when nothing predates the range', () => {
    const data = computeNetWorth({
      months: ['2026-01', '2026-02'],
      sums: [
        { account: 'checking', month: '2026-01', amount: 1000 },
        { account: 'checking', month: '2026-02', amount: 500 },
      ],
      accounts: [account('checking', 'cash')],
      groups,
    });

    expect(data.baselineMonth).toBe('2026-01');
    expect(data.change).toBe(0.5);
    expect(data.groups[0].change).toBe(0.5);
  });

  it('splits accounts without a known group by budget side and hides empty ones', () => {
    const data = computeNetWorth({
      months: ['2026-01'],
      sums: [
        { account: 'a', month: '2026-01', amount: 10 },
        { account: 'b', month: '2026-01', amount: 20 },
        { account: 'c', month: '2026-01', amount: 5 },
        { account: 'deleted', month: '2026-01', amount: 999 },
      ],
      accounts: [
        account('a'),
        account('b', 'missing-group'),
        account('c', null, { offbudget: 1 }),
        account('empty', 'cash'),
      ],
      groups,
    });

    expect(
      data.groups.map(group => [group.id, group.name, group.accounts.length]),
    ).toEqual([
      [UNGROUPED_ON_BUDGET_ID, 'On budget', 2],
      [UNGROUPED_OFF_BUDGET_ID, 'Off budget', 1],
    ]);
    expect(data.groups[0].accounts.map(row => row.id)).toEqual(['b', 'a']);
    expect(data.netWorth).toBe(35);
  });

  it('keeps closed accounts for the months they had a balance', () => {
    const data = computeNetWorth({
      months: ['2026-01', '2026-02'],
      sums: [
        { account: 'old', month: '2025-12', amount: 300 },
        { account: 'old', month: '2026-02', amount: -300 },
      ],
      accounts: [account('old', 'cash', { closed: 1 })],
      groups,
    });

    expect(data.history).toEqual([300, 0]);
    expect(data.groups[0].change).toBe(-1);
  });

  it('sorts assets largest first, then debts largest first', () => {
    const data = computeNetWorth({
      months: ['2026-01'],
      sums: [
        { account: 'small', month: '2026-01', amount: 10 },
        { account: 'big', month: '2026-01', amount: 100 },
        { account: 'card', month: '2026-01', amount: -5 },
        { account: 'mortgage', month: '2026-01', amount: -500 },
      ],
      accounts: [
        account('small', 'g1'),
        account('big', 'g2'),
        account('card', 'g3'),
        account('mortgage', 'g4'),
      ],
      groups: ['g1', 'g2', 'g3', 'g4'].map((id, i) => ({
        id,
        name: id,
        sort_order: i,
      })),
    });

    expect(data.groups.map(group => group.id)).toEqual([
      'g2',
      'g1',
      'g4',
      'g3',
    ]);
    expect(data.groups[0].share).toBeCloseTo(100 / 110);
  });

  it('measures account shares against all accounts with a positive balance', () => {
    const data = computeNetWorth({
      months: ['2026-01'],
      sums: [
        { account: 'house', month: '2026-01', amount: 300 },
        { account: 'mortgage', month: '2026-01', amount: -250 },
        { account: 'checking', month: '2026-01', amount: 100 },
      ],
      accounts: [
        account('house', 'g1'),
        account('mortgage', 'g1'),
        account('checking', 'g2'),
      ],
      groups: [
        { id: 'g1', name: 'Home', sort_order: 0 },
        { id: 'g2', name: 'Cash', sort_order: 1 },
      ],
    });

    const [cash, home] = data.groups;
    expect(cash.share).toBeCloseTo(100 / 150);
    expect(home.share).toBeCloseTo(50 / 150);
    expect(home.accounts[0]).toMatchObject({ id: 'house', share: 0.75 });
    expect(home.accounts[1]).toMatchObject({ id: 'mortgage', share: null });
  });
});

describe('balanceChange', () => {
  it('measures growth by size, so shrinking debt is negative', () => {
    expect(balanceChange(100, 110)).toBeCloseTo(0.1);
    expect(balanceChange(-200, -150)).toBeCloseTo(-0.25);
    expect(balanceChange(-200, 0)).toBe(-1);
  });

  it('is null from zero or across zero', () => {
    expect(balanceChange(0, 100)).toBeNull();
    expect(balanceChange(100, -50)).toBeNull();
  });
});
