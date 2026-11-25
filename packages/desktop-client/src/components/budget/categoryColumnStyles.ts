import { useLocalPref } from '#hooks/useLocalPref';

import { CATEGORY_COLUMN_WIDTH, clampCategoryColumnWidth } from './util';

// The category column's width lives in a stylesheet instead of in each
// component's styles, so dragging the column edge only touches the elements
// that use it. A CSS variable on the table root would be simpler, but changing
// an inherited variable restyles every element under the root, which is far
// too slow on a large budget.

// The category cell of every budget row and header.
export const CATEGORY_COLUMN_CLASS = 'budget-category-column';
// Each row of the scrolling table.
export const CATEGORY_ROW_CLASS = 'budget-category-row';
// Set on the table root. `--budget-months-width` on it is the width of the
// month columns, so the table's max width follows the category column.
export const CATEGORY_COLUMN_ROOT_ATTR = 'data-category-column-root';
// Set on the table root while the column is being dragged.
export const CATEGORY_COLUMN_RESIZING_ATTR = 'data-category-column-resizing';
// The table's scroll container, and the content that scrolls in it. The former
// has `--budget-total-months` and `--budget-shown-months` set on it.
export const BUDGET_SCROLLER_CLASS = 'budget-scroller';
export const BUDGET_CONTENT_CLASS = 'budget-scroll-content';
// The part of a row beside the category column, as wide as every month the
// table can scroll to.
export const MONTHS_TRACK_CLASS = 'budget-months-track';

// Space on each side of the table, for its shadow.
export const TABLE_GUTTER = 5;

function getStyles(width: number) {
  const gutters = 2 * TABLE_GUTTER;
  const monthsWidth = `(100cqw - ${width + gutters}px) * var(--budget-total-months) / var(--budget-shown-months)`;

  return `
    .${CATEGORY_COLUMN_CLASS} {
      width: ${width}px;
    }
    [${CATEGORY_COLUMN_ROOT_ATTR}] {
      max-width: calc(${width}px + var(--budget-months-width));
    }

    .${BUDGET_SCROLLER_CLASS} {
      container-type: inline-size;
      scroll-padding-left: ${width + TABLE_GUTTER}px;
    }
    .${BUDGET_CONTENT_CLASS} {
      width: calc(${width + gutters}px + ${monthsWidth});
    }
    .${BUDGET_SCROLLER_CLASS} .${MONTHS_TRACK_CLASS} {
      display: grid;
      grid-template-columns: 100%;
      flex: none;
      width: calc(${monthsWidth});
    }
    /* Above a cell being edited, so it scrolls under the column. The border
       extends the cell's background under the table's frame: both can sit at a
       fractional position, where months would show through the seam. */
    .${BUDGET_SCROLLER_CLASS} .${CATEGORY_COLUMN_CLASS} {
      position: sticky;
      left: ${TABLE_GUTTER - 1}px;
      flex: none;
      width: ${width + 1}px;
      margin-left: -1px;
      border-left: 1px solid transparent;
      z-index: 101;
    }

    /* While dragging, skip layout of rows and months scrolled out of view. The
       browser only remembers a row's real height for "contain-intrinsic-size:
       auto" if it's set while the row renders, so it's always on; it does
       nothing until "content-visibility" kicks in. */
    .${CATEGORY_ROW_CLASS} {
      contain-intrinsic-size: auto 32px;
    }
    [${CATEGORY_COLUMN_RESIZING_ATTR}] .${CATEGORY_ROW_CLASS} {
      content-visibility: auto;
    }
    [${CATEGORY_COLUMN_RESIZING_ATTR}] .${MONTHS_TRACK_CLASS} > [inert] {
      display: none;
    }
  `;
}

let styleEl: HTMLStyleElement | null = null;
let currentWidth: number | null = null;

export function setCategoryColumnWidth(width: number) {
  // Touching the stylesheet restyles every column cell, even when the value
  // is unchanged, so skip no-op writes (e.g. the commit after a drag).
  if (width === currentWidth) {
    return;
  }
  currentWidth = width;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.dataset.categoryColumnStyles = '';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = getStyles(width);
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
