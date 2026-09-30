import * as WideComponents from './wide';

export function WideComponent({ name }: { name: keyof typeof WideComponents }) {
  const Component = WideComponents[name];
  return <Component />;
}
