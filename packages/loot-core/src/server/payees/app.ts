import { createApp } from '#server/app';
import * as db from '#server/db';
import { liveRead, registerLiveReads } from '#server/live-reads';
import { payeeModel } from '#server/models';
import { mutator } from '#server/mutators';
import { getCompletedScheduleRuleIds } from '#server/schedules/app';
import { batchMessages } from '#server/sync';
import * as rules from '#server/transactions/transaction-rules';
import { undoable } from '#server/undo';
import type { Diff } from '#shared/util';
import type { PayeeEntity, RuleEntity } from '#types/models';

export type PayeesHandlers = {
  'payee-create': typeof createPayee;
  'common-payees-get': typeof getCommonPayees;
  'payees-get': typeof getPayees;
  'payees-merge': typeof mergePayees;
  'payees-batch-change': typeof batchChangePayees;
  'payees-check-orphaned': typeof checkOrphanedPayees;
  'payees-get-rules': typeof getPayeeRules;
};

export const app = createApp<PayeesHandlers>();
app.method('payee-create', mutator(undoable(createPayee)));
app.method('common-payees-get', getCommonPayees);
app.method('payees-get', getPayees);
app.method(
  'payees-merge',
  mutator(
    undoable(mergePayees, args => ({
      mergeIds: args.mergeIds,
      targetId: args.targetId,
    })),
  ),
);
app.method('payees-batch-change', mutator(undoable(batchChangePayees)));
app.method('payees-check-orphaned', checkOrphanedPayees);
app.method('payees-get-rules', getPayeeRules);

async function createPayee({ name }: { name: PayeeEntity['name'] }) {
  return db.insertPayee({ name });
}

async function getCommonPayees(): Promise<PayeeEntity[]> {
  // TODO: Update to an AQL query. Server must return AQL entities not the raw DB data.
  return db.getCommonPayees().map(p => payeeModel.fromDb(p));
}

export const payeeLiveReads = registerLiveReads({
  'payees-get': liveRead({
    // Transfer payees take their account's name
    tables: ['payees', 'accounts'],
    empty: () => [],
    read: readPayees,
  }),
  'payees-get-orphaned': liveRead({
    // Payees no transaction or rule uses; transactions are read through
    // `v_transactions_internal_alive`
    tables: [
      'payees',
      'payee_mapping',
      'transactions',
      'category_mapping',
      'rules',
    ],
    empty: () => [],
    read: readOrphanedPayees,
  }),
  'payees-get-rule-counts': liveRead({
    // The rules app's rules, kept in step with `rules` and the mappings
    // (a merge remaps their payees) before a change is reported, less those
    // of completed schedules
    tables: ['rules', 'payee_mapping', 'schedules'],
    empty: (): Record<PayeeEntity['id'], number> => ({}),
    read: readPayeeRuleCounts,
  }),
  'payees-get-rules': liveRead<RuleEntity[], { id: PayeeEntity['id'] }>({
    tables: rules.RULES_TABLES,
    empty: () => [],
    read: readPayeeRules,
  }),
});

function readPayees(): PayeeEntity[] {
  // TODO: Update to an AQL query. Server must return AQL entities not the raw DB data.
  return db.getPayees().map(p => payeeModel.fromDb(p));
}

async function getPayees(): Promise<PayeeEntity[]> {
  return readPayees();
}

function readOrphanedPayees(): Array<Pick<PayeeEntity, 'id'>> {
  return db.syncGetOrphanedPayees();
}

function readPayeeRuleCounts(): Record<PayeeEntity['id'], number> {
  const payeeCounts: Record<PayeeEntity['id'], number> = {};
  const completedScheduleRules = new Set(getCompletedScheduleRuleIds());

  rules.iterateIds(rules.getRules(), 'payee', (rule, id) => {
    if (rule.id && completedScheduleRules.has(rule.id)) {
      return;
    }

    if (payeeCounts[id] == null) {
      payeeCounts[id] = 0;
    }
    payeeCounts[id]++;
  });

  return payeeCounts;
}

async function mergePayees({
  targetId,
  mergeIds,
}: {
  targetId: PayeeEntity['id'];
  mergeIds: Array<PayeeEntity['id']>;
}) {
  db.mergePayees(targetId, mergeIds);
}

async function batchChangePayees({
  added,
  deleted,
  updated,
}: Partial<Diff<PayeeEntity>>): Promise<void> {
  batchMessages(() => {
    for (const p of deleted ?? []) {
      db.deletePayee({ id: p.id });
    }

    for (const p of added ?? []) {
      db.insertPayee(payeeModel.toDb(p));
    }

    for (const p of updated ?? []) {
      db.updatePayee(payeeModel.toDb(p as PayeeEntity, { update: true }));
    }
  });
}

async function checkOrphanedPayees({
  ids,
}: {
  ids: Array<PayeeEntity['id']>;
}): Promise<Array<PayeeEntity['id']>> {
  const orphaned = new Set(db.getOrphanedPayees());
  return ids.filter(id => orphaned.has(id));
}

function readPayeeRules({ id }: { id: PayeeEntity['id'] }): RuleEntity[] {
  return rules.serializeRules(rules.getRulesForPayee(id));
}

async function getPayeeRules(args: {
  id: PayeeEntity['id'];
}): Promise<RuleEntity[]> {
  return readPayeeRules(args);
}
