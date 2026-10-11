import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as aql from '#server/aql';
import * as db from '#server/db';
import { handlers } from '#server/main';
import { runHandler } from '#server/mutators';
import { Action } from '#server/rules/action';

import {
  ensureFormulaPreferencesLoaded,
  resetFormulaPreferencesCache,
} from './bootstrap';
import { loadUserPreferencesForFormulas } from './customFunctionsPreferences';

function executeFormula(formula: string) {
  const action = new Action('set', 'notes', null, { formula });
  const transaction = { notes: '' };

  action.exec(transaction);

  return transaction.notes;
}

describe('formula preference bootstrap', () => {
  beforeEach(async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await (global as any).emptyDatabase()();
    vi.clearAllMocks();
    resetFormulaPreferencesCache();
  });

  it('reloads cached user preferences after reset', async () => {
    ensureFormulaPreferencesLoaded();
    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1,234.50');

    db.update('preferences', {
      id: 'numberFormat',
      value: 'dot-comma',
    });

    resetFormulaPreferencesCache();
    ensureFormulaPreferencesLoaded();

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

  it('reloads cached user preferences after relevant synced preferences change', async () => {
    ensureFormulaPreferencesLoaded();
    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1,234.50');

    await runHandler(handlers['preferences/save'], {
      id: 'numberFormat',
      value: 'dot-comma',
    });
    ensureFormulaPreferencesLoaded();

    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1.234,50');
  });

  it('reloads cached user preferences after hide fraction changes', async () => {
    ensureFormulaPreferencesLoaded();
    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1,234.50');

    await runHandler(handlers['preferences/save'], {
      id: 'hideFraction',
      value: 'true',
    });
    ensureFormulaPreferencesLoaded();

    expect(executeFormula('=FORMATNUMBER(1234.5)')).toBe('1,235');
  });

  it('keeps cached user preferences after unrelated synced preferences change', async () => {
    ensureFormulaPreferencesLoaded();
    db.update('preferences', {
      id: 'numberFormat',
      value: 'dot-comma',
    });

    await runHandler(handlers['preferences/save'], {
      id: 'dateFormat',
      value: 'dd/MM/yyyy',
    });
    ensureFormulaPreferencesLoaded();

    expect(executeFormula('=FORMATNUMBER(1234.5, 2)')).toBe('1,234.50');
  });
});
