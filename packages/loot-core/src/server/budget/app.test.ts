import { app } from '#server/budget/app';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import type { CategoryEntity } from '#types/models';

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
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
      await db.insertCategoryGroup({ id: 'group1', name: 'group1' });
      const id = await db.insertCategory({ name: 'foo', cat_group: 'group1' });
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
});
