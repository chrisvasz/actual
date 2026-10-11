import type {
  MonteCarloRuleExplanation,
  MonteCarloRunDetailRow,
  MonteCarloWithdrawalRuleConfig,
} from '#components/reports/reports/monte-carlo/monteCarloSimulation';

/**
 * Enough precision that multiplying the displayed rate by the balance
 * reproduces the displayed amounts; trailing zeros trimmed so simple
 * rates still read cleanly (4% rather than 4.0000%)
 */
export function formatRuleRate(rate: number) {
  return `${Number((rate * 100).toFixed(4))}%`;
}

type MonteCarloYearStoryInput = {
  row: MonteCarloRunDetailRow;
  withdrawalRule: MonteCarloWithdrawalRuleConfig;
  /** How the surplus pot is labelled in the UI */
  surplusPotName: string;
  hasSurplusPot: boolean;
  format: (amount: number, type: 'financial') => string;
};

/**
 * The plain-English summary of one simulated year, as a few sentences
 * that follow cause to effect: what the withdrawal rule decided and why,
 * whether the minimum spending floor stepped in, how the year's spending was
 * funded, and where any money the plan didn't spend ended up. The
 * numbers behind each decision live in the detailed lines, not here
 */
export function buildMonteCarloYearStory({
  row,
  withdrawalRule,
  surplusPotName,
  hasSurplusPot,
  format,
}: MonteCarloYearStoryInput): string[] {
  const sentences: string[] = [];

  const ruleSentence =
    row.ruleExplanation != null
      ? getRuleDecisionSentence(row.ruleExplanation, withdrawalRule, format)
      : null;
  if (ruleSentence != null) {
    sentences.push(ruleSentence);
  }

  if (row.minimumApplied) {
    const planned = format(row.plannedSpending, 'financial');
    sentences.push(
      ruleSentence != null
        ? `The minimum spending floor then lifted it to ${planned}.`
        : `The minimum spending floor set this year's spending at ${planned}.`,
    );
  }

  sentences.push(...getFundingSentences(row, format));

  const surplusSentence = getSurplusSentence(
    row,
    surplusPotName,
    hasSurplusPot,
    format,
  );
  if (surplusSentence != null) {
    sentences.push(surplusSentence);
  }

  return sentences;
}

function getRuleName(rule: 'guardrails' | 'ratcheting' | 'boundaries') {
  if (rule === 'guardrails') {
    return 'Guardrails';
  }
  if (rule === 'ratcheting') {
    return 'Ratcheting';
  }
  return 'Boundaries';
}

// What the rule decided, with the reason in words; null when the rule
// did nothing worth telling
function getRuleDecisionSentence(
  explanation: MonteCarloRuleExplanation,
  withdrawalRule: MonteCarloWithdrawalRuleConfig,
  format: MonteCarloYearStoryInput['format'],
): string | null {
  if (explanation.kind === 'anchor') {
    return "This is the first spending year, so the plan's withdrawal rate was set here.";
  }
  if (explanation.kind === 'floor-ceiling') {
    const values = {
      amount: format(
        explanation.applied === 'floor'
          ? explanation.floor
          : explanation.ceiling,
        'financial',
      ),
      unclamped: format(explanation.unclamped, 'financial'),
    };
    if (explanation.applied === 'floor') {
      return `Floor & ceiling held spending at ${values.amount} - the rate-based amount (${values.unclamped}) fell below the floor.`;
    }
    if (explanation.applied === 'ceiling') {
      return `Floor & ceiling held spending at ${values.amount} - the rate-based amount (${values.unclamped}) rose above the ceiling.`;
    }
    return null;
  }

  const rule = getRuleName(explanation.rule);
  const planned = format(explanation.planned, 'financial');
  const adjusted = format(explanation.adjusted, 'financial');
  if (explanation.action === 'cut') {
    if (explanation.rule === 'boundaries') {
      return `${rule} cut this year's spending from ${planned} to ${adjusted} because the withdrawal rate rose above ${formatRuleRate(withdrawalRule.upperRateThreshold)}.`;
    }
    return `${rule} cut this year's spending from ${planned} to ${adjusted} because the withdrawal rate had climbed too far above the plan.`;
  }
  if (explanation.action === 'raise') {
    if (explanation.rule === 'boundaries') {
      return `${rule} raised this year's spending from ${planned} to ${adjusted} because the withdrawal rate fell below ${formatRuleRate(withdrawalRule.lowerRateThreshold)}.`;
    }
    if (explanation.rule === 'ratcheting') {
      return `${rule} raised this year's spending from ${planned} to ${adjusted} because the balance had stayed above ${`${Number(withdrawalRule.balanceThresholdMultiple.toFixed(2))}×`} its starting level for ${withdrawalRule.consecutiveYears} years.`;
    }
    return `${rule} raised this year's spending from ${planned} to ${adjusted} because the withdrawal rate had fallen well below the plan.`;
  }
  if (explanation.factor !== 1) {
    return `Earlier ${rule} changes still applied, so this year's spending was ${adjusted} instead of the ${planned} planned.`;
  }
  return null;
}

// How the year's spending was paid for, or that it couldn't be
function getFundingSentences(
  row: MonteCarloRunDetailRow,
  format: MonteCarloYearStoryInput['format'],
): string[] {
  const spent = format(row.spent, 'financial');
  if (row.spent < row.plannedSpending) {
    const sentences = [
      `Only ${spent} of the ${format(row.plannedSpending, 'financial')} planned could be funded - the plan ran out of accessible money here.`,
    ];
    if (row.inaccessibleBalance != null) {
      sentences.push(
        `${format(row.inaccessibleBalance, 'financial')} was still locked in pots that had not reached their access age.`,
      );
    }
    return sentences;
  }
  if (row.income > 0) {
    // What the pots put towards spending: the withdrawal net of tax
    const netFromPots = row.withdrawal - row.taxPaid;
    if (netFromPots <= 0) {
      return [
        `Income covered all of the ${spent} spent, so nothing had to come from the pots.`,
      ];
    }
    const fromIncome = row.spent - netFromPots;
    // Net income that neither went to spending nor was left over was
    // paid into pots by contributions sourced from the income
    const netIncome = row.income - row.incomeTax;
    const toContributions = netIncome - row.unspentIncome - fromIncome;
    if (fromIncome <= 0) {
      return [
        `The ${format(netIncome, 'financial')} income all went into contributions, so the ${spent} spent came from the pots.`,
      ];
    }
    if (toContributions > 0) {
      return [
        `Income covered ${format(fromIncome, 'financial')} of the ${spent} spent, with another ${format(toContributions, 'financial')} of it going into contributions; withdrawals covered the rest.`,
      ];
    }
    return [
      `Income covered ${format(fromIncome, 'financial')} of the ${spent} spent; withdrawals covered the rest.`,
    ];
  }
  return [`Spent ${spent} as planned, funded from the pots.`];
}

// Where money the plan didn't spend ended up; null when there was none
function getSurplusSentence(
  row: MonteCarloRunDetailRow,
  surplusPotName: string,
  hasSurplusPot: boolean,
  format: MonteCarloYearStoryInput['format'],
): string | null {
  if (hasSurplusPot && row.surplusSaved > 0) {
    return `${format(row.surplusSaved, 'financial')} of income beyond the plan was saved into ${surplusPotName}.`;
  }
  if (row.unspentIncome > 0) {
    return `${format(row.unspentIncome, 'financial')} of income beyond the plan went unspent and left the plan.`;
  }
  return null;
}
