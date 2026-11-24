import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { SheetNameProvider } from '#hooks/useSheetName';

import { MONTHS_TRACK_CLASS } from './categoryColumnStyles';
import { useMonths } from './MonthsContext';

type RenderMonthsProps = {
  children: ReactNode | (({ month }: { month: string }) => ReactNode);
  /** Draws the row's lines where months aren't mounted yet. */
  hasRowLines?: boolean;
  trackStyle?: CSSProperties;
  style?: CSSProperties;
};

const line = `linear-gradient(${theme.tableBorder}, ${theme.tableBorder})`;

/** Renders the mounted months in place on a track as wide as all of them. */
export function RenderMonths({
  children,
  hasRowLines = false,
  trackStyle,
  style,
}: RenderMonthsProps) {
  const { months, offscreenMonths, firstMonth, totalMonths } = useMonths();

  return (
    <View
      className={MONTHS_TRACK_CLASS}
      style={{
        ...(hasRowLines && {
          background: `${line} top / 100% 1px no-repeat, ${line} bottom / 100% 1px no-repeat`,
        }),
        ...trackStyle,
      }}
    >
      {months.map(month => {
        const index = monthUtils.differenceInCalendarMonths(month, firstMonth);
        return (
          <SheetNameProvider key={month} name={monthUtils.sheetForMonth(month)}>
            <View
              // Keeps the Tab key from moving to, and scrolling to, a month
              // out of view
              inert={offscreenMonths.includes(month)}
              nativeStyle={{
                marginLeft: `${(index / totalMonths) * 100}%`,
                width: `${100 / totalMonths}%`,
              }}
              style={{
                gridArea: '1 / 1',
                borderLeft: '1px solid ' + theme.tableBorder,
                ...style,
              }}
            >
              {typeof children === 'function' ? children({ month }) : children}
            </View>
          </SheetNameProvider>
        );
      })}
    </View>
  );
}
