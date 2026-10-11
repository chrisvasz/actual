import type { Step } from 'react-joyride';

import * as monthUtils from '@actual-app/core/shared/months';

import { Link } from '#components/common/Link';

import type { TourId } from './TourContext';

export const ADD_ACCOUNT_STEP_ID = 'add-account';

export type TourStepDeps = {
  navigate: (to: string) => void;
};

function getDisplayedMonths(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid="selected-budget-month"]',
    ),
  )
    .map(element => element.dataset.month)
    .filter((month): month is string => Boolean(month));
}

// The budget summaries strip also renders the month before and after the
// displayed months (clipped by its container) so it can animate between
// months, so a summary being in the DOM does not mean it is on screen. Only
// target the current month while the month picker shows it as displayed, and
// otherwise fall back to the first displayed month.
function findBudgetSummary(): HTMLElement | null {
  const displayedMonths = getDisplayedMonths();
  const currentMonth = monthUtils.currentMonth();
  const month =
    displayedMonths.length === 0 || displayedMonths.includes(currentMonth)
      ? currentMonth
      : displayedMonths[0];

  return (
    document.querySelector<HTMLElement>(
      `[data-testid="budget-summary"][data-month="${month}"]`,
    ) ?? document.querySelector<HTMLElement>('[data-testid="budget-summary"]')
  );
}

// Must resolve within joyride's 5s beforeTimeout. Waits for the element to be
// rendered, not just present: a budget page opened earlier stays mounted but
// hidden while another page shows, and joyride skips hidden targets.
function waitForElement(selector: string, timeoutMs = 4000): Promise<void> {
  return new Promise(resolve => {
    const start = Date.now();
    function check() {
      if (
        document.querySelector(selector)?.checkVisibility() ||
        Date.now() - start > timeoutMs
      ) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    }
    check();
  });
}

function getBudgetTourSteps({ navigate }: TourStepDeps): Step[] {
  return [
    {
      id: 'welcome',
      target: 'body',
      placement: 'center',
      title: <>Welcome to Actual!</>,
      content: (
        <>
          Actual is a budgeting app that helps you understand exactly where your
          money goes. This short tour walks you through the basics. It only
          takes a couple of minutes, and you can leave at any time and replay it
          later from the Help menu.
        </>
      ),
    },
    {
      id: 'budget-table',
      target: '[data-testid="budget-table"]',
      scrollTarget: '[data-testid="budget-table-scroll-container"]',
      placement: 'center',
      before: async () => {
        if (window.location.pathname !== '/budget') {
          navigate('/budget');
        }
        await waitForElement('[data-testid="budget-table"]');
      },
      title: 'Your Budget',
      content: (
        <>
          Categories in Actual work like virtual envelopes: you assign the money
          you already have to them, then spend from each envelope. This approach
          is called{' '}
          <Link
            variant="external"
            to="https://actualbudget.org/docs/getting-started/envelope-budgeting"
          >
            envelope budgeting
          </Link>
          .
        </>
      ),
    },
    {
      id: 'budget-summary',
      target: findBudgetSummary,
      placement: 'bottom',
      title: 'To Budget',
      content: (
        <>
          The <strong>To Budget</strong> amount shows the money you have not
          assigned to a category yet. Aim to bring it to zero, so that all of
          your money has a job.
        </>
      ),
    },
    {
      id: 'category',
      target: '[data-testid="category-name"]',
      placement: 'bottom',
      title: 'Categories',
      content: (
        <>
          Each row in the budget is a category. Click the{' '}
          <strong>Budgeted</strong> amount to assign money to a category, and
          keep an eye on the <strong>Balance</strong> column to see how much is
          left to spend.
        </>
      ),
    },
    {
      id: 'month-picker',
      target: '[data-testid="selected-budget-month"]',
      placement: 'bottom',
      title: 'Month by Month',
      content:
        'Every month gets its own budget. Use the month picker to move between months, and the calendar icons on the left to choose how many months are shown side by side.',
    },
    {
      id: 'sidebar-navigation',
      target: '[data-testid="sidebar-primary-buttons"]',
      placement: 'right',
      title: 'Getting Around',
      content: (
        <>
          The sidebar takes you to your budget, reports, and scheduled
          transactions. You can find payees, rules, and the settings (with help
          and your server connection) under <strong>More</strong>.
        </>
      ),
    },
    {
      id: ADD_ACCOUNT_STEP_ID,
      target: '[data-testid="sidebar-add-account"]',
      placement: 'right',
      title: 'Add Your Accounts',
      content: (
        <>
          Transactions live in accounts, so adding your first account is the
          best way to get started with Actual. Click here to add one. You can
          enter transactions yourself, or{' '}
          <Link
            variant="external"
            to="https://actualbudget.org/docs/advanced/bank-sync"
          >
            link the account to your bank
          </Link>{' '}
          to import them automatically.
        </>
      ),
    },
  ];
}

const tourSteps: Record<TourId, (deps: TourStepDeps) => Step[]> = {
  'budget-tour': getBudgetTourSteps,
};

export function getTourSteps(tourId: TourId, deps: TourStepDeps): Step[] {
  return tourSteps[tourId](deps);
}
