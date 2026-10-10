import { useLocalPref } from '#hooks/useLocalPref';

import { CATEGORY_COLUMN_WIDTH, clampCategoryColumnWidth } from './util';

// The category column's width lives in a single stylesheet rule instead of in
// each component's styles, so dragging the column edge only touches the
// elements that use it. A CSS variable on the table root would be simpler, but
// changing an inherited variable restyles every element under the root, which
// is far too slow on a large budget.

// The category cell of every budget row and header.
export const CATEGORY_COLUMN_CLASS = 'budget-category-column';
// Each row of the scrolling table.
export const CATEGORY_ROW_CLASS = 'budget-category-row';
// Set on the table root. `--budget-months-width` on it is the width of the
// month columns, so the table's max width follows the category column.
export const CATEGORY_COLUMN_ROOT_ATTR = 'data-category-column-root';
// Set on the table root while the column is being dragged.
export const CATEGORY_COLUMN_RESIZING_ATTR = 'data-category-column-resizing';

let columnRule: CSSStyleRule | null = null;
let rootRule: CSSStyleRule | null = null;
let currentWidth: number | null = null;

function getRules() {
  if (!columnRule || !rootRule) {
    const styleEl = document.createElement('style');
    styleEl.dataset.categoryColumnStyles = '';
    document.head.appendChild(styleEl);
    const sheet = styleEl.sheet!;
    sheet.insertRule(`.${CATEGORY_COLUMN_CLASS} {}`, 0);
    sheet.insertRule(`[${CATEGORY_COLUMN_ROOT_ATTR}] {}`, 1);
    // While dragging, skip layout of rows scrolled out of view. The browser
    // only remembers a row's real height for `contain-intrinsic-size: auto`
    // if it's set while the row renders, so it's always on; it does nothing
    // until `content-visibility` kicks in.
    sheet.insertRule(
      `.${CATEGORY_ROW_CLASS} { contain-intrinsic-size: auto 32px; }`,
      2,
    );
    sheet.insertRule(
      `[${CATEGORY_COLUMN_RESIZING_ATTR}] .${CATEGORY_ROW_CLASS} {
        content-visibility: auto;
      }`,
      3,
    );
    columnRule = sheet.cssRules[0] as CSSStyleRule;
    rootRule = sheet.cssRules[1] as CSSStyleRule;
    setCategoryColumnWidth(CATEGORY_COLUMN_WIDTH);
  }
  return { columnRule, rootRule };
}

export function setCategoryColumnWidth(width: number) {
  const rules = getRules();
  // Touching the stylesheet restyles every column cell, even when the value
  // is unchanged, so skip no-op writes (e.g. the commit after a drag).
  if (width === currentWidth) {
    return;
  }
  currentWidth = width;
  rules.columnRule.style.setProperty('width', `${width}px`);
  rules.rootRule.style.setProperty(
    'max-width',
    `calc(${width}px + var(--budget-months-width))`,
  );
}

export function setCategoryColumnResizing(root: HTMLElement, value: boolean) {
  root.toggleAttribute(CATEGORY_COLUMN_RESIZING_ATTR, value);
}

// The saved column width, clamped to the allowed range.
export function useCategoryColumnWidth() {
  const [widthPref, setWidthPref] = useLocalPref('budget.categoryColumnWidth');
  const width = clampCategoryColumnWidth(widthPref ?? CATEGORY_COLUMN_WIDTH);
  return [width, setWidthPref] as const;
}
