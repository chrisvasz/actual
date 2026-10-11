import * as monthUtils from '@actual-app/core/shared/months';
import type {
  CategoryEntity,
  CategoryGroupEntity,
  CustomReportEntity,
  sortByOpType,
} from '@actual-app/core/types/models';

const startDate = monthUtils.subMonths(monthUtils.currentMonth(), 5) + '-01';
const endDate = monthUtils.currentDay();

export const defaultReport: CustomReportEntity = {
  id: '',
  name: '',
  startDate,
  endDate,
  isDateStatic: false,
  dateRange: 'Last 6 months',
  mode: 'total',
  groupBy: 'Category',
  interval: 'Monthly',
  balanceType: 'Payment',
  sortBy: 'desc',
  showEmpty: false,
  showOffBudget: false,
  showHiddenCategories: true,
  includeCurrentInterval: true,
  showUncategorized: true,
  trimIntervals: false,
  showTrendLines: false,
  graphType: 'BarGraph',
  conditions: [],
  conditionsOp: 'and',
};

const balanceTypeOptions = [
  { description: 'Payment', key: 'Payment', format: 'totalDebts' as const },
  { description: 'Deposit', key: 'Deposit', format: 'totalAssets' as const },
  { description: 'Net', key: 'Net', format: 'totalTotals' as const },
  {
    description: 'Net Payment',
    key: 'Net Payment',
    format: 'netDebts' as const,
  },
  {
    description: 'Net Deposit',
    key: 'Net Deposit',
    format: 'netAssets' as const,
  },
  {
    description: 'Budgeted',
    key: 'Budgeted',
    format: 'totalBudgeted' as const,
  },
];

const groupByOptions = [
  { description: 'Category', key: 'Category' },
  { description: 'Group', key: 'Group' },
  { description: 'Category+Group', key: 'CategoryGroup' }, // new: two-ring donut support
  { description: 'Payee', key: 'Payee' },
  { description: 'Account', key: 'Account' },
  { description: 'Interval', key: 'Interval' },
];

const sortByOptions: {
  description: string;
  key: string;
  format: sortByOpType;
}[] = [
  { description: 'Ascending', key: 'Ascending', format: 'asc' as const },
  { description: 'Descending', key: 'Descending', format: 'desc' as const },
  { description: 'Name', key: 'Name', format: 'name' as const },
  { description: 'Budget', key: 'Budget', format: 'budget' as const },
];

export type dateRangeProps = {
  description: string;
  key: string;
  name: number | string;
  type?: string;
  Daily: boolean;
  Weekly: boolean;
  Monthly: boolean;
  Yearly: boolean;
};

const dateRangeOptions: dateRangeProps[] = [
  {
    description: 'This week',
    key: 'This week',
    name: 0,
    type: 'Week',
    Daily: true,
    Weekly: true,
    Monthly: false,
    Yearly: false,
  },
  {
    description: 'Last week',
    key: 'Last week',
    name: 1,
    type: 'Week',
    Daily: true,
    Weekly: true,
    Monthly: false,
    Yearly: false,
  },
  {
    description: 'This month',
    key: 'This month',
    name: 0,
    type: 'Month',
    Daily: true,
    Weekly: true,
    Monthly: true,
    Yearly: false,
  },
  {
    description: 'Last month',
    key: 'Last month',
    name: 1,
    type: 'Month',
    Daily: true,
    Weekly: true,
    Monthly: true,
    Yearly: false,
  },
  {
    description: 'Current quarter',
    key: 'Current quarter',
    name: 'currentQuarter',
    type: 'Month',
    Daily: true,
    Weekly: true,
    Monthly: true,
    Yearly: false,
  },
  {
    description: 'Previous quarter',
    key: 'Previous quarter',
    name: 'previousQuarter',
    type: 'Month',
    Daily: true,
    Weekly: true,
    Monthly: true,
    Yearly: false,
  },
  {
    description: 'Last 30 days',
    key: 'Last 30 days',
    name: 'last30Days',
    type: 'Day',
    Daily: true,
    Weekly: true,
    Monthly: true,
    Yearly: false,
  },
  {
    description: 'Last 3 months',
    key: 'Last 3 months',
    name: 3,
    type: 'Month',
    Daily: true,
    Weekly: true,
    Monthly: true,
    Yearly: false,
  },
  {
    description: 'Last 6 months',
    key: 'Last 6 months',
    name: 6,
    type: 'Month',
    Daily: false,
    Weekly: false,
    Monthly: true,
    Yearly: false,
  },
  {
    description: 'Last 12 months',
    key: 'Last 12 months',
    name: 12,
    type: 'Month',
    Daily: false,
    Weekly: false,
    Monthly: true,
    Yearly: false,
  },
  {
    description: 'Year to date',
    key: 'Year to date',
    name: 'yearToDate',
    type: 'Month',
    Daily: false,
    Weekly: true,
    Monthly: true,
    Yearly: true,
  },
  {
    description: 'Last year',
    key: 'Last year',
    name: 'lastYear',
    type: 'Month',
    Daily: false,
    Weekly: true,
    Monthly: true,
    Yearly: true,
  },
  {
    description: 'Prior year to date',
    key: 'Prior year to date',
    name: 'priorYearToDate',
    type: 'Month',
    Daily: false,
    Weekly: true,
    Monthly: true,
    Yearly: true,
  },
  {
    description: 'All time',
    key: 'All time',
    name: 'allTime',
    type: 'Month',
    Daily: false,
    Weekly: true,
    Monthly: true,
    Yearly: true,
  },
];

type intervalOptionsProps = {
  description: string;
  key: string;
  name: 'Day' | 'Week' | 'Month' | 'Year';
  format: string;
  range:
    | 'dayRangeInclusive'
    | 'weekRangeInclusive'
    | 'rangeInclusive'
    | 'yearRangeInclusive';
};

const intervalOptions: intervalOptionsProps[] = [
  {
    description: 'Daily',
    key: 'Daily',
    name: 'Day',
    format: 'yy-MM-dd',
    range: 'dayRangeInclusive',
  },
  {
    description: 'Weekly',
    key: 'Weekly',
    name: 'Week',
    format: 'yy-MM-dd',
    range: 'weekRangeInclusive',
  },
  {
    description: 'Monthly',
    key: 'Monthly',
    name: 'Month',
    format: "MMM ''yy",
    range: 'rangeInclusive',
  },
  {
    description: 'Yearly',
    key: 'Yearly',
    name: 'Year',
    format: 'yyyy',
    range: 'yearRangeInclusive',
  },
];

export const ReportOptions = {
  groupBy: groupByOptions,
  groupByItems: new Set(groupByOptions.map(item => item.key)),
  balanceType: balanceTypeOptions,
  balanceTypeMap: new Map(
    balanceTypeOptions.map(item => [item.key, item.format]),
  ),
  sortBy: sortByOptions,
  sortByMap: new Map(sortByOptions.map(item => [item.key, item.format])),
  dateRange: dateRangeOptions,
  dateRangeMap: new Map(dateRangeOptions.map(item => [item.key, item.name])),
  dateRangeType: new Map(dateRangeOptions.map(item => [item.key, item.type])),
  interval: intervalOptions,
  intervalMap: new Map<string, 'Day' | 'Week' | 'Month' | 'Year'>(
    intervalOptions.map(item => [item.key, item.name]),
  ),
  intervalFormat: new Map(intervalOptions.map(item => [item.key, item.format])),
  intervalRange: new Map<
    string,
    | 'dayRangeInclusive'
    | 'weekRangeInclusive'
    | 'rangeInclusive'
    | 'yearRangeInclusive'
  >(intervalOptions.map(item => [item.key, item.range])),
};

// Only Daily and Weekly labels spell out a day and a month, so they are the
// only intervals whose ordering a date-format preference can disagree with.
// Monthly ("MMM ''yy") and Yearly ("yyyy") are unambiguous either way.
const dayLevelIntervals = new Set(['Daily', 'Weekly']);

/**
 * The display format for an interval's labels, following the user's date
 * format preference.
 *
 * @param interval one of the `intervalOptions` keys.
 * @param dateFormat the `dateFormat` synced pref, e.g. 'MM/dd/yyyy'.
 * @returns a date-fns format string, or '' for an unrecognised interval.
 */
export function getIntervalFormat(
  interval: string,
  dateFormat?: string,
): string {
  if (!dayLevelIntervals.has(interval)) {
    return ReportOptions.intervalFormat.get(interval) ?? '';
  }
  // The preference is used exactly as it is set, including a four-digit year.
  // This does make the tick labels wider than the format they replaced.
  return dateFormat || 'yyyy-MM-dd';
}

export type QueryDataEntity = {
  date: string;
  category: string;
  categoryHidden: boolean;
  categoryGroup: string;
  categoryGroupHidden: boolean;
  account: string;
  accountOffBudget: boolean;
  payee: string;
  transferAccount: string;
  amount: number;
};

type UncategorizedId = 'off_budget' | 'transfer' | 'other' | 'all';

export type UncategorizedEntity = Pick<
  CategoryEntity,
  'id' | 'name' | 'hidden'
> & {
  uncategorized_id?: UncategorizedId;
};

const uncategorizedCategory: UncategorizedEntity = {
  id: '',
  name: 'Uncategorized',
  uncategorized_id: 'other',
  hidden: false,
};
const transferCategory: UncategorizedEntity = {
  id: '',
  name: 'Transfers',
  uncategorized_id: 'transfer',
  hidden: false,
};
const offBudgetCategory: UncategorizedEntity = {
  id: '',
  name: 'Off budget',
  uncategorized_id: 'off_budget',
  hidden: false,
};

type UncategorizedGroupEntity = Pick<
  CategoryGroupEntity,
  'name' | 'id' | 'hidden'
> & {
  categories?: UncategorizedEntity[];
  uncategorized_id?: UncategorizedId;
};

const uncategorizedGroup: UncategorizedGroupEntity = {
  name: 'Uncategorized & Off budget',
  id: 'uncategorized',
  hidden: false,
  uncategorized_id: 'all',
  categories: [uncategorizedCategory, transferCategory, offBudgetCategory],
};

export const categoryLists = (categories: {
  list: CategoryEntity[];
  grouped: CategoryGroupEntity[];
}) => {
  const categoriesToSort = [...categories.list];
  const categoryList: UncategorizedEntity[] = [
    ...categoriesToSort.sort((a, b) => {
      const catGroupA = categories.grouped.find(f => f.id === a.group);
      const catGroupB = categories.grouped.find(f => f.id === b.group);
      return a.sort_order && b.sort_order && catGroupA && catGroupB
        ? Number(catGroupA.is_income) - Number(catGroupB.is_income) ||
            (catGroupA.sort_order ?? 0) - (catGroupB.sort_order ?? 0) ||
            a.sort_order - b.sort_order
        : 0;
    }),
    uncategorizedCategory,
    offBudgetCategory,
    transferCategory,
  ];

  const categoryGroup: UncategorizedGroupEntity[] = [
    ...categories.grouped,
    uncategorizedGroup,
  ];
  return [categoryList, categoryGroup.filter(group => group !== null)] as const;
};

export const groupBySelections = (
  groupBy: string,
  categoryList: UncategorizedEntity[],
  categoryGroup: UncategorizedEntity[],
  payees: UncategorizedEntity[],
  accounts: UncategorizedEntity[],
): [
  UncategorizedEntity[],
  'category' | 'categoryGroup' | 'payee' | 'account',
] => {
  let groupByList: UncategorizedEntity[];
  let groupByLabel: 'category' | 'categoryGroup' | 'payee' | 'account';
  switch (groupBy) {
    case 'Category':
      groupByList = categoryList;
      groupByLabel = 'category';
      break;
    case 'Group':
      groupByList = categoryGroup.map(group => {
        return {
          ...group,
          id: group.id,
          name: group.name,
          hidden: group.hidden,
        };
      });
      groupByLabel = 'categoryGroup';
      break;
    // CategoryGroup uses category-level data from createCustomSpreadsheet.
    // The group-level data comes from groupedData (createGroupedSpreadsheet).
    // This case just prevents the default throw so the spreadsheet doesn't error.
    case 'CategoryGroup':
      groupByList = categoryGroup.map(group => {
        return {
          ...group,
          id: group.id,
          name: group.name,
          hidden: group.hidden,
        };
      });
      groupByLabel = 'categoryGroup';
      break;
    case 'Payee':
      groupByList = payees.map(payee => {
        return { id: payee.id, name: payee.name, hidden: false };
      });
      groupByLabel = 'payee';
      break;
    case 'Account':
      groupByList = accounts.map(account => {
        return { id: account.id, name: account.name, hidden: false };
      });
      groupByLabel = 'account';
      break;
    case 'Interval':
      groupByList = categoryList;
      groupByLabel = 'category';
      break;
    default:
      throw new Error('Error loading data into the spreadsheet.');
  }
  return [groupByList, groupByLabel];
};
