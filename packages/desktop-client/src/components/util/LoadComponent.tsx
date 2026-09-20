import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

import { Block } from '@actual-app/components/block';
import { AnimatedLoading } from '@actual-app/components/icons/AnimatedLoading';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { LazyLoadFailedError } from '@actual-app/core/shared/errors';
import { retry as promiseRetry } from '@actual-app/core/shared/retry';

type ProplessComponent = ComponentType<Record<string, never>>;
type Importer = () => Promise<Record<string, ProplessComponent>>;
type LoadComponentProps<K extends string> = {
  name: K;
  message?: string;
  importer: () => Promise<{ [key in K]: ProplessComponent }>;
};

// Modules already pulled in by a previous render, so a component whose chunk is
// already in the module registry can be rendered on the very first render
// instead of blanking the page for a frame. Keyed by importer identity, so only
// module-level constant importers get a hit — importers defined inline inside a
// render (e.g. the reports pages) simply never hit the cache.
const moduleCache = new Map<Importer, Record<string, ProplessComponent>>();

export function LoadComponent<K extends string>(props: LoadComponentProps<K>) {
  // need to set `key` so the component is reloaded when the name changes
  // otherwise the old component will be rendered while the new one is being loaded
  return <LoadComponentInner key={props.name} {...props} />;
}

function LoadComponentInner<K extends string>({
  name,
  message,
  importer,
}: LoadComponentProps<K>) {
  // Lazy initializer: runs during the first render (before paint), so an
  // already-loaded module renders synchronously with no blank frame.
  const [Component, setComponent] = useState<ProplessComponent | null>(
    () => moduleCache.get(importer)?.[name] ?? null,
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const cached = moduleCache.get(importer);
    if (cached) {
      // Covers `importer` changing without a remount (e.g. resizing across the
      // narrow/wide breakpoint keeps `name`, so there is no key change). When
      // nothing changed this sets the same value and React bails out.
      setComponent(() => cached[name]);
      return;
    }

    let isUnmounted = false;
    setError(null);
    setComponent(null);

    // Load the module; if it fails - retry with exponential backoff
    promiseRetry(
      retry =>
        importer()
          .then(module => {
            moduleCache.set(importer, module);
            // Handle possibly being unmounted while retrying.
            if (!isUnmounted) {
              setComponent(() => module[name]);
            }
          })
          .catch(retry),
      {
        retries: 5,
      },
    ).catch(e => {
      if (!isUnmounted) {
        setError(e);
      }
    });

    return () => {
      isUnmounted = true;
    };
  }, [name, importer]);

  if (error) {
    throw new LazyLoadFailedError(name, error);
  }

  if (!Component) {
    return (
      <View
        style={{
          flex: 1,
          gap: 20,
          justifyContent: 'center',
          alignItems: 'center',
          ...styles.delayedFadeIn,
        }}
      >
        {message && (
          <Block style={{ marginBottom: 20, fontSize: 18 }}>{message}</Block>
        )}
        <AnimatedLoading width={25} color={theme.pageTextDark} />
      </View>
    );
  }

  return <Component />;
}
