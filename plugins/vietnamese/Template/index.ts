import { fetchApi, fetchProto, fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import { storage, localStorage, sessionStorage } from '@libs/storage';
import { utf8ToBytes, bytesToUtf8, Buffer } from '@libs/utils';
import { ContentType, ContentWarning } from '@libs/pluginMetadata';
import test from './utils';

// Thêm file "BROKEN" vào folder để tránh ext này được build
class TemplatePlugin implements Plugin.PluginBase {
  // Là một ID duy nhất để nhận diện Plugin
  id = 'template.id';
  // Tên hiển thị của Plugin
  name = 'Template Plugin';
  // Ví dụ: Icon của Plugin được lưu tại đường dẫn public/static/src/vi/template/icon.png. Kích thước khuyến nghị là 96x96 pixel.
  icon = 'src/vi/template/icon.png';
  // URL của trang web. Đây cũng là URL dùng để mở WebView.
  site = 'https://example.com';
  // Phiên bản của Plugin, được viết theo chuẩn [SemVer 2.0](https://semver.org/) - <major>.<minor>.<patch>
  version = '1.0.0';
  // Bộ lọc của popularNovels, được sử dụng khi mở plugin trong ứng dụng (sẽ có nút filter ở góc dưới cùng bên phải màn hình plugin)
  filters: Filters | undefined = undefined;
  // Sử dụng để tùy chỉnh yêu cầu hình ảnh. Ví dụ: Nếu trang web yêu cầu header đặc biệt để tải ảnh, có thể thiết lập ở đây.
  // Có thể sử dụng getter để trả về giá trị động nếu cần.
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;
  // Cờ để chỉ định plugin có được sử dụng dữ liệu từ WebView hay không. Hữu ích với những trang web cần sử dụng WebView (ví dụ: đăng nhập),
  // nhưng session được lưu vào WebView thay vì Cookie.
  // Mặc định: không
  webStorageUtilized?: boolean;
  // Phần này để định nghĩa Plugin Settings.
  // Cần tải lại ứng dụng sau khi thay đổi để cài đặt có hiệu lực.
  pluginSettings: Plugin.PluginSettings = {
    hideLocked: {
      value: false, // Giá trị khởi tạo
      label: 'Hide locked chapters', // Nhãn hiển thị trong UI
      type: 'Switch',
    },
    url: {
      value: '',
      label: 'URL',
      // type: 'Text' (Mặc định)
    },
  };
  // Để sử dụng giá trị của pluginSettings, có thể truy cập bằng cách sử dụng biến storage đã được import ở trên.
  valueSettingHideLocked = storage.get('hideLocked'); // Trả về kiểu boolean
  valueSettingUrl = storage.get('url'); // Trả về kiểu string
  // localStorage và sessionStorage cũng có thể được sử dụng nếu cần, nhưng cần phải bật flag webStorageUtilized ở trên.

  // File CSS tùy chỉnh cho giao diện đọc.
  // Được lưu cùng thư mục với thư mục chứa icon.png
  customCSS?: string | undefined = 'src/vi/template/custom.css';

  // File JS tùy chỉnh cho giao diện đọc.
  // Được lưu cùng thư mục với thư mục chứa icon.png
  // Lưu ý: Bạn phải code các file js này trong thư mục webview.
  // Entry point là index.js hoặc index.ts.
  // Sau khi build thì bundle file sẽ được lưu vào đường dẫn customJS
  customJS?: string | undefined = 'src/vi/template/custom.js';

  // Loại nội dung mà plugin này cung cấp
  contentType?: ContentType | undefined = ContentType.NOVEL;

  // Cảnh báo nội dung mà plugin này có thể chứa
  contentWarning?: ContentWarning | undefined = ContentWarning.SAFE;

  // Hàm này được gọi khi người dùng mở trang đầu của Plugin. Có thể apply các bộ lọc đã được định nghĩa.
  // Giống như việc bạn xem trang đầu tiên của Web vậy, và nó có chia trang.
  async popularNovels(
    pageNo: number,
    {
      showLatestNovels, // Boolean, sử dụng để phân biệt giữa popular và latest. Trong màn hình Plugin, ở góc cuối plugin sẽ có mục "Latest"
      filters, // Filter hiện tại đang apply. Sử dụng object giống như filters đã được định nghĩa ở trên, nhưng có thể có thêm trường value để lấy giá trị của filter đó.
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // Khi sử dụng showLatestNovels, sẽ bỏ qua toàn bộ filters.
    // Tức là ứng dụng sẽ không gửi dữ liệu filters, nếu fetch latest thì nên dùng 1 bộ filters mặc định
    const novels: Plugin.NovelItem[] = [];
    // Thêm đoạn mã xử lý thực tế vào đây.
    // Sử dụng hàm fetchApi giống như fetch Web API thông thường.
    // Ngoài ra thư viện có định nghĩa sẵn một số hàm tiện ích khác như:
    // - fetchText: trả về response dưới dạng text (sử dụng TextDecoder để decode, mặc định utf-8)
    // - fetchProto: trả về response dưới dạng object đã được decode, chỉ định kiểu bằng TS.
    novels.push({
      name: `Novel${pageNo}`, // Tên truyện
      path: `/novels/${pageNo}`, // Đường dẫn đến truyện
      cover: defaultCover, // Image thumbnail của truyện. Có thể để trống hoặc sử dụng defaultCover nếu không có ảnh.
    });
    return novels;
  }
  // Đây là hàm để trả về thông tin chi tiết của 1 truyện, bao gồm cả list chương. Hàm này được gọi khi người dùng nhấn vào một truyện nào đó.
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      // Đường dẫn đến truyện, giống như trường path ở NovelItem. Có thể sử dụng để lấy dữ liệu chi tiết của truyện đó.
      path: novelPath,
      // Tên truyện
      name: 'Untitled',
    };

    /* Đoạn mã nguồn để bổ sung dữ liệu vào novel object ở đây. */

    novel.artist = '';
    novel.author = '';
    novel.cover = defaultCover;
    // Thể loại, là một chuỗi phân tách bằng dấu phẩy. Ví dụ: "Action,Adventure,Comedy"
    novel.genres = '';
    // Trạng thái của truyện, sử dụng Enum NovelStatus đã được định nghĩa ở trên.
    novel.status = NovelStatus.Completed;
    // Tóm tắt truyện. Có thể để trống nếu không có.
    novel.summary = '';

    // Danh sách chương của truyện.
    const chapters: Plugin.ChapterItem[] = [];

    /* Đoạn mã nguồn để bổ sung dữ liệu vào chapters array ở đây. */

    const chapter: Plugin.ChapterItem = {
      name: 'Chapter 1',
      path: '/novels/chapter-1',
      // Thời gian phát hành, sử dụng ISO string hoặc YYYY-MM-DD format. Ví dụ: "2024-01-01T00:00:00Z" hoặc "2024-01-01". Có thể bỏ qua
      releaseTime: '',
      // Đánh thứ tự cho chapter number. Có thể bỏ qua. Nhưng nếu sử dụng, đảm bảo giá trị này unique.
      chapterNumber: 0,
      // Tính năng chia chương theo volume / page.
      // Lưu ý: Trong ứng dụng gốc, page chỉ được dùng trong trường hợp sử dụng Plugin.PagePlugin, tức là khi truyện có
      // quá nhiều chương và cần chia thành nhiều trang để hiển thị. Khi đó, page sẽ là một số nguyên (string có thể parse)
      // để đại diện cho trang đó (ví dụ: page 1, page 2, v.v).
      // Tuy nhiên, bản Patch của lnreader của Ellie sử dụng Page làm tên của 1 volume (giống như Hako)
      // Vì thế, page sẽ không bắt buộc phải là một số, mà có thể là một chuỗi tùy ý để hiển thị trong UI.
      // Nếu không cần phân trang cho các chương, có thể bỏ qua trường này.
      page: 'Volume 1',
    };
    chapters.push(chapter);

    novel.chapters = chapters;
    return novel;
  }
  // Hàm này được gọi khi người dùng nhấn vào một chương để đọc. Trả về nội dung của chương đó dưới dạng HTML string.
  async parseChapter(chapterPath: string): Promise<string> {
    const response = await fetchText(`${this.site}${chapterPath}`);
    const $ = loadCheerio(response);
    // Giả sử nội dung chương nằm trong thẻ div có class "chapter-content"
    const chapterContent = $('.chapter-content').html()!;
    return chapterContent;
  }
  // Hàm này được gọi khi người dùng tìm kiếm truyện bằng thanh tìm kiếm. Trả về một mảng các truyện phù hợp với từ khóa tìm kiếm.
  async searchNovels(
    searchTerm: string, // Query
    pageNo: number, // Trang tìm kiếm thứ bao nhiêu (bắt đầu từ 1)
  ): Promise<Plugin.NovelItem[]> {
    // Thử chạy hàm trong file utils.ts
    test();
    // Nếu trang tìm kiếm không hỗ trợ phân trang, sử dụng code giống như dưới đây để bỏ qua tham số pageNo này.
    if (pageNo > 1) return [];
    const novels: Plugin.NovelItem[] = [];
    return novels;
  }
}

// Xuất ra một instance của TemplatePlugin để ứng dụng có thể sử dụng
export default new TemplatePlugin();
