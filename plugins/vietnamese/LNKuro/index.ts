import { fetchApi, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class LNKuroPlugin implements Plugin.PluginBase {
  id = 'lnkuro';
  name = 'LNKuro';
  icon = 'src/vi/lnkuro/icon.png';
  site = 'https://lnkuro.top';
  version = '1.0.7';
  filters = {
    genre: {
      label: 'Thể loại',
      type: FilterTypes.Picker,
      value: '',
      options: [
        { label: 'None', value: '' },
        { label: 'Action', value: 'action' },
        { label: 'Adventure', value: 'adventure' },
        { label: 'Comedy', value: 'comedy' },
        { label: 'Drama', value: 'drama' },
        { label: 'Echi', value: 'echi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Mature', value: 'mature' },
        { label: 'Mystery', value: 'mystery' },
        { label: 'Psychological', value: 'psychological' },
        { label: 'Romance', value: 'romance' },
        { label: 'School Life', value: 'truyen-han-quoc-hoc-duong' },
        { label: 'Sci-fi', value: 'sci-fi' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Slice of Life', value: 'slice-of-life' },
        { label: 'Sport', value: 'sport' },
        { label: 'Supernatural', value: 'supernatural' },
        { label: 'Thriller', value: 'thriller' },
        { label: 'Tragedy', value: 'tragedy' },
        { label: 'Võ Hiệp', value: 'vo-hiep' },
        { label: 'Võ thuật', value: 'vo-thuat' },
        { label: 'Web Novel', value: 'web-novel' },
        { label: 'Wuxia', value: 'wuxia' },
        { label: 'Yandere', value: 'yandere' },
      ],
    },
    sort: {
      label: 'Sắp xếp',
      type: FilterTypes.Picker,
      value: 'views',
      options: [
        { label: 'Xem nhiều', value: 'views' },
        { label: 'Mới cập nhật', value: 'updated' },
      ],
    },
  } satisfies Filters;

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let url = `${this.site}/`;
    if (filters.genre.value != '') {
      url = `${this.site}/the-loai/${filters.genre.value}/?krp=${pageNo}&sort=${filters.sort.value}`;
    }

    const text = await fetchText(url);
    const $ = loadCheerio(text);
    const novels: Plugin.NovelItem[] = [];

    if (url == `${this.site}/`) {
      if (pageNo != 1) {
        return [];
      }
      $('.truyen-card').each((i, el) => {
        const card = $(el);
        const cover = card.find('.truyen-thumb img').attr('data-src');
        const name = card.find('.truyen-info h3.title').text().trim();
        const url = card
          .find('.truyen-tooltip .tooltip-footer a.tooltip-button')
          .attr('href')!;
        if (url) {
          const path = new URL(url).pathname;
          novels.push({
            name,
            cover,
            path,
          });
        }
      });
    } else {
      $('.kr-card').each((i, el) => {
        const card = $(el);
        const cover = card.find('.kr-card__cover img').attr('data-src');
        const name = card.find('.kr-card__title a').text().trim();
        const url = card.find('.kr-card__title a').attr('href')!;
        if (url) {
          const path = new URL(url).pathname;
          novels.push({
            name,
            cover,
            path,
          });
        }
      });
    }

    return novels;
  }
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const text = await fetchText(`${this.site}${novelPath}`);
    if (!text) {
      throw new Error('Không thể tải truyện');
    }
    const $ = loadCheerio(text);

    const name = $('title').text();

    const authorLine = $('p:contains("Tác giả")').text();
    const author = authorLine.replace('Tác giả:', '').trim();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name,
      author,
    };

    novel.cover = $('.cover_kuro img').attr('data-src') || defaultCover;
    novel.genres = $('.genres_kuro a')
      .map((i, el) => $(el).text().trim())
      .get()
      .join(',');
    const statusLine = $('p:contains("Tình trạng")').text().toLowerCase();
    if (statusLine.includes('ongoing')) {
      novel.status = NovelStatus.Ongoing;
    } else {
      novel.status = NovelStatus.Completed;
    }
    const summaryLine = $('.summary_kuro div').first().text().trim();
    novel.summary = summaryLine.replace('Tóm tắt', '').trim();

    const chapters: Plugin.ChapterItem[] = [];

    const webnovelSection = $('#webnovel_section');

    $('.kuro-edit-badge').each((i, el) => {
      $(el).remove();
    });

    webnovelSection.each((i, el) => {
      const w = loadCheerio(el);
      const volumeName = w('.section-title_kuro').text().trim();
      w('.novel_kuro ul.chapter-list_kuro li').each((i, el) => {
        const li = $(el);
        const aTag = li.find('a');

        const chapterName = aTag
          .text()
          .trim()
          .replace(/[\n\s]+/g, ' ');
        const chapterUrl = aTag.attr('href')!;
        const releaseTime =
          li.find('span.date').text().trim() || li.find('span').text().trim(); // DD/MM/YYYY

        const isVip = li.find('.fa-solid.fa-crown').length > 0;

        const chapterPath = new URL(chapterUrl).pathname;

        chapters.push({
          name: isVip ? `👑 ${chapterName}` : chapterName,
          path: chapterPath,
          releaseTime: this.convertDate(releaseTime),
          page: volumeName,
        });
      });
    });

    novel.chapters = chapters;

    if (novel.chapters.length === 0) {
      throw new Error(
        'Không tìm thấy chương nào hoặc truyện yêu cầu đăng nhập',
      );
    }

    console.log(novel);
    return novel;
  }
  convertDate(ddmmyyyy: string) {
    const [day, month, year] = ddmmyyyy.split('/');
    return `${year}-${month}-${day}`;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchText(`${this.site}${chapterPath}`);
    if (!response) throw new Error(`API error: ${this.site}${chapterPath}`);
    const $ = loadCheerio(response);
    const chapterElementRaw = $('.entry-content.single-page');
    chapterElementRaw.find('#kuro-chapter-nav-wrapper').remove();
    chapterElementRaw.find('.post-views_kuro').remove();

    let isP = false;
    chapterElementRaw.children().each((i, el) => {
      if (isP) return;
      const $el = $(el);
      if ($el.is('p')) {
        isP = true;
        return;
      } else {
        $el.remove();
      }
    });

    // remove ads
    chapterElementRaw.find('#vip-inline-gold-hyper').parent().remove();
    $('.post-views').each((i, el) => {
      $(el).remove();
    });
    $('.blog-share').each((i, el) => {
      $(el).remove();
    });
    chapterElementRaw
      .children('div')
      .filter(function () {
        const textContent = $(this).text().toLowerCase();
        const ads = ['discord kuro', 'lnkuro.top', 'xem minh họa'];
        const isAdBlock = ads.some(ad => textContent.includes(ad));
        return isAdBlock;
      })
      .remove();
    const chapterContent = chapterElementRaw.html()!.trim()!;
    if (chapterContent.length <= '<p></p>'.length)
      throw new Error('Chương không có nội dung hoặc bị lỗi');
    return chapterContent;
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) return [];
    const novels: Plugin.NovelItem[] = [];
    const text = await fetchText(`${this.site}/truyen-han-quoc/`);
    const $ = loadCheerio(text);
    const nonceValue = $('input[name="kr_nonce"]').val();

    const urlencoded = new URLSearchParams();
    urlencoded.append('q', searchTerm);
    urlencoded.append('action', 'kr_search_truyen');
    urlencoded.append('kr_nonce', nonceValue as string);
    urlencoded.append('page', pageNo.toString());
    urlencoded.append('per_page', '12');

    const data = await fetchApi('https://lnkuro.top/wp-admin/admin-ajax.php', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'origin': 'https://lnkuro.top',
        'referer': 'https://lnkuro.top/truyen-han-quoc/',
      },
      body: urlencoded.toString(),
      redirect: 'follow',
      method: 'POST',
    });
    const json = (await data.json()) as {
      success: boolean;
      msg?: string;
      items?: {
        title: string;
        link: string;
        cover: string;
        status_key: string;
        status_label: string;
        tags: {
          name: string;
          link: string;
        }[];
        chapter_count: number;
        latest_time: string;
        avg_rating: string;
        r18: boolean;
        taxonomy: string;
        term_id: number;
      }[];
      page?: number;
      per_page?: number;
      total?: number;
      total_pages?: number;
      has_next?: boolean;
      has_prev?: boolean;
    };
    if (!json.success || !json.items) return [];
    json.items.forEach(item => {
      const url = new URL(item.link);
      novels.push({
        name: item.title,
        path: url.pathname,
        cover: item.cover,
      });
    });
    return novels;
  }
}

export default new LNKuroPlugin();
