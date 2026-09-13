// @ts-strict-ignore
import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import {
  SvgArrowThinLeft,
  SvgArrowThinRight,
} from '@actual-app/components/icons/v1';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { Link } from '#components/common/Link';
import { useLocale } from '#hooks/useLocale';
import { useResizeObserver } from '#hooks/useResizeObserver';

import type { MonthBounds } from './MonthsContext';

type MonthPickerProps = {
  startMonth: string;
  numDisplayed: number;
  monthBounds: MonthBounds;
  style: CSSProperties;
  onSelect: (month: string) => void;
};

export const MonthPicker = ({
  startMonth,
  numDisplayed,
  monthBounds,
  style,
  onSelect,
}: MonthPickerProps) => {
  const locale = useLocale();
  const { t } = useTranslation();
  const [hoverId, setHoverId] = useState(null);
  const [targetMonthCount, setTargetMonthCount] = useState(12);

  const currentMonth = monthUtils.currentMonth();
  const firstSelectedMonth = startMonth;

  const lastSelectedMonth = monthUtils.addMonths(
    firstSelectedMonth,
    numDisplayed - 1,
  );

  const range = monthUtils.rangeInclusive(
    monthUtils.subMonths(
      firstSelectedMonth,
      Math.floor(targetMonthCount / 2 - numDisplayed / 2),
    ),
    monthUtils.addMonths(
      lastSelectedMonth,
      Math.floor(targetMonthCount / 2 - numDisplayed / 2),
    ),
  );

  const firstSelectedIndex =
    Math.floor(range.length / 2) - Math.floor(numDisplayed / 2);
  const lastSelectedIndex = firstSelectedIndex + numDisplayed - 1;

  const [size, setSize] = useState('small');
  const containerRef = useResizeObserver(rect => {
    setSize(rect.width <= 400 ? 'small' : 'big');
    // Reserve room for the chrome around the strip and for the inline year
    // labels, then show as many months as what is left can hold.
    setTargetMonthCount(
      Math.min(Math.max(Math.floor((rect.width - 150) / 50), 6), 24),
    );
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...style,
      }}
    >
      <View
        innerRef={containerRef}
        style={{
          flexDirection: 'row',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Link
          variant="button"
          buttonVariant="bare"
          onPress={() => onSelect(monthUtils.prevMonth(startMonth))}
          style={{
            padding: '3px 3px',
            marginRight: '12px',
            opacity: 0.6,
            ':hover': {
              opacity: 1,
            },
          }}
        >
          <View title={t('Previous month')}>
            <SvgArrowThinLeft
              style={{
                width: 13,
                height: 13,
              }}
            />
          </View>
        </Link>
        {range.map((month, idx) => {
          const monthName = monthUtils.format(month, 'MMM', locale);
          const selected =
            idx >= firstSelectedIndex && idx <= lastSelectedIndex;

          const lastHoverId = hoverId + numDisplayed - 1;
          const hovered =
            hoverId === null ? false : idx >= hoverId && idx <= lastHoverId;

          const current = currentMonth === month;
          const year = monthUtils.getYear(month);
          const showYear = monthUtils.getMonthIndex(month) === 0;

          const isMonthBudgeted =
            month >= monthBounds.start && month <= monthBounds.end;

          // January carries the year with it, abbreviated when the cells are
          // too narrow for the full one.
          const label = showYear
            ? `${size === 'big' ? monthName : monthName[0]} ${
                size === 'big' ? year : String(year).slice(-2)
              }`
            : size === 'big'
              ? monthName
              : monthName[0];

          return (
            <View
              key={month}
              data-testid={selected ? 'selected-budget-month' : undefined}
              data-month={selected ? month : undefined}
              style={{
                alignItems: 'center',
                padding: showYear ? '3px 6px' : '3px 3px',
                ...(!showYear && {
                  width: size === 'big' ? '35px' : '20px',
                }),
                textAlign: 'center',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                cursor: 'default',
                borderRadius: 2,
                border: 'none',
                ...(!isMonthBudgeted && {
                  textDecoration: 'line-through',
                  color: theme.pageTextSubdued,
                }),
                ...styles.smallText,
                ...(selected && {
                  backgroundColor: theme.buttonPrimaryBackground,
                  color: theme.buttonPrimaryText,
                }),
                ...((hovered || selected) && {
                  borderRadius: 0,
                  cursor: 'pointer',
                }),
                ...(hoverId !== null &&
                  !hovered &&
                  selected && {
                    filter: 'brightness(65%)',
                  }),
                ...(hovered &&
                  !selected && {
                    backgroundColor: theme.buttonBareBackgroundHover,
                  }),
                ...(!hovered &&
                  !selected &&
                  current && {
                    backgroundColor: theme.buttonBareBackgroundHover,
                    filter: 'brightness(120%)',
                  }),
                ...(hovered &&
                  selected &&
                  current && {
                    filter: 'brightness(120%)',
                  }),
                ...(hovered &&
                  selected && {
                    backgroundColor: theme.buttonPrimaryBackground,
                  }),
                ...((idx === firstSelectedIndex ||
                  (idx === hoverId && !selected)) && {
                  borderTopLeftRadius: 2,
                  borderBottomLeftRadius: 2,
                }),
                ...((idx === lastSelectedIndex ||
                  (idx === lastHoverId && !selected)) && {
                  borderTopRightRadius: 2,
                  borderBottomRightRadius: 2,
                }),
                ...(current && {
                  textDecoration: isMonthBudgeted
                    ? 'underline'
                    : 'line-through underline',
                }),
              }}
              onClick={() => onSelect(month)}
              onMouseEnter={() => setHoverId(idx)}
              onMouseLeave={() => setHoverId(null)}
            >
              <View>{label}</View>
            </View>
          );
        })}
        <Link
          variant="button"
          buttonVariant="bare"
          onPress={() => onSelect(monthUtils.nextMonth(startMonth))}
          style={{
            padding: '3px 3px',
            marginLeft: '12px',
            opacity: 0.6,
            ':hover': {
              opacity: 1,
            },
          }}
        >
          <View title={t('Next month')}>
            <SvgArrowThinRight
              style={{
                width: 13,
                height: 13,
              }}
            />
          </View>
        </Link>
      </View>
    </View>
  );
};
