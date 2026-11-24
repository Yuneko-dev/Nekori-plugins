# Tài liệu phát triển Nekori Plugins

[English](docs.md)

> [!NOTE]
> Tài liệu này được tạo bởi AI dựa trên mã nguồn của repository. Nội dung đã
> được đối chiếu với mã nguồn nhưng vẫn có thể lệch — khi nghi ngờ, hãy tin
> `src/types/plugin.ts` và các plugin `Template`.

Tài liệu tham chiếu để viết plugin trong repository này. Nguồn chính xác nhất là
`src/types/plugin.ts`; mẫu khung đầy đủ (có chú thích) nằm ở
`plugins/vietnamese/broken_Template/index.ts` (`NekoriBasePlugin`) và
`plugins/vietnamese/broken_Template2/index.ts` (`NekoriPagePlugin`).

> Nekori API v1 là contract chính thức. Plugin Nekori không chạy trên LNReader.
> App Nekori nâng chuỗi chương của LNReader thành object ChapterContent.

- [Cài đặt](#cài-đặt)
- [Cấu trúc Plugin](#cấu-trúc-plugin)
- [Các loại Plugin](#các-loại-plugin)
- [Các trường metadata](#các-trường-metadata)
- [Manifest repository](#manifest-repository)
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

Yêu cầu: kiến thức Git và TypeScript, Node.js >= 20.

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
├── icon.<ext>        # tuỳ chọn: icon local, basename khớp metadata.icon
└── webview/
    ├── style.css      # tuỳ chọn: nguồn customCSS, copy nguyên byte
    └── index.ts       # tuỳ chọn: nguồn customJS, được bundle riêng
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

Tài nguyên nguồn nằm cạnh plugin. Tên tệp icon là basename trong metadata
`icon`, CSS nằm ở `webview/style.css`, còn Custom JS nằm ở
`webview/index.ts` hoặc `webview/index.js`:

```ts
icon = 'icon.png';
customCSS = 'style.css';
customJS = 'player.js';
```

Tên tệp ngắn được chuẩn hoá thành `src/<plugin.id>/<filename>` và sinh dưới
`public/static/`. Giá trị metadata có chứa `/` giữ nguyên đường dẫn đầy đủ kiểu
cũ. Namespace theo plugin ID giúp plugin mới không cần thêm tiền tố ngôn ngữ
hay đường dẫn thư mục vào metadata asset. Chạy `npm run build:assets` để copy
icon và CSS nguyên byte, đồng thời bundle Custom JS tới đường dẫn đã chuẩn hoá.
`npm run build:webviews` là alias tương thích. Thiếu tài nguyên local đã khai
báo hoặc trùng đường dẫn đích sẽ làm build lỗi. CSS được copy độc lập; các tài
nguyên tương đối mà CSS tham chiếu không được copy tự động. Không có chế độ
watch, nên chạy lại bước asset sau khi sửa và build lại bundle plugin khi
metadata thay đổi. Khi đổi sang tên tệp ngắn, đường dẫn output thay đổi nên
phải tăng patch version của plugin.

Đoạn ngôn ngữ trong đường dẫn tài nguyên dùng mã ngắn (`vi`, `en`, `jp`, `kr`,
`multi`). Icon nên có kích thước 96x96 px. Tệp sinh trong `public/static/` là
output của build, không phải mã nguồn plugin. Cụ thể, `public/static/src/` là
output được sinh; các ảnh fallback nằm trực tiếp trong `public/static/` vẫn là
tệp nguồn. Trình tải icon chỉ bổ sung icon local còn thiếu, giữ nguyên icon và
tệp fallback hiện có, không xoá các tệp static không liên quan.

## Các loại Plugin

Import abstract class từ `@nekori/plugin` và dùng `extends`:

| Class | Dùng khi nào |
| --- | --- |
| `NekoriBasePlugin` | `parseNovel` trả toàn bộ danh sách chương, kể cả truyện gom volume. |
| `NekoriPagePlugin` | Danh sách phân trang; `parseNovel` trả `totalPages` nguyên dương, `parsePage` tải từng trang. |

Volume dùng `ChapterItem.page` làm nhãn (ví dụ `'Volume 1'`) trên base plugin.
Plugin phân trang dùng chuỗi số nguyên dương chuẩn như `'1'`, `'2'`, không dùng nhãn volume.
`Plugin.PluginBase` và `Plugin.PagePlugin` chỉ dành cho LNReader legacy: `parseChapter(): Promise<string>`.
Plugin Nekori trả `Promise<Plugin.ChapterContent>`. Hai template được liên kết ở đầu tài liệu chứa class đầy đủ.

## Các trường metadata

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `string` | có | Duy nhất giữa mọi plugin. Phải là tên tệp hợp lệ — nếu không, bước build manifest sẽ báo lỗi. |
| `name` | `string` | có | Tên hiển thị. |
| `icon` | `string` | có | Tên file local như `icon.png`, tự thêm namespace `src/<id>/`. Đường dẫn cũ có `/` giữ nguyên. |
| `site` | `string` | có | URL trang web. Cũng là URL mở trong WebView và là base URL của Reader. |
| `version` | `string` | có | Theo [SemVer 2.0](https://semver.org/). **Phải tăng version, nếu không pipeline sẽ bỏ qua thay đổi của bạn** (`--only-new` so sánh version). |
| `isNekoriPlugin` | `true` | kế thừa | Base class đặt; host dùng để chọn contract chương. |
| `minApiVersion` | `number` | kế thừa | API host tối thiểu yêu cầu. |
| `outputTarget` | `'js' / 'hermes' / 'all'` | không | No-op: hiện mọi giá trị đều chỉ build JS, chưa có HBC. |
| `filters` | `Filters` | không | Xem [Bộ lọc](#bộ-lọc-filters). |
| `pluginSettings` | `Plugin.PluginSettings` | không | Xem [Plugin settings](#plugin-settings-và-storage). |
| `imageRequestInit` | `Plugin.ImageRequestInit` | không | Bổ sung `method` / `headers` / `body` cho request ảnh, dùng khi web chặn hotlink. |
| `customCSS` | `string` | không | Đường dẫn tương đối so với `public/static/`. |
| `customJS` | `string` | không | Đường dẫn tương đối so với `public/static/`; được build từ `webview/`. |
| `contentType` | `ContentType` | không | `NOVEL`, `IMAGE`, `VIDEO`, `MIXED`. **chỉ Nekori** |
| `contentWarning` | `ContentWarning` | không | `UNSPECIFIED`, `SAFE`, `MIXED`, `NSFW`. **chỉ Nekori** |
| `webStorageUtilized` | `boolean` | không | Bật khi plugin cần `localStorage` / `sessionStorage` của WebView Reader (ví dụ session lưu trong web storage thay vì Cookie). |

Tăng version của plugin khi phát hành thay đổi. Phiên bản API được quản lý tập trung tại `src/nekori/plugin.ts`.

```ts
import { NekoriBasePlugin } from '@nekori/plugin';
import { ContentType, ContentWarning } from '@nekori/pluginMetadata';

// Trích metadata; cài các method abstract theo template đầy đủ.
class MyPlugin extends NekoriBasePlugin {
  id = 'myplugin.id';
  name = 'My Plugin';
  icon = 'icon.png';
  site = 'https://example.com';
  version = '1.0.0';
  contentType = ContentType.NOVEL;
  contentWarning = ContentWarning.SAFE;
}
```

### Manifest repository

Manifest vẫn là mảng JSON. Build đọc metadata từ instance export trong index.ts bằng runtime mock,
không duy trì thêm bản metadata viết tay. Language được lấy từ thư mục qua scripts/languages.js;
URL JS/icon/CSS/customJS được sinh từ cấu hình build và đường dẫn asset.
App kiểm tra minApiVersion nếu có (số nguyên dương), từ chối cài/chạy API mới hơn mức hỗ trợ.
Khi nạp plugin, metadata trong code là nguồn xác định contract; tăng version để app nhận bản cập nhật.

Ví dụ một entry (URL minh họa):

```json
[
  {
    "id": "example",
    "name": "Example",
    "site": "https://example.com",
    "lang": "English",
    "version": "1.0.0",
    "url": "https://repo.example/plugins/english/Example.js",
    "iconUrl": "https://repo.example/static/src/example/icon.png",
    "contentWarning": 0,
    "contentType": "novel",
    "isNekoriPlugin": true,
    "minApiVersion": 1
  }
]
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
"Latest". Không giả định Latest bỏ filters; host có thể truyền giá trị bộ lọc
hoặc mặc định của plugin. `options.filters`
chứa các cặp `{ type, value }`, khoá trùng với khoá trong định nghĩa filter.

### parseNovel

```ts
parseNovel(novelPath: string): Promise<Plugin.SourceNovel>
// NekoriPagePlugin: Promise<Plugin.SourceNovel & { totalPages: number }>
```

`novelPath` chính là `path` trong `NovelItem` bạn đã trả về, và
`SourceNovel.path` nên giữ nguyên giá trị đó.

### parsePage — chỉ `NekoriPagePlugin`

```ts
parsePage(novelPath: string, page: string): Promise<Plugin.SourcePage>
```

Trả về danh sách chương của một trang được đánh số.

### parseChapter

```ts
async parseChapter(chapterPath: string): Promise<Plugin.ChapterContent> {
  const html = await fetchText(this.site + chapterPath);
  return { state: 'ready', type: 'novel', html };
}
```

`ChapterContent` là object chính thức trong Electron và Android; chỉ `html` dùng để render.
`type` bắt buộc: `novel | mixed | image | video`. Mọi loại vẫn render bằng HTML.

| Trường | Ý nghĩa |
| --- | --- |
| `state: 'ready'` | Nội dung sử dụng được. |
| `state: 'checkpoint'` | Được hiển thị HTML xác minh/đăng nhập/chương khóa, nhưng download và EPUB export phải báo lỗi. |
| `noCache?: boolean` | Không tái sử dụng phản hồi trong cache đọc/runtime; không tự cấm download. |
| `noPrefetch?: boolean` | Dừng đọc trước từ chương này, chặn nối chương vào infinite reader; không tự cấm download. |
| `checkpointMessage?: string` | Thông báo tùy chọn của checkpoint. |

Checkpoint khai báo cả hai cờ true; normalizer cũng ép chúng thành true.

```ts
return {
  state: 'checkpoint',
  type: 'novel',
  html: '<div id="captcha-placeholder">Please verify and reload.</div>',
  checkpointMessage: 'Verification required',
  noCache: true,
  noPrefetch: true,
};
```

Throw lỗi nếu không có HTML hữu ích. Checkpoint không tự giải captcha hoặc retry;
customJS xử lý tương tác và yêu cầu reload qua bridge reader hiện có.
LNReader trả chuỗi được nâng thành object; không hạ object Nekori về chuỗi hay tạo lại marker policy.

### searchNovels

```ts
searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]>
```

Nếu trang tìm kiếm không hỗ trợ phân trang: `if (pageNo > 1) return [];`

### getFilterSuggestions — tuỳ chọn

```ts
getFilterSuggestions(
  filterKey: string,
  query: string,
): Promise<FilterOption[]>
```

Trả về danh sách gợi ý tự động điền cho bộ lọc `TextInput` hoặc `MultiText` có
`autocomplete: true`. Bỏ qua nếu plugin không cần gợi ý; ứng dụng sẽ tự động
dùng ô nhập văn bản thường.

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

> Các entity dùng **`path`**, không phải `url`. Khi không có ảnh bìa, hãy bỏ trống `cover` (hoặc để `undefined`) — ứng dụng sẽ tự hiển thị ảnh mặc định (`@libs/defaultCover` đã được gỡ bỏ).


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

Dùng `page: 'Volume 1'` làm nhãn volume trên base plugin. Plugin phân trang dùng chuỗi số trang, với `totalPages` nguyên dương.

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
| `TextInput` | Ô nhập văn bản (hỗ trợ `autocomplete: true`) | `string` |
| `MultiText` | Nhập nhiều thẻ/chip (hỗ trợ `autocomplete: true`) | `string[]` |
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
của ứng dụng. Tải lại plugin/app để thay đổi có hiệu lực.

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

Allowlist hiện tại:

| Namespace | Exports / modules |
| --- | --- |
| `@libs/*` | `fetch`, `storage`, `filterInputs`, `novelStatus`, `pluginError`, `isAbsoluteUrl` |
| `@libs/aes` | `gcm` |
| `@libs/utils` | `utf8ToBytes`, `bytesToUtf8` |
| `@nekori/plugin` | `NekoriBasePlugin`, `NekoriPagePlugin` |
| `@nekori/pluginMetadata` | `ContentType`, `ContentWarning` |
| `@nekori/aes` | `gcm`, `ctr`, `ecb`, `cbc`, `cfb` |
| `@nekori/utils` | `Buffer`, `NodeCrypto`, `getUserAgent`, `encodeHtmlEntities`, `decodeHtmlEntities` |
| `@nekori/cookie` | `set`, `get`, `setFromResponse`, `flush`, `removeSessionCookies` |

Ngoài ra: `@/types/plugin`, `cheerio`, `htmlparser2`, `dayjs`, `urlencode`, `node-html-markdown`.
Import tương đối phải nằm trong thư mục plugin.

Build nhúng class @nekori/plugin và constants metadata; các API runtime khác do host cung cấp. @libs/cookie, @libs/pluginMetadata, @libs/webview không thuộc API hiện tại.

@nekori/webview chỉ là stub và không nằm trong allowlist: solveCloudflare trả false, solveCloudflareTurnstile reject. Không dùng như solver hoạt động.

NodeCrypto dùng Node trong Electron và crypto-browserify trên Android; chỉ dùng thuật toán có ở cả hai. cookie.flush() ghi cookie.

- `fetchApi(url, init?)`: Response; kiểm tra status trước khi đọc body.
- `fetchText(url, init?, encoding?)`: decode text (mặc định UTF-8), trả chuỗi rỗng khi thất bại.
- `fetchProto<T>({ proto, requestType, requestData?, responseType }, url, init?)`: protobuf.

Bundle nhắm ES2020. Chưa có HBC. Electron dùng để dev, kiểm thử release trên app.

## Gỡ lỗi (Debug)

> Mã webview (Custom JS) **không** hỗ trợ hot-reload của Vite. Chạy
> `npm run build:assets` mỗi khi thay đổi asset. Nếu đổi metadata, build lại
> bundle plugin.

Build và kiểm tra TypeScript chạy độc lập. Dùng `npm run type-check` để kiểm tra
mọi phạm vi, hoặc `npm run type-check:plugins` / `npm run type-check:webviews`
khi đang sửa riêng plugin.

`npm run build:prepare` chạy lần lượt clean multisrc, generate multisrc, bundle
plugin và build asset. `npm run build:full` thêm manifest. `npm run dev` chạy
pipeline prepare trước khi mở Electron; `npm run serve:dev` prepare trước khi
tạo manifest development.

Sau `npm run build:full`, chạy `npm run test:build` để kiểm tra asset plugin đã
sinh. `build:assets` phải chạy sau `build:plugins` vì nó đọc metadata từ bundle
đã biên dịch.

Chạy `npm run test:checks` để kiểm tra hồi quy site-probe cục bộ và validation
plugin, bao gồm phản hồi M3U hợp lệ, rỗng và sai định dạng.

### Kiểm tra tự động

`npm run check:sites` kiểm tra từng `plugin.site` duy nhất từ metadata plugin
đã biên dịch cục bộ qua đường request Electron/Chromium bằng GET có giới hạn,
tự theo redirect, thử lại lỗi tạm thời và ghi `broken-sites-report.json`.
Cloudflare DoH bảo mật và ECH tùy khả năng được bật mặc định khi server công bố
record HTTPS/SVCB cần thiết. Dùng `--dns-mode secure|automatic|off`,
`--doh HTTPS_URL` hoặc `--no-ech` để đổi đường mạng. `--no-ech` tắt cơ chế
khám phá HTTPS/SVCB `UseDnsHttpsSvcb` và hint ECH của Chromium, nhưng không tắt
DoH. Kiểm tra Chromium 150 trực tiếp cho thấy mặc định thương lượng TLS 1.3
với SNI mã hóa, còn `--no-ech` cho SNI plaintext. Các cờ khác gồm `--plugin ID`, `--url URL`, `--timeout MS`,
`--attempts N`, `--concurrency N` và `--output FILE`. Mỗi mục giữ danh sách
plugin dùng chung site, URL đầu vào/cuối, mọi hop redirect, chuyển host, trạng
thái, số lần thử và lý do. Lệnh báo endpoint đã truy cập và không sửa metadata
site. Trạng thái gồm `accessible`, `blocked`, `http_error`, `network_error`,
`timeout` và `invalid_url`. `blocked` nghĩa là site đã phản hồi nhưng không thể
xác minh nội dung nên lệnh thoát 0; các trạng thái không khỏe khác thoát 1.

`npm run check:plugins` chạy các method thật được chọn mẫu trong cửa sổ
Electron ẩn, dùng profile và kho settings mới, cô lập. Lệnh nhận các cờ lặp
`--plugin ID`, `--query TEXT`, `--novel PATH`, `--chapter PATH`, `--config FILE`,
`--timeout MS`, `--output FILE`, `--list`, `--dns-mode secure|automatic|off`,
`--doh HTTPS_URL` và `--no-ech`. Dùng `--method NAME` với `--args
JSON` hoặc `--args-file FILE` để gọi đúng một method; report dùng
`mode: "single_method"` và có preview đối số/kết quả được giới hạn, che thông
tin nhạy cảm, timeline request và stack đã làm sạch. `--debug` thêm chẩn đoán
chi tiết cho smoke run. `--inspect` chỉ dùng với một plugin và method, mở
DevTools hiển thị, dừng trước lời gọi và giữ cửa sổ đến khi đóng. Config dùng
plugin ID làm khóa:

```json
{"plugin.id":{"settings":{},"query":"...","novel":"...","chapter":"..."}}
```

Trên Windows nên dùng args file để tránh lỗi escape của shell:

```json
["/novel/example"]
```

```powershell
npm run check:plugins -- --plugin example --method parseNovel --args-file .\args.json --inspect
```

Smoke path kiểm tra entity trả về và đi theo dữ liệu qua method popular/search,
novel, page, chapter và resolve URL khi có. Method bắt buộc bị empty hoặc
skipped sẽ làm lệnh thất bại; method tùy chọn có thể skipped. Lệnh tự động
không giải CAPTCHA hay challenge tương tác. Đây là kiểm tra mẫu, không chứng
minh toàn bộ catalog hoặc đầy đủ tương thích Hermes/thiết bị. Khi tất cả pass,
lệnh thoát 0; trạng thái method gồm `passed`, `failed`, `empty`, `blocked`,
`skipped` và `timeout` (correlation request cũng có thể báo `network_error`).
Kết quả failed, empty, blocked, timeout, network hoặc required skipped thoát 1.

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

### 2. serve:dev (kiểm thử release trên ứng dụng Nekori)

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

`customJS` được bundle từ `webview/index.ts` hoặc `index.js`; `customCSS` được chép nguyên từ `webview/style.css`. Build lại assets sau khi sửa. Tên metadata không có đường dẫn được xuất dưới `public/static/src/<plugin.id>/`.

Electron dev client dùng bản build được chép vào `public/static/novel-reader/`: runtime, declarations, CSS, widget VanJS và media engines offline. Build bình thường không cần repo Nekori bên cạnh hoặc npm dependency reader. Để cập nhật, chạy **trong app/tools/reader-runtime của Nekori**, rồi commit các file đã chép trong repo plugins:

```sh
npm run build
node sync-dev-client.mjs /duong-dan/nekori-plugins
```

Trong repo plugins, `npm run build:reader` build adapter Electron từ các file cục bộ này; `build:prepare` đã gọi bước đó. Open Preview chạy runtime thật; F12 mở DevTools. Tổng hợp giọng nói Android, dịch/tóm tắt AI, tải chương và điều hướng giữa các chương thuộc host, chưa được triển khai trong preview độc lập này.

### Cấu trúc file

| Đường dẫn | Vai trò |
| --- | --- |
| `public/static/novel-reader/` | Bản `dist` chép từ app: runtime, assets, styles, declarations và media vendors. Commit các file này. |
| `src/lib/reader-client.ts` | Adapter host Electron. |
| `public/static/reader-client.js` | Adapter đã compile; import trực tiếp `./novel-reader/index.js`. |
| `src/types/webview/index.d.ts` | Import declarations đã chép cho customJS của source. |

Script chép cập nhật thư mục đầu tiên. Build dev client chỉ compile adapter, không build lại hay chép thêm runtime app.

### Reader API

CustomJS chạy trong WebView, tách với Hermes dùng cho source plugin.
Dùng global viết thường `window.nekori`; các helper `@libs/*` không được inject vào tài liệu này.
`src/types/webview/index.d.ts` import declarations đã build từ app.
Khi cần type có tên trong `plugins/<language>/<PluginName>/webview/index.ts`, dùng type-only import:

```ts
import type { ReaderApi, DashConfig } from '../../../../public/static/novel-reader/index.js';
```

Global được tạo trước khi các controller khởi tạo xong.
Đợi `ready`, dùng hàm async thay top-level await vì customJS được bundle thành classic IIFE:

```ts
void (async () => {
  const reader = window.nekori;
  if (!reader) throw new Error('Reader chưa sẵn sàng');
  await reader.ready;
  console.info(reader.context.chapter.id, reader.context.chapter.path);
})().catch(error => window.nekori?.error(String(error)));
```

| Thành viên | Hợp đồng |
| --- | --- |
| `ready` | `Promise<void>`; controller đã khởi tạo, chưa đảm bảo font/ảnh/reflow/phát video hoàn tất. |
| `context` | Getter cho dữ liệu document/novel/chapter/runtime/cấu hình hiện tại; xem bên dưới. |
| `config` | `ReaderConfig` hiện tại, thuộc app; không phải setter preference native. |
| `events.subscribe(name, listener)` | Trả hàm unsubscribe. Thông báo state được mô tả bên dưới. Không có public emit. |
| `layout` | `ReaderLayout` hoặc null; kiểm tra enabled trước khi dùng phân trang và chấp nhận position có thể null. |
| `player` | `ReaderPlayer` hoặc null; tài liệu văn bản thông thường không có media delegate. |
| `fetch(input, init?)` | `Promise<Response>`; proxy host dùng RequestInit chuẩn, chuyển tiếp headers. Tự kiểm tra response.ok. |
| `refetch()` | `void`; yêu cầu host lấy lại từ source, không trả Promise hoàn tất. |
| `error(message)` | `void`; gửi chuỗi lỗi vào kênh reader error của host. |
| `dispose()` | `void`; dọn tài liệu, do ứng dụng nhúng quản lý. Không dùng để dọn riêng UI của source. |

#### Context, metadata và runtime

`context` có `documentId`, `mode` (reader/download/error), `novel`, `chapter`, `nextChapter`, `chapters`, `runtime`, `strings`.
Các trường cấu hình tùy chọn là `ui`, `style`, `layout`, `player`; đây là dữ liệu, khác controller tại reader.layout / reader.player.
Các trường định danh tùy chọn là `sourceBaseUrl`, `sourceId`, `novelId`, `chapterId`; novel/chapter ID mặc định lấy từ metadata tương ứng.

| Đối tượng | Các trường |
| --- | --- |
| `novel` | Chuỗi id, name, path. |
| `chapter`, `nextChapter` | Chuỗi id, name, path; số progress; url dạng chuỗi và number dạng số là tùy chọn. nextChapter có thể null. |
| `chapters` | Metadata được cấp cho tài liệu; reader Android cấp các chương đã nạp, không phải toàn bộ mục lục source hoặc nội dung chương. |
| `runtime` | Boolean editing, infinite, textSelectionBlocked, forcedLowercase, menuVisible, immersive, loadingChapter, loadingNext, noMoreChapters; ttsState là playing/paused/stopped/starting. |

ID database native là chuỗi số; không đổi thành Number.
Path là định danh nguyên gốc của source, không phải URL ngoài để tự chuẩn hóa hoặc nối chuỗi tùy ý.
Chapter.progress là tiến độ đã lưu do host cấp, không phải bộ theo dõi cuộn DOM tức thời.
Runtime không có progress/chapterProgress/currentChapterId.
Đọc context mới khi cần; sửa các đối tượng này không điều hướng, lưu thư viện hoặc thay preference native.

#### Theo dõi state

`document.stateChanged` nhận `{ runtime, event? }` sau khi host cập nhật config/runtime, không có lớp DOM Event/detail.
Đọc state ban đầu trước khi subscribe; chuỗi event tùy chọn là nhãn của host.
Unsubscribe khi gỡ UI sở hữu listener:

```ts
const reader = window.nekori;
if (reader) {
  console.info(reader.context.runtime.ttsState);
  const unsubscribe = reader.events.subscribe('document.stateChanged', ({ runtime }) => {
    console.info(runtime.ttsState);
  });
  // Gọi unsubscribe() khi gỡ UI tùy chỉnh sở hữu listener này.
}
```

Các protocol event reader gửi về native như layout.positionChanged, chapter.appended, reader.error không tự phát lại cho subscriber.
Các DOM event tsundoku:* cũ đã bỏ.
ReaderApi không có public actions cho chương trước/sau, TTS, dịch hoặc phương thức truy cập bridge riêng.

#### Layout và DOM source

Các thao tác phân trang trả boolean: `moveBy(delta, behavior?)`, `seekUnit(index, behavior?)`, `seekPercent(percent)`, `revealElement(element)`, `reflow(preserveViewport?)`.
Dùng -1/+1 để chuyển một đơn vị đọc; chuyển tới sau tại ranh giới đã nạp có thể yêu cầu chương khác.
SeekUnit bắt đầu từ 0 trong chương đang thấy; seekPercent(50) là một nửa.
Layout.position có chapterId, unitIndex, unitCount, firstPage, lastPage, totalPages, progress (0–1).
Một đơn vị là một trang hoặc spread hai trang; đợi position khác null khi đọc nó.
Dùng revealElement thay scrollIntoView trong phân trang.
Để app quản lý configure, prepareSilentTurn, finishSilentTurn và dispose của controller.

Root là `#nekori-reader` / `.nekori-reader` / `[data-nekori-reader-root]`.
Chương dùng `<nekori-chapter class="nekori-chapter">` với data-nekori-chapter-id, -name, -number, -path, -url ở cả layout cuộn và phân trang.
Plain text dùng `.nekori-plain-text` / `[data-nekori-plain-text="1"]`.
Giới hạn CSS vào chương hoặc phần tử riêng của plugin, giữ root/wrapper của app.
Phần trong summary/feedback nằm ở shadow root; selector chương thông thường không style được chúng.

Dùng --reader-background-color, --reader-text-color, các biến font/margin --reader-* và màu theme --md-sys-color-*.
Không có JavaScript theme object; đọc giá trị qua getComputedStyle(document.documentElement).getPropertyValue(name).

Source customJS được bật và đưa vào tài liệu chạy một lần sau khi reader khởi tạo.
Chỉ user snippet bật chạy khi append mới được native gọi lại; source customJS không tự chạy lại khi cuộn vô hạn nối chương.
Dùng MutationObserver giới hạn trong vùng cần thiết nếu UI source phải phản ứng với node chương mới.
Inline script trong HTML chịu thiết lập embedded JS và bước xử lý nội dung; đặt hành vi source vào customJS.

#### Fetch và refetch

Dùng reader.fetch cho URL HTTP(S) khi proxy reader được bật.
Nó nhận chuỗi URL, đối tượng URL hoặc Request; resolve chuỗi tương đối theo URL source thật trước khi proxy.
Dùng fetch trình duyệt cho blob/data URL.
Khi tắt proxy, reader.fetch gửi lỗi có hướng dẫn xử lý đến host và reject.

Sau xác minh thành công, gọi reader.refetch(): host Android lấy lại chương hiện tại từ source; Electron đồng bộ web storage rồi gọi parseChapter với path preview.
Thao tác tạo tài liệu khác, nên không giữ lại API/DOM cũ.
Các globals reader, tts, pageReader, van, LNReaderPlayer, ReactNativeWebView, Tsundoku, TsundokuTheme không được cung cấp.

## Plugin Video (Anime)

Trả ChapterContent với `type: 'video'`, `noCache: true`, `noPrefetch: true`. Player Nekori dùng Video.js cùng hls.js/dash.js. Plugin mới dùng metadata `nekori-*`:

```ts
return {
  state: 'ready', type: 'video', noCache: true, noPrefetch: true,
  html: [
    '<meta name="nekori-video-mode" content="direct">',
    '<meta name="nekori-video-type" content="m3u8">',
    '<meta name="nekori-video-url" content="https://example.com/video.m3u8">',
  ].join('\n'),
};
```

Direct tự phát. Các type được chấp nhận: `m3u8` (HLS/MSE), `mpd` (DASH), `video-file`, `iframe`. Không có alias hls/dash. Iframe chỉ nhận HTTP(S), không tải xuống được.

Nếu customJS mới lấy được URL, đặt `nekori-video-mode` là `lazy`, đợi ready rồi gọi player. Các hàm phát trả `Promise<void>`; await khởi tạo và catch các rejection ngoài dự kiến. Lỗi phát/engine còn được báo đến host; Promise resolve không đảm bảo đang phát:

```ts
const reader = window.nekori;
if (!reader) throw new Error('Reader chưa sẵn sàng');
void reader.ready.then(async () => {
  if (!reader.player) throw new Error('Chương không có player');
  await reader.player.playHls('https://example.com/video.m3u8', { /* cấu hình hls.js chuẩn */ });
}).catch(error => reader.error(String(error)));
```

### Player API

| Hàm | Tham số |
| --- | --- |
| `playHls(url, config?)` | Cấu hình hls.js chuẩn, gồm custom loader. |
| `playDash(url, config?)` | `{ settings?, protectionData? }` theo dash.js chuẩn. |
| `playDirect(url)` | File video trực tiếp. |
| `playIframe(url)` | Player nhúng. |
| `log(message)` | Log console; thêm vào overlay player khi bật debug. |
| `setDebug(enabled)`, `toggleDebug()` | Overlay debug. |
| `addSubtitles(trackOrTracks)` | `Promise<void>`; một track hoặc mảng. Trường: label?, lang?, url?, content?, default?. Cấp content hoặc URL. |
| `dispose()` | Dọn khi đóng tài liệu; thường do reader quản lý. |

Engine instance và DOM nội bộ là private. Truyền cấu hình qua playHls/playDash thay vì truy cập hlsInstance/dashInstance.

```ts
// Thay URL/headers bên dưới bằng giá trị source lấy được.
void (async () => {
  const reader = window.nekori;
  if (!reader) throw new Error('Reader chưa sẵn sàng');
  await reader.ready;
  const player = reader.player;
  if (!player) throw new Error('Chương không có player');
  await player.playDash('https://example.com/manifest.mpd', {
    settings: { streaming: { buffer: { bufferTimeAtTopQuality: 30 } } },
    protectionData: {
      'com.widevine.alpha': {
        serverURL: 'https://example.com/license',
        httpRequestHeaders: { Authorization: 'Bearer YOUR_TOKEN' },
      },
    },
  });
  await player.addSubtitles({
    label: 'Tiếng Việt', lang: 'vi',
    url: 'https://example.com/subtitles.vtt', default: true,
  });
})().catch(error => window.nekori?.error(String(error)));
```

Settings dash.js được thay thế, không merge. Không đặt DRM robustness mặc định: WebView Android có thể từ chối mức cao hơn. Protected playback tuân theo permission/incognito của host; DRM chạy trong Electron không chứng minh tương thích Android. Phụ đề hỗ trợ WebVTT và chuyển SubRip; plugin tự chuyển các định dạng khác. Phụ đề ngoài chưa được ghi vào file video tải xuống.

Có thể chuẩn bị phụ đề trước khi phát hoặc thêm sau; các track đã chuẩn bị được giữ khi player mount lại. Track lỗi được log và bỏ qua, không reject toàn bộ thao tác addSubtitles.

## Các thẻ meta đặc biệt

| Metadata | Ý nghĩa |
| --- | --- |
| `meta[name=nekori-video-mode]` | direct hoặc lazy. |
| `meta[name=nekori-video-type]` | m3u8, mpd, video-file, iframe. |
| `meta[name=nekori-video-url]` | URL phát trực tiếp; escape giá trị thuộc tính HTML. |
| `meta#nekori-video-disable-progress` | Tắt lưu tiến độ / skin live; không tải xuống. |
| `meta[name=nekori-video-poster]` | Poster. |
| `meta[name=nekori-video-thumbnails]` | Storyboard WebVTT; opt-in này buộc media element dùng anonymous CORS. |
| `meta[name=nekori-debug-mode]` | true bật overlay debug. |

State/type/cache/prefetch nằm trong ChapterContent, không dùng marker điều khiển cũ. Chuyển marker offline cũ là trách nhiệm tại bước nạp của app.

## Captcha và các vấn đề bên lề

Trả checkpoint với HTML tương tác và noCache/noPrefetch true. CustomJS xác minh rồi gọi window.nekori.refetch(). Electron đồng bộ web storage trước khi yêu cầu chương mới. Không coi checkpoint là chương tải xong hoặc prefetch được. API này không cung cấp solver tự động hay IPC tổng quát giữa plugin và customJS.
