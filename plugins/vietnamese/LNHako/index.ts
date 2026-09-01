import { fetchApi } from '@libs/fetch';
import { load } from 'cheerio';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { storage } from '@libs/storage';
import filters from './filters';
import {
  decodeProtectedContent,
  htmlToMarkdown,
  parseDmyToIso,
  parseProtectedChunks,
  urlToPath,
} from './utils';

class HakoPlugin implements Plugin.PluginBase {
  id = 'ln.hako.vn';
  name = 'Hako Novel';
  icon = 'src/vi/hakolightnovel/icon.png';
  version = '1.2.20';
  filters = filters;

  customCSS = 'src/vi/hakolightnovel/custom.css';
  customJS = 'src/vi/hakolightnovel/custom.js';

  pluginSettings: Plugin.PluginSettings = {
    domain: {
      value: 'https://ln.hako.vn',
      label: 'Chọn tên miền',
      type: 'Select',
      options: [
        {
          label: 'ln.hako.vn',
          value: 'https://ln.hako.vn',
        },
        {
          label: 'docln.sbs',
          value: 'https://docln.sbs',
        },
        {
          label: 'docln.net',
          value: 'https://docln.net',
        },
      ],
    },
    showAllChapters: {
      value: false,
      label:
        'Hiển thị tất cả các chương, không chia theo Volume. Tên chương có dạng [{volume_name}]: {chapter_name}',
      type: 'Switch',
    },
    showTitleInfo: {
      value: false,
      label: 'Hiển thị tên Volume, Chapter và thông tin truyện ở đầu chương',
      type: 'Switch',
    },
    showChapterComments: {
      value: false,
      label: 'Hiển thị bình luận ở cuối mỗi chương (thử nghiệm)',
      type: 'Switch',
    },
    showMetadataInDescription: {
      value: false,
      label:
        'Hiển thị chi tiết thông tin truyện trong mô tả. Cũng sử dụng markdown để hiển thị.',
      type: 'Switch',
    },
  };

  get site() {
    return this.domain || 'https://ln.hako.vn';
  }

  get domain() {
    return storage.get('domain') as string;
  }

  get showAllChapters() {
    return storage.get('showAllChapters') as boolean;
  }

  get showChapterComments() {
    return storage.get('showChapterComments') as boolean;
  }

  get showTitleInfo() {
    return storage.get('showTitleInfo') as boolean;
  }

  get showMetadataInDescription() {
    return storage.get('showMetadataInDescription') as boolean;
  }

  private async fetchHtml(
    path: string,
    validator?: (html: string) => boolean,
  ): Promise<string> {
    const res = await fetchApi(this.site + path);
    console.log(`Fetched ${this.site + path} - Status: ${res.status}`);
    const html = res.ok ? await res.text() : '';
    // Idk why hako returns 403 but fetchjs return 200???
    const $ = load(html);
    // Check class: error-page, error-name, error-note
    const errorPage = $('.error-page');
    const errorName = errorPage.find('.error-name')?.first()?.text()?.trim();
    const errorNote = errorPage.find('.error-note')?.first().text()?.trim();
    if (errorPage?.length || errorName?.length || errorNote?.length) {
      throw new Error(`Hako error: ${errorName} - ${errorNote}`);
    }
    if (html && (!validator || validator(html))) {
      return html;
    } else {
      throw new Error('Failed to fetch valid HTML from ' + this.site);
    }
  }

  async parseNovels(url: string) {
    const html = await fetchApi(url).then(res => res.text());
    const $ = load(html);
    const novels: Plugin.NovelItem[] = [];

    $('.thumb-item-flow').each((_, ele) => {
      const name = $(ele).find('.series-title a').attr('title') || '';
      let path = $(ele).find('.series-title a').attr('href') || '';
      path = urlToPath(path);
      const cover = $(ele).find('.img-in-ratio').attr('data-bg') || '';

      if (name && path) {
        novels.push({ name, path, cover });
      }
    });

    return novels;
  }
  async popularNovels(
    pageNo: number,
    {
      filters,
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = new URL(`${this.site}/tim-kiem-nang-cao`);
    if (showLatestNovels) {
      filters = {
        author: this.filters.author,
        illustrator: this.filters.illustrator,
        title: this.filters.title,
        status: this.filters.status,
        sapxep: {
          ...this.filters.sapxep,
          value: 'capnhat',
        },
        genres: this.filters.genres,
        seriestype: this.filters.seriestype,
      } as typeof this.filters;
    }
    if (filters) {
      url.searchParams.set(
        'author',
        filters.author?.value ?? this.filters.author.value,
      );
      url.searchParams.set(
        'illustrator',
        filters.illustrator?.value ?? this.filters.illustrator.value,
      );
      url.searchParams.set(
        'title',
        filters.title?.value ?? this.filters.title.value,
      );
      url.searchParams.set(
        'status',
        filters.status?.value ?? this.filters.status.value,
      );
      url.searchParams.set(
        'sapxep',
        filters.sapxep?.value ?? this.filters.sapxep.value,
      );
      url.searchParams.set(
        'seriestype',
        filters.seriestype?.value ?? this.filters.seriestype.value,
      );
      const genres = filters.genres?.value ?? this.filters.genres.value;
      if (genres.include?.length) {
        url.searchParams.set('selectgenres', genres.include.join(','));
      }
      if (genres.exclude?.length) {
        url.searchParams.set('rejectgenres', genres.exclude.join(','));
      }
    }
    if (pageNo > 1) {
      url.searchParams.set('page', pageNo.toString());
    }
    return this.parseNovels(url.toString());
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    novelPath = urlToPath(novelPath);
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: '',
      author: '',
      artist: '',
      summary: '',
      genres: '',
      status: '',
    };
    const html = await this.fetchHtml(
      novelPath,
      html => load(html)('.volume-list .list-chapters li').length > 0,
    );

    const $ = load(html);

    const novelType = $('.series-type').first().text().trim();
    novel.name = $('.series-name').first().text().trim();

    if (this.showMetadataInDescription) {
      const summary = htmlToMarkdown($('.summary-content').html() || '');
      const prefixHeader = '## ✦';
      const facts = $('.fact-item')
        .map((_, el) => {
          const factName = $(el)
            .find('.fact-name')
            .first()
            .text()
            .trim()
            .replace(/:$/, '');

          const factValue = htmlToMarkdown(
            $(el).find('.fact-value').html() || '',
          );
          return `${prefixHeader} ${factName}\n${factValue}`;
        })
        .get();
      const note = $('.series-note').first();
      const result = note.length
        ? {
            title: note.find('header .sect-title').first().text().trim(),
            content: note.find('main').first().html()?.trim() ?? '',
          }
        : null;

      novel.summary = [
        ...(facts.length ? facts : []),
        `${prefixHeader} Tóm tắt`,
        summary,
        ...(result
          ? [
              `${prefixHeader} ${result.title}`,
              htmlToMarkdown(result.content).trim(),
            ]
          : []),
      ].join('\n');
    } else {
      novel.summary = $('.summary-content p')
        .map(function () {
          return $(this).text().trim();
        })
        .get()
        .join('\n');
    }

    const coverEl = $('.series-cover .img-in-ratio').first();
    const coverDataBg = coverEl.attr('data-bg')?.trim();
    if (coverDataBg) {
      novel.cover = coverDataBg;
    } else {
      const style = coverEl.attr('style') || '';
      const matchedCover = style.match(/url\(['"]?(.*?)['"]?\)/i);
      if (matchedCover?.[1]) {
        novel.cover = matchedCover[1];
      }
    }

    novel.genres = $('.series-gernes .series-gerne-item')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean)
      .join(',');

    novel.genres = `${novelType ? novelType : '🐛'},${novel.genres}`;

    const infoItems = $('.series-information .info-item');
    novel.author = '';
    novel.artist = '';
    novel.status = '';

    infoItems.each((_, element) => {
      const item = $(element);
      const label = item.find('.info-name').first().text().toLowerCase().trim();
      const value = item
        .find('.info-value')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      if (!value) {
        return;
      }

      if (!novel.author && label.includes('tác giả')) {
        novel.author = value;
        return;
      }

      if (
        !novel.artist &&
        (label.includes('họa sĩ') ||
          label.includes('hoạ sĩ') ||
          label.includes('artist'))
      ) {
        novel.artist = value;
        return;
      }

      if (!novel.status && label.includes('tình trạng')) {
        novel.status = value;
      }
    });

    const parsedChapters: Plugin.ChapterItem[] = [];
    let num = 0;
    let part = 1;

    $('.volume-list').each((_, volumeElement) => {
      const volume = $(volumeElement)
        .find('.sect-title')
        .first()
        .text()
        .replace(/\*/g, '') // ?
        .replace(/\s+/g, ' ')
        .trim();

      $(volumeElement)
        .find('.list-chapters > li')
        .each((__, chapterElement) => {
          const chapterNode = $(chapterElement).find('.chapter-name a').first();
          let path = chapterNode.attr('href') || '';
          path = urlToPath(path);
          const name =
            chapterNode.attr('title')?.trim() ||
            chapterNode.text().replace(/\s+/g, ' ').trim();

          if (!path || !name) {
            return;
          }

          const matchedChapterNumber = name.match(
            /(?:chương|chapter)\s*(\d+(?:\.\d+)?)/i,
          );

          let chapterNumber = num + part / 10;
          if (matchedChapterNumber) {
            const parsedNumber = Number(matchedChapterNumber[1]);
            if (!Number.isNaN(parsedNumber) && parsedNumber > 0) {
              if (num === parsedNumber) {
                chapterNumber = num + part / 10;
                part += 1;
              } else {
                num = parsedNumber;
                part = 1;
                chapterNumber = parsedNumber;
              }
            }
          } else {
            part += 1;
          }

          const chapter: Plugin.ChapterItem = {
            path,
            name,
            page: volume,
            chapterNumber,
          };

          if (this.showAllChapters) {
            delete chapter.page;
            chapter.name = `[${volume}]: ${chapter.name}`;
          }

          const releaseTimeRaw = $(chapterElement)
            .find('.chapter-time')
            .first()
            .text();
          const releaseTime = parseDmyToIso(releaseTimeRaw);
          if (releaseTime) {
            chapter.releaseTime = releaseTime;
          }

          parsedChapters.push(chapter);
        });
    });

    novel.chapters = parsedChapters;
    switch (novel.status?.trim()) {
      case 'Đang tiến hành':
      case 'đang tiến hành':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'Tạm ngưng':
      case 'tạm ngưng':
        novel.status = NovelStatus.OnHiatus;
        break;
      case 'Đã hoàn thành':
      case 'Hoàn thành':
      case 'đã hoàn thành':
      case 'hoàn thành':
      case 'Completed':
        novel.status = NovelStatus.Completed;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }
    novel.genres = novel.genres?.replace(/,*\s*$/, '');
    novel.name = novel.name.trim();
    novel.summary = novel.summary?.trim();

    console.log(novel);
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.fetchHtml(
      chapterPath,
      html => load(html)('div#chapter-content').length > 0,
    );

    const $ = load(html);
    const chapterContainer = $('div#chapter-content').first();

    if (!chapterContainer.length) {
      return '';
    }

    const protectedContent = chapterContainer
      .find('#chapter-c-protected')
      .first();

    if (protectedContent.length) {
      const mode = protectedContent.attr('data-s') || '';
      const key = protectedContent.attr('data-k') || '';
      const chunks = parseProtectedChunks(
        protectedContent.attr('data-c') || '',
      );
      const decodedContent = decodeProtectedContent(mode, key, chunks);

      if (decodedContent.trim()) {
        protectedContent.replaceWith(decodedContent);
      } else {
        protectedContent.remove();
      }
    }

    $('a').each((_, el) => {
      // console.log('Processing link:', $(el).attr('href'), $(el).html());
      const href = $(el).attr('href');
      if (href && href.startsWith('/')) {
        if ($(el).attr('target')) {
          $(el).remove();
        } else {
          $(el).attr('href', '#skip-link');
        }
      }
    });

    chapterContainer
      .find(
        'p.none,script,style,iframe,[style*="display: none"],[style*="display:none"]',
      )
      .remove();

    const chapterText = (chapterContainer.html() || '')
      .replace(/<p id="\d+">/g, '<p>')
      // .replace(/\[note\d+]/gi, '')
      .replace(/&nbsp;/g, '')
      // .replace(/\[Lên trên\]/gi, '🔼')
      // Fix mixed content for images
      .replace(/(<img\b[^>]*\bsrc\s*=\s*["'])http:\/\//gi, '$1https://')
      .trim();

    if (!chapterText) {
      return '';
    }

    let output = `<div>\n${chapterText}\n</div>`;

    if (this.showChapterComments) {
      // Comment
      const commentSection = $('#chapter-comments').first();
      // Báo cáo bình luận không phù hợp
      commentSection.find('#fbcmt_root > span').remove();
      // Bạn phải đăng nhập hoặc tạo tài khoản để bình luận
      commentSection.find('.ln-comment_sign-in').remove();
      // Comment form (login)
      commentSection
        .find('.ln-comment > header, .ln-comment > script')
        .remove();
      commentSection.find('#ln-comment-submit').remove();
      // Other buttons
      commentSection.find('.do-like').remove();
      commentSection.find('.do-reply').remove();
      commentSection.find('.my-auto').remove();
      commentSection.find('.fas.fa-chevron-down').remove();
      commentSection.find('.ln-comment-page').remove();
      commentSection.find('.comment_see_more').remove();
      commentSection.find('.leading-tight').remove();

      // Remove loading svg
      commentSection.find('.loading').remove();

      // Avatar decoration
      commentSection.find('img[src*="/images/frames"]').remove();

      // Edit comment
      commentSection.find('.ln-comment-toolkit').parent().remove();

      output = `${output}\n<div id="shadow-host"></div>\n${commentSection.prop('outerHTML')}`;
    }

    if (this.showTitleInfo) {
      const volumeName = `<h2>${$('h2.title-item').first().text().trim()}</h2>`;
      const chapterName = `<h4>${$('h4.title-item').first().text().trim()}</h4>`;
      const infoComponent = $('h6.title-item').first();
      const $link = infoComponent.find('a');
      if ($link.length > 0) {
        $link.attr('href', '#chapter-comments');
      }
      const $time = infoComponent.find('time');
      if ($time.length > 0) {
        $time.attr('class', 'chapter-release-time');
        $time.text($time.attr('title')!);
      }
      output = `<div>${volumeName}${chapterName}<h6>${infoComponent.html()}</h6></div>\n${output}`;
    }

    return output;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url = new URL(`${this.site}/tim-kiem`);
    url.searchParams.set('keywords', searchTerm);
    if (pageNo > 1) {
      url.searchParams.set('page', pageNo.toString());
    }
    return this.parseNovels(url.toString());
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }

  imageRequestInit: Plugin.ImageRequestInit = {
    headers: {
      Referer: this.site,
    },
  };
}

export default new HakoPlugin();
