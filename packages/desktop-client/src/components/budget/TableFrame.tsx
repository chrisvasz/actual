import React from 'react';
import type { CSSProperties } from 'react';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { CATEGORY_COLUMN_CLASS, TABLE_GUTTER } from './categoryColumnStyles';

// Covers the gutters around what's framed
const cover = `0 0 0 15px ${theme.pageBackground}`;

type TableFrameProps = {
  borderRadius?: CSSProperties['borderRadius'];
  hasShadow?: boolean;
  /** Space below the table the frame also covers. */
  bottom?: number;
  /** Also frame the month in view as a card. */
  hasMonthCard?: boolean;
};

/**
 * Frames the part of its (relatively positioned) parent that is in view, so a
 * parent as wide as every month keeps its edges, corners and shadow wherever
 * it's scrolled. Hides what is scrolled into the gutters around the table.
 */
export function TableFrame({
  borderRadius,
  hasShadow = false,
  bottom = 0,
  hasMonthCard = false,
}: TableFrameProps) {
  return (
    <View
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        bottom: -bottom,
        left: -TABLE_GUTTER,
        right: -TABLE_GUTTER,
        pointerEvents: 'none',
        zIndex: 102,
      }}
    >
      <View
        style={{
          position: 'sticky',
          left: 0,
          width: '100cqw',
          flex: 1,
          // The scroller clips the sides
          clipPath: 'inset(0 -15px)',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom,
            left: TABLE_GUTTER,
            right: TABLE_GUTTER,
            flexDirection: 'row',
            borderRadius,
            boxShadow: hasShadow ? `${styles.cardShadow}, ${cover}` : cover,
          }}
        >
          {hasMonthCard && (
            <>
              <View className={CATEGORY_COLUMN_CLASS} />
              <View
                style={{
                  flex: 1,
                  marginTop: 5,
                  marginBottom: 5,
                  borderRadius: 6,
                  boxShadow: `${styles.cardShadow}, 0 0 0 5px ${theme.pageBackground}`,
                }}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
}
