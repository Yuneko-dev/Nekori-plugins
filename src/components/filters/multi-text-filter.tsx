import type { Filter } from '@libs/filterInputs';
import { FilterTypes } from '@libs/filterInputs';
import { Plus, X } from 'lucide-react';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFilterSuggestions } from '@/hooks/useFilterSuggestions';
import { addMultiTextValues } from '@/lib/filter-utils';
import type { Plugin } from '@/types/plugin';

import { FilterSuggestionsList } from './filter-suggestions-list';

type MultiTextFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.MultiText>;
  };
  value: string[];
  set: (value: string[]) => void;
  plugin?: Plugin.PluginSource;
};

export function MultiTextFilter({
  filter,
  value,
  set,
  plugin,
}: MultiTextFilterProps) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const autocompleteEnabled =
    filter.filter.autocomplete === true &&
    typeof plugin?.getFilterSuggestions === 'function';

  const { suggestions, loading } = useFilterSuggestions({
    plugin,
    filterKey: filter.key,
    query: draft,
    enabled: autocompleteEnabled && focused && !dismissed,
  });

  const commitValue = (raw: string) => {
    const next = addMultiTextValues(value, raw);
    if (next.length !== value.length) {
      set(next);
    }
    setDraft('');
    setDismissed(false);
  };

  const removeValue = (item: string) => {
    set(value.filter(entry => entry !== item));
  };

  const filteredSuggestions = suggestions.filter(
    option => !value.includes(option.value),
  );
  const showDropdown =
    autocompleteEnabled &&
    focused &&
    !dismissed &&
    draft.trim().length > 0 &&
    (loading || filteredSuggestions.length > 0);

  return (
    <div className="space-y-2 relative">
      <Label htmlFor={filter.key} className="text-sm font-medium">
        {filter.filter.label}
      </Label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(item => (
            <Badge
              key={item}
              variant="secondary"
              className="gap-1 pr-1 max-w-full"
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                onClick={() => removeValue(item)}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remove ${item}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          id={filter.key}
          value={draft}
          onChange={e => {
            setDismissed(false);
            setDraft(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={e => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              commitValue(draft);
            } else if (e.key === 'Backspace' && !draft && value.length > 0) {
              set(value.slice(0, -1));
            } else if (e.key === 'Escape') {
              setDismissed(true);
            }
          }}
          onPaste={e => {
            const pasted = e.clipboardData.getData('text');
            if (/[\r\n]/.test(pasted)) {
              e.preventDefault();
              commitValue(pasted);
            }
          }}
          placeholder={`Add ${filter.filter.label.toLowerCase()}...`}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!draft.trim()}
          onClick={() => commitValue(draft)}
          aria-label={`Add ${filter.filter.label}`}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {showDropdown && (
        <FilterSuggestionsList
          suggestions={filteredSuggestions}
          loading={loading}
          onSelect={option => commitValue(option.value)}
        />
      )}
    </div>
  );
}
