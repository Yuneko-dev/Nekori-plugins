import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import { Buffer, encodeHtmlEntities } from '@libs/utils';

class JukaNovelPlugin implements Plugin.PluginBase {
  id = 'jukanovel';
  name = 'JukaNovel';
  icon = 'src/vi/jukanovel/icon.png';
  site = 'https://sangtacviet.online';
  // 'https://jukaza.site';
  version = '1.0.10';

  pluginSettings: Plugin.PluginSettings = {
    preferRaw: {
      value: false,
      label: 'Ưu tiên hiển thị nội dung gốc (Raw)',
      type: 'Switch',
    },
  };

  get preferRaw() {
    return storage.get('preferRaw') as boolean;
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}/kham-pha?page=${pageNo}`;

    if (filters) {
      url += `&sort=${filters.sort.value}`;
      url += `&origin=${encodeURIComponent(filters.origin.value)}`;
      url += `&is_full=${filters.status.value}`;
      url += `&tags=${filters.tags.value.join(',')}`;
      url += `&exclude_tags=${filters.exclude_tags.value.join(',')}`;
    }

    const response = await fetchText(url);
    const $ = loadCheerio(response);
    this.checkLogin($);
    return this.parseNovels($);
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const response = await fetchText(`${this.site}${novelPath}`);
    const $ = loadCheerio(response);
    this.checkLogin($);
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').text().trim() || 'Untitled',
      cover: $('[class*="aspect"]').find('img').attr('src') || defaultCover,
      author:
        $('.text-sm.text-paper-muted.font-mono').text().trim() || 'Unknown',
      status: $('.flex-1')
        .find('div')
        .find('span')
        .text()
        .trim()
        .split('/')[0]
        .includes('Hoàn Thành')
        ? NovelStatus.Completed
        : NovelStatus.Ongoing,
      genres: $('.flex.flex-wrap')
        .find('a')
        .map((i, el) => $(el).text().trim())
        .get()
        .join(','),
      summary: $('#novel-description').text().trim(),
    };

    const chapters: Plugin.ChapterItem[] = [];

    $('#chapter-list-container li').each((i: number, el: any) => {
      const li = $(el);
      const a = li.find('a');
      const path = a.attr('href');
      const nameVi = a.find('span.font-medium').attr('data-vi');
      const status = a.find('div').find('span').find('span').text().trim();
      const chapterName = nameVi || a.find('span.font-medium').text().trim();
      const chapterNumber = li.attr('data-chapter');

      if (path) {
        chapters.push({
          name: `[${status}] ${chapterName}`,
          path: path.replace(this.site, ''),
          chapterNumber: chapterNumber ? parseInt(chapterNumber) : undefined,
        });
      }
    });

    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const chapterIdMatch = chapterPath.match(/\/(\d+)/);
    if (!chapterIdMatch) {
      throw new Error('Không thể tìm thấy ID chương.');
    }
    const chapterId = chapterIdMatch[1];
    const response = await fetchText(`${this.site}${chapterPath}`);
    const $ = loadCheerio(response);
    this.checkLogin($);
    const scriptContent = $('script:contains("__READER_DATA__")').html() || '';
    const tokenMatch = scriptContent.match(
      new RegExp(`"chapter_id":${chapterId},"token":"([^"]+)"`),
    );
    const token = tokenMatch ? tokenMatch[1] : null;

    const cipherKeyMatch = scriptContent.match(/"cipherKey":"([^"]+)"/);
    const cipherKey = cipherKeyMatch ? cipherKeyMatch[1] : '';

    if (!token) throw new Error('Không tìm thấy token cho chương này.');

    const getDataContent = await fetchText(
      `${this.site}/api/reader/chapter/${chapterId}`,
      {
        headers: {
          'accept': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          'referer': `${this.site}${chapterPath}`,
          'x-reader-token': token,
        },
      },
    );

    try {
      const chapterData = JSON.parse(getDataContent);
      const readerData = {
        cipherKey: cipherKey,
        chapter: chapterData,
      };
      const chapterContent = this.decryptJukaNovel(readerData);
      if (!chapterContent) throw new Error('chapterContent = null');
      return chapterContent;
    } catch (e) {
      throw new Error('Lỗi xử lý dữ liệu chương: ' + (e as any).message);
    }
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const response = await fetchText(
      `${this.site}/kham-pha?q=${searchTerm}&page=${pageNo}`,
    );
    const $ = loadCheerio(response);
    this.checkLogin($);
    return this.parseNovels($);
  }

  decryptJukaNovel(readerData: any): string {
    const n = readerData.cipherKey || '';
    const chapter = readerData.chapter || {};

    if (!n || !chapter) return '';

    const contentCipher = (e: string) => {
      if (!e) return null;
      try {
        const r = Buffer.from(e, 'base64');
        const i = n.length;
        let a = '';
        for (let o = 0; o < r.length; o++) {
          a += String.fromCharCode(r[o] ^ n.charCodeAt(o % i));
        }
        return Buffer.from(a, 'base64').toString('utf-8');
      } catch (error) {
        return null;
      }
    };

    let content: string | null = null;
    if (this.preferRaw) {
      content = contentCipher(chapter.raw_content);
    } else {
      content = contentCipher(
        chapter.published_content ||
          chapter.translated_content ||
          chapter.raw_content,
      );
    }

    if (!content) return '';

    const $ = loadCheerio(content);
    $('.jkz-trap').remove();
    content = $('body').html() || '';

    const notes: string[] = [];
    let regex: RegExp | null = null;
    try {
      regex =
        // @ts-expect-error
        /<span class="ann-marker"[^>]*>.*?<span class="ann-bubble">(.*?)<\/span><\/span>/gs;
    } catch {
      regex =
        /<span class="ann-marker"[^>]*>[\s\S]*?<span class="ann-bubble">([\s\S]*?)<\/span><\/span>/g;
    }
    content = content.replace(regex, (match, noteContent) => {
      const noteId = notes.length + 1;
      notes.push(noteContent);
      return ` <span id="anchor-note-${noteId}" class="note-icon none-print inline note-tooltip" data-tooltip-content="#note${noteId} .note-content" data-note-id="note${noteId}"><i class="fas fa-sticky-note"></i></span><a class="inline-print none" href="#note${noteId}">[note]</a>`;
    });

    const hasHtmlTags = ['<p>', '<img', '<div'].some(tag =>
      content?.includes(tag),
    );

    if (!hasHtmlTags) {
      content = content
        .replace(/\t/g, '<br>')
        .split(/\n\n+/)
        .filter(block => block.trim())
        .map(block => {
          const lines = block.split('\n').filter(l => l.trim());
          return `<div>${lines.map(l => `<p>${encodeHtmlEntities(l)}</p>`).join('<br>')}</div>`;
        })
        .join('');
    }

    content = content
      .replace(/src="\/\//g, 'src="https://')
      .replace(
        /<p>\s*(\*\*\*|[=\-_*~]{7,}|---)\s*<\/p>/g,
        '<p style="text-align:center; text-indent:0">* * *</p>',
      );

    if (notes.length > 0) {
      content +=
        '<br><p style="text-align: center; font-weight: bold;">Ghi chú</p><br>';
      let notesHtml = '\n<div class="note-reg">';
      notes.forEach((note, index) => {
        const noteId = index + 1;
        notesHtml += `<div id="note${noteId}" class="none"><div class="note-content"><a href="#anchor-note-${noteId}">[^]</a> ${note}</div></div>`;
      });
      notesHtml += '</div>';
      content += notesHtml;
    }
    content = '<div>' + content + '</div>';
    return content;
  }

  filters = {
    sort: {
      type: FilterTypes.Picker,
      label: 'Sắp xếp',
      value: 'new_update',
      options: [
        { label: 'Mới Cập Nhật', value: 'new_update' },
        { label: 'Lượt Xem (Ngày)', value: 'view_day' },
        { label: 'Lượt Xem (Tuần)', value: 'view_week' },
        { label: 'Lượt Xem (Tháng)', value: 'view_month' },
        { label: 'Tổng Lượt Xem', value: 'view_total' },
        { label: 'Đánh Giá (Sao)', value: 'rating' },
        { label: 'Truyện Mới Đăng', value: 'new_novel' },
      ],
    },
    origin: {
      type: FilterTypes.Picker,
      label: 'Quốc Gia',
      value: 'Toàn bộ',
      options: [
        { label: 'Toàn bộ', value: 'Toàn bộ' },
        { label: 'Hàn Quốc', value: 'Hàn Quốc' },
        { label: 'Nhật Bản', value: 'Nhật Bản' },
      ],
    },
    status: {
      type: FilterTypes.Picker,
      label: 'Trình trạng dịch',
      value: '0',
      options: [
        { label: 'Toàn bộ', value: '0' },
        { label: 'Đã dịch FULL', value: '1' },
      ],
    },
    tags: {
      type: FilterTypes.CheckboxGroup,
      label: 'Thể Loại (Bao gồm)',
      value: [],
      options: [
        { label: 'Academy', value: 'Academy' },
        { label: 'Action', value: 'Action' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Ecchi', value: 'Ecchi' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Gender Bender', value: 'Gender Bender' },
        { label: 'Harem', value: 'Harem' },
        { label: 'Historical', value: 'Historical' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Josei', value: 'Josei' },
        { label: 'Martial Arts', value: 'Martial Arts' },
        { label: 'Mature', value: 'Mature' },
        { label: 'Mecha', value: 'Mecha' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Romance', value: 'Romance' },
        { label: 'School Life', value: 'School Life' },
        { label: 'Sci-fi', value: 'Sci-fi' },
        { label: 'Seinen', value: 'Seinen' },
        { label: 'Shoujo', value: 'Shoujo' },
        { label: 'Shoujo Ai', value: 'Shoujo Ai' },
        { label: 'Shounen', value: 'Shounen' },
        { label: 'Slice of Life', value: 'Slice of Life' },
        { label: 'Sports', value: 'Sports' },
        { label: 'Supernatural', value: 'Supernatural' },
        { label: 'Tragedy', value: 'Tragedy' },
        { label: 'Wuxia', value: 'Wuxia' },
        { label: 'Xianxia', value: 'Xianxia' },
        { label: 'Xuanhuan', value: 'Xuanhuan' },
        { label: 'Yuri', value: 'Yuri' },
      ],
    },
    exclude_tags: {
      type: FilterTypes.CheckboxGroup,
      label: 'Thể Loại (Loại trừ)',
      value: [],
      options: [
        { label: 'Academy', value: 'Academy' },
        { label: 'Action', value: 'Action' },
        { label: 'Adventure', value: 'Adventure' },
        { label: 'Comedy', value: 'Comedy' },
        { label: 'Drama', value: 'Drama' },
        { label: 'Ecchi', value: 'Ecchi' },
        { label: 'Fantasy', value: 'Fantasy' },
        { label: 'Gender Bender', value: 'Gender Bender' },
        { label: 'Harem', value: 'Harem' },
        { label: 'Historical', value: 'Historical' },
        { label: 'Horror', value: 'Horror' },
        { label: 'Josei', value: 'Josei' },
        { label: 'Martial Arts', value: 'Martial Arts' },
        { label: 'Mature', value: 'Mature' },
        { label: 'Mecha', value: 'Mecha' },
        { label: 'Mystery', value: 'Mystery' },
        { label: 'Psychological', value: 'Psychological' },
        { label: 'Romance', value: 'Romance' },
        { label: 'School Life', value: 'School Life' },
        { label: 'Sci-fi', value: 'Sci-fi' },
        { label: 'Seinen', value: 'Seinen' },
        { label: 'Shoujo', value: 'Shoujo' },
        { label: 'Shoujo Ai', value: 'Shoujo Ai' },
        { label: 'Shounen', value: 'Shounen' },
        { label: 'Slice of Life', value: 'Slice of Life' },
        { label: 'Sports', value: 'Sports' },
        { label: 'Supernatural', value: 'Supernatural' },
        { label: 'Tragedy', value: 'Tragedy' },
        { label: 'Wuxia', value: 'Wuxia' },
        { label: 'Xianxia', value: 'Xianxia' },
        { label: 'Xuanhuan', value: 'Xuanhuan' },
        { label: 'Yuri', value: 'Yuri' },
      ],
    },
  } satisfies Filters;

  checkLogin($: any): void {
    if ($('form[action*="/login"].space-y-5').length) {
      throw new Error('Vui lòng đăng nhập ở WebView rồi thử lại !');
    }
  }

  parseNovels($: any): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    $('.flex-1 a.group').each((i: number, el: any) => {
      const h3 = $(el).find('h3');
      const name = h3.text().trim();
      const path = $(el).attr('href');
      const cover = $(el).find('img').attr('src');

      if (name && path) {
        novels.push({
          name,
          path: path.replace(this.site, ''),
          cover: cover || defaultCover,
        });
      }
    });
    return novels;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new JukaNovelPlugin();
