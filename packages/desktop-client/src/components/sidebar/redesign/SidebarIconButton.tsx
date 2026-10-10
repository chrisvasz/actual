import type { ComponentProps, ComponentType, SVGProps } from 'react';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { radius } from '@actual-app/components/tokens';
import { css } from '@emotion/css';

type SidebarIconButtonProps = {
  Icon:
    | ComponentType<SVGProps<SVGElement>>
    | ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onPress: ComponentProps<typeof Button>['onPress'];
};

export function SidebarIconButton({
  Icon,
  label,
  onPress,
}: SidebarIconButtonProps) {
  return (
    <Button
      variant="bare"
      aria-label={label}
      onPress={onPress}
      className={css({
        color: theme.sidebarTextSubdued,
        backgroundColor: 'transparent',
        '&[data-hovered], &[data-focus-visible]': {
          backgroundColor: theme.sidebarControlBackground,
          color: theme.sidebarItemTextSelected,
        },
      })}
      style={{
        width: 18,
        height: 18,
        padding: 0,
        borderRadius: radius.sm,
      }}
    >
      <Icon width={12} height={12} style={{ flexShrink: 0 }} />
    </Button>
  );
}
