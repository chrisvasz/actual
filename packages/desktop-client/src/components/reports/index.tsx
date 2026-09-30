import { useTranslation } from 'react-i18next';

import { View } from '@actual-app/components/view';

import { LoadComponent } from '#components/util/LoadComponent';

// A module-level importer, so `LoadComponent` renders the router straight away
// on later visits instead of loading it again.
const loadReportRouter = () =>
  import(/* webpackChunkName: 'reports' */ './ReportRouter');

export function Reports() {
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1 }} data-testid="reports-page">
      <LoadComponent
        name="ReportRouter"
        message={t('Loading reports...')}
        importer={loadReportRouter}
      />
    </View>
  );
}
