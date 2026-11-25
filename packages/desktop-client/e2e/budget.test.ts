import * as monthUtils from '@actual-app/core/shared/months';
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import type { BudgetPage } from './page-models/budget-page';
import { ConfigurationPage } from './page-models/configuration-page';

test.describe('Budget', () => {
  let page: Page;
  let configurationPage: ConfigurationPage;
  let budgetPage: BudgetPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    budgetPage = await configurationPage.createTestFile();

    // Move mouse to corner of the screen;
    // sometimes the mouse hovers on a budget element thus rendering an input box
    // and this breaks screenshot tests
    await page.mouse.move(0, 0);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('renders the summary information: available funds, overspent, budgeted and for next month', async () => {
    const summary = budgetPage.budgetSummary.first();

    await expect(summary.getByText('Available funds')).toBeVisible({
      timeout: 10000,
    });
    await expect(summary.getByText(/^Overspent in /)).toBeVisible();
    await expect(summary.getByText('Budgeted')).toBeVisible();
    await expect(summary.getByText('For next month')).toBeVisible();
    await expect(page).toMatchThemeScreenshots();
  });

  test('transfer funds to another category', async () => {
    const currentFundsA = await budgetPage.getBalanceForRow(1);
    const currentFundsB = await budgetPage.getBalanceForRow(2);

    await budgetPage.transferAllBalance(1, 2);

    await expect
      .poll(() => budgetPage.getBalanceForRow(2))
      .toEqual(currentFundsA + currentFundsB);
    await expect(page).toMatchThemeScreenshots();
  });

  test('budget table is rendered', async () => {
    await expect(budgetPage.budgetTable).toBeVisible();
    expect(await budgetPage.getTableTotals()).toEqual({
      budgeted: expect.any(Number),
      spent: expect.any(Number),
      balance: expect.any(Number),
    });
  });

  test('clicking on spent amounts opens a transaction page', async () => {
    const accountPage = await budgetPage.clickOnSpentAmountForRow(1);
    expect(page.url()).toContain('/accounts');
    expect(await accountPage.accountName.textContent()).toMatch('All Accounts');
    await page.goBack();
  });

  test('scrolling sideways moves through the months', async () => {
    const month = await budgetPage.getSelectedMonth();

    await budgetPage.scrollByMonths(-1);
    await expect
      .poll(() => budgetPage.getSelectedMonth())
      .toBe(monthUtils.subMonths(month, 1));

    // The months it scrolls to are the ones it shows
    await expect(budgetPage.budgetSummary.first()).toContainText(
      monthUtils.format(monthUtils.subMonths(month, 1), 'MMMM'),
    );

    await budgetPage.goToNextMonth();
    await expect.poll(() => budgetPage.getSelectedMonth()).toBe(month);
    await expect(budgetPage.budgetSummary.first()).toContainText(
      monthUtils.format(month, 'MMMM'),
    );
  });

  test('scrolls one month at a time, however far the scroll', async () => {
    const month = await budgetPage.getSelectedMonth();

    await budgetPage.scrollByMonths(-5);
    await expect
      .poll(() => budgetPage.getSelectedMonth())
      .toBe(monthUtils.subMonths(month, 1));
  });

  test('keeps a cell open for editing while scrolled out of view', async () => {
    const input = await budgetPage.editBudgetedAmount(1);
    await input.fill('123.45');

    const month = await budgetPage.getSelectedMonth();
    for (const distance of [1, 2, 3]) {
      await budgetPage.scrollByMonths(-1);
      await expect
        .poll(() => budgetPage.getSelectedMonth())
        .toBe(monthUtils.subMonths(month, distance));
    }
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('123.45');
  });

  test('right clicking a category opens context menu', async () => {
    await budgetPage.rightClickCategory(1);
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Rename' })).toBeVisible();
  });

  test('right clicking a category group opens context menu', async () => {
    await budgetPage.rightClickCategoryGroup('Usual Expenses');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Rename' })).toBeVisible();
  });

  test('right clicking budget name opens context menu', async () => {
    await page.getByTestId('budget-name').click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('button', { name: 'Switch file' }),
    ).toBeVisible();
  });
});

test.describe('Budget scroll position', () => {
  let page: Page;
  let configurationPage: ConfigurationPage;
  let budgetPage: BudgetPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    budgetPage = await configurationPage.createTestFile();

    // Add enough categories to make the budget table scrollable.
    const categoryCount = 20;
    await page.evaluate(async count => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const $send = (window as any).$send as (
        type: string,
        args?: unknown,
      ) => Promise<string>;
      const groupId = await $send('category-group-create', {
        name: 'Extra Categories',
      });
      for (let i = 1; i <= count; i++) {
        await $send('category-create', { name: `Category ${i}`, groupId });
      }
    }, categoryCount);
    await page
      .getByText(`Category ${categoryCount}`, { exact: true })
      .waitFor({ state: 'visible' });

    await page.mouse.move(0, 0);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('scroll position is restored when navigating back from spent transactions page', async () => {
    await budgetPage.scrollToBottom();
    const scrollTopBeforeViewingSpent = await budgetPage.getScrollTop();
    expect(scrollTopBeforeViewingSpent).toBeGreaterThan(0);

    // Click a spent-amount cell that is already visible at the current scroll position so the scroll does not change
    // before the handler captures it.
    await budgetPage.clickOnSpentAmountForLastVisibleRow();
    expect(page.url()).toContain('/accounts');

    await page.goBack();
    await budgetPage.waitFor();

    const scrollTopAfterReturningFromSpent = await budgetPage.getScrollTop();
    expect(scrollTopAfterReturningFromSpent).toBe(scrollTopBeforeViewingSpent);
  });
});
