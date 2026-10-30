import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';

import { FinancialText } from '#components/FinancialText';

const percentFormat = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

type PercentChangeProps = {
  /** A fraction, or null when there's no meaningful change to show */
  change: number | null;
  /** Whether the change is good news, which colors it */
  isGood: boolean;
  style?: CSSProperties;
};

/** A signed percentage change, or a dash when there's none to show. */
export function PercentChange({ change, isGood, style }: PercentChangeProps) {
  if (change == null) {
    return (
      <FinancialText
        aria-label="No change to show"
        style={{ color: theme.pageTextSubdued, ...style }}
      >
        —
      </FinancialText>
    );
  }
  const color =
    Math.abs(change) < 0.0005
      ? theme.pageTextSubdued
      : isGood
        ? theme.numberPositive
        : theme.numberNegative;
  return (
    <FinancialText style={{ color, ...style }}>
      {percentFormat.format(change)}
    </FinancialText>
  );
}
