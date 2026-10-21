import type { BudgetChanges } from '#platform/in-process-channel';
import { app, budgetLiveReads } from '#server/budget/app';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { liveReads } from '#server/live-reads';
import type { CategoryEntity } from '#types/models';

beforeEach(async () => {
  await global.emptyDatabase()();
  loadMappings();
});

async function getGoal(id: string) {
  return db.first<
    Pick<CategoryEntity, 'goal_amount' | 'goal_type' | 'goal_target_month'>
  >(
    'SELECT goal_amount, goal_type, goal_target_month FROM categories WHERE id = ?',
    [id],
  );
}

describe('budget app', () => {
  describe('category-update', () => {
    it('clears a goal when its fields are set to null', async () => {
      db.insertCategoryGroup({ id: 'group1', name: 'group1' });
      const id = db.insertCategory({ name: 'foo', cat_group: 'group1' });
      const category: CategoryEntity = {
        id,
        name: 'foo',
        group: 'group1',
        is_income: false,
        goal_amount: 50000,
        goal_type: 'balance',
        goal_target_month: '2026-12',
      };

      await app.handlers['category-update'](category);
      expect(await getGoal(id)).toEqual({
        goal_amount: 50000,
        goal_type: 'balance',
        goal_target_month: '2026-12',
      });

      await app.handlers['category-update']({
        ...category,
        goal_amount: null,
        goal_type: null,
        goal_target_month: null,
      });
      expect(await getGoal(id)).toEqual({
        goal_amount: null,
        goal_type: null,
        goal_target_month: null,
      });
    });
  });

  describe('get-categories', () => {
    async function changesFrom(write: () => Promise<unknown>) {
      const changes: BudgetChanges[] = [];
      const stop = liveReads.onChanges(change => changes.push(change));
      await write();
      stop();
      return changes;
    }

    const read = () => budgetLiveReads['get-categories'].read(undefined);

    function readsChanged(changes: BudgetChanges[]) {
      const { tables } = budgetLiveReads['get-categories'];
      return changes.some(
        change =>
          change === 'all' ||
          change.tables.some(table => tables.includes(table)),
      );
    }

    it('builds new objects on every read', () => {
      db.insertCategoryGroup({ id: 'group1', name: 'group1' });
      db.insertCategory({ name: 'foo', cat_group: 'group1' });

      const first = read();
      const second = read();
      expect(second).toEqual(first);
      expect(second.grouped[0]).not.toBe(first.grouped[0]);
      expect(second.list[0]).not.toBe(first.list[0]);
    });

    it('reports renaming a category or group under a table it reads', async () => {
      db.insertCategoryGroup({ id: 'group1', name: 'group1' });
      const id = db.insertCategory({ name: 'foo', cat_group: 'group1' });
      const category = read().list[0];
      const group = read().grouped[0];

      const renamed = await changesFrom(() =>
        app.handlers['category-update']({ ...category, name: 'bar' }),
      );
      expect(readsChanged(renamed)).toBe(true);
      expect(read().list.find(c => c.id === id)?.name).toBe('bar');

      const { categories: _, ...groupFields } = group;
      const renamedGroup = await changesFrom(() =>
        app.handlers['category-group-update']({
          ...groupFields,
          name: 'group2',
        }),
      );
      expect(readsChanged(renamedGroup)).toBe(true);
      expect(read().grouped[0].name).toBe('group2');
    });

    it('reports merging a category under a table it reads', async () => {
      db.insertCategoryGroup({ id: 'income', name: 'Income', is_income: 1 });
      const mergedId = db.insertCategory({
        name: 'merged',
        cat_group: 'income',
        is_income: 1,
      });
      const targetId = db.insertCategory({
        name: 'target',
        cat_group: 'income',
        is_income: 1,
      });

      const changes = await changesFrom(() =>
        app.handlers['category-delete']({ id: mergedId, transferId: targetId }),
      );
      expect(readsChanged(changes)).toBe(true);
      expect(read().list.map(c => c.id)).toEqual([targetId]);
    });
  });
});

describe('category-update', () => {
  type UpdateArgs = Parameters<(typeof app.handlers)['category-update']>[0];

  function getCategory(id: string) {
    return db.first<{ name: string; cat_group: string }>(
      'SELECT name, cat_group FROM categories WHERE id = ?',
      [id],
    );
  }

  beforeEach(() => {
    db.insertCategoryGroup({ id: 'group1', name: 'group1' });
    db.insertCategoryGroup({ id: 'group2', name: 'group2' });
  });

  it('does not require a name, since the API types fields as a Partial', async () => {
    // api/category-update spreads the caller's partial straight through, so a
    // caller changing only the group never sends `name` (#8857).
    const id = db.insertCategory({ name: 'Groceries', cat_group: 'group1' });

    await app.handlers['category-update']({
      id,
      group: 'group2',
    } as UpdateArgs);

    expect(getCategory(id)).toMatchObject({
      name: 'Groceries',
      cat_group: 'group2',
    });
  });

  it('still trims a name when one is supplied', async () => {
    const id = db.insertCategory({ name: 'foo', cat_group: 'group1' });

    await app.handlers['category-update']({
      id,
      name: '  Groceries  ',
    } as UpdateArgs);

    expect(getCategory(id)).toMatchObject({ name: 'Groceries' });
  });

  it('rejects an empty update with a clear error', async () => {
    const id = db.insertCategory({ name: 'foo', cat_group: 'group1' });

    await expect(
      app.handlers['category-update']({ id } as UpdateArgs),
    ).rejects.toThrow('No fields to update');
  });

  it('rejects updates that only carry ignored fields', async () => {
    const id = db.insertCategory({ name: 'foo', cat_group: 'group1' });

    await expect(
      app.handlers['category-update']({
        id,
        _ignored: true,
      } as unknown as UpdateArgs),
    ).rejects.toThrow('No fields to update');
  });
});
