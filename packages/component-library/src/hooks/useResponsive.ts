import { useWindowSize } from 'usehooks-ts';

import { breakpoints } from '#tokens';

export function useResponsive() {
  const { height, width } = useWindowSize({
    debounceDelay: 250,
  });

  // Possible view modes: small, medium, wide
  //
  // This fork ships no mobile UI, so `isNarrowWidth` is always false and the
  // narrow branches it guards are dead. It is kept as a field (rather than
  // removed) so the ~70 call sites that read it keep compiling; `isSmallWidth`
  // absorbs the old narrow range so exactly one mode is always true.
  return {
    // atLeastMediumWidth is provided to avoid checking (isMediumWidth || isWideWidth)
    atLeastMediumWidth: width >= breakpoints.medium,
    isNarrowWidth: false,
    isSmallWidth: width < breakpoints.medium,
    isMediumWidth: width >= breakpoints.medium && width < breakpoints.wide,
    // No atLeastWideWidth because that's identical to isWideWidth
    isWideWidth: width >= breakpoints.wide,
    height,
    width,
  };
}
