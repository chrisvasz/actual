import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { MonthPicker } from '@actual-app/components/month-picker';

import {
  hideNativeDateIconClassName,
  InputField,
} from '#components/common/FormFields';
import { useLanguage } from '#hooks/useLocale';

type MonthInputProps = {
  id: string;
  value: string;
  onChange: (month: string) => void;
};

// mobile keeps the native month input; desktop uses the custom month picker
export function MonthInput({ id, value, onChange }: MonthInputProps) {
  const language = useLanguage();
  const { isNarrowWidth } = useResponsive();
  if (isNarrowWidth) {
    return (
      <InputField
        id={id}
        type="month"
        value={value}
        onChange={event => onChange(event.target.value)}
        className={hideNativeDateIconClassName}
        style={{
          width: '100%',
          marginLeft: 0,
          marginRight: 0,
          boxSizing: 'border-box',
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
      />
    );
  }
  return (
    <MonthPicker
      id={id}
      value={value}
      locale={language}
      placeholder="Select month"
      labels={{ previous: 'Previous', next: 'Next' }}
      onChange={onChange}
    />
  );
}
