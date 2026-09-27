import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { NavigateFunction } from 'react-router';

import { useNavigate } from './useNavigate';

const StableNavigateContext = createContext<NavigateFunction | null>(null);

/**
 * Provides `useStableNavigate`. This component re-renders on every navigation
 * (through `useNavigate`), but its children are passed in and bail out, and
 * the function it provides never changes.
 */
export function StableNavigateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const latestNavigate = useRef(navigate);
  useLayoutEffect(() => {
    latestNavigate.current = navigate;
  });
  const [stableNavigate] = useState<NavigateFunction>(
    () =>
      ((to, options) =>
        latestNavigate.current(to as never, options)) as NavigateFunction,
  );

  return (
    <StableNavigateContext.Provider value={stableNavigate}>
      {children}
    </StableNavigateContext.Provider>
  );
}

/**
 * `useNavigate` without the location subscription: the returned function is
 * the same across navigations and calling this hook does not re-render on
 * route changes. `useNavigate` re-renders its caller on every navigation and
 * returns a new function each time, which a component that renders a large
 * tree (and hands navigation callbacks down it) can't afford.
 */
export function useStableNavigate(): NavigateFunction {
  const navigate = useContext(StableNavigateContext);
  if (!navigate) {
    throw new Error(
      'useStableNavigate must be used within a StableNavigateProvider',
    );
  }
  return navigate;
}
