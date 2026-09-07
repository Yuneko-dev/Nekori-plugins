import { fetchApi, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { Buffer } from '@libs/utils';

class LNKuroPlugin implements Plugin.PluginBase {
  id = 'lnkuro';
  name = 'LNKuro';
  icon = 'icon.png';
  site = 'https://lnkuro.top';
  version = '1.0.10';
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
        { label: 'Đô Thị Dị Biến', value: 'do-thi' },
        { label: 'Drama', value: 'drama' },
        { label: 'Echi', value: 'echi' },
        { label: 'Fantasy', value: 'fantasy' },
        { label: 'Gender Bender', value: 'gender-bender' },
        { label: 'Harem', value: 'harem' },
        { label: 'Historical', value: 'historical' },
        { label: 'Horror', value: 'horror' },
        { label: 'Huyền huyễn', value: 'huyen-huyen' },
        { label: 'Kiếm Hiệp', value: 'wuxia' },
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
        { label: 'Truyện Trung', value: 'truyen-trung' },
        { label: 'Võ Hiệp', value: 'vo-hiep' },
        { label: 'Võ thuật', value: 'vo-thuat' },
        { label: 'Web Novel', value: 'web-novel' },
        { label: 'Xianxia', value: 'xianxia' },
        { label: 'Yandere', value: 'yandere' },
        { label: 'Yuri', value: 'yuri' },
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
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    if (filters.genre.value != '') {
      const url = `${this.site}/the-loai/${filters.genre.value}/?krp=${pageNo}&sort=${filters.sort.value}`;
      let text = await fetchText(url);
      text = text.replace(
        /<script\b([^>]*?)\bsrc=["']data:text\/javascript;base64,([^"']+)["']([^>]*)><\/script>/gi,
        (_, before, base64, after) => {
          const js = Buffer.from(base64, 'base64').toString('utf8');
          return `<script${before}${after}>${js}</script>`;
        },
      );
      // Opt
      const ajaxUrl = text.match(
        /const\s+AJAX_URL\s*=\s*["']([^"']+)["']/,
      )?.[1];
      const nonce = text.match(/const\s+NONCE\s*=\s*["']([^"']+)["']/)?.[1];
      const loaiId = text.match(/const\s+LOAI_ID\s*=\s*(\d+)/)?.[1];
      if ((!ajaxUrl || !nonce || !loaiId) && filters.sort.value === 'updated') {
        throw new Error(
          'Regex không khớp. Hãy kiểm tra lại trang web hoặc cập nhật plugin.',
        );
      }
      const body = new URLSearchParams({
        action: 'kr_load_terms',
        nonce: nonce!,
        sort: filters.sort.value,
        page: `${pageNo}`,
        loai_id: loaiId!,
      });
      const response = await fetchApi(ajaxUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      const jsonResponse = await response.json();
      let $: ReturnType<typeof loadCheerio>;
      if (response.ok && jsonResponse.success && jsonResponse.data?.html) {
        $ = loadCheerio(jsonResponse.data.html);
      } else {
        $ = loadCheerio(text);
      }

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
    } else if (showLatestNovels) {
      const data = await fetchApi(
        `${this.site}/wp-content/uploads/truyen_moi_cap_nhat.json?v=${Date.now()}`,
      );
      const json = (await data.json()) as {
        name: string;
        link: string;
        image: string;
        tom_tat: string;
        tac_gia: string;
        tinh_trang: {
          value: string;
          label: string;
        };
        avg_rating: string;
        is_r18: boolean;
        the_loai: {
          name: string;
          link: string;
        }[];
        chapters: {
          title: string;
          link: string;
          time_str: string;
        }[];
        latest_ts: number;
      }[];
      json
        .sort((a, b) => b.latest_ts - a.latest_ts)
        .forEach(item => {
          const url = new URL(item.link);
          novels.push({
            name: item.name,
            cover: item.image,
            path: url.pathname,
          });
        });
    } else {
      const data = await fetchApi(
        `${this.site}/wp-content/uploads/bxh_truyen.json?v=${Date.now()}`,
      );
      const json = (await data.json()) as {
        title: string;
        link: string;
        real_cover: string;
        views_week: number;
        views_month: number;
        views_all: number;
        tag_ids: number[];
        tags_info: {
          name: string;
          link: string;
        }[];
        status_value: string;
        status_label: string;
        avg_rating: string | null;
        tom_tat: string;
      }[];
      json
        .sort((a, b) => b.views_all - a.views_all)
        .forEach(item => {
          const url = new URL(item.link);
          novels.push({
            name: item.title,
            cover: item.real_cover,
            path: url.pathname,
          });
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

    const webnovelSection = $('.section_kuro');

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
    const chapterElementRaw = $('.kuro-chapter-content');

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
      throw new Error(
        'Chương không có nội dung, yêu cầu VIP / đăng nhập hoặc plugin bị lỗi.',
      );
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
