import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as aql from '#server/aql';
import * as db from '#server/db';
import { handlers } from '#server/main';
import { runHandler } from '#server/mutators';
import { Action } from '#server/rules/action';

import { loadUserPreferencesForFormulas } from './customFunctionsPreferences';

function executeFormula(formula: string) {
  const action = new Action('set', 'notes', null, { formula });
  const transaction = { notes: '' };

  action.exec(transaction);

  return transaction.notes;
}

describe('formula preferences', () => {
  beforeEach(async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await (global as any).emptyDatabase()();
    vi.clearAllMocks();
  });

  it('reads preferences changed outside the settings, like by a sync', async () => {
    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1,234.50');

    db.update('preferences', {
      id: 'numberFormat',
      value: 'dot-comma',
    });

    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1.234,50');
  });

  it('infers number separators from locale formatting', async () => {
    const preferences = await loadUserPreferencesForFormulas({
      selectedLocale: 'de-DE',
    });

    expect(preferences.numberFormat).toBe('dot-comma');
    expect(preferences.decimalPlaces).toBe(2);
    expect(preferences.thousandsSeparator).toBe('.');
    expect(preferences.decimalSeparator).toBe(',');
  });

  it('loads hidden fraction preference for formula number formatting', async () => {
    db.update('preferences', {
      id: 'hideFraction',
      value: 'true',
    });

    const preferences = await loadUserPreferencesForFormulas();

    expect(preferences.decimalPlaces).toBe(0);
  });

  it('loads formula preferences with one preferences query', async () => {
    const aqlQuerySpy = vi.spyOn(aql, 'aqlQuery');

    await loadUserPreferencesForFormulas();

    expect(aqlQuerySpy).toHaveBeenCalledTimes(1);
  });

  it('reads preferences saved in the settings', async () => {
    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1,234.50');

    await runHandler(handlers['preferences/save'], {
      id: 'numberFormat',
      value: 'dot-comma',
    });

    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1.234,50');
  });

  it('reads the hide fraction preference once it changes', async () => {
    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1,234.50');

    await runHandler(handlers['preferences/save'], {
      id: 'hideFraction',
      value: 'true',
    });

    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1,235');
  });

  it('reads preferences changed by an undo', async () => {
    await runHandler(handlers['preferences/save'], {
      id: 'numberFormat',
      value: 'dot-comma',
    });
    await runHandler(handlers['preferences/save'], {
      id: 'numberFormat',
      value: 'comma-dot',
    });
    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1,234.50');

    await runHandler(handlers['undo']);

    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1.234,50');
  });
});
