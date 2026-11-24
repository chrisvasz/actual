import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { AccountPage } from './account-page';

// Elements of the months in view. The months on either side are mounted too,
// but inert.
function inView(testId: string) {
  return `[data-testid="${testId}"]:not([inert] *)`;
}

export class BudgetPage {
  readonly page: Page;
  readonly budgetSummary: Locator;
  readonly budgetTable: Locator;
  readonly budgetTableTotals: Locator;
  readonly selectedMonthButton: Locator;
  readonly nextMonthButton: Locator;
  readonly budgetTableScrollContainer: Locator;

  constructor(page: Page) {
    this.page = page;

    this.budgetSummary = page.locator(inView('budget-summary'));
    this.budgetTable = page.getByTestId('budget-table');
    this.budgetTableTotals = this.budgetTable.getByTestId('budget-totals');
    this.selectedMonthButton = page.getByTestId('selected-budget-month');
    this.nextMonthButton = page.getByTitle('Next month');
    this.budgetTableScrollContainer = page.getByTestId(
      'budget-table-scroll-container',
    );
  }

  async getScrollTop() {
    return this.budgetTableScrollContainer.evaluate(el => el.scrollTop);
  }

  async scrollToBottom() {
    await this.budgetTableScrollContainer.evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });
  }

  async scrollByMonths(count: number) {
    const monthWidth = await this.budgetTableTotals
      .locator('[data-testid$="total-budgeted"]')
      .evaluateAll(
        ([first, second]) =>
          second.getBoundingClientRect().left -
          first.getBoundingClientRect().left,
      );
    await this.budgetTableScrollContainer.evaluate(
      (el, left) => el.scrollBy({ left, behavior: 'instant' }),
      count * monthWidth,
    );
  }

  async editBudgetedAmount(idx: number) {
    const cell = this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .locator(inView('budget'))
      .first();
    await cell.click();
    // Not through `cell`, which only matches a month in view
    return this.budgetTable.getByTestId('budget').locator('input');
  }

  /**
   * Wait for the budget page to finish loading. The budget-table is
   * inside AutoSizer which returns null until layout provides width/
   * height, so it only appears after the page has fully mounted.
   */
  async waitFor(...options: Parameters<Locator['waitFor']>) {
    await this.budgetTable.waitFor(...options);
  }

  async getTotalBudgeted() {
    const totalBudgetedText = await this.budgetTableTotals
      .locator('[data-testid$="total-budgeted"]:not([inert] *)')
      .textContent();

    if (!totalBudgetedText) {
      throw new Error('Failed to get total budgeted.');
    }

    return parseInt(totalBudgetedText, 10);
  }

  async getTotalSpent() {
    const totalSpentText = await this.budgetTableTotals
      .locator('[data-testid$="total-spent"]:not([inert] *)')
      .textContent();

    if (!totalSpentText) {
      throw new Error('Failed to get total spent.');
    }

    return parseInt(totalSpentText, 10);
  }

  async getTotalLeftover() {
    const totalLeftoverText = await this.budgetTableTotals
      .locator('[data-testid$="total-leftover"]:not([inert] *)')
      .textContent();

    if (!totalLeftoverText) {
      throw new Error('Failed to get total leftover.');
    }

    return parseInt(totalLeftoverText, 10);
  }

  async getTableTotals() {
    return {
      budgeted: await this.getTotalBudgeted(),
      spent: await this.getTotalSpent(),
      balance: await this.getTotalLeftover(),
    };
  }

  async setBudgetedAmount(
    categoryName: string,
    amount: string,
    monthIndex = 0,
  ) {
    const row = this.budgetTable
      .getByTestId('row')
      .filter({ hasText: categoryName })
      .first();
    const budgetCell = row.locator(inView('budget')).nth(monthIndex);

    await budgetCell.click();
    const input = budgetCell.locator('input');
    await input.waitFor({ state: 'visible' });
    await input.fill(amount);
    await input.press('Enter');
  }

  async getSelectedMonth() {
    const selectedMonth =
      await this.selectedMonthButton.getAttribute('data-month');

    if (!selectedMonth) {
      throw new Error('Failed to get the selected month.');
    }

    return selectedMonth;
  }

  async #waitForNewMonthToLoad({
    currentMonth,
    errorMessage,
  }: {
    currentMonth: string;
    errorMessage: string;
  }) {
    await expect(this.selectedMonthButton, errorMessage).not.toHaveAttribute(
      'data-month',
      currentMonth,
    );

    return this.getSelectedMonth();
  }

  async goToNextMonth() {
    const currentMonth = await this.getSelectedMonth();

    await this.nextMonthButton.click();

    return await this.#waitForNewMonthToLoad({
      currentMonth,
      errorMessage: 'Failed to navigate to the next month.',
    });
  }

  async getBalanceForRow(idx: number) {
    const balanceText = await this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .locator(inView('balance'))
      .textContent();

    if (!balanceText) {
      throw new Error(`Failed to get balance on row index ${idx}.`);
    }

    return Math.round(parseFloat(balanceText.replace(/,/g, '')) * 100);
  }

  async getCategoryNameForRow(idx: number) {
    const categoryNameText = this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .getByTestId('category-name')
      .textContent();

    if (!categoryNameText) {
      throw new Error(`Failed to get category name on row index ${idx}.`);
    }

    return categoryNameText;
  }

  async clickOnSpentAmountForRow(idx: number) {
    await this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .locator(inView('category-month-spent'))
      .click();
    return new AccountPage(this.page);
  }

  async clickOnSpentAmountForLastVisibleRow() {
    // Click the last spent-amount cell currently visible in the scroll container
    // without triggering Playwright's auto-scroll-into-view, so the scroll
    // position is not changed before the click handler captures it.
    const clicked = await this.page.evaluate(() => {
      const container = document.querySelector(
        '[data-testid="budget-table-scroll-container"]',
      );
      if (!container) {
        throw new Error('Budget scroll container not found');
      }
      const containerRect = container.getBoundingClientRect();
      const cells = container.querySelectorAll<HTMLElement>(
        '[data-testid="category-month-spent"]:not([inert] *)',
      );
      for (const cell of [...cells].reverse()) {
        const rect = cell.getBoundingClientRect();
        if (
          rect.top >= containerRect.top &&
          rect.bottom <= containerRect.bottom
        ) {
          cell.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      throw new Error('No visible spent-amount cell found to click');
    }
    return new AccountPage(this.page);
  }

  async transferAllBalance(fromIdx: number, toIdx: number) {
    const toName = await this.getCategoryNameForRow(toIdx);
    if (!toName) {
      throw new Error(`Unable to get category name of row index ${toIdx}.`);
    }

    await this.budgetTable
      .getByTestId('row')
      .nth(fromIdx)
      .locator(inView('balance'))
      .getByTestId(/^budget/)
      .click();

    await this.page
      .getByRole('button', { name: 'Transfer to another category' })
      .click();

    await this.page.getByPlaceholder('(none)').click();

    await this.page.keyboard.type(toName);
    await this.page.keyboard.press('Enter');

    await this.page.getByRole('button', { name: 'Transfer' }).click();
  }

  async rightClickCategory(idx: number) {
    await this.budgetTable
      .getByTestId('row')
      .nth(idx)
      .getByTestId('category-name')
      .click({ button: 'right' });
  }

  async rightClickCategoryGroup(name: string) {
    // Assuming category groups have a specific text or role, or we can just find by text
    await this.budgetTable
      .getByText(name, { exact: true })
      .click({ button: 'right' });
  }
}
