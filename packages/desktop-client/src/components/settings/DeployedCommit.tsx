import React from 'react';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';

import { Link } from '#components/common/Link';

import { Setting } from './UI';

const COMMITS_URL = 'https://github.com/chrisvasz/actual/commits/master/';

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
        <strong>Deployed commit</strong> is the revision of Actual this instance
        was built from.
      </Text>
      <Text style={{ color: theme.pageText }} data-vrt-mask>
        <Link variant="external" to={COMMITS_URL} linkColor="purple">
          <span style={styles.tnum}>{commitSha.slice(0, 7)}</span>
        </Link>
      </Text>
    </Setting>
  );
}
