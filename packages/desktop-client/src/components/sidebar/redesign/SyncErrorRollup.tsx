import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { radius, spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';

type SyncErrorRollupProps = {
  count: number;
};

export function SyncErrorRollup({ count }: SyncErrorRollupProps) {
  if (count === 0) {
    return null;
  }

  return (
    <View
      title={
        count === 1
          ? '1 account needs attention'
          : `${count} accounts need attention`
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingInline: spacing.xs,
        borderRadius: radius.pill,
        backgroundColor: theme.sidebarBackgroundFailedSubtle,
        flexShrink: 0,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: radius.pill,
          backgroundColor: theme.sidebarItemBackgroundFailed,
        }}
      />
      <Text
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: theme.sidebarTextFailed,
        }}
      >
        {count}
      </Text>
    </View>
  );
}
