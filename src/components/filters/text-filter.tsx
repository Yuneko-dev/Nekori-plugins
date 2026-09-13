import type { Filter } from '@libs/filterInputs';
import { FilterTypes } from '@libs/filterInputs';
import React from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TextFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.TextInput>;
  };
  value: string;
  set: (value: string) => void;
};

export function TextFilter({ filter, value, set }: TextFilterProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={filter.key} className="text-sm font-medium">
        {filter.filter.label}
      </Label>
      <Input
        id={filter.key}
        value={value}
        onChange={e => set(e.target.value)}
        placeholder={`Enter ${filter.filter.label.toLowerCase()}...`}
      />
    </div>
  );
}
