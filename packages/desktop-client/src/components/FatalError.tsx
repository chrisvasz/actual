import React, { useState } from 'react';
import type { ReactNode } from 'react';

import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { Paragraph } from '@actual-app/components/paragraph';
import { SpaceBetween } from '@actual-app/components/space-between';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { LazyLoadFailedError } from '@actual-app/core/shared/errors';

import { useModalState } from '#hooks/useModalState';

import { DirectoryDisplay } from './common/DirectoryDisplay';
import { Link } from './common/Link';
import { Modal, ModalHeader } from './common/Modal';

const DATA_FOLDER_DOCS_URL =
  'https://actualbudget.org/docs/troubleshooting/data-folder-access';

// Filesystem error codes that mean "the OS refused access" rather than "the
// location is missing or invalid".
const ACCESS_DENIED_CODES = ['EPERM', 'EACCES'];

type AppError = Error & {
  type?: string;
  IDBFailure?: boolean;
  BackendInitFailure?: boolean;
  AlreadyOpenInAnotherTab?: boolean;
  InsecureContext?: boolean;
  DocumentDirFailure?: boolean;
  path?: string;
  code?: string;
};

type FatalErrorProps = {
  error: unknown;
};

type RenderSimpleProps = {
  error: Error | AppError;
};

function RenderSimple({ error }: RenderSimpleProps) {
  let msg: ReactNode;

  if ('IDBFailure' in error && error.IDBFailure) {
    // IndexedDB wasn't able to open the database
    msg = (
      <Text>
        Your browser doesn't support IndexedDB in this environment, a feature
        that Actual requires to run. This might happen if you are in private
        browsing mode. Please try a different browser or turn off private
        browsing.
      </Text>
    );
  } else if ('InsecureContext' in error && error.InsecureContext) {
    msg = (
      <Text>
        Actual needs a secure connection to store your budgets in this browser.
        Open it over HTTPS (or from localhost), for example by putting your
        server behind a reverse proxy with a certificate.
      </Text>
    );
  } else if (
    'AlreadyOpenInAnotherTab' in error &&
    error.AlreadyOpenInAnotherTab
  ) {
    msg = (
      <Text>
        Actual is already open in another tab. Close it and reload this page to
        use Actual here.
      </Text>
    );
  } else if ('BackendInitFailure' in error && error.BackendInitFailure) {
    msg = (
      <Text>
        Actual couldn't load a critical backend worker. Reload the page to try
        again; if the problem persists, do a hard refresh to clear any stale
        cached assets.
      </Text>
    );
  } else {
    msg = (
      <Text>There was a problem loading the app in this browser version.</Text>
    );
  }

  return (
    <SpaceBetween
      direction="vertical"
      style={{
        paddingBottom: 15,
        lineHeight: '1.5em',
        fontSize: 15,
      }}
    >
      <Text>{msg}</Text>
    </SpaceBetween>
  );
}

type RenderDocumentDirErrorProps = {
  path?: string;
  code?: string;
};

function RenderDocumentDirError({ path, code }: RenderDocumentDirErrorProps) {
  const isAccessDenied = code ? ACCESS_DENIED_CODES.includes(code) : false;

  return (
    <SpaceBetween
      direction="vertical"
      style={{
        paddingBottom: 15,
        lineHeight: '1.5em',
        fontSize: 15,
      }}
    >
      <Text>
        Actual couldn't access the folder where it stores your budget files:
      </Text>
      {path && <DirectoryDisplay directory={path} />}
      {isAccessDenied ? (
        <Text>
          Access to this folder was denied. This is usually caused by folder
          permissions, or by security software (such as ransomware protection or
          antivirus) blocking Actual. Allow Actual to use this folder, or choose
          a different folder below.
        </Text>
      ) : (
        <Text>
          {code ? <>The system reported the error code {code}. </> : null}
          Check that this location exists and that Actual is allowed to write to
          it, or choose a different folder below.
        </Text>
      )}
      <Text>
        See{' '}
        <Link variant="external" linkColor="muted" to={DATA_FOLDER_DOCS_URL}>
          our troubleshooting documentation
        </Link>{' '}
        for step-by-step instructions.
      </Text>
    </SpaceBetween>
  );
}

function RenderLazyLoadError() {
  return (
    <SpaceBetween
      direction="vertical"
      style={{
        paddingBottom: 15,
        lineHeight: '1.5em',
        fontSize: 15,
      }}
    >
      <Text>
        There was a problem loading one of the chunks of the application. Please
        reload the page and try again. If the issue persists - there might be an
        issue with either your internet connection and/or the server where the
        app is hosted.
      </Text>
    </SpaceBetween>
  );
}

function RenderUIError() {
  return (
    <>
      <Paragraph>There was an unrecoverable error in the UI. Sorry!</Paragraph>
      <Paragraph>
        If this error persists, please get{' '}
        <Link variant="external" to="https://actualbudget.org/contact">
          in touch
        </Link>{' '}
        so it can be investigated.
      </Paragraph>
    </>
  );
}

export function FatalError({ error: rawError }: FatalErrorProps) {
  const { modalStack } = useModalState();
  const lastModal = modalStack[modalStack.length - 1];

  const [showError, setShowError] = useState(false);

  const error: Error | AppError =
    rawError instanceof Error
      ? rawError
      : rawError && typeof rawError === 'object'
        ? // Plain message objects (e.g. app-init-failure payloads) stringify
          // to "[object Object]" — keep the real fields so bug reports carry
          // the actual cause.
          Object.assign(new Error(JSON.stringify(rawError)), rawError)
        : new Error(String(rawError));
  const isAppInitFailure = 'type' in error && error.type === 'app-init-failure';
  const isDocumentDirError =
    isAppInitFailure &&
    'DocumentDirFailure' in error &&
    Boolean(error.DocumentDirFailure);
  const documentDirPath =
    'path' in error && typeof error.path === 'string' ? error.path : undefined;
  const documentDirCode =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;
  const isLazyLoadError = error instanceof LazyLoadFailedError;

  let title = 'Fatal Error';
  if (isLazyLoadError) {
    title = 'Loading Error';
  } else if (isDocumentDirError) {
    title = 'Data folder unavailable';
  } else if (
    'AlreadyOpenInAnotherTab' in error &&
    error.AlreadyOpenInAnotherTab
  ) {
    title = 'Already open in another tab';
  } else if ('InsecureContext' in error && error.InsecureContext) {
    title = 'Secure connection required';
  }

  return (
    <Modal name={lastModal?.name ?? 'fatal-error'} isDismissable={false}>
      <ModalHeader title={title} />
      <View
        style={{
          maxWidth: 500,
        }}
      >
        {isLazyLoadError ? (
          <RenderLazyLoadError />
        ) : isDocumentDirError ? (
          <RenderDocumentDirError
            path={documentDirPath}
            code={documentDirCode}
          />
        ) : isAppInitFailure ? (
          <RenderSimple error={error} />
        ) : (
          <RenderUIError />
        )}

        <Paragraph>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button onPress={() => window.Actual.relaunch()}>
              Restart app
            </Button>
          </View>
        </Paragraph>
        <Paragraph isLast style={{ fontSize: 11 }}>
          <Link variant="text" onClick={() => setShowError(state => !state)}>
            Show Error
          </Link>
          {showError && (
            <Block
              style={{
                marginTop: 5,
                height: 100,
                overflow: 'auto',
              }}
            >
              {error.stack}
            </Block>
          )}
        </Paragraph>
      </View>
    </Modal>
  );
}
