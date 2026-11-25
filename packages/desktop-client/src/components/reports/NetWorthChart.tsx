import { Fragment, useState } from 'react';
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
import { balanceChange, netWorthChange, startingBalance } from './netWorth';
import type { NetWorthData, NetWorthRow } from './netWorth';
import { NetWorthLegend } from './NetWorthLegend';
import { PercentChange } from './PercentChange';

const HEIGHT = 276;
const MARGIN = { top: 12, right: 16, bottom: 44, left: 52 };
const MIN_X_LABEL_WIDTH = 54;
const MAX_BAR_WIDTH = 80;
const BAR_WIDTH_RATIO = 0.9;
const BAR_RADIUS = 4;
const TOOLTIP_GAP = 14;
const FADED_OPACITY = 0.2;

const axisFormat = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

type NetWorthChartProps = {
  data: NetWorthData;
  colors: ReadonlyMap<string, string>;
  /** The account groups in the order the legend lists them */
  legendGroups: readonly NetWorthRow[];
};

/**
 * Each month's change in balance, stacked by account group with gains above
 * zero and losses below, and net worth's change as a line.
 * Plotting change rather than balance gives the slope the full height and
 * keeps every group visible, however small next to the total. Percentages
 * along the axis follow net worth, or the legend item being pointed at, which
 * is then the only one with bars.
 */
export function NetWorthChart({
  data,
  colors,
  legendGroups,
}: NetWorthChartProps) {
  const format = useFormat();
  const formatChange = (value: number) =>
    `${value > 0 ? '+' : ''}${format(value, 'financial')}`;
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const containerRef = useResizeObserver<HTMLDivElement>(
    rect => setWidth(rect.width),
    { measureOnAttach: true },
  );

  const { months, groups } = data;
  const totalChanges = changes(data.total);
  // The scale covers every group even while one is focused, so the axis
  // holds still and the bars stay comparable
  const allStacks = stackChanges(months, groups);
  const [yMin, yMax, ticks] = niceScale(
    Math.min(0, ...allStacks.lowest, ...totalChanges),
    Math.max(0, ...allStacks.highest, ...totalChanges),
  );
  const focusedRow = [...groups, data.total].find(row => row.id === focusedId);
  const stacks = focusedRow
    ? stackChanges(
        months,
        groups.filter(group => group === focusedRow),
      )
    : allStacks;
  const percentRow = focusedRow ?? data.total;
  const percentChange =
    percentRow === data.total ? netWorthChange : balanceChange;
  const lineOpacity = percentRow === data.total ? 1 : FADED_OPACITY;

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slotWidth = plotWidth / months.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, slotWidth * BAR_WIDTH_RATIO);
  const x = (i: number) => MARGIN.left + (i + 0.5) * slotWidth;
  const y = (value: number) =>
    MARGIN.top + ((yMax - value) / (yMax - yMin || 1)) * plotHeight;

  const xLabels = pickMonthLabels(months, slotWidth);
  const lastIndex = months.length - 1;

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / (rect.width || 1);
    setHoverIndex(
      Math.min(lastIndex, Math.max(0, Math.floor(ratio * months.length))),
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
            aria-label={`Monthly change in net worth by account group, ${formatMonth(months[0])} to ${formatMonth(months[lastIndex])}`}
            style={{ display: 'block', overflow: 'visible' }}
          >
            {ticks.map(tick => (
              <g key={tick}>
                {tick !== 0 && (
                  <line
                    x1={MARGIN.left}
                    x2={width - MARGIN.right}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke={theme.tableBorder}
                    shapeRendering="crispEdges"
                  />
                )}
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
              <rect
                x={x(hoverIndex) - slotWidth / 2}
                y={MARGIN.top}
                width={slotWidth}
                height={plotHeight}
                fill={theme.tableHeaderText}
                fillOpacity={0.12}
                pointerEvents="none"
              />
            )}

            {stacks.bands.map(band => (
              <g
                key={band.key}
                fill={colors.get(band.groupId)}
                pointerEvents="none"
              >
                {months.map(
                  (month, i) =>
                    band.edge[i] !== band.base[i] && (
                      <path
                        key={month}
                        d={segmentPath({
                          left: x(i) - barWidth / 2,
                          width: barWidth,
                          baseY: y(band.base[i]),
                          edgeY: y(band.edge[i]),
                          isOutermost:
                            band.edge[i] === stacks.highest[i] ||
                            band.edge[i] === stacks.lowest[i],
                        })}
                      />
                    ),
                )}
              </g>
            ))}

            <path
              d={linePath(totalChanges, x, y)}
              fill="none"
              stroke={theme.pageText}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={lineOpacity}
              pointerEvents="none"
            />
            {/* Drawn over the bars and the net worth line so it stays
                visible in flat months, with a halo to set it apart from
                bars of a similar color */}
            <g pointerEvents="none">
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(0)}
                y2={y(0)}
                stroke={theme.tableBackground}
                strokeWidth={5}
              />
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(0)}
                y2={y(0)}
                stroke={theme.numberNegative}
                strokeWidth={2}
              />
            </g>
            <g
              fill={theme.pageText}
              stroke={theme.tableBackground}
              strokeWidth={2}
              opacity={lineOpacity}
              pointerEvents="none"
            >
              {months.map((month, i) => (
                <circle
                  key={month}
                  cx={x(i)}
                  cy={y(totalChanges[i])}
                  r={i === (hoverIndex ?? lastIndex) ? 4.5 : 3}
                />
              ))}
            </g>

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

        {width > 0 &&
          xLabels.map(({ index, endIndex, label }) => {
            const from = startingBalance(percentRow, index);
            const to = percentRow.history[endIndex];
            return (
              <View
                key={months[index]}
                style={{
                  position: 'absolute',
                  top: HEIGHT - MARGIN.bottom + 8,
                  left: x(index),
                  transform: 'translateX(-50%)',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                <Text style={{ color: theme.pageTextSubdued }}>{label}</Text>
                <PercentChange
                  change={percentChange(from, to)}
                  isGood={to > from}
                />
              </View>
            );
          })}

        {hoverIndex != null && (
          <View
            role="tooltip"
            style={{
              position: 'absolute',
              ...(tooltipAtBottom
                ? { bottom: MARGIN.bottom }
                : { top: MARGIN.top }),
              // Slides back inside the chart when there's too little room
              // beside the point; percentages are of the tooltip's own width
              ...(tooltipOnLeft
                ? {
                    right: width - x(hoverIndex) + TOOLTIP_GAP,
                    transform: `translateX(max(0px, 100% - ${x(hoverIndex) - TOOLTIP_GAP}px))`,
                  }
                : {
                    left: x(hoverIndex) + TOOLTIP_GAP,
                    transform: `translateX(min(0px, ${width - x(hoverIndex) - TOOLTIP_GAP}px - 100%))`,
                  }),
              width: 'max-content',
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
              End of {formatMonth(months[hoverIndex])}
            </Text>
            <View
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto auto auto',
                alignItems: 'center',
                columnGap: 8,
                rowGap: 6,
              }}
            >
              <Text
                style={{
                  gridColumn: 3,
                  textAlign: 'right',
                  color: theme.pageTextSubdued,
                }}
              >
                vs.{' '}
                {monthUtils.format(
                  monthUtils.prevMonth(months[hoverIndex]),
                  'MMM',
                )}
              </Text>
              <Text
                style={{
                  textAlign: 'right',
                  paddingLeft: 8,
                  color: theme.pageTextSubdued,
                }}
              >
                Balance
              </Text>
              <Text
                style={{
                  textAlign: 'right',
                  paddingLeft: 8,
                  color: theme.pageTextSubdued,
                }}
              >
                Change
              </Text>
              {groups.map(group => (
                <Fragment key={group.id}>
                  <ColorSwatch color={colors.get(group.id)} size={8} />
                  <Text style={{ color: theme.pageTextSubdued }}>
                    {group.name}
                  </Text>
                  <FinancialText style={{ textAlign: 'right' }}>
                    {formatChange(changes(group)[hoverIndex])}
                  </FinancialText>
                  <FinancialText style={{ textAlign: 'right', paddingLeft: 8 }}>
                    {format(group.history[hoverIndex], 'financial')}
                  </FinancialText>
                  <PercentChange
                    change={balanceChange(
                      startingBalance(group, hoverIndex),
                      group.history[hoverIndex],
                    )}
                    isGood={changes(group)[hoverIndex] > 0}
                    style={{ textAlign: 'right', paddingLeft: 8 }}
                  />
                </Fragment>
              ))}
              <View
                style={{
                  gridColumn: '1 / -1',
                  borderTop: `1px solid ${theme.tooltipBorder}`,
                }}
              />
              <Text style={{ gridColumn: '1 / 3', fontWeight: 600 }}>
                Net worth
              </Text>
              <FinancialText style={{ textAlign: 'right', fontWeight: 600 }}>
                {formatChange(totalChanges[hoverIndex])}
              </FinancialText>
              <FinancialText
                style={{ textAlign: 'right', paddingLeft: 8, fontWeight: 600 }}
              >
                {format(data.total.history[hoverIndex], 'financial')}
              </FinancialText>
              <PercentChange
                change={netWorthChange(
                  startingBalance(data.total, hoverIndex),
                  data.total.history[hoverIndex],
                )}
                isGood={totalChanges[hoverIndex] > 0}
                style={{ textAlign: 'right', paddingLeft: 8, fontWeight: 600 }}
              />
            </View>
          </View>
        )}
      </View>
      <View style={{ paddingLeft: MARGIN.left - 10 }}>
        <NetWorthLegend
          groups={legendGroups}
          total={data.total}
          colors={colors}
          onFocusItem={setFocusedId}
        />
      </View>
    </View>
  );
}

type Band = {
  key: string;
  groupId: string;
  /** The side nearest zero */
  base: number[];
  /** The side away from zero */
  edge: number[];
};

/**
 * How much a row's balance moved in each month: from the previous month-end,
 * or from the baseline for the first month
 */
function changes(row: NetWorthRow) {
  return row.history.map((value, i) => value - startingBalance(row, i));
}

/**
 * Stacks each group's gains up from zero and its losses down from it, in
 * the order given. A group that gains in some months and loses in others gets a
 * band on each side, so segments never cross zero.
 */
function stackChanges(
  months: readonly string[],
  groups: readonly NetWorthRow[],
) {
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

type XLabel = {
  /** The month the label sits under, the first one it covers */
  index: number;
  /** The last month it covers */
  endIndex: number;
  label: string;
};

/**
 * Evenly spaced month labels, as many as fit. The year shows on the first
 * label and on each January; ranges past two years label years only.
 */
function pickMonthLabels(months: string[], slotWidth: number): XLabel[] {
  if (months.length > 24) {
    const every = Math.ceil(MIN_X_LABEL_WIDTH / (slotWidth * 12));
    return months
      .map((month, index) => ({ month, index }))
      .filter(({ month }) => month.endsWith('-01'))
      .filter((_, i) => i % every === 0)
      .map(({ month, index }) => ({
        index,
        endIndex: Math.min(index + 11, months.length - 1),
        label: monthUtils.getYear(month),
      }));
  }
  const every = Math.ceil(MIN_X_LABEL_WIDTH / slotWidth);
  return months
    .map((month, index) => ({ month, index }))
    .filter(({ index }) => index % every === 0)
    .map(({ month, index }) => ({
      index,
      endIndex: index,
      label: monthUtils.format(
        month,
        index === 0 || month.endsWith('-01') ? 'MMM yyyy' : 'MMM',
      ),
    }));
}

/**
 * A bar segment's outline. Only the end of a stack is rounded, so segments
 * butt up against each other; a sliver keeps a visible height.
 */
function segmentPath({
  left,
  width,
  baseY,
  edgeY,
  isOutermost,
}: {
  left: number;
  width: number;
  baseY: number;
  edgeY: number;
  isOutermost: boolean;
}) {
  const direction = edgeY < baseY ? -1 : 1;
  const height = Math.max(1, Math.abs(edgeY - baseY));
  const end = baseY + direction * height;
  const right = left + width;
  const radius = isOutermost ? Math.min(BAR_RADIUS, width / 2, height) : 0;
  const shoulder = end - direction * radius;
  return [
    `M${left},${baseY}`,
    `V${shoulder}`,
    `Q${left},${end} ${left + radius},${end}`,
    `H${right - radius}`,
    `Q${right},${end} ${right},${shoulder}`,
    `V${baseY}Z`,
  ].join('');
}

function linePath(
  values: number[],
  x: (i: number) => number,
  y: (value: number) => number,
) {
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
