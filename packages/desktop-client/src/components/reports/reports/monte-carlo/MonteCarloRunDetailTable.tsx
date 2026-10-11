import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronDown,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FinancialText } from '#components/FinancialText';
import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import {
  getMonteCarloPotLabel,
  getMonteCarloSurplusPotLabel,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import type {
  MonteCarloIncomeStream,
  MonteCarloPot,
  MonteCarloRuleExplanation,
  MonteCarloRunDetailRow,
  MonteCarloWithdrawalRuleConfig,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';
import { GROUP_HEADING_STYLE } from '#components/reports/reports/monte-carlo/monteCarloStyles';
import {
  buildMonteCarloYearStory,
  formatRuleRate,
} from '#components/reports/reports/monte-carlo/monteCarloYearStory';
import { useFormat } from '#hooks/useFormat';

// The minWidth keeps amounts readable on narrow screens - the table
// scrolls sideways instead of letting columns collapse into each other
const AMOUNT_CELL_STYLE = {
  flex: 1,
  minWidth: 110,
  textAlign: 'right',
} as const;

// Pot mini-table cells must not shrink, so on narrow screens the panel
// pushes the shared scroll container wider instead of clipping columns
const POT_CELL_STYLE = {
  flexShrink: 0,
  textAlign: 'right',
} as const;

type MonteCarloRunDetailTableProps = {
  rows: MonteCarloRunDetailRow[];
  pots: MonteCarloPot[];
  simulationIndex: number;
  simulationCount: number;
  startAge: number;
  /** Show the Contributions columns (the plan has contributions set up) */
  hasContributions: boolean;
  /** The plan's income streams; the Income column shows when there are any */
  incomeStreams: MonteCarloIncomeStream[];
  /** The configured rule, quoted in the per-year explanations */
  withdrawalRule: MonteCarloWithdrawalRuleConfig;
  /** Rendered between the header row and the table - the cashflow chart */
  cashflowGraph?: ReactNode;
  onBack: () => void;
};

export function MonteCarloRunDetailTable({
  rows,
  pots,
  simulationIndex,
  simulationCount,
  startAge,
  hasContributions,
  incomeStreams,
  withdrawalRule,
  cashflowGraph,
  onBack,
}: MonteCarloRunDetailTableProps) {
  const format = useFormat();
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  // Years whose detailed working is shown under the summary
  const [workingYears, setWorkingYears] = useState<Set<number>>(new Set());

  const hasIncome = incomeStreams.length > 0;
  const surplusPotName = getMonteCarloSurplusPotLabel(pots);
  const hasSurplusPot = pots.some(pot => pot.isSurplus);
  const lastRow = rows[rows.length - 1];
  const hasSurvived = lastRow != null && lastRow.endBalance > 0;
  // Present whenever the plan has inflation enabled
  const showInflation = rows.some(row => row.inflation != null);
  const allExpanded = rows.length > 0 && expandedYears.size === rows.length;

  function toggleInSet(previous: Set<number>, year: number) {
    const next = new Set(previous);
    if (next.has(year)) {
      next.delete(year);
    } else {
      next.add(year);
    }
    return next;
  }

  function toggleYear(year: number) {
    if (expandedYears.has(year)) {
      // Collapsing a year hides its working too, so reopening it starts
      // from the summary again
      setWorkingYears(previous => {
        const next = new Set(previous);
        next.delete(year);
        return next;
      });
    }
    setExpandedYears(previous => toggleInSet(previous, year));
  }

  function toggleWorking(year: number) {
    setWorkingYears(previous => toggleInSet(previous, year));
  }

  // Run-level cost of the plan: what left the pots, and how much of it
  // went to tax and fees rather than spending
  let totalWithdrawn = 0;
  let totalTax = 0;
  let totalFees = 0;
  let totalIncome = 0;
  let totalIncomeTax = 0;
  for (const row of rows) {
    totalWithdrawn += row.withdrawal;
    totalTax += row.taxPaid;
    totalFees += row.feesPaid;
    totalIncome += row.income;
    totalIncomeTax += row.incomeTax;
  }

  function getIncomeTotalsSentence() {
    const total = format(totalIncome, 'financial');
    const tax = format(totalIncomeTax, 'financial');
    if (totalIncomeTax > 0) {
      return `Income received over this run: ${total}, of which ${tax} tax.`;
    }
    return `Income received over this run: ${total}.`;
  }

  // How the year's actual spending compares with the plan: on target or a
  // shortfall (the pots couldn't cover it)
  function getSpentSentence(row: MonteCarloRunDetailRow) {
    const spent = format(row.spent, 'financial');
    const planned = format(row.plannedSpending, 'financial');
    if (row.spent < row.plannedSpending) {
      return `Spent: ${spent} of the ${planned} planned - ${format(row.plannedSpending - row.spent, 'financial')} short.`;
    }
    if (row.spent > row.plannedSpending) {
      return `Spent: ${spent} - ${format(row.spent - row.plannedSpending, 'financial')} more than the ${planned} planned.`;
    }
    return `Spent: ${spent}, as planned.`;
  }

  function getSavedSentence(row: MonteCarloRunDetailRow) {
    return `Saved into ${surplusPotName}: ${format(row.surplusSaved, 'financial')} - income beyond what the plan spends.`;
  }

  // "State pension: 12,000.00" - the per-stream lines under a year's
  // income sentence when more than one stream is configured
  function getIncomeStreamLine(incomeIndex: number, amount: number) {
    const incomeStream = incomeStreams[incomeIndex];
    return `${
      incomeStream.name || `Income ${incomeIndex + 1}`
    }: ${format(amount, 'financial')}`;
  }

  // Four sentence variants so each language can phrase the combinations
  // naturally
  function getTotalsSentence() {
    const total = format(totalWithdrawn, 'financial');
    const tax = format(totalTax, 'financial');
    const fees = format(totalFees, 'financial');
    if (totalTax > 0 && totalFees > 0) {
      return `Total withdrawn over this run: ${total}, of which ${tax} tax, plus ${fees} paid in fees.`;
    }
    if (totalTax > 0) {
      return `Total withdrawn over this run: ${total}, of which ${tax} tax.`;
    }
    if (totalFees > 0) {
      return `Total withdrawn over this run: ${total}, plus ${fees} paid in fees.`;
    }
    return `Total withdrawn over this run: ${total}.`;
  }

  // One sentence per rule outcome, phrased with the numbers the user
  // configured so each year's working reads like the setup sentence
  function getRuleExplanationSentence(explanation: MonteCarloRuleExplanation) {
    if (explanation.kind === 'anchor') {
      return `Floor & ceiling: the first spending year takes the planned amount and sets the rule's rate at ${formatRuleRate(explanation.rate)} of the accessible balance; future years stay within ${formatRuleRate(withdrawalRule.floorPct)} below and ${formatRuleRate(withdrawalRule.ceilingPct)} above the planned amount.`;
    }
    if (explanation.kind === 'floor-ceiling') {
      const values = {
        rate: formatRuleRate(explanation.rate),
        amount: format(explanation.unclamped, 'financial'),
        floor: format(explanation.floor, 'financial'),
        ceiling: format(explanation.ceiling, 'financial'),
        floorPct: formatRuleRate(withdrawalRule.floorPct),
        ceilingPct: formatRuleRate(withdrawalRule.ceilingPct),
      };
      if (explanation.applied === 'floor') {
        return `Floor & ceiling: ${values.rate} of the accessible balance = ${values.amount}, below the floor (${values.floorPct} under the planned amount: ${values.floor}) - the floor applied.`;
      }
      if (explanation.applied === 'ceiling') {
        return `Floor & ceiling: ${values.rate} of the accessible balance = ${values.amount}, above the ceiling (${values.ceilingPct} over the planned amount: ${values.ceiling}) - the ceiling applied.`;
      }
      return `Floor & ceiling: ${values.rate} of the accessible balance = ${values.amount}, within ${values.floorPct} below (${values.floor}) and ${values.ceilingPct} above (${values.ceiling}) the planned amount.`;
    }
    // Concrete money beats abstractions: every outcome shows the rule's
    // result next to the planned amount (any minimum floor is reported
    // by its own line)
    const planned = format(explanation.planned, 'financial');
    const adjusted = format(explanation.adjusted, 'financial');
    const hasEarlierAdjustments = explanation.factor !== 1;
    if (explanation.rule === 'guardrails') {
      const values = {
        currentRate: formatRuleRate(explanation.currentRate ?? 0),
        referenceRate: formatRuleRate(explanation.referenceRate ?? 0),
        trigger: formatRuleRate(withdrawalRule.preservationTriggerPct),
        prosperityTrigger: formatRuleRate(withdrawalRule.prosperityTriggerPct),
        cut: formatRuleRate(withdrawalRule.preservationCutPct),
        raise: formatRuleRate(withdrawalRule.prosperityIncreasePct),
        planned,
        adjusted,
      };
      if (explanation.action === 'cut') {
        return `Guardrails: the withdrawal rate (${values.currentRate}) rose more than ${values.trigger} above the planned rate (${values.referenceRate}), so withdrawals were cut by ${values.cut}: ${values.adjusted} instead of the planned ${values.planned}.`;
      }
      if (explanation.action === 'raise') {
        return `Guardrails: the withdrawal rate (${values.currentRate}) fell more than ${values.prosperityTrigger} below the planned rate (${values.referenceRate}), so withdrawals were raised by ${values.raise}: ${values.adjusted} instead of the planned ${values.planned}.`;
      }
      if (hasEarlierAdjustments) {
        return `Guardrails: the withdrawal rate (${values.currentRate}) stayed close to the planned rate (${values.referenceRate}) - no new change, but earlier adjustments still apply: ${values.adjusted} instead of the planned ${values.planned}.`;
      }
      return `Guardrails: the withdrawal rate (${values.currentRate}) stayed close to the planned rate (${values.referenceRate}) - no change, taking the planned ${values.planned}.`;
    }
    if (explanation.rule === 'ratcheting') {
      const values = {
        multiple: `${Number(withdrawalRule.balanceThresholdMultiple.toFixed(2))}×`,
        years: withdrawalRule.consecutiveYears,
        raise: formatRuleRate(withdrawalRule.ratchetIncreasePct),
        streak: explanation.ratchetStreak ?? 0,
        planned,
        adjusted,
      };
      if (explanation.action === 'raise') {
        return `Ratcheting: the accessible balance stayed above ${values.multiple} its starting level for ${values.years} years in a row, so withdrawals were raised by ${values.raise}: ${values.adjusted} instead of the planned ${values.planned}.`;
      }
      if (explanation.ratchetStreak != null && explanation.ratchetStreak > 0) {
        return hasEarlierAdjustments
          ? `Ratcheting: balance above ${values.multiple} its starting level for ${values.streak} of ${values.years} years - no raise yet, but earlier raises still apply: ${values.adjusted} instead of the planned ${values.planned}.`
          : `Ratcheting: balance above ${values.multiple} its starting level for ${values.streak} of ${values.years} years - no raise yet, taking the planned ${values.planned}.`;
      }
      return hasEarlierAdjustments
        ? `Ratcheting: balance below ${values.multiple} its starting level - the streak reset, but earlier raises still apply: ${values.adjusted} instead of the planned ${values.planned}.`
        : `Ratcheting: balance below ${values.multiple} its starting level - the streak reset, taking the planned ${values.planned}.`;
    }
    const boundaryValues = {
      currentRate: formatRuleRate(explanation.currentRate ?? 0),
      upper: formatRuleRate(withdrawalRule.upperRateThreshold),
      lower: formatRuleRate(withdrawalRule.lowerRateThreshold),
      cut: formatRuleRate(withdrawalRule.upperCutPct),
      raise: formatRuleRate(withdrawalRule.lowerIncreasePct),
      planned,
      adjusted,
    };
    if (explanation.action === 'cut') {
      return `Boundaries: the withdrawal rate (${boundaryValues.currentRate}) rose above ${boundaryValues.upper}, so withdrawals were cut by ${boundaryValues.cut}: ${boundaryValues.adjusted} instead of the planned ${boundaryValues.planned}.`;
    }
    if (explanation.action === 'raise') {
      return `Boundaries: the withdrawal rate (${boundaryValues.currentRate}) fell below ${boundaryValues.lower}, so withdrawals were raised by ${boundaryValues.raise}: ${boundaryValues.adjusted} instead of the planned ${boundaryValues.planned}.`;
    }
    if (hasEarlierAdjustments) {
      return `Boundaries: the withdrawal rate (${boundaryValues.currentRate}) stayed between ${boundaryValues.lower} and ${boundaryValues.upper} - no new change, but earlier adjustments still apply: ${boundaryValues.adjusted} instead of the planned ${boundaryValues.planned}.`;
    }
    return `Boundaries: the withdrawal rate (${boundaryValues.currentRate}) stayed between ${boundaryValues.lower} and ${boundaryValues.upper} - no change, taking the planned ${boundaryValues.planned}.`;
  }

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 15,
          marginBottom: 10,
        }}
      >
        <Button onPress={onBack}>Back to all runs</Button>
        <Text style={{ fontWeight: 600 }}>
          {hasSurvived
            ? `Run ${simulationIndex + 1} of ${simulationCount} - survived to age ${lastRow ? startAge + lastRow.year : startAge}`
            : `Run ${simulationIndex + 1} of ${simulationCount} - ran out at age ${lastRow ? startAge + lastRow.year - 1 : startAge}`}
        </Text>
        <Button
          variant="bare"
          onPress={() => {
            setExpandedYears(
              allExpanded ? new Set() : new Set(rows.map(row => row.year)),
            );
            if (allExpanded) {
              setWorkingYears(new Set());
            }
          }}
          style={{ marginLeft: 'auto', color: theme.pageText }}
        >
          {allExpanded ? 'Collapse all years' : 'Expand all years'}
        </Button>
      </View>

      {cashflowGraph}

      <Text style={{ fontSize: 13, color: theme.pageText, marginBottom: 10 }}>
        <FinancialText as="span">{getTotalsSentence()}</FinancialText>
        {totalIncome > 0 && (
          <>
            {' '}
            <FinancialText as="span">{getIncomeTotalsSentence()}</FinancialText>
          </>
        )}
      </Text>

      <View style={{ ...styles.horizontalScrollbar, overflowX: 'auto' }}>
        <View style={{ minWidth: 'fit-content' }}>
          {/* Header row */}
          <View
            style={{
              flexDirection: 'row',
              paddingBottom: 8,
              borderBottom: `1px solid ${theme.tableBorder}`,
              gap: 10,
            }}
          >
            <View style={{ width: 36 }} />
            <Text style={{ ...GROUP_HEADING_STYLE, width: 60 }}>Age</Text>
            <Text style={{ ...GROUP_HEADING_STYLE, ...AMOUNT_CELL_STYLE }}>
              Starting balance
            </Text>
            {hasContributions && (
              <Text style={{ ...GROUP_HEADING_STYLE, ...AMOUNT_CELL_STYLE }}>
                Contributions
              </Text>
            )}
            {hasIncome && (
              <Text style={{ ...GROUP_HEADING_STYLE, ...AMOUNT_CELL_STYLE }}>
                Income (net)
              </Text>
            )}
            <Text style={{ ...GROUP_HEADING_STYLE, ...AMOUNT_CELL_STYLE }}>
              Withdrawal
            </Text>
            <Text style={{ ...GROUP_HEADING_STYLE, ...AMOUNT_CELL_STYLE }}>
              Spent
            </Text>
            <Text style={{ ...GROUP_HEADING_STYLE, ...AMOUNT_CELL_STYLE }}>
              Investment growth
            </Text>
            <Text
              style={{ ...GROUP_HEADING_STYLE, width: 90, textAlign: 'right' }}
            >
              Return (%)
            </Text>
            {showInflation && (
              <Text
                style={{
                  ...GROUP_HEADING_STYLE,
                  width: 110,
                  textAlign: 'right',
                }}
              >
                Inflation (%)
              </Text>
            )}
            <Text style={{ ...GROUP_HEADING_STYLE, ...AMOUNT_CELL_STYLE }}>
              Ending balance
            </Text>
          </View>

          {rows.map(row => {
            const isFailureRow = row === lastRow && !hasSurvived;
            const isExpanded = expandedYears.has(row.year);
            const showsWorking = workingYears.has(row.year);
            // Growth applies to what stayed invested after contributions
            // came in and the withdrawal went out; no growth on a failure
            // year (the plan stops there)
            const growthBase =
              row.startBalance +
              row.contributions +
              row.surplusSaved -
              row.withdrawal;
            const growthPct =
              !isFailureRow && growthBase > 0
                ? (row.growth / growthBase) * 100
                : null;
            const netSpending = row.withdrawal - row.taxPaid;
            return (
              <Fragment key={row.year}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: `1px solid ${theme.tableBorder}`,
                    gap: 10,
                  }}
                >
                  <View style={{ width: 36, alignItems: 'center' }}>
                    <Button
                      variant="bare"
                      aria-label={
                        isExpanded
                          ? "Hide this year's breakdown"
                          : "Show this year's breakdown"
                      }
                      onPress={() => toggleYear(row.year)}
                      style={{ padding: 4 }}
                    >
                      {isExpanded ? (
                        <SvgCheveronDown width={14} height={14} />
                      ) : (
                        <SvgCheveronRight width={14} height={14} />
                      )}
                    </Button>
                  </View>
                  <Text style={{ width: 60 }}>
                    <FinancialText as="span">
                      {String(startAge + row.year - 1)}
                    </FinancialText>
                  </Text>
                  <Text style={AMOUNT_CELL_STYLE}>
                    <FinancialText as="span">
                      {format(row.startBalance, 'financial')}
                    </FinancialText>
                  </Text>
                  {hasContributions && (
                    <Text style={AMOUNT_CELL_STYLE}>
                      <FinancialText as="span">
                        {format(
                          row.contributions + row.surplusSaved,
                          'financial',
                        )}
                      </FinancialText>
                    </Text>
                  )}
                  {hasIncome && (
                    <Text style={AMOUNT_CELL_STYLE}>
                      <FinancialText as="span">
                        {format(row.income - row.incomeTax, 'financial')}
                      </FinancialText>
                    </Text>
                  )}
                  <Text style={AMOUNT_CELL_STYLE}>
                    <FinancialText as="span">
                      {format(row.withdrawal, 'financial')}
                    </FinancialText>
                  </Text>
                  <Text
                    style={{
                      ...AMOUNT_CELL_STYLE,
                      // A year that couldn't be fully paid for stands out
                      ...(row.spent < row.plannedSpending && {
                        color: theme.reportsNumberNegative,
                      }),
                    }}
                  >
                    <FinancialText as="span">
                      {format(row.spent, 'financial')}
                    </FinancialText>
                  </Text>
                  <Text
                    style={{
                      ...AMOUNT_CELL_STYLE,
                      // A year that couldn't be fully paid for stands out
                      ...(row.spent < row.plannedSpending && {
                        color: theme.reportsNumberNegative,
                      }),
                    }}
                  >
                    <FinancialText as="span">
                      {format(row.spent, 'financial')}
                    </FinancialText>
                  </Text>
                  <Text
                    style={{
                      ...AMOUNT_CELL_STYLE,
                      color:
                        row.growth >= 0
                          ? theme.reportsNumberPositive
                          : theme.reportsNumberNegative,
                    }}
                  >
                    {!isFailureRow && (
                      <FinancialText as="span">
                        {format(row.growth, 'financial')}
                      </FinancialText>
                    )}
                  </Text>
                  <Text
                    style={{
                      width: 90,
                      textAlign: 'right',
                      color:
                        row.growth >= 0
                          ? theme.reportsNumberPositive
                          : theme.reportsNumberNegative,
                    }}
                  >
                    {growthPct != null && (
                      <FinancialText as="span">{`${growthPct.toFixed(2)}%`}</FinancialText>
                    )}
                  </Text>
                  {showInflation && (
                    // Deliberately neutral: coloring deflation "good" or
                    // inflation "bad" would oversimplify
                    <Text style={{ width: 110, textAlign: 'right' }}>
                      {row.inflation != null && (
                        <FinancialText as="span">
                          {`${(row.inflation * 100).toFixed(2)}%`}
                        </FinancialText>
                      )}
                    </Text>
                  )}
                  <Text style={AMOUNT_CELL_STYLE}>
                    <FinancialText as="span">
                      {/* On a bridge-gap failure the true remaining balance
                        is the locked money, not zero */}
                      {format(
                        row.inaccessibleBalance ?? row.endBalance,
                        'financial',
                      )}
                    </FinancialText>
                  </Text>
                </View>

                {isExpanded && (
                  <View
                    style={{
                      borderBottom: `1px solid ${theme.tableBorder}`,
                      padding: '10px 12px 12px 46px',
                      gap: 4,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: theme.pageText }}>
                      <FinancialText as="span">
                        {buildMonteCarloYearStory({
                          row,
                          withdrawalRule,
                          surplusPotName,
                          hasSurplusPot,
                          format,
                        }).join(' ')}
                      </FinancialText>
                    </Text>
                    <Button
                      variant="bare"
                      onPress={() => toggleWorking(row.year)}
                      style={{
                        alignSelf: 'flex-start',
                        padding: 0,
                        color: theme.pageTextLight,
                        textDecoration: 'underline',
                      }}
                    >
                      {showsWorking ? 'Hide the working' : 'Show the working'}
                    </Button>
                    {showsWorking && (
                      <View style={{ gap: 4, marginTop: 6 }}>
                        {row.ruleExplanation != null && (
                          <Text style={{ fontSize: 13, color: theme.pageText }}>
                            <FinancialText as="span">
                              {getRuleExplanationSentence(row.ruleExplanation)}
                            </FinancialText>
                          </Text>
                        )}
                        {row.minimumApplied && (
                          <Text style={{ fontSize: 13, color: theme.pageText }}>
                            <FinancialText as="span">
                              {`Raised to the minimum spending: ${format(
                                row.plannedSpending,
                                'financial',
                              )}.`}
                            </FinancialText>
                          </Text>
                        )}
                        {row.income > 0 && (
                          <Text style={{ fontSize: 13, color: theme.pageText }}>
                            <FinancialText as="span">
                              {row.incomeTax > 0
                                ? `Income: ${format(row.income, 'financial')} gross − ${format(row.incomeTax, 'financial')} tax = ${format(
                                    row.income - row.incomeTax,
                                    'financial',
                                  )} received.`
                                : `Income: ${format(row.income, 'financial')}, untaxed.`}
                              {incomeStreams.length > 1 &&
                                ` (${row.incomeAmounts
                                  .map((amount, incomeIndex) =>
                                    amount > 0
                                      ? getIncomeStreamLine(incomeIndex, amount)
                                      : null,
                                  )
                                  .filter(line => line != null)
                                  .join('; ')})`}
                            </FinancialText>
                          </Text>
                        )}
                        <Text style={{ fontSize: 13, color: theme.pageText }}>
                          <FinancialText as="span">
                            {row.taxPaid > 0
                              ? `Withdrawal: ${format(row.withdrawal, 'financial')} gross − ${format(row.taxPaid, 'financial')} tax = ${format(netSpending, 'financial')} to spend.`
                              : `Withdrawal: ${format(row.withdrawal, 'financial')}, untaxed.`}
                          </FinancialText>
                        </Text>
                        <Text style={{ fontSize: 13, color: theme.pageText }}>
                          <FinancialText as="span">
                            {getSpentSentence(row)}
                          </FinancialText>
                        </Text>
                        {row.surplusSaved > 0 && (
                          <Text style={{ fontSize: 13, color: theme.pageText }}>
                            <FinancialText as="span">
                              {getSavedSentence(row)}
                            </FinancialText>
                          </Text>
                        )}
                        {row.unspentIncome > 0 && row.surplusSaved === 0 && (
                          <Text style={{ fontSize: 13, color: theme.pageText }}>
                            <FinancialText as="span">
                              {`Unspent income: ${format(
                                row.unspentIncome,
                                'financial',
                              )} - more came in than the plan spends, and it leaves the plan.`}
                            </FinancialText>
                          </Text>
                        )}
                        {row.contributions > 0 && (
                          <Text style={{ fontSize: 13, color: theme.pageText }}>
                            <FinancialText as="span">
                              {`Contributions: ${format(
                                row.contributions,
                                'financial',
                              )}, added at the start of the year.`}
                            </FinancialText>
                          </Text>
                        )}
                        {row.feesPaid > 0 && (
                          <Text style={{ fontSize: 13, color: theme.pageText }}>
                            <FinancialText as="span">
                              {`Fees paid: ${format(row.feesPaid, 'financial')}, charged at the end of the year.`}
                            </FinancialText>
                          </Text>
                        )}
                        {row.inaccessibleBalance != null && (
                          <Text style={{ fontSize: 13, color: theme.pageText }}>
                            <FinancialText as="span">
                              {`${format(
                                row.inaccessibleBalance,
                                'financial',
                              )} remained locked in pots that had not reached their access age.`}
                            </FinancialText>
                          </Text>
                        )}
                      </View>
                    )}

                    {pots.length > 0 && (
                      <View
                        style={{
                          marginTop: 14,
                          maxWidth: hasContributions ? 1150 : 1010,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            gap: 10,
                            paddingBottom: 4,
                            borderBottom: `1px solid ${theme.tableBorder}`,
                          }}
                        >
                          <Text
                            style={{
                              ...GROUP_HEADING_STYLE,
                              flex: 1,
                              minWidth: 120,
                            }}
                          >
                            Pot
                          </Text>
                          <Text
                            style={{
                              ...GROUP_HEADING_STYLE,
                              ...POT_CELL_STYLE,
                              width: 130,
                            }}
                          >
                            Start balance
                          </Text>
                          {hasContributions && (
                            <View
                              style={{
                                width: 130,
                                flexShrink: 0,
                                flexDirection: 'row',
                                justifyContent: 'flex-end',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Text style={GROUP_HEADING_STYLE}>
                                Contributed
                              </Text>
                              {hasSurplusPot && (
                                <MonteCarloHelpTooltip placement="bottom end">
                                  For the {surplusPotName} pot this is the money
                                  the plan didn&apos;t spend that year, saved
                                  into it before growth.
                                </MonteCarloHelpTooltip>
                              )}
                            </View>
                          )}
                          <Text
                            style={{
                              ...GROUP_HEADING_STYLE,
                              ...POT_CELL_STYLE,
                              width: 130,
                            }}
                          >
                            Withdrawn
                          </Text>
                          <Text
                            style={{
                              ...GROUP_HEADING_STYLE,
                              ...POT_CELL_STYLE,
                              width: 110,
                            }}
                          >
                            Taxable
                          </Text>
                          <View
                            style={{
                              width: 110,
                              flexShrink: 0,
                              flexDirection: 'row',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Text style={GROUP_HEADING_STYLE}>Tax paid</Text>
                            <MonteCarloHelpTooltip placement="bottom end">
                              With tax bands, the year&apos;s tax is worked out
                              on all pots&apos; taxable income together, then
                              shared here in proportion to each pot&apos;s
                              taxable income - so every taxable pound bears the
                              year&apos;s average rate, even from a small pot.
                              With a flat rate per pot, each pot&apos;s tax is
                              exact.
                            </MonteCarloHelpTooltip>
                          </View>
                          <View
                            style={{
                              width: 110,
                              flexShrink: 0,
                              flexDirection: 'row',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Text style={GROUP_HEADING_STYLE}>Fees</Text>
                            <MonteCarloHelpTooltip placement="bottom end">
                              Charged at the end of the year, on the pot&apos;s
                              balance after that year&apos;s growth but before
                              the fee itself is deducted - so the end balance is
                              the post-growth balance minus this fee.
                            </MonteCarloHelpTooltip>
                          </View>
                          <Text
                            style={{
                              ...GROUP_HEADING_STYLE,
                              ...POT_CELL_STYLE,
                              width: 90,
                            }}
                          >
                            Return (%)
                          </Text>
                          <Text
                            style={{
                              ...GROUP_HEADING_STYLE,
                              ...POT_CELL_STYLE,
                              width: 130,
                            }}
                          >
                            End balance
                          </Text>
                        </View>
                        {pots.map((pot, potIndex) => {
                          const potReturn = row.potReturns[potIndex];
                          return (
                            <View
                              key={pot.id}
                              style={{
                                flexDirection: 'row',
                                gap: 10,
                                padding: '3px 0',
                              }}
                            >
                              <Text style={{ flex: 1, minWidth: 120 }}>
                                {getMonteCarloPotLabel(pots, potIndex)}
                              </Text>
                              <Text style={{ ...POT_CELL_STYLE, width: 130 }}>
                                <FinancialText as="span">
                                  {format(
                                    row.potStartBalances[potIndex] ?? 0,
                                    'financial',
                                  )}
                                </FinancialText>
                              </Text>
                              {hasContributions && (
                                <Text style={{ ...POT_CELL_STYLE, width: 130 }}>
                                  <FinancialText as="span">
                                    {format(
                                      (row.potContributions[potIndex] ?? 0) +
                                        (pot.isSurplus ? row.surplusSaved : 0),
                                      'financial',
                                    )}
                                  </FinancialText>
                                </Text>
                              )}
                              <Text style={{ ...POT_CELL_STYLE, width: 130 }}>
                                <FinancialText as="span">
                                  {format(
                                    row.potWithdrawals[potIndex] ?? 0,
                                    'financial',
                                  )}
                                </FinancialText>
                              </Text>
                              <Text style={{ ...POT_CELL_STYLE, width: 110 }}>
                                <FinancialText as="span">
                                  {format(
                                    row.potTaxables[potIndex] ?? 0,
                                    'financial',
                                  )}
                                </FinancialText>
                              </Text>
                              <Text style={{ ...POT_CELL_STYLE, width: 110 }}>
                                <FinancialText as="span">
                                  {format(
                                    row.potTaxes[potIndex] ?? 0,
                                    'financial',
                                  )}
                                </FinancialText>
                              </Text>
                              <Text style={{ ...POT_CELL_STYLE, width: 110 }}>
                                <FinancialText as="span">
                                  {format(
                                    row.potFees[potIndex] ?? 0,
                                    'financial',
                                  )}
                                </FinancialText>
                              </Text>
                              <Text
                                style={{
                                  ...POT_CELL_STYLE,
                                  width: 90,
                                  color:
                                    potReturn == null
                                      ? theme.pageText
                                      : potReturn >= 0
                                        ? theme.reportsNumberPositive
                                        : theme.reportsNumberNegative,
                                }}
                              >
                                {potReturn != null && (
                                  <FinancialText as="span">
                                    {`${(potReturn * 100).toFixed(2)}%`}
                                  </FinancialText>
                                )}
                              </Text>
                              <Text style={{ ...POT_CELL_STYLE, width: 130 }}>
                                <FinancialText as="span">
                                  {format(
                                    row.potBalances[potIndex] ?? 0,
                                    'financial',
                                  )}
                                </FinancialText>
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </Fragment>
            );
          })}
        </View>
      </View>

      {lastRow?.inaccessibleBalance != null && (
        <Text style={{ marginTop: 10, color: theme.pageText }}>
          {`The plan failed at age ${startAge + lastRow.year - 1} with ${format(lastRow.inaccessibleBalance, 'financial')} still locked in pots that had not reached their access age.`}
        </Text>
      )}
    </View>
  );
}
