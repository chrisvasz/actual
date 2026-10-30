import { View } from '@actual-app/components/view';

type ColorSwatchProps = {
  color: string | undefined;
  size?: number;
};

/** A small square of an account group's chart color. */
export function ColorSwatch({ color, size = 10 }: ColorSwatchProps) {
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 2,
        flexShrink: 0,
        backgroundColor: color,
      }}
    />
  );
}
