import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';

test.describe('Help', () => {
  let page: Page;
  let configurationPage: ConfigurationPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    // Move mouse to corner of the screen;
    // sometimes the mouse hovers on a budget element thus rendering an input box
    // and this breaks screenshot tests
    await page.mouse.move(0, 0);
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('Check the keyboard shortcuts modal visuals', async () => {
    await page.keyboard.press('?');

    const keyboardShortcutsModal = page.getByRole('dialog', {
      name: 'Modal dialog',
    });
    await expect(keyboardShortcutsModal).toBeVisible();
    await expect(page).toMatchThemeScreenshots();

    const searchBox =
      keyboardShortcutsModal.getByPlaceholder('Search shortcuts');
    await expect(searchBox).toHaveValue('');

    await searchBox.fill('command');
    await expect(
      keyboardShortcutsModal.getByText('Open the Command Palette'),
    ).toBeVisible();
    await expect(page).toMatchThemeScreenshots();

    const backButton = keyboardShortcutsModal.getByRole('button', {
      name: 'Back',
    });
    await backButton.click();
    await expect(searchBox).toHaveValue('');

    await keyboardShortcutsModal.getByText('Global').click();
    await expect(
      keyboardShortcutsModal.getByText('Show keyboard shortcuts'),
    ).toBeVisible();
    await expect(page).toMatchThemeScreenshots();
  });
});
