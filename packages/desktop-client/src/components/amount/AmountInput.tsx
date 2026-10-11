import { memo, useEffect, useState } from 'react';
import type { CSSProperties, FocusEvent, RefObject } from 'react';

import { styles } from '@actual-app/components/styles';
import * as Platform from '@actual-app/core/shared/platform';

import { FocusableAmountInput } from './FocusableAmountInput';

export type AmountInputProps = {
  value: number;
  variant?: 'normal' | 'large';
  negate?: boolean;
  style?: CSSProperties;
  inputRef?: RefObject<HTMLInputElement | null>;
  onEnter?: () => void;
  onChange?: (value: number) => void;
  onFocus?: (event?: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  disableNativeAutoFocusOnIOS?: boolean;
};

export const AmountInput = memo(function AmountInput({
  autoFocus = false,
  disableNativeAutoFocusOnIOS = false,
  disabled,
  inputRef,
  negate = false,
  onBlur,
  onChange,
  onEnter,
  onFocus,
  value,
  variant = 'normal',
  ...props
}: AmountInputProps) {
  const fallbackAutoFocus =
    autoFocus && !(disableNativeAutoFocusOnIOS && Platform.isIOSAgent);
  const [focused, setFocused] = useState(fallbackAutoFocus);

  useEffect(() => {
    if (fallbackAutoFocus) {
      setFocused(true);
    }
  }, [fallbackAutoFocus]);

  return (
    <FocusableAmountInput
      {...props}
      disabled={disabled}
      focused={focused}
      inputRef={inputRef}
      onBlur={event => {
        setFocused(false);
        onBlur?.(event);
      }}
      onEnter={() => onEnter?.()}
      onFocus={event => {
        setFocused(true);
        onFocus?.(event);
      }}
      onUpdateAmount={onChange}
      sign={value === 0 ? undefined : value < 0 ? '-' : '+'}
      focusedStyle={
        variant === 'large'
          ? {
              width: 'auto',
              padding: '5px',
              paddingLeft: '20px',
              paddingRight: '20px',
              minWidth: '100%',
            }
          : undefined
      }
      style={props.style}
      textStyle={
        variant === 'large'
          ? { ...styles.veryLargeText, textAlign: 'center' }
          : undefined
      }
      value={value}
      zeroSign={negate ? '-' : '+'}
    />
  );
});
