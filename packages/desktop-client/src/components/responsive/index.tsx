import { LoadComponent } from '#components/util/LoadComponent';

import type * as WideComponents from './wide';

const loadWide = () =>
  import(/* webpackChunkName: "wide-components" */ './wide');

export function WideComponent({ name }: { name: keyof typeof WideComponents }) {
  return <LoadComponent name={name} importer={loadWide} />;
}
