import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import { ContentType } from '@libs/pluginMetadata';

type GraphItem = {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount?: number };
  package?: Record<string, unknown>;
  remoteItem?: { id?: string; parentReference?: { driveId?: string } };
  file?: { mimeType?: string };
  parentReference?: { path?: string };
  '@microsoft.graph.downloadUrl'?: string;
};

type VideoEntry = {
  item: GraphItem;
  path: string;
};

type FolderEntry = {
  item: GraphItem;
  path: string;
};

type GraphChildrenResponse = {
  value: GraphItem[];
  '@odata.nextLink'?: string;
};

type GraphThumbnailsResponse = {
  value?: {
    large?: { url?: string };
    medium?: { url?: string };
  }[];
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type DeviceCodeResponse = {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  message?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
};

class OneDrivePlugin implements Plugin.PluginBase {
  id = 'yuneko.onedrive';
  name = 'OneDrive';
  icon = 'src/multi/onedrive/icon.png';
  site = 'https://onedrive.live.com';
  version = '8.0.0';
  contentType = ContentType.VIDEO;

  pluginSettings: Plugin.PluginSettings = {
    clientId: {
      value: '440009a4-c67b-4d15-8426-92308c3d9ae8',
      label: 'Microsoft Entra application client ID',
      type: 'Text',
    },
    folder: {
      value: '',
      label: 'OneDrive folder path',
      type: 'Text',
    },
    logout: {
      value: false,
      label: 'Logout and clear Microsoft tokens',
      type: 'Switch',
    },
  };

  private setting(name: string): string {
    return (storage.get(name) ||
      this.pluginSettings[name]?.value ||
      '') as string;
  }

  private get folder(): string {
    const folder = this.setting('folder').trim();
    if (folder.includes('\\')) {
      throw new Error(
        'Invalid OneDrive folder path. Use forward slashes (/) between folder names.',
      );
    }
    return folder.replace(/^\/+|\/+$/g, '');
  }

  private clearAuthentication(): void {
    storage.delete('accessToken');
    storage.delete('refreshToken');
    storage.delete('deviceCode');
    storage.delete('logout');
  }

  private async requestToken(refreshToken: string): Promise<string> {
    const clientId = this.setting('clientId').trim();
    if (!clientId)
      throw new Error('Configure the Microsoft Entra client ID first.');
    const response = await fetchApi(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: 'Files.Read offline_access User.Read',
        }).toString(),
      },
    );
    const data = (await response.json()) as TokenResponse;
    if (!response.ok || !data.access_token) {
      throw new Error(
        data.error_description || data.error || 'Microsoft Graph login failed.',
      );
    }
    if (data.refresh_token) storage.set('refreshToken', data.refresh_token);
    storage.set('accessToken', data.access_token);
    return data.access_token;
  }

  private async deviceLogin(): Promise<string> {
    const clientId = this.setting('clientId').trim();
    if (!clientId)
      throw new Error('Configure the Microsoft Entra client ID first.');

    let deviceCode = this.setting('deviceCode').trim();
    if (!deviceCode) {
      const response = await fetchApi(
        'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            scope: 'Files.Read offline_access User.Read',
          }).toString(),
        },
      );
      const data = (await response.json()) as DeviceCodeResponse;
      if (
        !response.ok ||
        !data.device_code ||
        !data.user_code ||
        !data.verification_uri
      ) {
        throw new Error(
          data.error_description ||
            data.error ||
            'Unable to start Microsoft login.',
        );
      }
      deviceCode = data.device_code;
      storage.set('deviceCode', deviceCode);
      throw new Error(
        `${data.message || 'Open the verification URL and enter the code.'} Then retry the plugin.`,
      );
    }

    const response = await fetchApi(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
        }).toString(),
      },
    );
    const data = (await response.json()) as TokenResponse;
    if (!response.ok || !data.access_token) {
      if (data.error === 'authorization_pending') {
        throw new Error(
          'Microsoft login is not finished. Complete it, then retry the plugin.',
        );
      }
      if (data.error === 'expired_token') storage.delete('deviceCode');
      throw new Error(
        data.error_description || data.error || 'Microsoft login failed.',
      );
    }
    storage.delete('deviceCode');
    if (data.refresh_token) storage.set('refreshToken', data.refresh_token);
    storage.set('accessToken', data.access_token);
    return data.access_token;
  }

  private async accessToken(): Promise<string> {
    if (storage.get('logout') === true) {
      this.clearAuthentication();
      throw new Error(
        'Microsoft tokens cleared. Retry the plugin to sign in again.',
      );
    }
    const accessToken = this.setting('accessToken').trim();
    if (accessToken) return accessToken;
    const refreshToken = this.setting('refreshToken').trim();
    if (refreshToken) return this.requestToken(refreshToken);
    return this.deviceLogin();
  }

  private async graph<T>(url: string, retry = true): Promise<T> {
    const response = await fetchApi(url, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (response.status === 401 && retry && this.setting('refreshToken')) {
      storage.delete('accessToken');
      await this.requestToken(this.setting('refreshToken'));
      return this.graph<T>(url, false);
    }
    const data = (await response.json()) as T & {
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(
        data.error?.message || `Graph request failed (${response.status}).`,
      );
    return data;
  }

  private pathFor(
    item: GraphItem,
    path: string,
    type: 'video' | 'folder',
  ): string {
    const params = new URLSearchParams();
    params.set('type', type);
    params.set('id', item.id);
    params.set('path', path);
    params.set('name', item.name);
    return `/onedrive?${params.toString()}`;
  }

  private async children(url: string): Promise<GraphItem[]> {
    const result = await this.graph<GraphChildrenResponse>(url);
    const items = [...result.value];
    if (result['@odata.nextLink'])
      items.push(...(await this.children(result['@odata.nextLink'])));
    return items;
  }

  private rootChildrenUrl(): string {
    return 'https://graph.microsoft.com/v1.0/me/drive/root/children';
  }

  private normalizeFolderName(name: string): string {
    return name
      .trim()
      .replace(/^[^A-Za-z0-9]+/, '')
      .toLowerCase();
  }

  private async selectedFolderChildrenUrl(): Promise<string> {
    const pathSegments = this.folder.split('/').filter(Boolean);
    const encodedPath = pathSegments.map(encodeURIComponent).join('/');

    try {
      const folder = await this.graph<GraphItem>(
        `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}`,
      );
      if (folder.folder || folder.package) {
        return `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folder.id)}/children`;
      }
    } catch {
      // Fall back to resolving each folder by its children/search results.
    }

    let childrenUrl = this.rootChildrenUrl();
    for (const segment of pathSegments) {
      const expectedName = this.normalizeFolderName(segment);
      const listedItems = await this.children(childrenUrl);
      let folder = listedItems.find(
        item =>
          (item.folder || item.package) &&
          this.normalizeFolderName(item.name) === expectedName,
      );

      if (!folder) {
        const searchUrl = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(segment)}')`;
        folder = (await this.children(searchUrl)).find(
          item =>
            (item.folder || item.package) &&
            this.normalizeFolderName(item.name) === expectedName,
        );
      }

      if (!folder) {
        const availableFolders = listedItems
          .filter(item => item.folder)
          .map(item => item.name)
          .slice(0, 20);
        const suffix = availableFolders.length
          ? ` Available root folders: ${availableFolders.join(', ')}`
          : '';
        throw new Error(`OneDrive folder not found: ${segment}.${suffix}`);
      }
      childrenUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folder.id)}/children`;
    }
    return childrenUrl;
  }

  private async listFolderContents(
    url: string,
    parentPath: string,
  ): Promise<{ videos: VideoEntry[]; folders: FolderEntry[] }> {
    const videos: VideoEntry[] = [];
    const folders: FolderEntry[] = [];
    for (const item of await this.children(url)) {
      const path = parentPath ? `${parentPath}/${item.name}` : item.name;
      if (item.folder) {
        folders.push({ item, path });
      } else if (/\.(mp4|mkv|ts)$/i.test(item.name)) {
        videos.push({ item, path });
      }
    }
    return { videos, folders };
  }

  private async itemDownloadUrl(item: GraphItem): Promise<string | undefined> {
    if (item['@microsoft.graph.downloadUrl']) {
      return item['@microsoft.graph.downloadUrl'];
    }
    const details = await this.graph<GraphItem>(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item.id)}`,
    );
    return details['@microsoft.graph.downloadUrl'];
  }

  private async videoThumbnailUrl(
    item: GraphItem,
  ): Promise<string | undefined> {
    const result = await this.graph<GraphThumbnailsResponse>(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(item.id)}/thumbnails`,
    );
    return result.value?.[0]?.large?.url || result.value?.[0]?.medium?.url;
  }

  private videoDisplayName(name: string): string {
    return name.replace(/\.(mp4|mkv|ts)$/i, '');
  }

  private async folderCoverUrl(folder: FolderEntry): Promise<string> {
    const contents = await this.listFolderContents(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folder.item.id)}/children`,
      folder.path,
    );
    const cover = (
      await this.children(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folder.item.id)}/children`,
      )
    ).find(item => /^cover\.(png|jpe?g|webp)$/i.test(item.name));
    if (cover) return (await this.itemDownloadUrl(cover)) || defaultCover;
    const firstVideo = contents.videos[0];
    if (firstVideo)
      return (await this.videoThumbnailUrl(firstVideo.item)) || defaultCover;
    return defaultCover;
  }

  private async listVideosRecursively(
    url: string,
    parentPath: string,
  ): Promise<VideoEntry[]> {
    const videos: VideoEntry[] = [];
    const contents = await this.listFolderContents(url, parentPath);
    videos.push(...contents.videos);
    for (const folder of contents.folders) {
      videos.push(
        ...(await this.listVideosRecursively(
          `https://graph.microsoft.com/v1.0/me/drive/items/${folder.item.id}/children`,
          folder.path,
        )),
      );
    }
    return videos;
  }

  private async listRootContents(): Promise<{
    videos: VideoEntry[];
    folders: FolderEntry[];
  }> {
    return this.listFolderContents(
      await this.selectedFolderChildrenUrl(),
      this.folder,
    );
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    await this.accessToken();
    const contents = await this.listRootContents();
    return [
      ...(await Promise.all(
        contents.folders.map(async folder => ({
          name: folder.item.name,
          path: this.pathFor(folder.item, folder.path, 'folder'),
          cover: await this.folderCoverUrl(folder),
        })),
      )),
      ...(await Promise.all(
        contents.videos.map(async ({ item, path }) => ({
          name: this.videoDisplayName(item.name),
          path: this.pathFor(item, path, 'video'),
          cover: (await this.videoThumbnailUrl(item)) || defaultCover,
        })),
      )),
    ];
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const query = searchTerm.toLowerCase();
    return (await this.popularNovels(1)).filter(item =>
      item.name.toLowerCase().includes(query),
    );
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const params = new URLSearchParams(novelPath.split('?')[1] || '');
    const name = params.get('name') || 'Video';
    const type = params.get('type') || 'video';
    const id = params.get('id');
    const path = params.get('path') || name;
    if (!id) throw new Error('Invalid OneDrive item ID.');

    if (type === 'folder') {
      const videos = await this.listVideosRecursively(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}/children`,
        path,
      );
      return {
        path: novelPath,
        name,
        cover: await this.folderCoverUrl({
          item: { id, name, folder: {} },
          path,
        }),
        status: NovelStatus.Ongoing,
        chapters: videos.map(({ item, path: videoPath }, index) => ({
          name: item.name.replace(/\.(mp4|mkv|ts)$/i, ''),
          path: this.pathFor(item, videoPath, 'video'),
          chapterNumber: index + 1,
        })),
      };
    }

    return {
      path: novelPath,
      name: this.videoDisplayName(name),
      cover: (await this.videoThumbnailUrl({ id, name })) || defaultCover,
      status: NovelStatus.Ongoing,
      chapters: [
        {
          name: this.videoDisplayName(name),
          path: this.pathFor({ id, name }, path, 'video'),
          chapterNumber: 1,
        },
      ],
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const params = new URLSearchParams(chapterPath.split('?')[1] || '');
    const id = params.get('id');
    if (!id) throw new Error('Invalid OneDrive video ID.');
    const result = await this.graph<GraphItem>(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}`,
    );
    const url = result['@microsoft.graph.downloadUrl'];
    if (!url)
      throw new Error(
        'Microsoft Graph did not return a playable download URL.',
      );

    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="direct">',
      '<meta name="lnreader-video-type" content="video-file">',
      `<meta name="lnreader-video-url" content="${this.escapeAttribute(url)}">`,
      '<meta id="no-cache-marker">',
      '<meta id="no-prefetch-marker">',
    ].join('\n');
  }

  private escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  resolveUrl(): string {
    return this.site;
  }
}

export default new OneDrivePlugin();
