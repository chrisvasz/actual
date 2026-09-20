import React from 'react';
import { Trans } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';

import { Link } from '#components/common/Link';

import { Setting } from './UI';

const REPOSITORY_URL = 'https://github.com/chrisvasz/actual';

// Baked in at build time by vite.config.mts; empty when the build had no
// commit to report (for example a tarball checkout with no git history).
const commitSha: string = import.meta.env.REACT_APP_COMMIT_SHA ?? '';

export function DeployedCommit() {
  if (!commitSha) {
    return null;
  }

  return (
    <Setting>
      <Text>
        <Trans>
          <strong>Deployed commit</strong> is the revision of Actual this
          instance was built from.
        </Trans>
      </Text>
      <Text style={{ color: theme.pageText }} data-vrt-mask>
        <Link
          variant="external"
          to={`${REPOSITORY_URL}/commit/${commitSha}`}
          linkColor="purple"
        >
          <span style={styles.tnum}>{commitSha.slice(0, 7)}</span>
        </Link>
      </Text>
    </Setting>
  );
}
