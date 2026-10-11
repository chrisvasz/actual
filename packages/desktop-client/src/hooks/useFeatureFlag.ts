import type { FeatureFlag } from '@actual-app/core/types/prefs';

import { useSyncedPref } from './useSyncedPref';

const DEFAULT_FEATURE_FLAG_STATE: Record<FeatureFlag, boolean> = {
  actionTemplating: false,
  formulaMode: false,
  currency: false,
  balanceForecastReport: false,
  customThemes: false,
  budgetAnalysisReport: false,
  sankeyReport: false,
  monteCarloReport: false,
};

export function useFeatureFlag(name: FeatureFlag): boolean {
  const [value] = useSyncedPref(`flags.${name}`);

  return value === undefined
    ? DEFAULT_FEATURE_FLAG_STATE[name] || false
    : String(value) === 'true';
}
