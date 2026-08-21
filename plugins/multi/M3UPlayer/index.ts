import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import { ContentType } from '@libs/pluginMetadata';

type PlaylistItem = {
  name: string;
  tvg: {
    id: string;
    name: string;
    logo: string;
    url: string;
    rec: string;
    shift: string;
  };
  group: {
    title: string;
  };
  http: {
    referrer: string;
    'user-agent': string;
  };
  url: string;
  catchup: {
    type: string;
    days: string;
    source: string;
  };
  timeshift: string;
  lang: string;
};

const iptvPlaylistParser = {
  parse: (content: string) => {
    const getAttribute = (str: string, name: string) => {
      const regex = new RegExp(`${name}="(.*?)"`, 'gi');
      const match = regex.exec(str);
      return match?.[1] ?? '';
    };
    const getName = (str: string) => {
      const info = str.replace(/="(.*?)"/g, '');
      const parts = info.split(/,(.*)/);
      return parts[1] || '';
    };
    const getOption = (str: string, name: string) => {
      const regex = new RegExp(`:${name}=(.*)`, 'gi');
      const match = regex.exec(str);
      return typeof match?.[1] === 'string' ? match[1].replace(/"/g, '') : '';
    };
    const getValue = (str: string) => {
      const regex = new RegExp(':(.*)', 'gi');
      const match = regex.exec(str);
      return typeof match?.[1] === 'string' ? match[1].replace(/"/g, '') : '';
    };
    const getParameter = (str: string, name: string) => {
      const params = str.replace(/^(.*)\|/, '');
      const regex = new RegExp(`${name}=(\\w[^&]*)`, 'gi');
      const match = regex.exec(params);
      return match?.[1] ?? '';
    };

    const lines = content.split(/\r?\n/);
    if (!lines[0] || !/^#EXTM3U/.test(lines[0]))
      throw new Error('Playlist is not valid');

    const items: PlaylistItem[] = [];
    let currentItem: Partial<PlaylistItem> | null = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentItem = {
          name: getName(line),
          tvg: {
            id: getAttribute(line, 'tvg-id'),
            name: getAttribute(line, 'tvg-name'),
            logo: getAttribute(line, 'tvg-logo'),
            url: getAttribute(line, 'tvg-url'),
            rec: getAttribute(line, 'tvg-rec'),
            shift: getAttribute(line, 'tvg-shift'),
          },
          group: {
            title: getAttribute(line, 'group-title'),
          },
          http: {
            referrer: getAttribute(line, 'referrer'),
            'user-agent': getAttribute(line, 'user-agent'),
          },
          url: '',
          catchup: {
            type: getAttribute(line, 'catchup'),
            days: getAttribute(line, 'catchup-days'),
            source: getAttribute(line, 'catchup-source'),
          },
          timeshift: getAttribute(line, 'timeshift'),
          lang: getAttribute(line, 'lang'),
        };
      } else if (line.startsWith('#EXTVLCOPT:')) {
        if (!currentItem?.http) continue;
        currentItem.http.referrer =
          getOption(line, 'http-referrer') || currentItem.http.referrer;
        currentItem.http['user-agent'] =
          getOption(line, 'http-user-agent') || currentItem.http['user-agent'];
      } else if (line.startsWith('#EXTGRP:')) {
        if (!currentItem?.group) continue;
        currentItem.group.title = getValue(line) || currentItem.group.title;
      } else if (line.startsWith('#')) {
        continue;
      } else {
        if (!currentItem?.http) continue;
        currentItem.url = line;
        currentItem.http['user-agent'] =
          getParameter(line, 'user-agent') || currentItem.http['user-agent'];
        currentItem.http.referrer =
          getParameter(line, 'referer') || currentItem.http.referrer;
        items.push(currentItem as PlaylistItem);
        currentItem = null;
      }
    }

    return { items };
  },
};

class M3UPlayerPlugin implements Plugin.PluginBase {
  id = 'yuneko.m3uplayer';
  name = 'M3U Player';
  icon = 'src/multi/m3uplayer/icon.png';
  version = '1.0.4';
  contentType = ContentType.VIDEO;

  pluginSettings: Plugin.PluginSettings = {
    m3uUrl: {
      value: '',
      label: 'M3U URL',
      type: 'Text',
    },
    referer: {
      value: '',
      label: 'Referer URL (Optional)',
      type: 'Text',
    },
  };

  get site(): string {
    const url = (storage.get('referer') ||
      this.pluginSettings.referer.value) as string;
    return url || 'https://vnepg.site';
  }

  get m3uUrl(): string {
    const url = (storage.get('m3uUrl') ||
      this.pluginSettings.m3uUrl.value) as string;
    if (!url)
      throw new Error(
        'Please add a valid M3U playlist URL in the plugin settings.',
      );
    return url;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1 || !this.m3uUrl) return [];
    const text = await fetchText(this.m3uUrl);

    const playlist = iptvPlaylistParser.parse(text);

    return playlist.items.map(item => {
      const params = new URLSearchParams();
      params.set('url', item.url);
      params.set('name', item.name);
      if (item.tvg.logo) params.set('logo', item.tvg.logo);
      // if (item.http['user-agent']) params.set('ua', item.http['user-agent']);

      return {
        name: item.name,
        path: `/m3u?${params.toString()}`,
        cover: item.tvg.logo || defaultCover,
      };
    });
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const novels = await this.popularNovels(1);
    return novels.filter(n =>
      n.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    if (!novelPath.startsWith('/m3u?')) {
      throw new Error('Invalid URL');
    }
    const params = new URLSearchParams(novelPath.split('?')[1]);
    const name = params.get('name') || 'Unknown';
    const cover = params.get('logo') || defaultCover;

    return {
      path: novelPath,
      name,
      cover,
      status: NovelStatus.Ongoing,
      chapters: [
        {
          name,
          path: novelPath,
          chapterNumber: 1,
        },
      ],
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (!chapterPath.startsWith('/m3u?')) {
      throw new Error('Invalid URL');
    }
    const params = new URLSearchParams(chapterPath.split('?')[1]);
    const url = params.get('url') || '';

    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="direct">',
      '<meta name="lnreader-video-type" content="m3u8">',
      `<meta name="lnreader-video-url" content="${url}">`,
      '<meta id="no-cache-marker"/>',
      '<meta id="no-prefetch-marker"/>',
      '<meta id="lnreader-video-disable-progress"/>',
    ].join('\n');
  }

  resolveUrl(path: string): string {
    return this.site;
  }
}

export default new M3UPlayerPlugin();
