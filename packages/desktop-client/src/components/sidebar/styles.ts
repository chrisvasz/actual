import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { radius } from '@actual-app/components/tokens';

export const sectionLabelStyle = {
  fontSize: 13,
  fontWeight: 600,
} satisfies CSSProperties;

export const groupLabelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: theme.sidebarTextSubdued,
} satisfies CSSProperties;

export const dropZoneStyle = {
  backgroundColor: theme.sidebarItemBackgroundHover,
  boxShadow: `inset 0 0 0 1px ${theme.sidebarItemAccentSelected}`,
  borderRadius: radius.sm,
} satisfies CSSProperties;

// Stretches a link's click target over its nearest positioned ancestor (the
// whole row), so the clickable area matches the row's hover background.
export const stretchedLinkStyle = {
  '::after': {
    content: '""',
    position: 'absolute' as const,
    inset: 0,
  },
} satisfies CSSProperties;

// Keeps controls inside a row clickable above a stretched link's overlay.
export const aboveStretchedLinkStyle = {
  position: 'relative' as const,
  zIndex: 1,
} satisfies CSSProperties;
