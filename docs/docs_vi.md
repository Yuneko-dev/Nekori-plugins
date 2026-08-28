# Tài liệu phát triển Nekori Plugins

> [!NOTE]
> Tài liệu này được tạo bởi AI dựa trên mã nguồn của repository. Nội dung đã
> được đối chiếu với mã nguồn nhưng vẫn có thể lệch — khi nghi ngờ, hãy tin
> `src/types/plugin.ts` và các plugin `Template`.

Tài liệu tham chiếu để viết plugin trong repository này. Nguồn chính xác nhất là
`src/types/plugin.ts`; mẫu khung đầy đủ (có chú thích) nằm ở
`plugins/vietnamese/Template/index.ts` (`PluginBase`) và
`plugins/vietnamese/Template2/index.ts` (`PagePlugin`).

> Fork này hướng tới [Nekori](https://github.com/Yuneko-dev/Nekori).
> Một số API bên dưới không tồn tại trong LNReader gốc và được đánh dấu
> **chỉ eXtended**.

- [Cài đặt](#cài-đặt)
- [Cấu trúc Plugin](#cấu-trúc-plugin)
- [Các loại Plugin](#các-loại-plugin)
- [Các trường metadata](#các-trường-metadata)
- [Các hàm](#các-hàm)
- [Các kiểu dữ liệu](#các-kiểu-dữ-liệu)
- [Bộ lọc (Filters)](#bộ-lọc-filters)
- [Plugin settings và storage](#plugin-settings-và-storage)
- [Thư viện được phép import](#thư-viện-được-phép-import)
- [Gỡ lỗi (Debug)](#gỡ-lỗi-debug)
- [Custom CSS và JS](#custom-css-và-js)
- [Plugin Video (Anime)](#plugin-video-anime)
- [Các thẻ meta đặc biệt](#các-thẻ-meta-đặc-biệt)

## Cài đặt

Yêu cầu: kiến thức Git và TypeScript, Node.js >= 20 (khuyến nghị 24).

```bash
npm install
npm run dev
```

## Cấu trúc Plugin

Mỗi plugin là một **thư mục**, không phải một tệp đơn lẻ:

```
plugins/<ngôn-ngữ>/<TenPlugin>/
├── index.ts          # entry point, export default một instance plugin
├── utils.ts          # tuỳ chọn: tách mã ra nhiều tệp cho dễ đọc
└── webview/
    └── index.ts      # tuỳ chọn: mã nguồn của customJS, được build riêng
```

- `<ngôn-ngữ>` phải khớp một khoá trong `scripts/languages.js`, viết thường trên
  ổ đĩa (`vietnamese`, `english`, `japanese`, `korean`, `multi`, …). Repo này tập
  trung vào nguồn tiếng Việt, nên thường là `plugins/vietnamese`.
- `<TenPlugin>` viết theo PascalCase, không có dấu cách.
- `index.ts` phải `export default new YourPlugin()` — một **instance**, không
  phải class.
- Đổi tên thư mục thành `broken_<TenPlugin>` để loại plugin khỏi dev UI, build
  plugin, build webview, kiểm tra kiểu và manifest. Không dùng tệp marker.
- **Không cần đăng ký plugin.** Không có tệp `plugins/index.ts` và không có mảng
  `PLUGINS`. Dev UI tự quét bằng `import.meta.glob` trên `plugins/*/*/index.ts`.

Xem `plugins/vietnamese/AnimeVietsub` để tham khảo một plugin nhiều tệp.

### Icon và tài nguyên

Tài nguyên nằm trong `public/static/`, còn trường trong plugin ghi đường dẫn
**tương đối so với `public/static/`**:

```ts
icon = 'src/vi/myplugin/icon.png'; // -> public/static/src/vi/myplugin/icon.png
```

Đoạn ngôn ngữ trong đường dẫn tài nguyên dùng mã ngắn (`vi`, `en`, `jp`, `kr`,
`multi`). Icon nên có kích thước 96x96 px.

## Các loại Plugin

| Loại | Dùng khi nào |
| --- | --- |
| `Plugin.PluginBase` | Nguồn thông thường. `parseNovel` trả về toàn bộ danh sách chương. |
| `Plugin.PagePlugin` | Web phân trang danh sách chương (ví dụ 1000 chương chia thành nhiều trang 50 chương), hoặc bạn muốn gom chương theo volume. |

`PagePlugin` khác ở hai điểm: `parseNovel` trả thêm `totalPages`, và bạn phải
cài đặt `parsePage(novelPath, page)`. `PluginBase` khai báo `parsePage?: never`,
nên class nào có `parsePage` **bắt buộc** phải khai kiểu là `PagePlugin`, nếu
không TypeScript sẽ báo lỗi.

```ts
class MyPlugin implements Plugin.PagePlugin {
  async parseNovel(
    novelPath: string,
  ): Promise<Plugin.SourceNovel & { totalPages: number }> { /* … */ }

  async parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage> {
    return { chapters: [] };
  }
}
```

## Các trường metadata

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `string` | có | Duy nhất giữa mọi plugin. Phải là tên tệp hợp lệ — nếu không, bước build manifest sẽ báo lỗi. |
| `name` | `string` | có | Tên hiển thị. |
| `icon` | `string` | có | Đường dẫn tương đối so với `public/static/`. |
| `site` | `string` | có | URL trang web. Cũng là URL mở trong WebView và là base URL của Reader. |
| `version` | `string` | có | Theo [SemVer 2.0](https://semver.org/). **Phải tăng version, nếu không pipeline sẽ bỏ qua thay đổi của bạn** (`--only-new` so sánh version). |
| `filters` | `Filters` | không | Xem [Bộ lọc](#bộ-lọc-filters). |
| `pluginSettings` | `Plugin.PluginSettings` | không | Xem [Plugin settings](#plugin-settings-và-storage). |
| `imageRequestInit` | `Plugin.ImageRequestInit` | không | Bổ sung `method` / `headers` / `body` cho request ảnh, dùng khi web chặn hotlink. |
| `customCSS` | `string` | không | Đường dẫn tương đối so với `public/static/`. |
| `customJS` | `string` | không | Đường dẫn tương đối so với `public/static/`; được build từ `webview/`. |
| `contentType` | `ContentType` | không | `NOVEL`, `IMAGE`, `VIDEO`, `MIXED`. **chỉ eXtended** |
| `contentWarning` | `ContentWarning` | không | `UNSPECIFIED`, `SAFE`, `MIXED`, `NSFW`. **chỉ eXtended** |
| `webStorageUtilized` | `boolean` | không | Bật khi plugin cần `localStorage` / `sessionStorage` của WebView Reader (ví dụ session lưu trong web storage thay vì Cookie). |

Quy ước tăng version: `patch` cho sửa lỗi giúp plugin chạy lại (đổi selector,
sai filter), `minor` cho cải tiến (thêm filter, thêm tuỳ chọn tìm kiếm), `major`
cho thay đổi lớn (đổi URL site).

```ts
import { ContentType, ContentWarning } from '@libs/pluginMetadata';

class MyPlugin implements Plugin.PluginBase {
  id = 'myplugin.id';
  name = 'My Plugin';
  icon = 'src/vi/myplugin/icon.png';
  site = 'https://example.com';
  version = '1.0.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.SAFE;
}
```

## Các hàm

### popularNovels

```ts
popularNovels(
  pageNo: number,
  options: Plugin.PopularNovelsOptions<typeof this.filters>,
): Promise<Plugin.NovelItem[]>
```

Được gọi khi mở trang đầu của plugin. `options.showLatestNovels` đánh dấu mục
"Latest". **Khi `showLatestNovels` bằng true, ứng dụng không gửi filters** — hãy
dùng bộ mặc định của riêng bạn thay vì đọc `options.filters`. `options.filters`
chứa các cặp `{ type, value }`, khoá trùng với khoá trong định nghĩa filter.

### parseNovel

```ts
parseNovel(novelPath: string): Promise<Plugin.SourceNovel>
// PagePlugin: Promise<Plugin.SourceNovel & { totalPages: number }>
```

`novelPath` chính là `path` trong `NovelItem` bạn đã trả về, và
`SourceNovel.path` nên giữ nguyên giá trị đó.

### parsePage — chỉ `PagePlugin`

```ts
parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage>
```

Trả về danh sách chương của một trang/volume.

### parseChapter

```ts
parseChapter(chapterPath: string): Promise<string>
```

Trả về nội dung chương dưới dạng chuỗi HTML.

### searchNovels

```ts
searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]>
```

Nếu trang tìm kiếm không hỗ trợ phân trang: `if (pageNo > 1) return [];`

### resolveUrl — tuỳ chọn

```ts
resolveUrl(path: string, isNovel?: boolean): string
```

Chuyển `path` nội bộ về URL duyệt được, dùng cho "Mở trong WebView". Cài đặt khi
cấu trúc URL của web khác với cách đặt `path` của bạn.

## Các kiểu dữ liệu

Import bằng `import { Plugin } from '@/types/plugin';`

### NovelItem

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `name` | `string` | có | Tên truyện. |
| `path` | `string` | có | Đường dẫn nội bộ, thường là path của web bỏ phần origin. |
| `cover` | `string` | không | URL ảnh bìa. |

> Các entity dùng **`path`**, không phải `url`. Khi không có ảnh bìa, dùng
> `import { defaultCover } from '@libs/defaultCover';`

### SourceNovel

Gồm `NovelItem` cộng thêm:

| Trường | Kiểu | Mô tả |
| --- | --- | --- |
| `genres` | `string` | Phân tách bằng dấu phẩy: `"Action,Adventure,Comedy"`. |
| `summary` | `string` | Tóm tắt. |
| `author` | `string` | |
| `artist` | `string` | |
| `status` | `string` | Dùng `NovelStatus` từ `@libs/novelStatus`. |
| `rating` | `number` | Thang 5, kiểu float. |
| `chapters` | `ChapterItem[]` | Danh sách chương. |

Giá trị `NovelStatus`: `Unknown`, `Ongoing`, `Completed`, `Licensed`,
`PublishingFinished`, `Cancelled`, `OnHiatus`, `STUB`, `Inactive`.

### ChapterItem

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `name` | `string` | có | Tên chương. |
| `path` | `string` | có | Đường dẫn nội bộ. |
| `releaseTime` | `string \| null` | không | `"YYYY-MM-DD"`, chuỗi ISO, hoặc chuỗi hiển thị bất kỳ. |
| `chapterNumber` | `number` | không | Nếu dùng thì phải là giá trị duy nhất trong truyện. |
| `page` | `string` | không | Gom nhóm theo trang/volume — xem bên dưới. |
| `scanlator` | `string \| string[]` | không | Nhóm dịch. |

Trong ứng dụng gốc, `page` là chỉ số trang của `PagePlugin`. Bản patch của
Ellie chấp nhận chuỗi tuỳ ý và hiển thị nó như tên volume (giống Hako), nên
`page: 'Volume 1'` là hợp lệ.

### SourcePage

```ts
type SourcePage = { chapters: ChapterItem[] };
```

## Bộ lọc (Filters)

```ts
import { FilterTypes, Filters } from '@libs/filterInputs';
```

Object định nghĩa filter khai báo những gì hiện trong bảng lọc của ứng dụng.
Khoá của object chính là khoá dùng để đọc giá trị.

```ts
filters = {
  genre: {
    type: FilterTypes.CheckboxGroup,
    label: 'Thể loại',
    value: [],
    options: [
      { label: 'Isekai', value: 'isekai' },
      { label: 'Ngôn tình', value: 'romance' },
    ],
  },
} satisfies Filters;
```

> Đừng quên `satisfies Filters` — thiếu nó thì kiểu của value trong
> `popularNovels` sẽ không được suy ra.

Mọi filter đều có `label`, `type` và `value` (giá trị mặc định); các loại nhóm
cần thêm `options`.

| `FilterTypes` | Giao diện | Kiểu `value` |
| --- | --- | --- |
| `TextInput` | Ô nhập văn bản | `string` |
| `Picker` | Chọn một | `string` |
| `Switch` | Công tắc | `boolean` |
| `CheckboxGroup` | Chọn nhiều | `string[]` |
| `ExcludableCheckboxGroup` | Chọn nhiều 3 trạng thái | `{ include?: string[]; exclude?: string[] }` |

Đọc giá trị trong `popularNovels`:

```ts
options.filters.genre.value; // string[]
options.filters.genre.type;  // FilterTypes.CheckboxGroup

// ExcludableCheckboxGroup
const { include, exclude } = options.filters.tags.value;
```

## Plugin settings và storage

`pluginSettings` tạo các tuỳ chọn cho người dùng trong màn hình cài đặt plugin
của ứng dụng. **Chỉ eXtended.** Cần tải lại ứng dụng để thay đổi có hiệu lực.

```ts
pluginSettings: Plugin.PluginSettings = {
  hideLocked: { value: false, label: 'Ẩn chương bị khoá', type: 'Switch' },
  url:        { value: '',    label: 'URL' }, // type mặc định là 'Text'
  quality: {
    value: '720',
    label: 'Chất lượng',
    type: 'Select',
    options: [
      { label: '720p', value: '720' },
      { label: '1080p', value: '1080' },
    ],
  },
  hosts: {
    value: [],
    label: 'Nguồn phát',
    type: 'CheckboxGroup',
    options: [{ label: 'Host A', value: 'a' }],
  },
};
```

| `type` | Kiểu `value` |
| --- | --- |
| `Text` (mặc định) | `string` |
| `Switch` | `boolean` |
| `Select` | `string` + `options` |
| `CheckboxGroup` | `string[]` + `options` |

Giá trị được đọc qua `storage`, khoá chính là tên setting:

```ts
import { storage, localStorage, sessionStorage } from '@libs/storage';

const hideLocked = storage.get('hideLocked'); // boolean
storage.set('token', value, expiresMsOrDate); // tham số hết hạn là tuỳ chọn
storage.delete('token');
storage.getAllKeys();
storage.clearAll();
```

`localStorage` và `sessionStorage` **chỉ có `get()`**: chúng là bản chụp những
gì WebView Reader đã ghi, do ứng dụng đưa cho plugin. Đặt
`webStorageUtilized = true` để nhận được chúng. Trong Playground, dữ liệu này
được lấy từ tab Preview (xem [Gỡ lỗi](#gỡ-lỗi-debug)).

## Thư viện được phép import

Mã plugin bị ESLint chặn mọi import trừ danh sách cho phép. Import ngoài danh
sách là **lỗi**:

`@libs/*`, `@/types/plugin`, `cheerio`, `htmlparser2`, `dayjs`, `urlencode`,
`node-html-markdown`.

Các module `@libs` hiện có: `fetch`, `storage`, `filterInputs`, `novelStatus`,
`defaultCover`, `isAbsoluteUrl`, `utils`, `aes`, `cookie`, `pluginMetadata`.

```ts
import { fetchApi, fetchText, fetchProto, type FetchInit } from '@libs/fetch';
```

- `fetchApi(url, init)` — dùng như Fetch API thông thường.
- `fetchText(url, init?, encoding?)` — trả text đã decode, mặc định `utf-8`; trả
  `''` nếu thất bại.
- `fetchProto<T>({ proto, requestType, requestData?, responseType }, url, init?)`
  — request/response dạng protobuf.

Những API sau **chỉ chạy trên eXtended**, ESLint sẽ cảnh báo khi bạn import và
nhắc ghi chú điều đó vào README của plugin:

- `@libs/aes`: mọi cipher trừ `gcm` (`ctr`, `ecb`, `cbc`, `cfb`, `gcmsiv`,
  `aeskw`, `aeskwp`, `cmac`, `aessiv`).
- `@libs/utils`: `Buffer`, `NodeCrypto`, `getUserAgent`, `encodeHtmlEntities`,
  `decodeHtmlEntities`.
- `@libs/cookie` (mọi import).

Plugin và webview được bundle trực tiếp từ TypeScript sang ES2020 cho Hermes của
Nekori. API chỉ có trên trình duyệt vẫn có thể lỗi trên thiết bị.

## Gỡ lỗi (Debug)

> Mã webview (Custom JS) **không** hỗ trợ hot-reload của Vite. Chạy
> `npm run build:full` mỗi khi thay đổi.

Build và kiểm tra TypeScript chạy độc lập. Dùng `npm run type-check` để kiểm tra
mọi phạm vi, hoặc `npm run type-check:plugins` / `npm run type-check:webviews`
khi đang sửa riêng plugin.

### 1. Electron Playground

```bash
npm run dev
```

Đây là cách test tương tác duy nhất — không còn chế độ chạy trên trình duyệt.
Môi trường này không bị CORS chặn, giữ cookie bền vững, và mô phỏng ngữ cảnh
WebView của ứng dụng.

- **Spawn New Tab** (`Ctrl+T` / `Cmd+T`) mở một WebView để bạn tự giải
  Cloudflare/Captcha; cookie thu được sẽ tự đồng bộ cho các request `fetch` của
  plugin.
- **Mở Preview** trong mục *Parse Chapter* mở chương trong một tab Electron
  riêng với base URL đặt bằng `plugin.site`, nhờ vậy URL tương đối resolve đúng
  và `customCSS` / `customJS` chạy giống như trong Reader. Khung nội dung phía
  dưới luôn hiển thị raw HTML.
- Những gì custom JS trong tab Preview ghi vào `localStorage` /
  `sessionStorage` sẽ được đồng bộ ngược lại — đó là lý do
  `localStorage.get()` / `sessionStorage.get()` của `@libs/storage` có dữ liệu
  khi chạy Playground.
- DevTools: `F12` trong tab Preview, hoặc icon debug trên tab WebView.

### 2. serve:dev (kiểm thử trực tiếp trên ứng dụng LNReader)

Dành cho bước kiểm tra cuối. Lệnh này biên dịch plugin và dựng một server local
để bạn thêm vào app trên điện thoại.

Chuẩn bị tệp `.env`:

```
USER_CONTENT_BASE=http://<IP-máy-tính>:3000
```

```bash
npm run serve:dev
```

- Server chạy ở cổng 3000. Điện thoại và máy tính phải chung mạng Wi-Fi.
- Trong Nekori, vào **Cài đặt → Repositories**, thêm URL
  `http://<IP-máy-tính>:3000/.dist/plugins.min.json` rồi cập nhật.
- Đây là cách kiểm tra chính xác nhất hành vi Custom JS/CSS trong Reader, nhưng
  không có console để xem log nếu không debug Application.

## Custom CSS và JS

`customJS` được viết trong thư mục `webview/` của plugin (entry là `index.ts`
hoặc `index.js`), rồi `npm run build:webviews` sẽ bundle ra đúng đường dẫn ghi
trong trường `customJS`. `customCSS` là một tệp thường nằm trong
`public/static/`.

Lưu ý về môi trường Reader:

- Nội dung chương được bọc trong `<div id="LNReader-chapter">`.
- Kết quả của `parseChapter` đã được chuẩn hoá, nên thẻ `<script>` nội tuyến có
  thể không chạy — hãy đưa logic vào `customJS`.
- Location của trang là **URL site của plugin**, không phải URL của chương.
- Xem `src/lib/reader-mock.ts` để biết ngữ cảnh JS mà ứng dụng cung cấp
  (`window.reader`, `window.tts`, `window.pageReader`, `window.van`).

Một số API hữu ích (**chỉ eXtended**):

```js
window.reader.refetch();                    // buộc tải lại, bỏ qua cache
window.reader.post({ type: 'refetch' });    // tương đương
await window.reader.fetch(url, init);       // fetch bỏ qua giới hạn của WebView
```

## Plugin Video (Anime)

Ứng dụng có sẵn Core Player dựa trên Video.js v10, dùng `hls.js` cho HLS và
`dash.js` cho DASH. Hỗ trợ `m3u8`, `mpd`, file video thường và `iframe`, kèm sẵn
bộ điều khiển, thanh tua và fullscreen. Bạn **không cần** tự viết CSS hay nhúng
thư viện ngoài — chỉ cần trả về HTML chứa các thẻ `<meta>` đúng quy chuẩn.

### Phương thức 1: Direct Mode (phát trực tiếp)

Dành cho trang mà bạn bóc tách được link video ngay trong TypeScript của plugin:

```ts
async parseChapter(chapterPath: string): Promise<string> {
  const videoUrl = 'https://example.com/video.m3u8';
  return [
    '<meta name="lnreader-chapter-type" content="video">',  // bắt buộc
    '<meta name="lnreader-video-mode" content="direct">',
    '<meta name="lnreader-video-type" content="m3u8">',
    `<meta name="lnreader-video-url" content="${videoUrl}">`,
  ].join('\n');
}
```

Ứng dụng sẽ tự khởi tạo Player và phát ngay.

`lnreader-video-type` đặt tên theo đuôi manifest:

| type | phát bằng | ghi chú |
| --- | --- | --- |
| `m3u8` | hls.js qua MSE | Chromium không có HLS native |
| `mpd` | dash.js | không có alias `dash` |
| `video-file` | `<video>` thường | mp4, m4v, mkv, webm, mov, avi, ts |
| `iframe` | iframe sandbox | chỉ http(s), không tải xuống được |

### Phương thức 2: Lazy Mode (phát trì hoãn)

Dành cho trang phức tạp, cần chạy JS trong WebView (bypass Cloudflare, vượt
captcha, tự giải mã m3u8, tạo blob), hoặc khi cần truyền tuỳ chọn cho engine —
thẻ meta không mang được chúng:

```ts
async parseChapter(chapterPath: string): Promise<string> {
  return [
    '<meta name="lnreader-chapter-type" content="video">',
    '<meta name="lnreader-video-mode" content="lazy">',
    '<meta name="lnreader-debug-mode" content="true">', // hiện log overlay trên màn hình
  ].join('\n');
}
```

Sau đó truyền link cho player từ `customJS`:

```js
(async function () {
  if (!window.LNReaderPlayer) return;
  const m3u8Url = await fetchVideoUrl();
  window.LNReaderPlayer.playHls(m3u8Url);
})();
```

### API của `window.LNReaderPlayer`

- `playDirect(url)` — phát file/URL tĩnh như `.mp4`, `.webm`, …
- `playHls(url, hlsJsConfig?)` — phát `.m3u8`. Tham số thứ hai **chính là** object
  cấu hình `hls.js`, truyền thẳng vào constructor `Hls` (ví dụ dùng `xhrSetup` để
  chèn header Authorization khi stream các fragment `.ts`).
- `playDash(url, { settings?, protectionData? })` — phát `.mpd`. Xem bên dưới.
- `playIframe(url)` — nhúng iframe.
- `addSubtitles(tracks)` — gắn phụ đề rời. Xem bên dưới.
- `log(msg)` — ghi log ra console; nếu bật debug mode thì hiện dạng overlay.

Lưu ý chỗ không đối xứng: `playHls` nhận thẳng config hls.js, còn `playDash`
nhận object bao ngoài. Hình dạng của `playHls` có từ trước khi chuyển sang
Video.js và được giữ lại để tương thích.

### Phụ đề rời

`addSubtitles(tracks)` nhận một track hoặc một mảng track, trả về promise.

| Field | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `url` | một trong hai | File phụ đề cần tải. Đi qua fetch riêng của reader nên mang sẵn `Referer` giống video và không dính CORS. |
| `content` | một trong hai | Text phụ đề bạn đã có sẵn. Có cái này thì bỏ qua bước tải. |
| `label` | không | Tên hiện trong menu phụ đề. Mặc định `Subtitles`. |
| `lang` | không | Mã BCP-47 (`vi`, `en`). Mặc định rỗng. |
| `default` | không | `true` là bật track này ngay. |

```js
await window.LNReaderPlayer.playHls(m3u8Url);
await window.LNReaderPlayer.addSubtitles([
  { label: 'Tiếng Việt', lang: 'vi', url: subUrl, default: true },
  { label: 'English', lang: 'en', url: enUrl },
]);
```

Gọi lúc nào cũng được — trước lời gọi `play*`, sau nó, hay giữa lúc đang phát.
Track được **nhớ lại** chứ không chỉ gắn một lần, nên nó sống qua remount: đổi
engine hay phát lại thì mọi track bạn thêm đều được gắn lại.

WebVTT dùng thẳng. SubRip được tự chuyển đổi: thêm header `WEBVTT` và đổi dấu
phẩy trong timestamp thành dấu chấm, còn dấu phẩy trong lời thoại giữ nguyên.
Định dạng khác — nhất là ASS/SSA — plugin phải tự chuyển rồi truyền qua
`content`.

Mỗi track được cô lập riêng. Tải lỗi 404, hay file không parse được, thì ghi log
ra debug overlay rồi bỏ qua; các track còn lại và bản thân video vẫn chạy. Mất
phụ đề không bao giờ được kéo theo mất luôn tập phim.

Phụ đề đã nằm sẵn trong playlist HLS (`#EXT-X-MEDIA:TYPE=SUBTITLES`) do hls.js
tự xử lý, không cần gọi gì.

Chương đã tải về chưa giữ được phụ đề rời — chúng không được ghi vào file lưu.

### Truy cập thẳng engine

Engine đang chạy vẫn được expose cho những thứ lớp bao ngoài không phủ hết:

- `LNReaderPlayer.hlsInstance` — instance `Hls`, sau khi gọi `playHls`.
- `LNReaderPlayer.dashInstance` — `MediaPlayer` của dash.js, sau khi gọi `playDash`.

```js
await window.LNReaderPlayer.playDash(url, { protectionData });
window.LNReaderPlayer.dashInstance.updateSettings({
  streaming: { buffer: { bufferTimeAtTopQuality: 30 } },
});
window.LNReaderPlayer.dashInstance.on('qualityChangeRendered', onQuality);
```

`playDirect` / `playHls` / `playDash` là **async** — các custom element chúng cần
có thể được đăng ký bởi script module bị defer — nên phải `await` trước khi chạm
vào instance, nếu không bạn sẽ đọc phải `null` hoặc engine của chương trước. Cả
hai được xoá khi player bị huỷ.

Tự gọi `updateSettings()` sẽ **merge** vào settings hiện tại, khác với tuỳ chọn
`settings` bên dưới — cái đó thay thế toàn bộ.

Lỗi được hiển thị cho người dùng dưới dạng banner ngay trong Reader — không có
gì bị nuốt im lặng, nhưng cũng không có gì ném ngược về plugin của bạn. Khi phát
triển, hãy đọc overlay debug hoặc cắm `chrome://inspect`.

Toàn bộ API: [`src/lib/core-player.js`](../src/lib/core-player.js).

### Cấu hình dash.js

`settings` chính là `MediaPlayerSettingClass` của dash.js, truyền nguyên vẹn:

```js
window.LNReaderPlayer.playDash('https://example.com/manifest.mpd', {
  settings: {
    streaming: {
      abr: { autoSwitchBitrate: { video: true } },
      buffer: { bufferTimeAtTopQuality: 30 },
      retryAttempts: { MediaSegment: 5 },
    },
  },
});
```

Settings bị **thay thế, không merge**: player reset settings của dash.js trước
khi áp cái của bạn, nên key nào bạn bỏ đi sẽ về mặc định chứ không giữ giá trị cũ.

### DRM

License server **không** thuộc settings của dash.js — nó là map `protectionData`
riêng, khoá theo key system, được truyền vào `setProtectionData()` trước khi gắn
manifest. Hãy viết đúng tên field chuẩn của dash.js; dash.js **im lặng bỏ qua**
key lạ, nên config copy từ player khác sẽ không bao giờ gửi license request và
chết bằng một lỗi decode mơ hồ.

```js
window.LNReaderPlayer.playDash(
  'https://media.axprod.net/TestVectors/Cmaf/protected_1080p_h264_cbcs/manifest.mpd',
  {
    protectionData: {
      'com.widevine.alpha': {
        serverURL: 'https://drm-widevine-licensing.axtest.net/AcquireLicense',
        httpRequestHeaders: { 'X-AxDRM-Message': '<token>' },
        priority: 0,
      },
    },
  },
);
```

| viết thế này | không phải |
| --- | --- |
| `serverURL` | `url`, `licenseUrl` |
| `httpRequestHeaders` | `licenseHeaders`, `headers` |

Field hữu ích khác: `withCredentials`, `httpTimeout`, `serverCertificate`,
`audioRobustness`, `videoRobustness`, `distinctiveIdentifier`, `persistentState`.
ClearKey dùng `clearkeys` nội tuyến thay cho `serverURL`.

Bốn ràng buộc nên biết trước khi báo lỗi:

- **Đừng đặt robustness trừ khi bạn đã đo được là nó chạy.** Android WebView chỉ
  có Widevine **L3** — nó không expose đường giải mã trong TEE cho EME, nên máy
  báo L1 ở tầng thiết bị vẫn chỉ là L3 bên trong WebView. Trần chấp nhận được
  khác nhau tuỳ máy: trên một máy test, robustness rỗng và `SW_SECURE_CRYPTO`
  được chấp nhận còn `SW_SECURE_DECODE` bị từ chối với `NotSupportedError`. Để
  trống là mặc định an toàn.
- **Nội dung đòi L1 sẽ không phát được**, cấu hình kiểu gì cũng vậy.
- **Incognito chặn Widevine.** Nó cần device DRM identifier ngay cả ở L3, mà
  định danh đó là vĩnh viễn và không reset được, nên ứng dụng từ chối trao nó
  cho site plugin khi đang bật incognito. Người dùng thấy banner giải thích.
  ClearKey vẫn chạy.
- **Chương DASH và DRM không tải xuống được.** Fragment đã mã hoá thì vô dụng
  với sink tải về, nên chương đó bị từ chối ngay từ đầu thay vì tạo ra file hỏng.

Nếu DRM lỗi, warning `It is recommended that a robustness level be specified`
của Chromium **không** phải nguyên nhân — nó in ra cả khi gọi thành công.

## Các thẻ meta đặc biệt

Thêm vào kết quả trả về của `parseChapter`.

| Thẻ | Tác dụng |
| --- | --- |
| `<meta id="no-cache-marker" />` | Không cache chương này. |
| `<meta id="no-prefetch-marker" />` | Không tải trước chương kế tiếp. |
| `<meta id="lnreader-video-disable-progress" />` | Chương video không lưu tiến độ (ví dụ Live, không có thời điểm kết thúc). Player chuyển sang skin live, đồng thời chương này cũng không hỗ trợ tải xuống. |
| `<meta name="lnreader-video-poster" content="…" />` | Ảnh tĩnh hiện trước khi phát. |
| `<meta name="lnreader-video-thumbnails" content="…" />` | File WebVTT storyboard cho ảnh preview khi tua. Xem cảnh báo bên dưới. |

`lnreader-video-thumbnails` ép `crossorigin="anonymous"` lên media element. Với
chương `video-file`, điều đó **ép luôn một CORS fetch cho chính video**, nên host
không trả `Access-Control-Allow-Origin` sẽ ngừng phát. Chỉ dùng với nguồn bạn
chắc chắn có gửi header CORS.

## Captcha và các vấn đề bên lề

1. Ưu tiên mở trang web bằng tab WebView và giải captcha ở đó trước.
2. Nếu trang web chặn WebView, thử đổi User-Agent trong phần cài đặt.
3. Nếu vẫn không được, có thể render captcha ngay trong Reader — do kết quả của
   `parseChapter` đã được chuẩn hoá, hãy điều khiển bằng `customJS`.
