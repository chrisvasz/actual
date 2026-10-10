import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheckCircle1,
  SvgCheckCircleHollow,
} from '@actual-app/components/icons/v2';
import { theme } from '@actual-app/components/theme';
import { css } from '@emotion/css';

import { useSidebarBalanceMode } from './useSidebarBalanceMode';

type BalanceModeToggleProps = {
  className?: string;
};

export function BalanceModeToggle({ className }: BalanceModeToggleProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useSidebarBalanceMode();
  const isCleared = mode === 'cleared';
  const iconColor = isCleared
    ? theme.noticeTextLight
    : theme.sidebarTextSubdued;

  const label = isCleared
    ? t('Summing cleared transactions. Switch to all')
    : t('Summing all transactions. Switch to cleared only');

  return (
    <Button
      variant="bare"
      aria-label={label}
      onPress={() => setMode(isCleared ? 'all' : 'cleared')}
      className={`${className ?? ''} ${css({
        color: iconColor,
        backgroundColor: 'transparent',
        border: '1px solid transparent',
        '&[data-hovered], &[data-pressed]': {
          color: iconColor,
          backgroundColor: 'transparent',
        },
        // Same focus ring as the status cell on the account page.
        '&[data-focus-visible]': {
          border: '1px solid ' + theme.formInputBorderSelected,
          boxShadow: '0 1px 2px ' + theme.formInputBorderSelected,
        },
      })}`}
      style={{
        padding: 1,
        flexShrink: 0,
        borderRadius: 50,
        cursor: 'pointer',
      }}
    >
      {isCleared ? (
        <SvgCheckCircle1 width={13} height={13} />
      ) : (
        <SvgCheckCircleHollow width={13} height={13} />
      )}
    </Button>
  );
}
