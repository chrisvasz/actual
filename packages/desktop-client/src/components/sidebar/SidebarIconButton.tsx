import type { ComponentProps, ComponentType, SVGProps } from 'react';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { radius } from '@actual-app/components/tokens';
import { css } from '@emotion/css';

import { aboveStretchedLinkStyle } from './styles';

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
        ...aboveStretchedLinkStyle,
        color: theme.sidebarTextSubdued,
        backgroundColor: 'transparent',
        '&[data-hovered], &[data-focus-visible]': {
          backgroundColor: 'transparent',
          color: theme.sidebarItemTextSelected,
        },
        '&[data-focus-visible]': {
          boxShadow: `inset 0 0 0 1px ${theme.sidebarItemAccentSelected}`,
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
