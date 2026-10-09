import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents:
      "export * from './src/types/filters'; export * from './src/lib/filter-utils';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
});
const module = { exports: {} };
Function(
  'module',
  'exports',
  bundle.outputFiles[0].text,
)(module, module.exports);
const { FilterTypes, isFilterValue, getValueFor } = module.exports;
const cases = [
  [FilterTypes.TextInput, 'default', '', [false, [], {}, null]],
  [FilterTypes.Picker, 'default', 'selected', [false, [], {}, null]],
  [FilterTypes.Switch, true, false, ['', [], {}, null]],
  [FilterTypes.CheckboxGroup, ['default'], [], ['', false, {}, null]],
  [
    FilterTypes.ExcludableCheckboxGroup,
    { include: ['default'] },
    {},
    ['', false, [], null],
  ],
];

for (const [type, defaultValue, selected, invalidValues] of cases) {
  const filter = { type, label: type, value: defaultValue };
  const value = { type, value: selected };
  assert.equal(isFilterValue(value, type), true);
  assert.equal(getValueFor(filter, value), selected);
  for (const invalid of invalidValues) {
    const value = { type, value: invalid };
    assert.equal(isFilterValue(value, type), false);
    assert.equal(getValueFor(filter, value), defaultValue);
  }
  for (const otherType of Object.values(FilterTypes).filter(
    other => other !== type,
  )) {
    const value = { type: otherType, value: selected };
    assert.equal(isFilterValue(value, type), false);
    assert.equal(getValueFor(filter, value), defaultValue);
  }
}

// Optional sibling checkout check keeps the app and authoring contracts aligned.
if (process.argv[2]) {
  const normalize = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(normalize('src/types/filters.ts'), normalize(process.argv[2]));
}
console.log(
  'Filter guards, default fallback and optional runtime parity passed.',
);
