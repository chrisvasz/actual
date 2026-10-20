import type { BudgetChanges } from '#platform/in-process-channel';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { liveReads } from '#server/live-reads';
import { app, payeeLiveReads } from '#server/payees/app';
import { createSchedule, updateSchedule } from '#server/schedules/app';
import {
  deleteRule,
  insertRule,
  loadRules,
  resetState,
} from '#server/transactions/transaction-rules';

beforeEach(async () => {
  await global.emptyDatabase()();
  resetState();
  loadMappings();
  loadRules();
});

describe('payees app', () => {
  describe('payees-get-orphaned', () => {
    it('returns only payees with no transactions or live rules', async () => {
      db.insertAccount({ id: 'acct', name: 'Account' });
      const orphanId = db.insertPayee({ name: 'Orphan' });
      const usedId = db.insertPayee({ name: 'Used' });
      const ruleOnlyId = db.insertPayee({ name: 'Rule only' });
      const deletedRuleId = db.insertPayee({ name: 'Deleted rule' });
      const oneOfId = db.insertPayee({ name: 'One of' });

      db.insertTransaction({
        account: 'acct',
        date: '2020-01-01',
        amount: -100,
        payee: usedId,
      });
      insertRule({
        stage: 'pre',
        conditionsOp: 'and',
        conditions: [{ op: 'is', field: 'payee', value: ruleOnlyId }],
        actions: [{ op: 'set', field: 'category', value: null }],
      });

      insertRule({
        stage: 'pre',
        conditionsOp: 'and',
        conditions: [{ op: 'oneOf', field: 'payee', value: [oneOfId] }],
        actions: [{ op: 'set', field: 'category', value: null }],
      });
      // A rule with an empty payee must not hide every other payee
      insertRule({
        stage: 'pre',
        conditionsOp: 'and',
        conditions: [
          // Saved rules can hold a null payee even though the type forbids it
          { op: 'is', field: 'payee', value: null as unknown as string },
        ],
        actions: [{ op: 'set', field: 'category', value: null }],
      });
      const deletedId = insertRule({
        stage: 'pre',
        conditionsOp: 'and',
        conditions: [{ op: 'is', field: 'payee', value: deletedRuleId }],
        actions: [{ op: 'set', field: 'category', value: null }],
      });
      deleteRule(deletedId);

      const orphaned = await app.handlers['payees-get-orphaned']();

      expect(orphaned.map(p => p.id).sort()).toEqual(
        [orphanId, deletedRuleId].sort(),
      );
    });
  });

  describe('payees-get-rule-counts', () => {
    it('counts payee rules but excludes rules linked to completed schedules', async () => {
      const activePayeeId = db.insertPayee({ name: 'Active Payee' });
      const completedPayeeId = db.insertPayee({
        name: 'Completed Payee',
      });

      insertRule({
        stage: 'pre',
        conditionsOp: 'and',
        conditions: [{ op: 'is', field: 'payee', value: activePayeeId }],
        actions: [{ op: 'set', field: 'category', value: null }],
      });

      const scheduleId = await createSchedule({
        conditions: [
          { op: 'is', field: 'payee', value: completedPayeeId },
          { op: 'is', field: 'date', value: '2020-12-20' },
        ],
      });
      await updateSchedule({
        schedule: { id: scheduleId, completed: true },
      });

      const counts = await app.handlers['payees-get-rule-counts']();

      expect(counts[activePayeeId]).toBe(1);
      expect(counts[completedPayeeId]).toBeUndefined();
    });

    it('reports a merge as a change to a table the counts read', async () => {
      const mergedId = db.insertPayee({ name: 'Merged' });
      const targetId = db.insertPayee({ name: 'Target' });
      insertRule({
        stage: 'pre',
        conditionsOp: 'and',
        conditions: [{ op: 'is', field: 'payee', value: mergedId }],
        actions: [{ op: 'set', field: 'category', value: null }],
      });

      const changes: BudgetChanges[] = [];
      const stop = liveReads.onChanges(change => changes.push(change));
      await app.handlers['payees-merge']({ targetId, mergeIds: [mergedId] });
      stop();

      const counts = await app.handlers['payees-get-rule-counts']();
      expect(counts[targetId]).toBe(1);
      expect(counts[mergedId]).toBeUndefined();

      // So a live read of the counts is refreshed
      const { tables } = payeeLiveReads['payees-get-rule-counts'];
      expect(
        changes.some(
          change =>
            change === 'all' ||
            change.tables.some(table => tables.includes(table)),
        ),
      ).toBe(true);
    });
  });
});
