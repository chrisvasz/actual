import React from 'react';

import { Button } from '@actual-app/components/button';
import { SpaceBetween } from '@actual-app/components/space-between';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

type SaveReportDeleteProps = {
  onDelete: () => void;
  onClose: () => void;
  name: string;
};

export function SaveReportDelete({
  onDelete,
  onClose,
  name,
}: SaveReportDeleteProps) {
  return (
    <>
      <View style={{ align: 'center' }}>
        <Text style={{ color: theme.errorText, marginBottom: 5 }}>
          Are you sure you want to delete the report named{" '"}
          <Text style={{ display: 'inline' }}>{name}</Text>
          '?
        </Text>
      </View>

      <SpaceBetween
        style={{
          marginTop: 15,
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1 }} />
        <Button variant="primary" autoFocus onPress={onDelete}>
          Yes
        </Button>
        <Button variant="primary" onPress={onClose}>
          No
        </Button>
      </SpaceBetween>
    </>
  );
}
