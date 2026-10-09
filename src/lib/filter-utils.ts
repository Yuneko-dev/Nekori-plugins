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
