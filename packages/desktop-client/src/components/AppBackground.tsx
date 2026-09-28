import React from 'react';
import { animated, useTransition } from 'react-spring';

import { Block } from '@actual-app/components/block';
import { AnimatedLoading } from '@actual-app/components/icons/AnimatedLoading';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { useSelector } from '#redux';

import { Background } from './Background';

type AppBackgroundProps = {
  isLoading?: boolean;
};

export function AppBackground({ isLoading }: AppBackgroundProps) {
  const loadingText = useSelector(state => state.app.loadingText);
  const showLoading = isLoading || loadingText !== null;
  // Transition on whether we're loading, not on the text itself, so the
  // loader stays put while startup steps update the message in place.
  const transitions = useTransition(showLoading, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
  });

  return (
    <>
      <Background />

      {transitions(
        (style, isShown) =>
          isShown && (
            <animated.div style={style}>
              <View
                className={css({
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  padding: 50,
                  paddingTop: 200,
                  color: theme.pageText,
                  alignItems: 'center',
                })}
              >
                <Block
                  style={{
                    marginBottom: 20,
                    fontSize: 18,
                    lineHeight: '24px',
                    minHeight: 24,
                  }}
                >
                  {loadingText}
                </Block>
                <AnimatedLoading width={25} color={theme.pageText} />
              </View>
            </animated.div>
          ),
      )}
    </>
  );
}
