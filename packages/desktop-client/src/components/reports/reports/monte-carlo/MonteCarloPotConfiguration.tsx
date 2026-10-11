import { useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { GridListItem } from 'react-aria-components';

import { Button } from '@actual-app/components/button';
import { SvgDelete } from '@actual-app/components/icons/v0';
import {
  SvgCheveronDown,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { MonteCarloAllocationPreset } from '@actual-app/core/types/models';
import { css } from '@emotion/css';

import { FinancialText } from '#components/FinancialText';
import { LabeledCheckbox } from '#components/forms/LabeledCheckbox';
import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import { MonteCarloNumberInput } from '#components/reports/reports/monte-carlo/MonteCarloNumberInput';
import { POT_COLUMNS } from '#components/reports/reports/monte-carlo/MonteCarloPotsTableHeader';
import {
  ALLOCATION_PRESETS,
  getHistoricalMixStats,
  getPotAssetWeights,
  MAX_AMOUNT,
  MAX_ANNUAL_FEE_RATE,
  MAX_WITHDRAWAL_TAX_RATE,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import type { MonteCarloPot } from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import {
  FIELD_LABEL_ROW_STYLE,
  FIELD_LABEL_STYLE,
  FIELD_STYLE,
  GROUP_HEADING_STYLE,
} from '#components/reports/reports/monte-carlo/monteCarloStyles';
import { Field, Row } from '#components/table';
import { FinancialInput } from '#components/util/FinancialInput';
import { useAccounts } from '#hooks/useAccounts';

const POT_ROW_HEIGHT = 43;

type MonteCarloPotConfigurationProps = ComponentPropsWithoutRef<
  typeof GridListItem<MonteCarloPot>
> & {
  pot: MonteCarloPot;
  potLabel: string;
  canRemove: boolean;
  /** True when a historical return model is active */
  usesHistoricalReturns: boolean;
  /** True when the bands tax model is active */
  usesTaxBands: boolean;
  onPotChange: (changes: Partial<MonteCarloPot>) => void;
  onRemove: () => void;
};

export function MonteCarloPotConfiguration({
  pot,
  potLabel,
  canRemove,
  usesHistoricalReturns,
  usesTaxBands,
  onPotChange,
  onRemove,
  ...props
}: MonteCarloPotConfigurationProps) {
  const { data: accounts = [] } = useAccounts();
  const [isExpanded, setIsExpanded] = useState(false);

  // Historical models derive this pot's returns from its allocation mix,
  // so pots with one (presets and custom mixes) show the mix's measured
  // history instead of editable assumptions; the manual return/volatility
  // only apply to pots without a mix
  const assetWeights = usesHistoricalReturns ? getPotAssetWeights(pot) : null;
  const historicalMixStats =
    assetWeights != null ? getHistoricalMixStats(assetWeights) : null;

  // A custom mix only counts once its shares total 100% (matching
  // getPotAssetWeights, tolerance included); until then the pot falls
  // back to its manual return/volatility and the UI warns
  const sanitizeShare = (share: number) =>
    Number.isFinite(share) && share > 0 ? share : 0;
  const mixShareTotal =
    sanitizeShare(pot.allocationStocks) +
    sanitizeShare(pot.allocationBonds) +
    sanitizeShare(pot.allocationCash);
  const isMixIncomplete =
    pot.allocationPreset === 'custom-mix' &&
    Math.abs(mixShareTotal - 1) >= 1e-9;

  // A linked account that has since been closed or deleted isn't in the
  // open-accounts list; keep it represented so the stored link doesn't
  // display as a blank selection
  const openAccounts = accounts
    .filter(account => account.closed === 0)
    // Budgeted accounts first, then off-budget, each keeping the user's
    // sidebar drag order (the query already sorts by sort_order) - the
    // same order the sidebar shows
    .sort((accountA, accountB) => accountA.offbudget - accountB.offbudget);
  const linkedAccount = accounts.find(account => account.id === pot.accountId);
  const missingLinkedOptions: Array<[string, string]> =
    pot.accountId != null &&
    !openAccounts.some(account => account.id === pot.accountId)
      ? [
          [
            pot.accountId,
            linkedAccount
              ? `${linkedAccount.name} (closed)`
              : 'Unavailable account',
          ],
        ]
      : [];

  // The surplus pot is managed by the Manage surplus setting: it holds
  // whatever the plan didn't spend, as cash, immediately accessible,
  // untaxed and fee-free - so its row is read-only
  if (pot.isSurplus) {
    const readOnlyCellStyle = { color: theme.tableText };
    return (
      <GridListItem
        textValue={potLabel}
        className={css({
          '&[data-dragging]': {
            opacity: 0.5,
          },
        })}
        {...props}
      >
        <Row
          collapsed
          height={POT_ROW_HEIGHT}
          style={{
            backgroundColor: theme.tableBackground,
            ':hover': { backgroundColor: theme.tableRowBackgroundHover },
          }}
        >
          <Field width={POT_COLUMNS.expand} />
          <Field
            width="flex"
            style={{ minWidth: POT_COLUMNS.name }}
            truncate={false}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <Text style={readOnlyCellStyle}>{potLabel}</Text>
              <MonteCarloHelpTooltip>
                Your plan&apos;s surplus pot. Income beyond your spending is
                saved here each year, and it is drawn on before any other pot
                when spending needs funding. It starts empty and holds cash: no
                access age, no tax, no fees. To remove it, tick Assume any
                unspent money is spent under Manage surplus on the Plan details
                tab.
              </MonteCarloHelpTooltip>
            </View>
          </Field>
          <Field
            width="flex"
            style={{ minWidth: POT_COLUMNS.startingBalance }}
            truncate={false}
          >
            <Text style={readOnlyCellStyle}>Starts empty</Text>
          </Field>
          <Field
            width="flex"
            style={{ minWidth: POT_COLUMNS.linkedAccount }}
            truncate={false}
          >
            <Text style={readOnlyCellStyle}>None</Text>
          </Field>
          <Field
            width="flex"
            style={{ minWidth: POT_COLUMNS.allocation }}
            truncate={false}
          >
            <Text style={readOnlyCellStyle}>Cash / money market</Text>
          </Field>
          <Field
            width="flex"
            style={{ minWidth: POT_COLUMNS.expectedReturn }}
            truncate={false}
          >
            <Text style={readOnlyCellStyle}>
              <FinancialText as="span">
                {historicalMixStats != null
                  ? `${`${(historicalMixStats.mean * 100).toFixed(1)}%`} (historical)`
                  : `${(pot.expectedReturnMean * 100).toFixed(1)}%`}
              </FinancialText>
            </Text>
          </Field>
          <Field
            width="flex"
            style={{ minWidth: POT_COLUMNS.volatility }}
            truncate={false}
          >
            <Text style={readOnlyCellStyle}>
              <FinancialText as="span">
                {historicalMixStats != null
                  ? `${`${(historicalMixStats.stdDev * 100).toFixed(1)}%`} (historical)`
                  : `${(pot.returnStdDev * 100).toFixed(1)}%`}
              </FinancialText>
            </Text>
          </Field>
          <Field width={POT_COLUMNS.remove} />
        </Row>
      </GridListItem>
    );
  }

  return (
    <GridListItem
      textValue={potLabel}
      className={css({
        '&[data-dragging]': {
          opacity: 0.5,
        },
      })}
      {...props}
    >
      <Row
        collapsed
        height={POT_ROW_HEIGHT}
        style={{
          backgroundColor: theme.tableBackground,
          ':hover': { backgroundColor: theme.tableRowBackgroundHover },
        }}
      >
        <Field
          width={POT_COLUMNS.expand}
          truncate={false}
          style={{ alignItems: 'center' }}
        >
          <Button
            variant="bare"
            aria-label={
              isExpanded ? 'Hide more settings' : 'Show more settings'
            }
            onPress={() => setIsExpanded(!isExpanded)}
            style={{ padding: 6 }}
          >
            {isExpanded ? (
              <SvgCheveronDown width={14} height={14} />
            ) : (
              <SvgCheveronRight width={14} height={14} />
            )}
          </Button>
        </Field>

        <Field
          width="flex"
          style={{ minWidth: POT_COLUMNS.name }}
          truncate={false}
        >
          <Input
            // Uncontrolled on purpose: committing on blur keeps typing
            // snappy since every config change re-runs the simulation.
            // The key remounts it when the linked account changes, so an
            // auto-filled name actually shows up
            key={pot.accountId ?? 'manual'}
            defaultValue={pot.name}
            placeholder={potLabel}
            onUpdate={newName => {
              if (newName !== pot.name) {
                onPotChange({ name: newName });
              }
            }}
          />
        </Field>

        <Field
          width="flex"
          style={{ minWidth: POT_COLUMNS.startingBalance }}
          truncate={false}
        >
          <FinancialInput
            value={pot.startingBalance}
            // Typing a different balance takes manual control: the pot
            // unlinks from its account and keeps the typed value. The
            // changed-check stops a mere tab-through from unlinking.
            onUpdate={value => {
              const newBalance = Math.min(MAX_AMOUNT, Math.max(0, value));
              if (newBalance !== pot.startingBalance) {
                onPotChange({
                  startingBalance: newBalance,
                  accountId: null,
                });
              }
            }}
          />
        </Field>

        <Field
          width="flex"
          style={{ minWidth: POT_COLUMNS.linkedAccount }}
          truncate={false}
        >
          <Select
            value={pot.accountId ?? ''}
            onChange={value => {
              const newAccountId = value === '' ? null : value;
              const newAccount = accounts.find(
                account => account.id === newAccountId,
              );
              const previousAccount = accounts.find(
                account => account.id === pot.accountId,
              );
              // Default the pot's name to the account's, but only when
              // the current name isn't the user's own: empty, or still
              // the auto-filled name of the previously linked account
              const shouldFillName =
                newAccount != null &&
                (pot.name === '' || pot.name === previousAccount?.name);
              onPotChange({
                accountId: newAccountId,
                ...(shouldFillName && { name: newAccount.name }),
              });
            }}
            options={[
              ['', 'None'],
              ...missingLinkedOptions,
              ...openAccounts.map(
                account => [account.id, account.name] as [string, string],
              ),
            ]}
          />
        </Field>

        <Field
          width="flex"
          style={{ minWidth: POT_COLUMNS.allocation }}
          truncate={false}
        >
          <Select
            value={pot.allocationPreset}
            onChange={value => {
              const preset = value as MonteCarloAllocationPreset;
              if (preset === 'custom') {
                onPotChange({ allocationPreset: preset });
              } else if (preset === 'custom-mix') {
                // Seed the mix from the preset being left, so tweaking
                // a preset (e.g. 80/20 to 85/15) starts from its shares
                const presetWeights =
                  pot.allocationPreset !== 'custom-mix'
                    ? getPotAssetWeights(pot)
                    : null;
                onPotChange({
                  allocationPreset: preset,
                  ...(presetWeights != null && {
                    allocationStocks: presetWeights.stocks,
                    allocationBonds: presetWeights.bonds,
                    allocationCash: presetWeights.cash,
                  }),
                });
                // The mix's share inputs live in the expanded panel
                setIsExpanded(true);
              } else {
                onPotChange({
                  allocationPreset: preset,
                  expectedReturnMean: ALLOCATION_PRESETS[preset].mean,
                  returnStdDev: ALLOCATION_PRESETS[preset].stdDev,
                });
              }
            }}
            options={[
              ['equity-100', '100% stocks'],
              ['equity-80', '80% stocks / 20% bonds'],
              ['equity-60', '60% stocks / 40% bonds'],
              ['equity-40', '40% stocks / 60% bonds'],
              ['cash', 'Cash / money market'],
              ['custom-mix', 'Custom mix'],
              ['custom', 'Custom'],
            ]}
          />
        </Field>

        <Field
          width="flex"
          style={{ minWidth: POT_COLUMNS.expectedReturn }}
          truncate={false}
        >
          {historicalMixStats != null ? (
            // Historical models take real blended returns for pots with
            // an asset mix, so show what the mix actually measured
            // rather than an ignored assumption
            <Text style={{ color: theme.tableText }}>
              <FinancialText as="span">
                {`${`${(historicalMixStats.mean * 100).toFixed(1)}%`} (historical)`}
              </FinancialText>
            </Text>
          ) : (
            <MonteCarloNumberInput
              value={pot.expectedReturnMean}
              aria-label="Expected return (%)"
              scale={100}
              min={-100}
              max={100}
              onCommit={newValue =>
                onPotChange({
                  expectedReturnMean: newValue ?? 0,
                  // Typing a value only detaches a real preset; a custom
                  // mix keeps its mix (these are its random-model inputs)
                  allocationPreset:
                    pot.allocationPreset === 'custom-mix'
                      ? 'custom-mix'
                      : 'custom',
                })
              }
            />
          )}
        </Field>

        <Field
          width="flex"
          style={{ minWidth: POT_COLUMNS.volatility }}
          truncate={false}
        >
          {historicalMixStats != null ? (
            <Text style={{ color: theme.tableText }}>
              <FinancialText as="span">
                {`${`${(historicalMixStats.stdDev * 100).toFixed(1)}%`} (historical)`}
              </FinancialText>
            </Text>
          ) : (
            <MonteCarloNumberInput
              value={pot.returnStdDev}
              aria-label="Volatility (std dev %)"
              scale={100}
              min={0}
              max={100}
              onCommit={newValue =>
                onPotChange({
                  returnStdDev: newValue ?? 0,
                  allocationPreset:
                    pot.allocationPreset === 'custom-mix'
                      ? 'custom-mix'
                      : 'custom',
                })
              }
            />
          )}
        </Field>

        <Field
          width={POT_COLUMNS.remove}
          truncate={false}
          style={{ alignItems: 'center' }}
        >
          {canRemove && (
            <Button
              variant="bare"
              aria-label="Remove pot"
              onPress={onRemove}
              style={{ padding: 6 }}
            >
              <SvgDelete width={12} height={12} />
            </Button>
          )}
        </Field>
      </Row>

      {isExpanded && (
        <View
          style={{
            backgroundColor: theme.tableBackground,
            borderBottom: `1px solid ${theme.tableBorder}`,
            padding: '12px 15px 16px',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            rowGap: 15,
            columnGap: 40,
          }}
        >
          {pot.allocationPreset === 'custom-mix' && (
            <View style={{ gap: 10 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Text style={GROUP_HEADING_STYLE}>Allocation</Text>
                <MonteCarloHelpTooltip>
                  The share of this pot held in each asset class. The allocation
                  must total 100% - until it does, the pot falls back to the
                  expected return and volatility you enter.
                  <br />
                  <br />
                  The mix drives this pot&apos;s returns under the historical
                  return models. The random model still uses the expected return
                  and volatility you enter.
                </MonteCarloHelpTooltip>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  gap: 20,
                }}
              >
                <View style={FIELD_STYLE}>
                  <View style={FIELD_LABEL_ROW_STYLE}>
                    <Text style={FIELD_LABEL_STYLE}>Stocks (%)</Text>
                  </View>
                  <MonteCarloNumberInput
                    value={pot.allocationStocks}
                    aria-label="Stocks (%)"
                    scale={100}
                    min={0}
                    max={100}
                    onCommit={newValue =>
                      onPotChange({ allocationStocks: newValue ?? 0 })
                    }
                  />
                </View>
                <View style={FIELD_STYLE}>
                  <View style={FIELD_LABEL_ROW_STYLE}>
                    <Text style={FIELD_LABEL_STYLE}>Bonds (%)</Text>
                  </View>
                  <MonteCarloNumberInput
                    value={pot.allocationBonds}
                    aria-label="Bonds (%)"
                    scale={100}
                    min={0}
                    max={100}
                    onCommit={newValue =>
                      onPotChange({ allocationBonds: newValue ?? 0 })
                    }
                  />
                </View>
                <View style={FIELD_STYLE}>
                  <View style={FIELD_LABEL_ROW_STYLE}>
                    <Text style={FIELD_LABEL_STYLE}>Cash (%)</Text>
                  </View>
                  <MonteCarloNumberInput
                    value={pot.allocationCash}
                    aria-label="Cash (%)"
                    scale={100}
                    min={0}
                    max={100}
                    onCommit={newValue =>
                      onPotChange({ allocationCash: newValue ?? 0 })
                    }
                  />
                </View>
              </View>
              {isMixIncomplete && (
                // width 0 keeps the message from widening the group (it
                // would push the other groups aside); minWidth stretches
                // it back to the share inputs' width, wrapping the text
                <Text
                  style={{ color: theme.errorText, width: 0, minWidth: '100%' }}
                >
                  The allocation must total 100% - currently{' '}
                  {`${parseFloat((mixShareTotal * 100).toFixed(2))}%`}. Until it
                  does, this pot uses your expected return and volatility
                  instead of the mix.
                </Text>
              )}
            </View>
          )}

          <View style={{ gap: 10 }}>
            <Text style={GROUP_HEADING_STYLE}>Access</Text>
            <View style={FIELD_STYLE}>
              <View style={FIELD_LABEL_ROW_STYLE}>
                <Text style={FIELD_LABEL_STYLE}>Accessible from age</Text>
                <MonteCarloHelpTooltip>
                  Some pots can&apos;t be touched until a certain age - e.g.
                  personal pensions. Until then the pot stays invested and keeps
                  growing, but can&apos;t fund withdrawals.
                  <br />
                  <br />
                  Leave blank if the pot is available now.
                </MonteCarloHelpTooltip>
              </View>
              <MonteCarloNumberInput
                value={pot.accessAge}
                aria-label="Accessible from age"
                allowEmpty
                roundToInteger
                min={16}
                max={120}
                step={1}
                placeholder="Immediately"
                onCommit={newValue => onPotChange({ accessAge: newValue })}
              />
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={GROUP_HEADING_STYLE}>Tax</Text>
            <View style={FIELD_STYLE}>
              <View style={FIELD_LABEL_ROW_STYLE}>
                <Text style={FIELD_LABEL_STYLE}>
                  {usesTaxBands ? 'Taxable portion (%)' : 'Tax (%)'}
                </Text>
                <MonteCarloHelpTooltip>
                  {usesTaxBands
                    ? 'The share of a withdrawal from this pot that counts as taxable income under your tax bands - e.g. a pension with a 25% tax-free portion is 75, a tax-free account is 0, and a taxable account is roughly the share of each withdrawal that is gains.'
                    : 'The effective tax rate on withdrawals from this pot. Your spending is what you keep after tax, so the simulation withdraws extra to cover it - e.g. a tax-free account is 0, a pension blending its tax-free portion with income tax might be around 15, and a taxable account its effective gains rate.'}
                </MonteCarloHelpTooltip>
              </View>
              {usesTaxBands ? (
                <MonteCarloNumberInput
                  value={pot.taxableFraction}
                  aria-label="Taxable portion (%)"
                  scale={100}
                  min={0}
                  max={100}
                  onCommit={newValue =>
                    onPotChange({ taxableFraction: newValue ?? 1 })
                  }
                />
              ) : (
                <MonteCarloNumberInput
                  value={pot.withdrawalTaxRate}
                  aria-label="Tax (%)"
                  scale={100}
                  min={0}
                  max={MAX_WITHDRAWAL_TAX_RATE * 100}
                  onCommit={newValue =>
                    onPotChange({ withdrawalTaxRate: newValue ?? 0 })
                  }
                />
              )}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={GROUP_HEADING_STYLE}>Fees</Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 20,
              }}
            >
              <View style={FIELD_STYLE}>
                <View style={FIELD_LABEL_ROW_STYLE}>
                  <Text style={FIELD_LABEL_STYLE}>Fixed yearly fee</Text>
                  <MonteCarloHelpTooltip>
                    The sum of all fixed yearly costs on this pot - e.g. adviser
                    or platform fees - charged at the end of each year.
                  </MonteCarloHelpTooltip>
                </View>
                <FinancialInput
                  value={pot.annualFeeFixed}
                  onUpdate={value => {
                    const newFee = Math.min(MAX_AMOUNT, Math.max(0, value));
                    if (newFee !== pot.annualFeeFixed) {
                      onPotChange({ annualFeeFixed: newFee });
                    }
                  }}
                />
              </View>

              <LabeledCheckbox
                id={`pot-fee-inflation-${pot.id}`}
                checked={pot.feeAdjustsWithInflation}
                onChange={event =>
                  onPotChange({
                    feeAdjustsWithInflation: event.target.checked,
                  })
                }
                style={{ flex: 'unset', paddingBottom: 6 }}
              >
                Adjust by inflation
              </LabeledCheckbox>

              <View style={FIELD_STYLE}>
                <View style={FIELD_LABEL_ROW_STYLE}>
                  <Text style={FIELD_LABEL_STYLE}>Fee (% of balance)</Text>
                  <MonteCarloHelpTooltip>
                    A yearly percentage of the pot&apos;s end-of-year balance -
                    e.g. fund or platform charges.
                  </MonteCarloHelpTooltip>
                </View>
                <MonteCarloNumberInput
                  value={pot.annualFeeRate}
                  aria-label="Fee (% of balance)"
                  scale={100}
                  min={0}
                  max={MAX_ANNUAL_FEE_RATE * 100}
                  step={0.01}
                  onCommit={newValue =>
                    onPotChange({ annualFeeRate: newValue ?? 0 })
                  }
                />
              </View>
            </View>
          </View>
        </View>
      )}
    </GridListItem>
  );
}
