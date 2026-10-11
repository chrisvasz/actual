import {
  clearCachedUserPreferences,
  setCachedUserPreferences,
} from '#shared/formulas/customFunctions';

import { getUserPreferencesForFormulas } from './customFunctionsPreferences';

let isCached = false;

export function resetFormulaPreferencesCache(): void {
  isCached = false;
  clearCachedUserPreferences();
}

export function ensureFormulaPreferencesLoaded(): void {
  if (isCached) {
    return;
  }
  setCachedUserPreferences(getUserPreferencesForFormulas());
  isCached = true;
}
