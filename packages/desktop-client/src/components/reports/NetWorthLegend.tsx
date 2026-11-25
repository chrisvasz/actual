import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { ColorSwatch } from './ColorSwatch';
import type { NetWorthRow } from './netWorth';

type NetWorthLegendProps = {
  groups: readonly NetWorthRow[];
  total: NetWorthRow;
  colors: ReadonlyMap<string, string>;
  /** Called with an item's id when it's pointed at, and null once it isn't */
  onFocusItem: (id: string | null) => void;
};

/** Names the chart's bars and line, and reports the item being pointed at. */
export function NetWorthLegend({
  groups,
  total,
  colors,
  onFocusItem,
}: NetWorthLegendProps) {
  return (
    <View
      role="group"
      aria-label="Chart legend"
      data-testid="net-worth-legend"
      style={{ flexDirection: 'row', flexWrap: 'wrap' }}
    >
      {[...groups, total].map(row => (
        <button
          key={row.id}
          type="button"
          onMouseEnter={() => onFocusItem(row.id)}
          onMouseLeave={() => onFocusItem(null)}
          onFocus={() => onFocusItem(row.id)}
          onBlur={() => onFocusItem(null)}
          className={css({
            all: 'unset',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 13,
            cursor: 'default',
            ':hover, :focus-visible': {
              backgroundColor: theme.tableRowBackgroundHover,
            },
            ':focus-visible': {
              outline: `2px solid ${theme.tableBorderSelected}`,
            },
          })}
        >
          {row === total ? (
            <View
              aria-hidden
              style={{
                width: 14,
                height: 3,
                borderRadius: 2,
                flexShrink: 0,
                backgroundColor: theme.pageText,
              }}
            />
          ) : (
            <ColorSwatch color={colors.get(row.id)} />
          )}
          <Text>{row.name}</Text>
        </button>
      ))}
    </View>
  );
}
