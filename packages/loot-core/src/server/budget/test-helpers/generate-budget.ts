// Test-only. Writes a randomized, multi-year budget straight into the
// database, covering what the budget math has to get right: split
// transactions (including orphaned children and deleted parents), transfers,
// off-budget and closed accounts, merged and deleted categories, a deleted
// group, hidden categories, a second income group, null amounts, carryover
// flags on expense and income categories, and held amounts including null.
import * as db from '#server/db';
import * as monthUtils from '#shared/months';

export function seededRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min)),
    chance: (p: number) => next() < p,
    pick: <T>(items: T[]): T => items[Math.floor(next() * items.length)],
  };
}

export type GeneratedBudget = {
  onBudgetAccounts: string[];
  offBudgetAccounts: string[];
  expenseGroups: string[];
  incomeGroup: string;
  expenseCategories: string[];
  incomeCategories: string[];
};

function toDbDate(month: string, day: number) {
  return parseInt(month.replace('-', '')) * 100 + day;
}

export async function generateBudget({
  seed,
  years,
  transactionsPerMonth = 25,
  groupCount = 4,
  categoriesPerGroup = 4,
}: {
  seed: number;
  years: number;
  transactionsPerMonth?: number;
  groupCount?: number;
  categoriesPerGroup?: number;
}): Promise<GeneratedBudget> {
  const random = seededRandom(seed);
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${seed}-${nextId++}`;

  const onBudgetAccounts = ['acct-checking', 'acct-savings', 'acct-card'];
  const offBudgetAccounts = ['acct-invest', 'acct-mortgage'];
  for (const accountId of onBudgetAccounts) {
    await db.insertAccount({ id: accountId, name: accountId, offbudget: 0 });
  }
  for (const accountId of offBudgetAccounts) {
    await db.insertAccount({ id: accountId, name: accountId, offbudget: 1 });
  }
  await db.insertAccount({
    id: 'acct-closed',
    name: 'acct-closed',
    offbudget: 0,
    closed: 1,
  });
  onBudgetAccounts.push('acct-closed');

  const expenseGroups: string[] = [];
  const expenseCategories: string[] = [];
  for (let g = 0; g < groupCount; g++) {
    const groupId = `group-${g}`;
    db.insertCategoryGroup({
      id: groupId,
      name: groupId,
      hidden: g === groupCount - 1 ? 1 : 0,
    });
    expenseGroups.push(groupId);
    for (let c = 0; c < categoriesPerGroup; c++) {
      const catId = `cat-${g}-${c}`;
      db.insertCategory({
        id: catId,
        name: catId,
        cat_group: groupId,
        hidden: random.chance(0.15) ? 1 : 0,
      });
      expenseCategories.push(catId);
    }
  }

  const incomeGroup = 'group-income';
  db.insertCategoryGroup({
    id: incomeGroup,
    name: incomeGroup,
    is_income: 1,
  });
  const incomeCategories = ['income-salary', 'income-bonus', 'income-other'];
  for (const catId of incomeCategories) {
    db.insertCategory({
      id: catId,
      name: catId,
      cat_group: incomeGroup,
      is_income: 1,
    });
  }
  // A second income group: only the first one's total is the month's income.
  db.insertCategoryGroup({
    id: 'group-income-2',
    name: 'group-income-2',
    is_income: 1,
  });
  db.insertCategory({
    id: 'income-side',
    name: 'income-side',
    cat_group: 'group-income-2',
    is_income: 1,
  });
  incomeCategories.push('income-side');

  // Categories that get merged into others or deleted once they have
  // transactions, and a group that gets deleted.
  db.insertCategory({
    id: 'cat-merged',
    name: 'cat-merged',
    cat_group: 'group-0',
  });
  db.insertCategory({
    id: 'cat-merged-2',
    name: 'cat-merged-2',
    cat_group: 'group-1',
  });
  db.insertCategory({
    id: 'cat-deleted',
    name: 'cat-deleted',
    cat_group: 'group-1',
  });
  db.insertCategoryGroup({ id: 'group-deleted', name: 'group-deleted' });
  db.insertCategory({
    id: 'cat-in-deleted-group',
    name: 'cat-in-deleted-group',
    cat_group: 'group-deleted',
  });

  const allExpense = [
    ...expenseCategories,
    'cat-merged',
    'cat-merged-2',
    'cat-deleted',
    'cat-in-deleted-group',
  ];

  const currentMonth = monthUtils.currentMonth();
  const firstMonth = monthUtils.subMonths(currentMonth, years * 12);
  // Transactions run a few months into the future, past nothing in
  // particular, and a couple land far beyond the budget's range.
  const months = monthUtils.rangeInclusive(
    firstMonth,
    monthUtils.addMonths(currentMonth, 2),
  );

  const insert = db.cache(
    `INSERT INTO transactions
       (id, isParent, isChild, acct, category, amount, date, tombstone,
        parent_id, sort_order, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );
  let sortOrder = 0;
  function transaction(row: {
    id?: string;
    isParent?: number;
    isChild?: number;
    acct: string | null;
    category: string | null;
    amount: number | null;
    date: number | null;
    tombstone?: number | null;
    parent_id?: string | null;
  }) {
    const transactionId = row.id ?? id('t');
    db.runQuery(insert, [
      transactionId,
      row.isParent ?? 0,
      row.isChild ?? 0,
      row.acct,
      row.category,
      row.amount,
      row.date,
      row.tombstone === undefined ? 0 : row.tombstone,
      row.parent_id ?? null,
      sortOrder++,
    ]);
    return transactionId;
  }

  const anyAccount = () =>
    random.chance(0.15)
      ? random.pick(offBudgetAccounts)
      : random.pick(onBudgetAccounts);

  db.transaction(() => {
    for (const month of months) {
      const day = () => random.int(1, 29);

      // Income
      transaction({
        acct: 'acct-checking',
        category: 'income-salary',
        amount: random.int(300000, 500000),
        date: toDbDate(month, 1),
      });
      if (random.chance(0.3)) {
        transaction({
          acct: anyAccount(),
          category: random.pick(incomeCategories),
          amount: random.int(1000, 90000),
          date: toDbDate(month, day()),
        });
      }

      for (let i = 0; i < transactionsPerMonth; i++) {
        const roll = random.next();
        if (roll < 0.06) {
          // A split: the parent's own category never counts, its children do
          // while it is alive.
          const parentTombstone = random.chance(0.15) ? 1 : 0;
          const date = toDbDate(month, day());
          const acct = anyAccount();
          const parentId = transaction({
            isParent: 1,
            acct,
            category: random.chance(0.3) ? random.pick(allExpense) : null,
            amount: -random.int(1000, 50000),
            date,
            tombstone: parentTombstone,
          });
          const children = random.int(2, 4);
          for (let c = 0; c < children; c++) {
            transaction({
              isChild: 1,
              parent_id: parentId,
              acct,
              category: random.chance(0.9) ? random.pick(allExpense) : null,
              amount: -random.int(100, 20000),
              date,
              tombstone: random.chance(0.1) ? 1 : 0,
            });
          }
        } else if (roll < 0.08) {
          // Orphaned children: no parent, or no parent id at all.
          transaction({
            isChild: 1,
            parent_id: random.chance(0.5) ? id('missing-parent') : null,
            acct: anyAccount(),
            category: random.pick(allExpense),
            amount: -random.int(100, 20000),
            date: toDbDate(month, day()),
          });
        } else if (roll < 0.13) {
          // A transfer from an on-budget to an off-budget account; only the
          // on-budget side carries a category.
          const amount = random.int(1000, 100000);
          const date = toDbDate(month, day());
          transaction({
            acct: random.pick(onBudgetAccounts),
            category: random.pick(allExpense),
            amount: -amount,
            date,
          });
          transaction({
            acct: random.pick(offBudgetAccounts),
            category: null,
            amount,
            date,
          });
        } else {
          transaction({
            acct: anyAccount(),
            category: random.chance(0.05) ? null : random.pick(allExpense),
            amount: random.chance(0.02)
              ? null
              : random.chance(0.1)
                ? random.int(100, 5000)
                : -random.int(100, 30000),
            date: random.chance(0.01) ? null : toDbDate(month, day()),
            tombstone: random.chance(0.05) ? 1 : random.chance(0.02) ? null : 0,
          });
        }
      }
    }

    // Beyond the budget's range, and without an account.
    transaction({
      acct: 'acct-checking',
      category: expenseCategories[0],
      amount: -1234,
      date: toDbDate(monthUtils.addMonths(currentMonth, 30), 5),
    });
    transaction({
      acct: null,
      category: expenseCategories[1],
      amount: -999,
      date: toDbDate(currentMonth, 3),
    });
  });

  // Budgeted amounts, carryover flags and holds, including rows outside the
  // budget's range and rows of categories that get deleted.
  const budgetInsert = db.cache(
    `INSERT INTO zero_budgets (id, month, category, amount, carryover)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const carryoverCategories = new Set(
    allExpense.filter(() => random.chance(0.3)),
  );
  db.transaction(() => {
    const budgetMonths = monthUtils.rangeInclusive(
      monthUtils.subMonths(firstMonth, 5),
      monthUtils.addMonths(currentMonth, 14),
    );
    for (const month of budgetMonths) {
      const dbMonth = parseInt(month.replace('-', ''));
      for (const catId of allExpense) {
        if (random.chance(0.3)) {
          continue;
        }
        // Carryover is mostly set for runs of months, sometimes toggled.
        const carryover = carryoverCategories.has(catId)
          ? random.chance(0.9)
          : random.chance(0.03);
        db.runQuery(budgetInsert, [
          `${dbMonth}-${catId}`,
          dbMonth,
          catId,
          random.chance(0.05) ? null : random.int(0, 60000),
          carryover ? 1 : 0,
        ]);
      }
      for (const catId of incomeCategories) {
        if (random.chance(0.2)) {
          db.runQuery(budgetInsert, [
            `${dbMonth}-${catId}`,
            dbMonth,
            catId,
            random.chance(0.5) ? null : random.int(0, 1000),
            random.chance(0.6) ? 1 : 0,
          ]);
        }
      }
      if (random.chance(0.15)) {
        db.runQuery(
          'INSERT INTO zero_budget_months (id, buffered) VALUES (?, ?)',
          [
            month,
            random.chance(0.1)
              ? null
              : random.chance(0.2)
                ? 0
                : random.int(0, 200000),
          ],
        );
      }
    }
  });

  // Merging a category that others were merged into forwards them too.
  db.deleteCategory({ id: 'cat-merged-2' }, 'cat-merged');
  db.deleteCategory({ id: 'cat-merged' }, expenseCategories[2]);
  db.deleteCategory({ id: 'cat-deleted' });
  db.deleteCategoryGroup({ id: 'group-deleted' });

  return {
    onBudgetAccounts,
    offBudgetAccounts,
    expenseGroups,
    incomeGroup,
    expenseCategories,
    incomeCategories,
  };
}
