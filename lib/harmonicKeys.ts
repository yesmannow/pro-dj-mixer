export const getCompatibleKeys = (currentKey: string): string[] => {
  const match = currentKey.match(/^(\d+)([AB])$/);
  if (!match) return [];

  const hour = parseInt(match[1]);
  const letter = match[2];

  // 1. Same Key
  const compatible = [currentKey];

  // 2. +/- 1 Hour (Adjacent on the wheel)
  const plusOne = hour === 12 ? 1 : hour + 1;
  const minusOne = hour === 1 ? 12 : hour - 1;
  compatible.push(`${plusOne}${letter}`, `${minusOne}${letter}`);

  // 3. Relative Major/Minor (A <-> B toggle)
  const relative = letter === 'A' ? 'B' : 'A';
  compatible.push(`${hour}${relative}`);

  return compatible;
};
