import { Menu } from '@actual-app/components/menu';
import type { MenuItem } from '@actual-app/components/menu';

type CustomReportSummary = {
  id: string;
  name: string;
};

type GetDashboardWidgetItemsParams = {
  customReports: CustomReportSummary[];
  formulaMode: boolean;
  crossoverReportEnabled: boolean;
  budgetAnalysisReportEnabled: boolean;
  balanceForecastReportEnabled: boolean;
};

type DashboardWidgetMenuName =
  | 'balance-forecast-card'
  | 'budget-analysis-card'
  | 'calendar-card'
  | 'cash-flow-card'
  | 'crossover-card'
  | 'custom-report'
  | 'formula-card'
  | 'markdown-card'
  | 'net-worth-card'
  | 'spending-card'
  | 'summary-card'
  | `custom-report-${string}`;

function findItemIndex(
  items: MenuItem<DashboardWidgetMenuName>[],
  name: string,
) {
  const index = items.findIndex(
    item => item !== Menu.line && item.name === name,
  );
  return index === -1 ? items.length : index;
}

export function getDashboardWidgetItems({
  customReports,
  formulaMode,
  crossoverReportEnabled,
  budgetAnalysisReportEnabled,
  balanceForecastReportEnabled,
}: GetDashboardWidgetItemsParams): MenuItem<DashboardWidgetMenuName>[] {
  const items: MenuItem<DashboardWidgetMenuName>[] = [
    {
      name: 'cash-flow-card',
      text: 'Cash flow graph',
    },
    {
      name: 'net-worth-card',
      text: 'Net worth graph',
    },
    {
      name: 'spending-card',
      text: 'Spending analysis',
    },
    {
      name: 'markdown-card',
      text: 'Text widget',
    },
    {
      name: 'summary-card',
      text: 'Summary card',
    },
    {
      name: 'calendar-card',
      text: 'Calendar card',
    },
    {
      name: 'custom-report',
      text: 'New custom report',
    },
  ];

  if (crossoverReportEnabled) {
    items.splice(2, 0, {
      name: 'crossover-card',
      text: 'Crossover point',
    });
  }

  if (budgetAnalysisReportEnabled) {
    items.splice(findItemIndex(items, 'markdown-card'), 0, {
      name: 'budget-analysis-card',
      text: 'Budget analysis',
    });
  }

  if (balanceForecastReportEnabled) {
    items.splice(findItemIndex(items, 'markdown-card'), 0, {
      name: 'balance-forecast-card',
      text: 'Balance forecast',
    });
  }

  if (formulaMode) {
    items.splice(findItemIndex(items, 'custom-report'), 0, {
      name: 'formula-card',
      text: 'Formula card',
    });
  }

  if (customReports.length) {
    items.push(Menu.line);
    items.push(
      ...customReports.map(report => ({
        name: `custom-report-${report.id}`,
        text: report.name,
      })),
    );
  }

  return items;
}
