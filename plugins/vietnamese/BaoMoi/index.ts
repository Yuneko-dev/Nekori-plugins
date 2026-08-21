// Easter Eggs

import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { ContentType } from '@libs/pluginMetadata';

class BaoMoiPlugin implements Plugin.PluginBase {
  id = 'baomoi.com';
  name = 'Báo Mới';
  icon = 'src/vi/baomoi/icon.png';
  site = 'https://baomoi.com';
  version = '1.0.12';
  contentType = ContentType.MIXED;
  filters: Filters = {
    page: {
      label: 'Tìm theo trang',
      type: FilterTypes.Picker,
      options: [
        { label: 'Tin mới', value: 'tin-moi.epi' },
        {
          label: 'Thế giới',
          value: 'the-gioi.epi',
        },
        {
          label: 'Xã hội',
          value: 'xa-hoi.epi',
        },
        {
          label: 'Thời sự',
          value: 'thoi-su.epi',
        },
        {
          label: 'Giao thông',
          value: 'giao-thong.epi',
        },
        {
          label: 'Môi trường - Khí hậu',
          value: 'moi-truong-khi-hau.epi',
        },
        {
          label: 'Văn hóa',
          value: 'van-hoa.epi',
        },
        {
          label: 'Nghệ thuật',
          value: 'nghe-thuat.epi',
        },
        {
          label: 'Ẩm thực',
          value: 'am-thuc.epi',
        },
        {
          label: 'Du lịch',
          value: 'du-lich.epi',
        },
        {
          label: 'Kinh tế',
          value: 'kinh-te.epi',
        },
        {
          label: 'Lao động - Việc làm',
          value: 'lao-dong-viec-lam.epi',
        },
        {
          label: 'Tài chính',
          value: 'tai-chinh.epi',
        },
        {
          label: 'Chứng khoán',
          value: 'chung-khoan.epi',
        },
        {
          label: 'Kinh doanh',
          value: 'kinh-doanh.epi',
        },
        {
          label: 'Giáo dục',
          value: 'giao-duc.epi',
        },
        {
          label: 'Học bổng - Du học',
          value: 'hoc-bong-du-hoc.epi',
        },
        {
          label: 'Đào tạo - Thi cử',
          value: 'dao-tao-thi-cu.epi',
        },
        {
          label: 'Thể thao',
          value: 'the-thao.epi',
        },
        /*
        {
          label: 'Bóng đá',
          value: 'listType=3&listId=55',
        },
        */
        {
          label: 'Bóng đá quốc tế',
          value: 'bong-da-quoc-te.epi',
        },
        {
          label: 'Bóng đá Việt Nam',
          value: 'bong-da-viet-nam.epi',
        },
        {
          label: 'Quần vợt',
          value: 'quan-vot.epi',
        },
        {
          label: 'Giải trí',
          value: 'giai-tri.epi',
        },
        {
          label: 'Âm nhạc',
          value: 'am-nhac.epi',
        },
        {
          label: 'Thời trang',
          value: 'thoi-trang.epi',
        },
        {
          label: 'Điện ảnh - Truyền hình',
          value: 'dien-anh-truyen-hinh.epi',
        },
        {
          label: 'Pháp luật',
          value: 'phap-luat.epi',
        },
        {
          label: 'An ninh - Trật tự',
          value: 'an-ninh-trat-tu.epi',
        },
        {
          label: 'Hình sự - Dân sự',
          value: 'hinh-su-dan-su.epi',
        },
        {
          label: 'Khoa học - Công nghệ',
          value: 'khoa-hoc-cong-nghe.epi',
        },
        {
          label: 'CNTT - Viễn thông',
          value: 'cntt-vien-thong.epi',
        },
        {
          label: 'Thiết bị phần cứng',
          value: 'thiet-bi-phan-cung.epi',
        },
        {
          label: 'Khoa học',
          value: 'khoa-hoc.epi',
        },
        {
          label: 'Đời sống',
          value: 'doi-song.epi',
        },
        {
          label: 'Dinh dưỡng - Làm đẹp',
          value: 'dinh-duong-lam-dep.epi',
        },
        {
          label: 'Tình yêu - Hôn nhân',
          value: 'tinh-yeu-hon-nhan.epi',
        },
        {
          label: 'Sức khỏe - Y tế',
          value: 'suc-khoe-y-te.epi',
        },
        {
          label: 'Xe cộ',
          value: 'xe-co.epi',
        },
        {
          label: 'Nhà đất',
          value: 'nha-dat.epi',
        },
        {
          label: 'Quản lý - Quy hoạch',
          value: 'quan-ly-quy-hoach.epi',
        },
        {
          label: 'Không gian - Kiến trúc',
          value: 'khong-gian-kien-truc.epi',
        },
      ],
      value: 'tin-moi.epi',
    },
  };
  cacheSet = new Set<string>();
  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    if (pageNo === 1) {
      console.log('Loading first page, clearing cache to ensure fresh data');
      this.cacheSet.clear();
    }
    if (
      !filters.page?.value ||
      (filters.page?.value as string)?.endsWith('.epi')
    ) {
      const response = await fetchText(
        `${this.site}/${(filters.page?.value as string).replace('.epi', '')}/trang${pageNo}.epi`,
      );
      const $ = loadCheerio(response);
      const nextDataScript = $('#__NEXT_DATA__').html();
      if (nextDataScript) {
        const nextData = JSON.parse(nextDataScript);
        const items =
          nextData.props.pageProps.resp.data.content.items ||
          nextData.props.pageProps.resp.data.content.sections.flatMap(
            (section: any) => section.items,
          );
        console.log('Parsed __NEXT_DATA__:', items);
        items.forEach((item: any) => {
          if (item.title && item.url) {
            if (this.cacheSet.has(item.title)) {
              console.log('Skipping duplicate post:', item.title);
              return;
            }
            novels.push({
              name: item.title,
              path: item.url,
              cover: item.thumb || defaultCover,
            });
            this.cacheSet.add(item.title);
          }
        });
      } else {
        throw new Error(
          'Failed to find __NEXT_DATA__ script in the popular novels page',
        );
      }
    } else {
      throw new Error('Not implemented for the selected filter option');
    }

    console.log('Current cache size:', this.cacheSet.size);

    return novels;
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
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (nextDataScript) {
      const nextData = JSON.parse(nextDataScript);
      const data = nextData.props.pageProps.resp.data.content;
      console.log('Parsed __NEXT_DATA__:', data);
      novel.name = data.title;
      novel.author = data.publisher?.name || 'Unknown';
      novel.cover = data.thumbL || data.thumb || defaultCover;
      novel.genres = data.tags?.map((tag: any) => tag.name).join(',') || '';
      novel.status = NovelStatus.Completed;
      novel.summary = data.description || '';
      novel.chapters = [
        {
          name: 'Ấn vào để xem chi tiết bài viết',
          path: data.url + '#read',
          chapterNumber: 0,
          releaseTime: new Date(
            (data.publishedDate || data.date || 0) * 1_000,
          ).toISOString(),
        },
      ];
      novel.content =
        `<h2>${data.title}</h2>\n` +
        data.bodys
          .map((item: any) => {
            switch (item.type) {
              case 'text': {
                const textClass = item.subType
                  ? ` class="${item.subType}"`
                  : ' class="body-text"';
                return `<p${textClass}>${item.content}</p>`;
              }

              case 'image': {
                const loadingAttr = item.lazyLoad ? ' loading="lazy"' : '';
                return `
          <figure class="article-image">
            <img 
              src="${item.content}" 
              width="${item.width}" 
              height="${item.height}" 
              alt="Hình ảnh bài viết" 
              ${loadingAttr}
            />
          </figure>
        `.trim();
              }

              case 'video':
                return `
          <figure class="article-video">
            <video controls width="${item.width}" height="${item.height}" poster="${item.poster}">
              <source src="${item.content}" type="video/mp4" />
              Trình duyệt của bạn không hỗ trợ thẻ video.
            </video>
          </figure>
        `.trim();

              default:
                console.warn(`Bỏ qua type không xác định: ${item.type}`);
                return '';
            }
          })
          .join('\n');
    } else {
      throw new Error('Failed to find __NEXT_DATA__ script in the novel page');
    }
    console.log('Parsed novel:', novel);
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const novel = await this.parseNovel(chapterPath);
    return novel.content || '';
  }
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    const response = await fetchText(
      `${this.site}/tim-kiem/${encodeURIComponent(searchTerm)}/trang${pageNo}.epi`,
    );
    const $ = loadCheerio(response);
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (nextDataScript) {
      const nextData = JSON.parse(nextDataScript);
      const items = nextData.props.pageProps.resp.data.content.items;
      console.log('Parsed __NEXT_DATA__:', items);
      if (!items || items.length === 0) {
        return [];
      }
      items.forEach((item: any) => {
        novels.push({
          name: item.title,
          path: item.url,
          cover: item.thumb || defaultCover,
        });
      });
    } else {
      throw new Error(
        'Failed to find __NEXT_DATA__ script in the search results page',
      );
    }
    return novels;
  }

  resolveUrl(path: string, isNovel?: boolean): string {
    return this.site + path;
  }
}

export default new BaoMoiPlugin();
