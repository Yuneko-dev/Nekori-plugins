import {
  Filters,
  FilterToValues,
  FilterTypes,
  isFilterValue,
  ValueOfFilter,
} from '../types/filters';

export const getValueFor = <T extends FilterTypes>(
  filter: Filters[string],
  value: FilterToValues<Filters>[string],
): ValueOfFilter<T> =>
  (isFilterValue(value, filter.type)
    ? value.value
    : filter.value) as ValueOfFilter<T>;

/** Split pasted/submitted MultiText input on newlines only so commas stay literal. */
export const addMultiTextValues = (
  current: readonly string[],
  raw: string,
): string[] => {
  const seen = new Set(current);
  const next = [...current];
  for (const part of raw.split(/\r?\n/)) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
};
