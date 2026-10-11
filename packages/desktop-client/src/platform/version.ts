import * as Platform from '@actual-app/core/shared/platform';

export const ACTUAL_VERSION: string = Platform.isPlaywright
  ? '99.9.9'
  : import.meta.env.REACT_APP_REVIEW_ID
    ? '.preview'
    : import.meta.env.REACT_APP_VERSION;
