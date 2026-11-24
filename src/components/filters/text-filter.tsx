import type { Filter } from '@libs/filterInputs';
import { FilterTypes } from '@libs/filterInputs';
import React, { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFilterSuggestions } from '@/hooks/useFilterSuggestions';
import type { Plugin } from '@/types/plugin';

import { FilterSuggestionsList } from './filter-suggestions-list';

type TextFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.TextInput>;
  };
  value: string;
  set: (value: string) => void;
  plugin?: Plugin.PluginSource;
};

export function TextFilter({ filter, value, set, plugin }: TextFilterProps) {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const autocompleteEnabled =
    filter.filter.autocomplete === true &&
    typeof plugin?.getFilterSuggestions === 'function';

  const { suggestions, loading } = useFilterSuggestions({
    plugin,
    filterKey: filter.key,
    query: value,
    enabled: autocompleteEnabled && focused && !dismissed,
  });

  const showDropdown =
    autocompleteEnabled &&
    focused &&
    !dismissed &&
    value.trim().length > 0 &&
    (loading || suggestions.length > 0);

  return (
    <div className="space-y-2 relative">
      <Label htmlFor={filter.key} className="text-sm font-medium">
        {filter.filter.label}
      </Label>
      <Input
        id={filter.key}
        value={value}
        onChange={e => {
          setDismissed(false);
          set(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if (e.key === 'Escape') setDismissed(true);
        }}
        placeholder={`Enter ${filter.filter.label.toLowerCase()}...`}
        autoComplete="off"
      />
      {showDropdown && (
        <FilterSuggestionsList
          suggestions={suggestions}
          loading={loading}
          onSelect={option => {
            set(option.value);
            setDismissed(true);
          }}
        />
      )}
    </div>
  );
}
