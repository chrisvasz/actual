import { View } from '@actual-app/components/view';

import { ReportRouter } from './ReportRouter';

export function Reports() {
  return (
    <View style={{ flex: 1 }} data-testid="reports-page">
      <ReportRouter />
    </View>
  );
}
