// VNExpress - Vietnamese news via RSS (https://vnexpress.net/rss)

import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { ContentType } from '@libs/pluginMetadata';

const SEARCH_SITE = 'https://timkiem.vnexpress.net';

class VnExpressPlugin implements Plugin.PluginBase {
  id = 'vnexpress.net';
  name = 'VNExpress';
  icon = 'src/vi/vnexpress/icon.png';
  site = 'https://vnexpress.net';
  version = '1.0.0';
  contentType = ContentType.MIXED;
  filters: Filters = {
    page: {
      label: 'Chuyên mục',
      type: FilterTypes.Picker,
      options: [
        { label: 'Tin mới nhất', value: 'rss/tin-moi-nhat.rss' },
        { label: 'Tin nổi bật', value: 'rss/tin-noi-bat.rss' },
        { label: 'Tin xem nhiều', value: 'rss/tin-xem-nhieu.rss' },
        { label: 'Thời sự', value: 'rss/thoi-su.rss' },
        { label: 'Thế giới', value: 'rss/the-gioi.rss' },
        { label: 'Kinh doanh', value: 'rss/kinh-doanh.rss' },
        { label: 'Khoa học - Công nghệ', value: 'rss/khoa-hoc-cong-nghe.rss' },
        { label: 'Giải trí', value: 'rss/giai-tri.rss' },
        { label: 'Thể thao', value: 'rss/the-thao.rss' },
        { label: 'Pháp luật', value: 'rss/phap-luat.rss' },
        { label: 'Giáo dục', value: 'rss/giao-duc.rss' },
        { label: 'Sức khỏe', value: 'rss/suc-khoe.rss' },
        { label: 'Đời sống', value: 'rss/gia-dinh.rss' },
        { label: 'Du lịch', value: 'rss/du-lich.rss' },
        { label: 'Ô tô - Xe máy', value: 'rss/oto-xe-may.rss' },
        { label: 'Bất động sản', value: 'rss/bat-dong-san.rss' },
        { label: 'Ý kiến', value: 'rss/y-kien.rss' },
        { label: 'Góc nhìn', value: 'rss/goc-nhin.rss' },
      ],
      value: 'rss/tin-moi-nhat.rss',
    },
  };
  cacheSet = new Set<string>();

  /**
   * RSS chỉ trả ~30 bài mới nhất và không có phân trang,
   * nên danh sách chỉ được lấy ở trang 1.
   */
  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1) {
      return [];
    }
    const novels: Plugin.NovelItem[] = [];
    this.cacheSet.clear();
    const response = await fetchText(
      `${this.site}/${filters.page?.value || 'rss/tin-moi-nhat.rss'}`,
    );
    const $ = loadCheerio(response, { xmlMode: true });
    $('item').each((_, element) => {
      const item = $(element);
      const title = item.find('title').first().text().trim();
      const link = item.find('link').first().text().trim();
      if (!title || !link) {
        return;
      }
      if (this.cacheSet.has(link)) {
        return;
      }
      // Ảnh nằm trong <enclosure> hoặc thẻ <img> đầu tiên trong description CDATA
      const enclosureUrl = item.find('enclosure').attr('url');
      let cover = enclosureUrl || defaultCover;
      if (cover === defaultCover) {
        const descriptionHtml = item.find('description').first().text();
        const imgSrc = loadCheerio(descriptionHtml, { xmlMode: true })(
          'img',
        ).attr('src');
        cover = imgSrc || defaultCover;
      }
      novels.push({
        name: title,
        path: link.replace(this.site, ''),
        cover,
      });
      this.cacheSet.add(link);
    });
    return novels;
  }

  /** "Thứ tư, 26/8/2026, 11:13 (GMT+7)" -> ISO string */
  parseVnexpressDate(text: string): string | undefined {
    const match = text.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{1,2})/,
    );
    if (!match) {
      return undefined;
    }
    const [, day, month, year, hour, minute] = match;
    // GMT+7 -> UTC
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 7,
        Number(minute),
      ),
    );
    return isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  async parseNovel(novelPath: string): Promise<
    Plugin.SourceNovel & {
      content: string;
    }
  > {
    const text = await fetchText(`${this.site}${novelPath}`);
    const $ = loadCheerio(text);

    const novel: Plugin.SourceNovel & {
      content: string;
    } = {
      path: novelPath,
      content: '',
      name: '',
    };

    const article = $('article.fck_detail');
    if (!article.length) {
      throw new Error('Failed to find article content in the novel page');
    }

    novel.name =
      $('h1.title-detail').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      '';
    novel.summary = $('p.description').text().trim();

    // Ảnh bìa: ưu tiên data-src của ảnh đầu tiên trong bài
    const firstImage =
      article.find('figure img[data-src]').first().attr('data-src') ||
      article.find('img[itemprop="contentUrl"]').first().attr('src') ||
      $('meta[property="og:image"]').attr('content');
    novel.cover = firstImage || defaultCover;

    // Thể loại: mục đầu tiên trong breadcrumb
    novel.genres = $('ul.breadcrumb li a').first().text().trim() || '';

    novel.status = NovelStatus.Completed;

    // Bài báo thường không có dòng tác giả đọc được máy
    novel.author = 'VNExpress';
    const releaseTime = this.parseVnexpressDate($('span.date').first().text());
    novel.chapters = [
      {
        name: 'Ấn vào để xem chi tiết bài viết',
        path: novelPath + '#read',
        chapterNumber: 0,
        releaseTime:
          releaseTime ||
          new Date(
            Date.parse(
              $('meta[property="article:published_time"]').attr('content') ||
                '',
            ) || Date.now(),
          ).toISOString(),
      },
    ];

    // Làm sạch nội dung bài viết trong bản sao của <article>
    const body = article.clone();
    body
      .find(
        'script, style, iframe, ul.list-news, ul.link_content, .item_quiz, .box_comment, .widget, .mb20, .block_ads',
      )
      .remove();
    // Bỏ h1/mô tả vì đã đưa vào trường riêng
    body.find('h1.title-detail, p.description').remove();
    // Khôi phục ảnh lazy-load: src placeholder base64 -> data-src thật
    body.find('img').each((_, img) => {
      const el = $(img);
      const realSrc =
        el.attr('data-src') ||
        el.attr('data-original') ||
        (el.attr('src') && !el.attr('src')!.startsWith('data:')
          ? el.attr('src')
          : undefined);
      if (realSrc) {
        el.attr('src', realSrc);
      } else {
        el.remove();
      }
      el.removeAttr('data-src data-original class style intrinsicsize');
    });
    body.find('picture source').remove(); // source dùng data-srcset, vô dụng khi không có JS
    body.find('figcaption').each((_, cap) => {
      const el = $(cap);
      const captionText = el.text().trim();
      if (captionText) {
        el.html(`<em>${captionText}</em>`);
      }
    });

    novel.content =
      `<h2>${novel.name}</h2>\n` +
      `<p><em>${novel.summary}</em></p>\n` +
      body.html()?.trim();

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const path = chapterPath.replace(/#.*$/, '');
    const novel = await this.parseNovel(path);
    return novel.content || '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    const url =
      `${SEARCH_SITE}/?q=${encodeURIComponent(searchTerm)}` +
      `&media_type=all&fromdate=0&todate=0&latest=&cate_code=` +
      `&search_f=title,tag_list&date_format=all&page=${pageNo}`;
    const response = await fetchText(url);
    const $ = loadCheerio(response);
    $('article.item-news').each((_, element) => {
      const item = $(element);
      const linkEl = item.find('h3.title-news a').first();
      const title = linkEl.attr('title') || linkEl.text().trim();
      const href = linkEl.attr('href');
      if (!title || !href) {
        return;
      }
      // Ảnh thật nằm trong data-srcset của <source>, img chỉ có placeholder base64
      const srcset = item
        .find('picture source[data-srcset]')
        .first()
        .attr('data-srcset');
      const thumbImg = item.find('a.thumb img').first();
      const rawCover =
        (srcset ? srcset.split(/\s+/)[0] : '') ||
        thumbImg.attr('data-src') ||
        thumbImg.attr('src') ||
        '';
      if (!rawCover || rawCover.startsWith('data:')) {
        return;
      }
      novels.push({
        name: title.trim(),
        path: href.startsWith('http') ? href.replace(this.site, '') : href,
        cover: rawCover.startsWith('//') ? 'https:' + rawCover : rawCover,
      });
    });
    return novels;
  }
  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new VnExpressPlugin();
