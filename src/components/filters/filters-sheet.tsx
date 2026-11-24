import {
  AnyFilterValue,
  Filters,
  FilterToValues,
  FilterTypes,
} from '@libs/filterInputs';
import { RotateCcw } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getValueFor } from '@/lib/filter-utils';
import type { Plugin } from '@/types/plugin';

import { CheckboxFilter } from './checkbox-filter';
import { ExcludableCheckboxFilter } from './excludable-checkbox-filter';
import { MultiTextFilter } from './multi-text-filter';
import { PickerFilter } from './picker-filter';
import { SwitchFilter } from './switch-filter';
import { TextFilter } from './text-filter';

const renderFilters = (
  filters: Filters | undefined,
  values: FilterToValues<Filters> | undefined,
  set: (key: string, v: AnyFilterValue) => void,
  plugin: Plugin.PluginSource | undefined,
  resetVersion: number,
): React.ReactNode => {
  if (!filters || !values) return null;

  return (
    <>
      {Object.entries(filters).map(([key, filter]) => {
        if (!(key in values)) {
          console.error(`No filter value for ${key} in filter values!`);
          return null;
        }
        switch (filter.type) {
          case FilterTypes.Picker: {
            const value = getValueFor<typeof filter.type>(filter, values[key]);
            return (
              <PickerFilter
                key={`picker_filter_${key}`}
                filter={{ key, filter }}
                value={value}
                set={newValue => set(key, newValue)}
              />
            );
          }
          case FilterTypes.Switch: {
            const value = getValueFor<typeof filter.type>(filter, values[key]);
            return (
              <SwitchFilter
                filter={{ key, filter }}
                key={`switch_filter_${key}`}
                value={value}
                set={newValue => set(key, newValue)}
              />
            );
          }
          case FilterTypes.TextInput: {
            const value = getValueFor<typeof filter.type>(filter, values[key]);
            return (
              <TextFilter
                filter={{ key, filter }}
                set={newValue => set(key, newValue)}
                value={value}
                plugin={plugin}
                key={`text_filter_${key}_${resetVersion}`}
              />
            );
          }
          case FilterTypes.MultiText: {
            const value = getValueFor<typeof filter.type>(filter, values[key]);
            return (
              <MultiTextFilter
                filter={{ key, filter }}
                set={newValue => set(key, newValue)}
                value={value}
                plugin={plugin}
                key={`multitext_filter_${key}_${resetVersion}`}
              />
            );
          }
          case FilterTypes.CheckboxGroup: {
            const value = getValueFor<typeof filter.type>(filter, values[key]);
            return (
              <CheckboxFilter
                filter={{ key, filter }}
                set={newValue => set(key, newValue)}
                value={value}
                key={`checkbox_filter_${key}`}
              />
            );
          }
          case FilterTypes.ExcludableCheckboxGroup: {
            const value = getValueFor<typeof filter.type>(filter, values[key]);
            return (
              <ExcludableCheckboxFilter
                filter={{ key, filter }}
                set={newValue => set(key, newValue)}
                value={value}
                key={`xcheckbox_filter_${key}`}
              />
            );
          }
        }
      })}
    </>
  );
};

type FiltersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: FilterToValues<Filters> | undefined;
  filters: Filters | undefined;
  plugin?: Plugin.PluginSource;
  setValues: React.Dispatch<
    React.SetStateAction<FilterToValues<Filters> | undefined>
  >;
  refetch: () => void;
};

export function FiltersSheet({
  open,
  onOpenChange,
  values,
  setValues,
  filters,
  plugin,
  refetch,
}: FiltersSheetProps) {
  const [resetVersion, setResetVersion] = useState(0);

  const setFilterWithKey = (key: string, newValue: AnyFilterValue) =>
    setValues(fValues =>
      !fValues
        ? fValues
        : {
            ...fValues,
            [key]: {
              ...fValues[key],
              value: newValue,
            },
          },
    );

  const resetFilters = () => {
    if (filters) {
      const resetValues: FilterToValues<typeof filters> = {};
      for (const fKey in filters) {
        resetValues[fKey as keyof typeof resetValues] = {
          type: filters[fKey].type,
          value: filters[fKey].value,
        };
      }
      setValues(resetValues);
      setResetVersion(v => v + 1);
    }
  };

  const filterElements = renderFilters(
    filters,
    values,
    setFilterWithKey,
    plugin,
    resetVersion,
  );

  const handleApply = () => {
    refetch();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Customize your search with these filter options
          </SheetDescription>
        </SheetHeader>
        <div className="py-6 space-y-4">
          {filterElements || (
            <p className="text-sm text-muted-foreground text-center py-8">
              No filters available
            </p>
          )}
        </div>
        <SheetFooter className="flex-col sm:flex-col gap-2">
          <Button onClick={handleApply} className="w-full">
            Apply Filters
          </Button>
          <Button
            variant="outline"
            onClick={resetFilters}
            className="w-full gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
