import React, { useEffect, useRef, useState } from 'react';
import { Form } from 'react-aria-components';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { GenericInput } from '#components/util/GenericInput';

type SaveReportChooseProps = {
  onApply: (cond: string) => void;
};

export function SaveReportChoose({ onApply }: SaveReportChooseProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <>
      <Form
        onSubmit={e => {
          e.preventDefault();

          if (!value) {
            setErr('Invalid report entered');
            return;
          }

          onApply(value);
        }}
      >
        <View style={{ flexDirection: 'row', align: 'center' }}>
          <Text style={{ userSelect: 'none', flex: 1 }}>Choose Report</Text>
          <View style={{ flex: 1 }} />
        </View>
        <GenericInput
          ref={inputRef}
          field="report"
          type="saved"
          value={value}
          style={{ marginTop: 10 }}
          onChange={setValue}
        />

        <View
          style={{
            marginTop: 15,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <Button variant="primary" type="submit">
            Apply
          </Button>
        </View>
      </Form>
      {err !== '' ? (
        <View style={{ padding: 10, alignItems: 'center' }}>
          <Text style={{ color: theme.errorText }}>{err}</Text>
        </View>
      ) : (
        <View />
      )}
    </>
  );
}
