export function getColorScale(name: string): string[] {
  const scales: Record<string, string[]> = {
    qualitative: [
      'var(--color-chartQual1)', // Dark Teal
      'var(--color-chartQual2)', // Yellow
      'var(--color-chartQual3)', // Orange
      'var(--color-chartQual4)', // Light Red
      'var(--color-chartQual5)', // Blue
      'var(--color-chartQual6)', // Peach
      'var(--color-chartQual7)', // Light Teal
      'var(--color-chartQual8)', // Light Yellow
      'var(--color-chartQual9)', // Light Red
    ],
  };
  return name ? scales[name] : scales.qualitative;
}
