import { useState } from 'react';
import type { PointerEvent } from 'react';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { integerToAmount } from '@actual-app/core/shared/util';

import { FinancialText } from '#components/FinancialText';
import { useFormat } from '#hooks/useFormat';
import { useResizeObserver } from '#hooks/useResizeObserver';

import { ColorSwatch } from './ColorSwatch';
import type { NetWorthData, NetWorthRow } from './netWorth';

const HEIGHT = 260;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 52 };
const MAX_X_LABELS = 8;
const BAND_OPACITY = 0.28;

const axisFormat = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

type NetWorthChartProps = {
  data: NetWorthData;
  colors: ReadonlyMap<string, string>;
};

/**
 * Each month-end's change since the baseline month, stacked by account group
 * with gains above zero and losses below, and net worth's change as a line.
 * Plotting change rather than balance gives the slope the full height and
 * keeps every group visible, however small next to the total.
 */
export function NetWorthChart({ data, colors }: NetWorthChartProps) {
  const format = useFormat();
  const formatChange = (value: number) =>
    `${value > 0 ? '+' : ''}${format(value, 'financial')}`;
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useResizeObserver<HTMLDivElement>(
    rect => setWidth(rect.width),
    { measureOnAttach: true },
  );

  const { months, groups } = data;
  const totalChanges = changes(data.total);
  const stacks = stackChanges(data);
  const [yMin, yMax, ticks] = niceScale(
    Math.min(0, ...stacks.lowest, ...totalChanges),
    Math.max(0, ...stacks.highest, ...totalChanges),
  );

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (i: number) =>
    MARGIN.left +
    (months.length === 1
      ? plotWidth / 2
      : (i / (months.length - 1)) * plotWidth);
  const y = (value: number) =>
    MARGIN.top + ((yMax - value) / (yMax - yMin || 1)) * plotHeight;

  const xLabels = pickMonthLabels(months);
  const lastIndex = months.length - 1;

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / (rect.width || 1);
    setHoverIndex(
      Math.min(lastIndex, Math.max(0, Math.round(ratio * lastIndex))),
    );
  }

  // Keep the tooltip clear of the hovered point: beside it horizontally,
  // and in the half of the plot it isn't in
  const tooltipOnLeft = hoverIndex != null && x(hoverIndex) > width / 2;
  const tooltipAtBottom =
    hoverIndex != null && y(totalChanges[hoverIndex]) < HEIGHT / 2;

  return (
    <View style={{ gap: 12 }}>
      <View
        ref={containerRef}
        style={{ position: 'relative', height: HEIGHT }}
        data-testid="net-worth-chart"
      >
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Change in net worth since ${formatMonth(data.baselineMonth)} by account group, ${formatMonth(months[0])} to ${formatMonth(months[lastIndex])}`}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {ticks.map(tick => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={
                    tick === 0 ? theme.tableHeaderText : theme.tableBorder
                  }
                  strokeOpacity={tick === 0 ? 0.5 : 1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={MARGIN.left - 10}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={11}
                  fill={theme.pageTextSubdued}
                  style={styles.tnum}
                >
                  {axisFormat.format(integerToAmount(tick))}
                </text>
              </g>
            ))}

            {hoverIndex != null && (
              <line
                x1={x(hoverIndex)}
                x2={x(hoverIndex)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                stroke={theme.tableHeaderText}
                strokeOpacity={0.4}
                shapeRendering="crispEdges"
                pointerEvents="none"
              />
            )}

            {stacks.bands.map(band => {
              const color = colors.get(band.groupId);
              return (
                <g key={band.key} pointerEvents="none">
                  <path
                    d={areaPath(band.base, band.edge, x, y)}
                    fill={color}
                    fillOpacity={BAND_OPACITY}
                  />
                  <path
                    d={linePath(band.edge, x, y)}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

            <path
              d={linePath(totalChanges, x, y)}
              fill="none"
              stroke={theme.pageText}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
            <circle
              cx={x(hoverIndex ?? lastIndex)}
              cy={y(totalChanges[hoverIndex ?? lastIndex])}
              r={4}
              fill={theme.pageText}
              stroke={theme.tableBackground}
              strokeWidth={2}
              pointerEvents="none"
            />

            {xLabels.map(({ index, label }) => (
              <text
                key={months[index]}
                x={x(index)}
                y={HEIGHT - 8}
                // Keep the edge labels inside the plot
                textAnchor={
                  lastIndex > 0 && index === 0
                    ? 'start'
                    : lastIndex > 0 && index === lastIndex
                      ? 'end'
                      : 'middle'
                }
                fontSize={11}
                fill={theme.pageTextSubdued}
              >
                {label}
              </text>
            ))}

            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHoverIndex(null)}
            />
          </svg>
        )}

        {hoverIndex != null && (
          <View
            role="tooltip"
            style={{
              position: 'absolute',
              ...(tooltipAtBottom
                ? { bottom: MARGIN.bottom }
                : { top: MARGIN.top }),
              ...(tooltipOnLeft
                ? { right: width - x(hoverIndex) + 14 }
                : { left: x(hoverIndex) + 14 }),
              pointerEvents: 'none',
              backgroundColor: theme.tooltipBackground,
              color: theme.tooltipText,
              border: `1px solid ${theme.tooltipBorder}`,
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 12,
              gap: 6,
              minWidth: 200,
              boxShadow:
                '0 15px 30px 0 rgba(0, 0, 0, 0.11), 0 5px 15px 0 rgba(0, 0, 0, 0.08)',
            }}
          >
            <Text style={{ fontWeight: 600, fontSize: 13 }}>
              Change from {formatMonth(data.baselineMonth)} to{' '}
              {formatMonth(months[hoverIndex])}
            </Text>
            {groups.map(group => (
              <View
                key={group.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <ColorSwatch color={colors.get(group.id)} size={8} />
                <Text style={{ flex: 1, color: theme.pageTextSubdued }}>
                  {group.name}
                </Text>
                <FinancialText>
                  {formatChange(changes(group)[hoverIndex])}
                </FinancialText>
              </View>
            ))}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 12,
                fontWeight: 600,
                borderTop: `1px solid ${theme.tooltipBorder}`,
                paddingTop: 6,
              }}
            >
              <Text>Net worth</Text>
              <FinancialText>
                {formatChange(totalChanges[hoverIndex])}
              </FinancialText>
            </View>
          </View>
        )}
      </View>

      <View
        aria-hidden
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: '6px 16px',
          paddingLeft: MARGIN.left,
          fontSize: 12,
          color: theme.pageTextSubdued,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 14,
              height: 2.5,
              borderRadius: 2,
              backgroundColor: theme.pageText,
            }}
          />
          <Text>Net worth change</Text>
        </View>
        {groups.map(group => (
          <View
            key={group.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <ColorSwatch color={colors.get(group.id)} />
            <Text>{group.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type Band = {
  key: string;
  groupId: string;
  /** The side nearest zero */
  base: number[];
  /** The side away from zero, drawn as a line */
  edge: number[];
};

/** A row's month-end balances, less its balance at the baseline */
function changes({ history, balance, changeAmount }: NetWorthRow) {
  const baseline = balance - changeAmount;
  return history.map(value => value - baseline);
}

/**
 * Stacks each group's gains up from zero and its losses down from it, in
 * table order. A group that gains in some months and loses in others gets a
 * band on each side, so bands never cross zero.
 */
function stackChanges({ months, groups }: NetWorthData) {
  const gainTop = months.map(() => 0);
  const lossBottom = months.map(() => 0);
  const bands: Band[] = [];
  for (const group of groups) {
    const groupChanges = changes(group);
    for (const stack of [gainTop, lossBottom]) {
      const isLoss = stack === lossBottom;
      const base = [...stack];
      groupChanges.forEach((value, i) => {
        stack[i] += isLoss ? Math.min(0, value) : Math.max(0, value);
      });
      if (stack.some((value, i) => value !== base[i])) {
        bands.push({
          key: `${group.id}-${isLoss ? 'losses' : 'gains'}`,
          groupId: group.id,
          base,
          edge: [...stack],
        });
      }
    }
  }
  return { bands, highest: gainTop, lowest: lossBottom };
}

/**
 * At most `MAX_X_LABELS` evenly spaced month labels. The year shows on the
 * first label and on each January; ranges past two years label years only.
 */
function pickMonthLabels(months: string[]) {
  if (months.length > 24) {
    const januaries = months
      .map((month, index) => ({ month, index }))
      .filter(({ month }) => month.endsWith('-01'));
    const every = Math.ceil(januaries.length / MAX_X_LABELS);
    return januaries
      .filter((_, i) => i % every === 0)
      .map(({ month, index }) => ({ index, label: monthUtils.getYear(month) }));
  }
  const every = Math.ceil(months.length / MAX_X_LABELS);
  return months
    .map((month, index) => ({ month, index }))
    .filter(({ index }) => index % every === 0)
    .map(({ month, index }) => ({
      index,
      label: monthUtils.format(
        month,
        index === 0 || month.endsWith('-01') ? 'MMM yyyy' : 'MMM',
      ),
    }));
}

function areaPath(
  base: number[],
  edge: number[],
  x: (i: number) => number,
  y: (value: number) => number,
) {
  if (edge.length === 1) {
    // A single month: draw a narrow column so it's visible
    return `M${x(0) - 12},${y(edge[0])}H${x(0) + 12}V${y(base[0])}H${x(0) - 12}Z`;
  }
  const out = edge.map((value, i) => `${x(i)},${y(value)}`);
  const back = base.map((value, i) => `${x(i)},${y(value)}`).reverse();
  return `M${out.join('L')}L${back.join('L')}Z`;
}

function linePath(
  values: number[],
  x: (i: number) => number,
  y: (value: number) => number,
) {
  if (values.length === 1) {
    return `M${x(0) - 12},${y(values[0])}H${x(0) + 12}`;
  }
  return `M${values.map((value, i) => `${x(i)},${y(value)}`).join('L')}`;
}

/** A domain covering `min`..`max` with round tick values. */
function niceScale(min: number, max: number): [number, number, number[]] {
  if (min === max) {
    return [min - 100, max + 100, [min]];
  }
  const roughStep = (max - min) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step =
    [1, 2, 2.5, 5, 10].map(n => n * magnitude).find(n => n >= roughStep) ??
    10 * magnitude;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = niceMin; tick <= niceMax + step / 2; tick += step) {
    ticks.push(Math.round(tick));
  }
  return [niceMin, niceMax, ticks];
}

function formatMonth(month: string) {
  return monthUtils.format(month, 'MMMM yyyy');
}
