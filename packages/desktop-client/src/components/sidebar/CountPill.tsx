import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { radius, spacing } from '@actual-app/components/tokens';

type CountPillProps = {
  count: number;
  isSelected?: boolean;
};

export function CountPill({ count, isSelected = false }: CountPillProps) {
  const color = isSelected
    ? theme.sidebarItemTextSelected
    : theme.sidebarTextMuted;

  return (
    <Text
      style={{
        fontSize: 10,
        fontWeight: 600,
        paddingInline: spacing.xs,
        borderRadius: radius.pill,
        // A translucent tint of the text color reads on the plain, hovered,
        // and selected row backgrounds alike.
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        flexShrink: 0,
      }}
    >
      {count}
    </Text>
  );
}
