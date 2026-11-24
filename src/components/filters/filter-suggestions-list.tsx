import type { FilterOption } from '@libs/filterInputs';
import React from 'react';

type FilterSuggestionsListProps = {
  suggestions: FilterOption[];
  loading: boolean;
  onSelect: (option: FilterOption) => void;
};

export function FilterSuggestionsList({
  suggestions,
  loading,
  onSelect,
}: FilterSuggestionsListProps) {
  return (
    <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md">
      {loading ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Loading suggestions...
        </p>
      ) : (
        suggestions.map(option => (
          <button
            key={`${option.value}-${option.label}`}
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2"
            onMouseDown={e => e.preventDefault()}
            onClick={() => onSelect(option)}
          >
            <span className="truncate">{option.label}</span>
            {option.label !== option.value && (
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                {option.value}
              </span>
            )}
          </button>
        ))
      )}
    </div>
  );
}
