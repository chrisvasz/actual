import { send } from '@actual-app/core/platform/client/connection';
import type { PayeeEntity } from '@actual-app/core/types/models';

import { useReportErrors } from '#hooks/useReportErrors';

export function useCreatePayee() {
  return useReportErrors(
    'There was an error creating the payee. Please try again.',
    ({ name }: Pick<PayeeEntity, 'name'>): Promise<PayeeEntity['id']> =>
      send('payee-create', { name: name.trim() }),
  );
}
