// @ts-nocheck

import { fetchApi, fetchProto, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { storage, localStorage, sessionStorage } from '@libs/storage';
import { utf8ToBytes, bytesToUtf8, Buffer } from '@libs/utils';

// Phần đầu của TemplatePlugin giống như plugin template.ts, có thể xem ở đó...
class TemplatePlugin implements Plugin.PagePlugin {
  id = 'template2.id';
  name = 'Template Plugin 2';
  icon = 'src/vi/template2/icon.png';
  site = 'https://example.com';
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  // Giống như template.ts
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    novels.push({
      name: `Novel${pageNo}`,
      path: `/novels/${pageNo}`,
      cover: defaultCover,
    });
    return novels;
  }
  // Đây là hàm để trả về thông tin chi tiết của 1 truyện, bao gồm cả list chương. Hàm này được gọi khi người dùng nhấn vào một truyện nào đó.
  // ! Khác với template.ts, hàm này phải trả về 1 object truyện có thông tin tổng số trang (totalPages)
  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> {
    const novel: Plugin.SourceNovel & { totalPages: number } = {
      // Đường dẫn đến truyện, giống như trường path ở NovelItem. Có thể sử dụng để lấy dữ liệu chi tiết của truyện đó.
      path: novelPath,
      // Tên truyện
      name: 'Untitled',
      // Thêm trường totalPages vào object truyện. Nếu truyện không có phân trang, có thể để là 1.
      totalPages: 1,
    };

    /* Đoạn mã nguồn để bổ sung dữ liệu vào novel object ở đây. */
    novel.artist = '';
    novel.author = '';
    novel.cover = defaultCover;
    novel.genres = '';
    novel.status = NovelStatus.Completed;
    novel.summary = '';

    // Danh sách chương của truyện. (Có thể để trống nếu chưa có dữ liệu)
    const chapters: Plugin.ChapterItem[] = [];
    novel.chapters = chapters;

    return novel;
  }
  // ! Trả về danh sách chương của một trang truyện cụ thể.
  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    const response = await fetchApi(`${this.site}${novelPath}/trang-${page}`);
    // Ví dụ trang trả 1 api json...
    const data = await response.json();
    // Xử lý data để trả về thông tin chương
    return {
      chapters: [],
    };
  }
  // Giống như template.ts
  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchText(`${this.site}${chapterPath}`);
    const $ = loadCheerio(response);
    // Giả sử nội dung chương nằm trong thẻ div có class "chapter-content"
    const chapterContent = $('.chapter-content').html()!;
    return chapterContent;
  }
  // Giống như template.ts
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const novels: Plugin.NovelItem[] = [];
    return novels;
  }
}

// Xuất ra một instance của TemplatePlugin để ứng dụng có thể sử dụng
export default new TemplatePlugin();
