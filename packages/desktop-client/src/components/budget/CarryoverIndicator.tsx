import React from 'react';
import type { CSSProperties } from 'react';

import { SvgArrowThinRight } from '@actual-app/components/icons/v1';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';

export type CarryoverIndicatorProps = {
  style?: CSSProperties;
  /** Explains what rolls forward; shown as a tooltip when set. */
  label?: string;
};

// By default the arrow hangs just past the right edge of its positioned
// parent, so the balance it sits beside stays aligned with the column.
export function CarryoverIndicator({ style, label }: CarryoverIndicatorProps) {
  const icon = (
    <SvgArrowThinRight
      width={style?.width || 8}
      height={style?.height || 8}
      style={style}
    />
  );

  return (
    <View
      aria-label={label}
      style={{
        position: 'absolute',
        right: -10,
        top: 0,
        bottom: 0,
        width: 10,
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {label ? (
        <Tooltip content={label} placement="top" triggerProps={{ delay: 0 }}>
          {icon}
        </Tooltip>
      ) : (
        icon
      )}
    </View>
  );
}
