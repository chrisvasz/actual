import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { MonteCarloWithdrawalRuleType } from '@actual-app/core/types/models';

import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import { MonteCarloNumberInput } from '#components/reports/reports/monte-carlo/MonteCarloNumberInput';
import { MAX_AMOUNT } from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import type { MonteCarloWithdrawalRuleConfig } from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import {
  FIELD_LABEL_ROW_STYLE,
  FIELD_LABEL_STYLE,
  FIELD_STYLE,
} from '#components/reports/reports/monte-carlo/monteCarloStyles';
import { FinancialInput } from '#components/util/FinancialInput';

const SENTENCE_STYLE = {
  color: theme.pageText,
  // Room for the inline inputs without cramped line wrapping
  lineHeight: 2.6,
} as const;

const INLINE_INPUT_STYLE = {
  width: 70,
  display: 'inline-block',
  textAlign: 'center',
  margin: '0 6px',
} as const;

type MonteCarloWithdrawalRuleConfigurationProps = {
  rule: MonteCarloWithdrawalRuleConfig;
  minimumSpending: number;
  onRuleChange: (changes: Partial<MonteCarloWithdrawalRuleConfig>) => void;
  onMinimumSpendingChange: (value: number) => void;
};

export function MonteCarloWithdrawalRuleConfiguration({
  rule,
  minimumSpending,
  onRuleChange,
  onMinimumSpendingChange,
}: MonteCarloWithdrawalRuleConfigurationProps) {
  return (
    <View style={{ marginTop: 20, gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
        <View style={{ width: 250 }}>
          <View style={FIELD_LABEL_ROW_STYLE}>
            <Text style={FIELD_LABEL_STYLE}>Withdrawal rule</Text>
            <MonteCarloHelpTooltip>
              Dynamic strategies that adjust your withdrawal each year based on
              how the pots are doing, instead of blindly taking the same
              inflation-adjusted amount.
            </MonteCarloHelpTooltip>
          </View>
          <Select
            value={rule.type}
            onChange={value =>
              onRuleChange({ type: value as MonteCarloWithdrawalRuleType })
            }
            options={[
              ['none', 'None (fixed withdrawals)'],
              ['guardrails', 'Guardrails (Guyton-Klinger)'],
              ['ratcheting', 'Ratcheting (Kitces)'],
              ['floor-ceiling', 'Floor & ceiling (Bengen)'],
              ['boundaries', 'Boundaries'],
            ]}
          />
        </View>

        {rule.type !== 'none' && (
          <View style={FIELD_STYLE}>
            <View style={FIELD_LABEL_ROW_STYLE}>
              <Text style={FIELD_LABEL_STYLE}>Minimum spending</Text>
              <MonteCarloHelpTooltip>
                The lowest amount you need to live on in any year, no matter
                what the rule says: when the rule cuts below it, the plan is
                lifted back up to it and that is what gets spent. Income counts
                towards it, so the pots only withdraw enough to top it up. It
                only applies in years with planned spending - a spending phase
                set to 0 takes nothing. Like your planned spending, it&apos;s in
                today&apos;s money and rises with inflation. Set to 0 for no
                floor.
              </MonteCarloHelpTooltip>
            </View>
            <FinancialInput
              value={minimumSpending}
              onUpdate={value =>
                onMinimumSpendingChange(
                  Math.min(MAX_AMOUNT, Math.max(0, value)),
                )
              }
            />
          </View>
        )}
      </View>

      {rule.type === 'guardrails' && (
        <View>
          <Text style={SENTENCE_STYLE}>
            <Text style={{ fontWeight: 600 }}>Capital preservation rule:</Text>{' '}
            If the withdrawal rate rises more than
            <MonteCarloNumberInput
              value={rule.preservationTriggerPct}
              aria-label="Capital preservation trigger (%)"
              scale={100}
              min={0}
              max={100}
              style={INLINE_INPUT_STYLE}
              onCommit={newValue =>
                onRuleChange({ preservationTriggerPct: newValue ?? 0 })
              }
            />
            % above the planned rate, cut withdrawals by
            <MonteCarloNumberInput
              value={rule.preservationCutPct}
              aria-label="Capital preservation cut (%)"
              scale={100}
              min={0}
              max={100}
              style={INLINE_INPUT_STYLE}
              onCommit={newValue =>
                onRuleChange({ preservationCutPct: newValue ?? 0 })
              }
            />
            %.
          </Text>
          <Text style={SENTENCE_STYLE}>
            <Text style={{ fontWeight: 600 }}>Prosperity rule:</Text> If the
            withdrawal rate falls more than
            <MonteCarloNumberInput
              value={rule.prosperityTriggerPct}
              aria-label="Prosperity trigger (%)"
              scale={100}
              min={0}
              max={100}
              style={INLINE_INPUT_STYLE}
              onCommit={newValue =>
                onRuleChange({ prosperityTriggerPct: newValue ?? 0 })
              }
            />
            % below the planned rate, raise withdrawals by
            <MonteCarloNumberInput
              value={rule.prosperityIncreasePct}
              aria-label="Prosperity raise (%)"
              scale={100}
              min={0}
              max={100}
              style={INLINE_INPUT_STYLE}
              onCommit={newValue =>
                onRuleChange({ prosperityIncreasePct: newValue ?? 0 })
              }
            />
            %.
          </Text>
        </View>
      )}

      {rule.type === 'ratcheting' && (
        <Text style={SENTENCE_STYLE}>
          If the accessible balance stays above
          <MonteCarloNumberInput
            value={rule.balanceThresholdMultiple}
            aria-label="Balance threshold multiple"
            min={1}
            max={10}
            step={0.1}
            style={INLINE_INPUT_STYLE}
            onCommit={newValue =>
              onRuleChange({ balanceThresholdMultiple: newValue ?? 1.5 })
            }
          />
          times its starting level for
          <MonteCarloNumberInput
            value={rule.consecutiveYears}
            aria-label="Years in a row"
            roundToInteger
            min={1}
            max={30}
            step={1}
            style={INLINE_INPUT_STYLE}
            onCommit={newValue =>
              onRuleChange({ consecutiveYears: newValue ?? 1 })
            }
          />
          years in a row, raise withdrawals by
          <MonteCarloNumberInput
            value={rule.ratchetIncreasePct}
            aria-label="Ratchet raise (%)"
            scale={100}
            min={0}
            max={100}
            style={INLINE_INPUT_STYLE}
            onCommit={newValue =>
              onRuleChange({ ratchetIncreasePct: newValue ?? 0 })
            }
          />
          %.
        </Text>
      )}

      {rule.type === 'floor-ceiling' && (
        <Text style={SENTENCE_STYLE}>
          Each year, withdraw the starting rate&apos;s share of the current
          accessible balance, but never more than
          <MonteCarloNumberInput
            value={rule.ceilingPct}
            aria-label="Ceiling above planned amount (%)"
            scale={100}
            min={0}
            max={200}
            style={INLINE_INPUT_STYLE}
            onCommit={newValue => onRuleChange({ ceilingPct: newValue ?? 0 })}
          />
          % above or
          <MonteCarloNumberInput
            value={rule.floorPct}
            aria-label="Floor below planned amount (%)"
            scale={100}
            min={0}
            max={100}
            style={INLINE_INPUT_STYLE}
            onCommit={newValue => onRuleChange({ floorPct: newValue ?? 0 })}
          />
          % below the planned amount.
        </Text>
      )}

      {rule.type === 'boundaries' && (
        <View>
          <Text style={SENTENCE_STYLE}>
            If the withdrawal rate rises above
            <MonteCarloNumberInput
              value={rule.upperRateThreshold}
              aria-label="Upper withdrawal rate threshold (%)"
              scale={100}
              min={0}
              max={100}
              style={INLINE_INPUT_STYLE}
              onCommit={newValue =>
                onRuleChange({ upperRateThreshold: newValue ?? 0 })
              }
            />
            %, cut withdrawals by
            <MonteCarloNumberInput
              value={rule.upperCutPct}
              aria-label="Cut when above the upper threshold (%)"
              scale={100}
              min={0}
              max={100}
              style={INLINE_INPUT_STYLE}
              onCommit={newValue =>
                onRuleChange({ upperCutPct: newValue ?? 0 })
              }
            />
            %.
          </Text>
          <Text style={SENTENCE_STYLE}>
            If the withdrawal rate falls below
            <MonteCarloNumberInput
              value={rule.lowerRateThreshold}
              aria-label="Lower withdrawal rate threshold (%)"
              scale={100}
              min={0}
              max={100}
              style={INLINE_INPUT_STYLE}
              onCommit={newValue =>
                onRuleChange({ lowerRateThreshold: newValue ?? 0 })
              }
            />
            %, raise withdrawals by
            <MonteCarloNumberInput
              value={rule.lowerIncreasePct}
              aria-label="Raise when below the lower threshold (%)"
              scale={100}
              min={0}
              max={100}
              style={INLINE_INPUT_STYLE}
              onCommit={newValue =>
                onRuleChange({ lowerIncreasePct: newValue ?? 0 })
              }
            />
            %.
          </Text>
        </View>
      )}

      {rule.type !== 'none' && (
        <Text style={{ color: theme.pageText, fontSize: 13 }}>
          {rule.type === 'guardrails'
            ? 'A deliberate spending-phase change is not counted as drift. The rule adjusts your planned spending year by year, independently in every scenario, and only looks at the pots you can currently access - locked pots count from the moment they unlock.'
            : 'The rule adjusts your planned spending year by year, independently in every scenario, and only looks at the pots you can currently access - locked pots count from the moment they unlock.'}
        </Text>
      )}
    </View>
  );
}
