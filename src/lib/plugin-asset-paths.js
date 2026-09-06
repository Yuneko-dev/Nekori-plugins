/**
 * Expand bare asset names once. Full legacy paths remain valid.
 * Keep this function self-contained: the build embeds it in plugin bundles.
 * @template {{ id: string, icon?: string, customCSS?: string, customJS?: string }} T
 * @param {T} plugin
 * @returns {T}
 */
export function resolvePluginAssets(plugin) {
  for (const field of ['icon', 'customCSS', 'customJS']) {
    const value = plugin[field];
    if (typeof value === 'string' && value && !value.includes('/')) {
      plugin[field] = `src/${plugin.id}/${value}`;
    }
  }
  return plugin;
}
