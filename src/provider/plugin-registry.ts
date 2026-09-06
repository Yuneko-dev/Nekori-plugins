import type { Plugin } from '@/types/plugin';
import { resolvePluginAssets } from '@/lib/plugin-asset-paths';

const pluginModules = import.meta.glob<Plugin.PluginSource>(
  ['/plugins/*/*/index.ts', '!/plugins/*/broken_*/**', '!/plugins/multisrc/**'],
  {
    eager: true,
    import: 'default',
  },
);

const plugins = Object.entries(pluginModules)
  .sort(([firstPath], [secondPath]) =>
    firstPath < secondPath ? -1 : firstPath > secondPath ? 1 : 0,
  )
  .map(([, plugin]) => resolvePluginAssets(plugin));

export default plugins;
