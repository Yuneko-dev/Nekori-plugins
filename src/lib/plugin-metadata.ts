import { ContentType, ContentWarning } from '@/types/constants';
import type { Plugin } from '@/types/plugin';

type PluginMetadata = Pick<Plugin.PluginCommon, 'name'> &
  Partial<
    Pick<
      Plugin.NekoriMetadata,
      'contentType' | 'contentWarning' | 'isNekoriPlugin'
    >
  >;

export const R18_PLUGIN_NAME_COLOR = 'rgb(210, 15, 57)';

const getContentTypePrefix = (plugin: PluginMetadata) => {
  switch (plugin.contentType) {
    case ContentType.VIDEO:
      return '📺 ';
    case ContentType.IMAGE:
      return '🖼️ ';
    case ContentType.MIXED:
      return '🧭 ';
    default:
      // Plugins using the LNReader structure are considered legacy.
      return plugin.isNekoriPlugin ? '' : '📦 ';
  }
};

export const getPluginDisplayName = (plugin: PluginMetadata) =>
  getContentTypePrefix(plugin) + plugin.name;

export const hasR18ContentWarning = (contentWarning?: ContentWarning) =>
  (contentWarning ?? ContentWarning.UNSPECIFIED) > ContentWarning.SAFE;

export const getPluginNameColor = (plugin: PluginMetadata) =>
  hasR18ContentWarning(plugin.contentWarning)
    ? R18_PLUGIN_NAME_COLOR
    : undefined;
