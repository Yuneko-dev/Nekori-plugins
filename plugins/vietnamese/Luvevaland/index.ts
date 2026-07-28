import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class LuvevalandPlugin implements Plugin.PluginBase {
  id = 'luvevaland.co';
  name = 'Luvevaland';
  icon = 'src/vi/luvevaland/icon.png';
  site = 'https://luvevaland.co';
  version = '1.0.4';
  filters: Filters | undefined = undefined;

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = new URL(`${this.site}/danh-sach-chuong-moi-cap-nhat/novel`);
    url.searchParams.set('page', pageNo.toString());
    const response = await fetchText(url.toString());
    const loadedCheerio = loadCheerio(response);
    const novels: Plugin.NovelItem[] = [];
    const container = loadedCheerio('.comic-box-container .row');
    if (!container.length) return novels;
    container.children().each((index, element) => {
      // Load cheerio for each novel item
      const item = loadedCheerio(element);
      const title = item.find('.book__lg-title a').text().trim();
      const cover = item.find('.img-wrap img').attr('data-src');
      const fullLink = item.find('.book__lg-image a').attr('href');
      if (!fullLink) return;
      const path = new URL(fullLink).pathname;
      novels.push({
        name: title,
        cover,
        path,
      });
    });
    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const text = await fetchText(`${this.site}${novelPath}`);
    const loadedCheerio = loadCheerio(text);
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('.book__detail-name').text().trim() || 'Untitled',
    };

    loadedCheerio('.book__detail-text').each((_, el) => {
      const text = loadedCheerio(el).text().trim();
      if (text.startsWith('Tác giả:')) {
        novel.author = text.replace('Tác giả:', '').trim();
      } else if (text.startsWith('Tag:')) {
        novel.genres = text
          .replace('Tag:', '')
          .trim()
          .split(',')
          .map(g => g.trim())
          .filter(g => g)
          .join(',');
      } else if (text.startsWith('Tình trạng:')) {
        const statusText = text.toLowerCase();
        if (statusText.includes('full')) {
          novel.status = NovelStatus.Completed;
        } else if (statusText.includes('đang tiến hành')) {
          novel.status = NovelStatus.Ongoing;
        } else {
          novel.status = NovelStatus.Unknown;
        }
      } else if (text.startsWith('Designer:')) {
        novel.artist = text.replace('Designer:', '').trim();
      }
    });
    novel.cover =
      loadedCheerio('.book__detail-image')
        .first()
        .children()
        .first()
        .attr('src') || defaultCover;
    novel.summary = loadedCheerio('.tab-comic-description')
      .html()
      ?.trim()
      .replace(/<br>/g, '\n');

    const chapters: Plugin.ChapterItem[] = [];
    loadedCheerio('tbody.chapter-list-inner tr.sort-item').each(
      (index, element) => {
        const row = loadedCheerio(element);

        const nameElement = row.find('.list-chapter__name a');

        let chapterName = nameElement.text().replace(/\s+/g, ' ').trim();
        const chapterLink = new URL(
          nameElement.attr('href') || 'https://luvevaland.co/',
        );
        let chapterPath = chapterLink.pathname;

        const costElement = row.find('.list-chapter__cost');
        const iconAlt = costElement.find('img').attr('alt');

        if (iconAlt === 'Chương hp-mp') {
          chapterName = `🔒 ${chapterName}`;
          chapterPath = `/login-lock#${index}&${novelPath}`;
        } else if (iconAlt === 'Chương chờ') {
          chapterName = `⏳ ${chapterName}`;
          chapterPath = `/time-lock#${index}&${novelPath}`;
        }

        if (chapterPath === '/') return;

        // const wordCount = row.find('.list-chapter__number').text().trim();
        // const views = row.find('.list-chapter__view').text().trim();

        // DD/MM/YYYY
        const updateDate = this.convertDDMMYYYY(
          row.find('.list-chapter__date').text().trim(),
        );

        chapters.push({
          name: chapterName,
          path: chapterPath,
          releaseTime: updateDate,
          chapterNumber: index + 1,
        });
      },
    );
    novel.chapters = chapters;
    console.log('Parsed novel:', novel);
    return novel;
  }

  convertDDMMYYYY(dateStr: string) {
    const [day, month, year] = dateStr.split('/');
    if (!day || !month || !year) return null;
    // Return YYYY-MM-DD
    return `${year}-${month}-${day}`;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.includes('/login-lock')) {
      throw new Error(
        'This chapter is locked. Please log in to view its content.',
      );
    } else if (chapterPath.includes('/time-lock')) {
      throw new Error(
        'This chapter is not yet available. Please check back later.',
      );
    }
    const response = await fetchText(`${this.site}${chapterPath}`);
    const $ = loadCheerio(response);
    const chapterContent = $('#chapter-content').html()!;
    return chapterContent;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const novels: Plugin.NovelItem[] = [];
    // https://luvevaland.co/tim-kiem?s=anh&word_type=2&status=&sort-by=name&sort-desc=desc&sort-view=&sort-number-chapter=&sort-date-update=&sort-number-word=
    const url = new URL(`${this.site}/tim-kiem`);
    url.searchParams.set('s', searchTerm);
    url.searchParams.set('word_type', '2'); // Novel only
    const response = await fetchText(url.toString());
    const loadedCheerio = loadCheerio(response);
    const firstTable = loadedCheerio('table.book__list').first();
    firstTable.find('tbody tr').each((i, row) => {
      const el = loadedCheerio(row);
      const titleEl = el.find('.book__list-name a');
      const title = titleEl
        .clone() // clone để tránh lấy text của <span> bên trong
        .children()
        .remove()
        .end()
        .text()
        .trim();
      const url = titleEl.attr('href');
      if (!url) return;
      const path = new URL(url).pathname;
      const cover = el.find('.book__list-image img').attr('data-src');
      novels.push({
        name: title,
        path,
        cover,
      });
    });
    return novels;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new LuvevalandPlugin();
