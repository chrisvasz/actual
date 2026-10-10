import React, { useRef } from 'react';
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
  startX: number;
  startWidth: number;
  maxWidth: number;
  width: number;
  root: HTMLElement;
};

// Sits on the right edge of the category header and resizes the category
// column. While dragging it writes the width straight to the shared stylesheet
// rule, so nothing re-renders; the width is only saved to the local pref (and
// React) when the drag ends.
export function CategoryColumnResizeHandle() {
  const { t } = useTranslation();
  const [width, setWidthPref] = useCategoryColumnWidth();
  const dragRef = useRef<DragState | null>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) {
      return;
    }
    const root = e.currentTarget.closest<HTMLElement>(
      `[${CATEGORY_COLUMN_ROOT_ATTR}]`,
    );
    if (!root) {
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const availableWidth = (root.parentElement ?? root).clientWidth;
    dragRef.current = {
      startX: e.clientX,
      startWidth: width,
      maxWidth: Math.max(width, availableWidth - MIN_MONTHS_WIDTH),
      width,
      root,
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
      Math.min(drag.maxWidth, drag.startWidth + e.clientX - drag.startX),
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
      setWidthPref(clampCategoryColumnWidth(width + delta));
    }
  }

  return (
    <View
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize category column')}
      aria-valuenow={width}
      aria-valuemin={MIN_CATEGORY_COLUMN_WIDTH}
      aria-valuemax={MAX_CATEGORY_COLUMN_WIDTH}
      tabIndex={0}
      title={t('Drag to resize, double-click to reset')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => setWidthPref(CATEGORY_COLUMN_WIDTH)}
      onKeyDown={onKeyDown}
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
