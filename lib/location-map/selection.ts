export function toggleMapSelection(
  selectedLabels: string[],
  label: string,
  additive: boolean,
): string[] {
  if (!additive) return [label];

  return selectedLabels.includes(label)
    ? selectedLabels.filter((selectedLabel) => selectedLabel !== label)
    : [...selectedLabels, label];
}

