// Opt-in: writes the large budget that `desktop-client/bin/bench-register.mjs`
// measures the account register with, for the web app's "Import file" >
// Actual. Run with:
//   REGISTER_BENCH_EXPORT=/tmp/bench.zip yarn workspace @actual-app/core vitest --run src/server/budget/register-bench-budget.test.ts
import { writeFileSync } from 'node:fs';

import type { Database } from 'better-sqlite3';
import { zipSync } from 'fflate';

import {
  generateBudget,
  seededRandom,
} from '#server/budget/test-helpers/generate-budget';
import * as db from '#server/db';

beforeEach(global.emptyDatabase());

const PAYEE_WORDS = [
  'Grocer',
  'Café',
  'Müller',
  'Łódź Market',
  'Fuel',
  'Bäckerei',
  'Hardware',
  'Pharmacy',
  'Crème',
  'Books',
];
const NOTE_WORDS = ['memo', 'cafe', 'Café', 'refund', 'gift', 'rent', 'GROCER'];

// Gives every transaction one of 200 payees, and a fifth of them notes
function seedPayeesAndNotes() {
  const random = seededRandom(3);
  const payeeIds: string[] = [];
  for (let i = 0; i < 200; i++) {
    payeeIds.push(db.insertPayee({ name: `${random.pick(PAYEE_WORDS)} ${i}` }));
  }
  const ids = db
    .runQuery<{ id: string }>('SELECT id FROM transactions', [], true)
    .map(row => row.id);
  db.transaction(() => {
    for (const id of ids) {
      const notes = random.chance(0.2)
        ? `${random.pick(NOTE_WORDS)} ${random.pick(NOTE_WORDS)}`
        : null;
      db.runQuery(
        'UPDATE transactions SET description = ?, notes = ? WHERE id = ?',
        [random.pick(payeeIds), notes, id],
      );
    }
  });
}

describe.skipIf(!process.env.REGISTER_BENCH_EXPORT)(
  'register bench budget',
  () => {
    it('writes the budget', { timeout: 600_000 }, async () => {
      await generateBudget({
        seed: 1,
        years: 10,
        transactionsPerMonth: 340,
        groupCount: 8,
        categoriesPerGroup: 7,
      });
      seedPayeesAndNotes();

      // Tests run on better-sqlite3
      const handle = db.getDatabase() as unknown as Database;
      const meta = { id: 'register-bench', budgetName: 'Register bench' };
      writeFileSync(
        process.env.REGISTER_BENCH_EXPORT as string,
        zipSync(
          {
            'db.sqlite': handle.serialize(),
            'metadata.json': new TextEncoder().encode(JSON.stringify(meta)),
          },
          // Tests mock the clock
          { mtime: new Date(2020, 0, 1) },
        ),
      );
    });
  },
);
