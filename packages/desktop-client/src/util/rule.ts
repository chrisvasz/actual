// @ts-strict-ignore
import type { RuleEntity } from '@actual-app/core/types/models';
import { v4 as uuidv4 } from 'uuid';

export type ActionSplit = {
  id: string;
  actions: RuleEntity['actions'];
};

export function groupActionsBySplitIndex(
  actions: RuleEntity['actions'],
): ActionSplit[] {
  return actions.reduce((acc, action) => {
    const splitIndex =
      'options' in action ? (action.options?.splitIndex ?? 0) : 0;
    acc[splitIndex] = acc[splitIndex] ?? {
      id: uuidv4(),
      actions: [],
    };
    acc[splitIndex].actions.push(action);
    return acc;
  }, [] as ActionSplit[]);
}

export function getAllocationMethods(hasFormulaMode = false) {
  return {
    'fixed-amount': 'a fixed amount',
    'fixed-percent': 'a fixed percent of the remainder',
    ...(hasFormulaMode && { formula: 'based on a formula' }),
    remainder: 'an equal portion of the remainder',
  };
}

export function mapField(field, opts?) {
  opts = opts || {};

  switch (field) {
    case 'imported_payee':
      return 'imported payee';
    case 'payee_name':
      return 'payee (name)';
    case 'amount':
      if (opts.inflow) {
        return 'amount (inflow)';
      } else if (opts.outflow) {
        return 'amount (outflow)';
      }
      return 'amount';
    case 'amount-inflow':
      return 'amount (inflow)';
    case 'amount-outflow':
      return 'amount (outflow)';
    case 'account':
      return 'account';
    case 'date':
      return 'date';
    case 'category':
      return 'category';
    case 'category_group':
      return 'category group';
    case 'notes':
      return 'notes';
    case 'payee':
      return 'payee';
    case 'saved':
      return 'saved';
    case 'cleared':
      return 'cleared';
    case 'reconciled':
      return 'reconciled';
    case 'transfer':
      return 'transfer';
    default:
      return field;
  }
}

export function friendlyOp(op, type?) {
  switch (op) {
    case 'oneOf':
      return 'one of';
    case 'notOneOf':
      return 'not one of';
    case 'is':
      return 'is';
    case 'isNot':
      return 'is not';
    case 'isapprox':
      return 'is approx';
    case 'isbetween':
      return 'is between';
    case 'contains':
      return 'contains';
    case 'hasTags':
      return 'has all tags';
    case 'hasAnyTag':
      return 'has any tag';
    case 'matches':
      return 'matches';
    case 'doesNotContain':
      return 'does not contain';
    case 'gt':
      if (type === 'date') {
        return 'is after';
      }
      return 'is greater than';
    case 'gte':
      if (type === 'date') {
        return 'is after or equals';
      }
      return 'is greater than or equals';
    case 'lt':
      if (type === 'date') {
        return 'is before';
      }
      return 'is less than';
    case 'lte':
      if (type === 'date') {
        return 'is before or equals';
      }
      return 'is less than or equals';
    case 'true':
      return 'is true';
    case 'false':
      return 'is false';
    case 'set':
      return 'set';
    case 'set-split-amount':
      return 'allocate';
    case 'link-schedule':
      return 'link schedule';
    case 'prepend-notes':
      return 'prepend to notes';
    case 'append-notes':
      return 'append to notes';
    case 'and':
      return 'and';
    case 'or':
      return 'or';
    case 'onBudget':
      return 'is on budget';
    case 'offBudget':
      return 'is off budget';
    case 'delete-transaction':
      return 'delete transaction';
    default:
      return '';
  }
}

export function translateRuleStage(stage: string): string {
  switch (stage) {
    case 'pre':
      return 'Pre';
    case 'post':
      return 'Post';
    default:
      return '';
  }
}
