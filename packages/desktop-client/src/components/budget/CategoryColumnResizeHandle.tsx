import React, { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  CATEGORY_COLUMN_RESIZING_ATTR,
  CATEGORY_COLUMN_ROOT_ATTR,
  setCategoryColumnResizing,
  setCategoryColumnWidth,
  useCategoryColumnWidth,
} from './categoryColumnStyles';
import {
  CATEGORY_COLUMN_WIDTH,
  clampCategoryColumnWidth,
  MAX_CATEGORY_COLUMN_WIDTH,
  MIN_CATEGORY_COLUMN_WIDTH,
} from './util';

const KEYBOARD_STEP = 10;
// Space a drag always leaves for the month columns, so it can't squeeze them
// unreadable on a narrow window.
const MIN_MONTHS_WIDTH = 300;

type DragState = {
  startWidth: number;
  maxWidth: number;
  width: number;
  root: HTMLElement;
  // Left edge and width of the area the table is centered in.
  areaLeft: number;
  areaWidth: number;
  // Width of the month columns, i.e. the table's max width minus the column.
  monthsWidth: number;
  // Distance from the table's left edge to the pointer, minus the column.
  grabOffset: number;
};

function getRoot(el: HTMLElement) {
  return el.closest<HTMLElement>(`[${CATEGORY_COLUMN_ROOT_ATTR}]`);
}

// The widest the column can go without squeezing the month columns below
// MIN_MONTHS_WIDTH (or the current width, if the window has since shrunk).
function getMaxWidth(root: HTMLElement, width: number) {
  const areaWidth = (root.parentElement ?? root).clientWidth;
  return clampCategoryColumnWidth(
    Math.max(width, areaWidth - MIN_MONTHS_WIDTH),
  );
}

// The column width that puts the column's edge under the pointer. Once the
// table hits its max width it's centered, so widening the column also moves
// the table's left edge by half as much.
function getWidthAtPointer(drag: DragState, clientX: number) {
  const fullWidth = clientX - drag.areaLeft - drag.grabOffset;
  if (fullWidth + drag.monthsWidth >= drag.areaWidth) {
    return fullWidth;
  }
  return 2 * fullWidth - drag.areaWidth + drag.monthsWidth;
}

// Sits on the right edge of the category header and resizes the category
// column. While dragging it writes the width straight to the shared stylesheet
// rule, so nothing re-renders; the width is only saved to the local pref (and
// React) when the drag ends.
export function CategoryColumnResizeHandle() {
  const { t } = useTranslation();
  const [width, setWidthPref] = useCategoryColumnWidth();
  const dragRef = useRef<DragState | null>(null);
  const [maxWidth, setMaxWidth] = useState(MAX_CATEGORY_COLUMN_WIDTH);

  // Don't leave the page's cursor or the table stuck if the budget is hidden
  // or closes mid-drag. The table resets the stylesheet when it's shown again.
  useEffect(
    () => () => {
      const drag = dragRef.current;
      if (drag) {
        dragRef.current = null;
        document.documentElement.style.cursor = '';
        setCategoryColumnResizing(drag.root, false);
      }
    },
    [],
  );

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) {
      return;
    }
    const root = getRoot(e.currentTarget);
    if (!root) {
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const area = root.parentElement ?? root;
    const areaLeft = area.getBoundingClientRect().left;
    const max = getMaxWidth(root, width);
    setMaxWidth(max);
    dragRef.current = {
      startWidth: width,
      maxWidth: max,
      width,
      root,
      areaLeft,
      areaWidth: area.clientWidth,
      monthsWidth:
        parseFloat(
          getComputedStyle(root).getPropertyValue('--budget-months-width'),
        ) || 0,
      grabOffset: e.clientX - root.getBoundingClientRect().left - width,
    };
    document.documentElement.style.cursor = 'col-resize';
    setCategoryColumnResizing(root, true);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    drag.width = clampCategoryColumnWidth(
      Math.min(drag.maxWidth, getWidthAtPointer(drag, e.clientX)),
    );
    setCategoryColumnWidth(drag.width);
  }

  function endDrag() {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    dragRef.current = null;
    document.documentElement.style.cursor = '';
    setCategoryColumnResizing(drag.root, false);
    if (drag.width !== drag.startWidth) {
      setWidthPref(drag.width);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP;
      const root = getRoot(e.currentTarget);
      const max = root ? getMaxWidth(root, width) : MAX_CATEGORY_COLUMN_WIDTH;
      setMaxWidth(max);
      setWidthPref(clampCategoryColumnWidth(Math.min(max, width + delta)));
    }
  }

  return (
    <View
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize category column')}
      aria-valuenow={width}
      aria-valuemin={MIN_CATEGORY_COLUMN_WIDTH}
      aria-valuemax={maxWidth}
      tabIndex={0}
      title={t('Drag to resize, double-click to reset')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => setWidthPref(CATEGORY_COLUMN_WIDTH)}
      onKeyDown={onKeyDown}
      onFocus={e => {
        const root = getRoot(e.currentTarget);
        if (root) {
          setMaxWidth(getMaxWidth(root, width));
        }
      }}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: -5,
        width: 10,
        zIndex: 1,
        cursor: 'col-resize',
        touchAction: 'none',
        outline: 'none',
        '::after': {
          content: '""',
          position: 'absolute',
          top: 6,
          bottom: 6,
          left: 4,
          width: 2,
          borderRadius: 1,
          backgroundColor: 'transparent',
          transition: 'background-color .15s',
        },
        [`&:hover::after, &:focus-visible::after, [${CATEGORY_COLUMN_RESIZING_ATTR}] &::after`]:
          {
            backgroundColor: theme.tableBorderSelected,
          },
      }}
    />
  );
}
