# Tài liệu phát triển LNReader Plugins

Tài liệu này cung cấp các hướng dẫn cơ bản để cài đặt môi trường và phát triển plugin cho LNReader.

## Cài đặt dự án

**Yêu cầu cơ bản:**

- Kiến thức về Git và TypeScript.
- Cài đặt [Node.js](https://nodejs.org/) phiên bản 24 trở lên.

**Các bước cài đặt:**
Mở terminal tại thư mục gốc của dự án và chạy lệnh sau để cài đặt các thư viện phụ thuộc:

```bash
npm install
```

## Hướng dẫn tạo Plugin

### 1. Vị trí tạo Plugin

- Tất cả các plugin được đặt trong thư mục `plugins`.
- Do repository này tập trung hỗ trợ các nền tảng Web Novel tiếng Việt, vui lòng tạo hoặc đặt plugin của bạn bên trong thư mục `plugins/vietnamese`.
- ~~Bạn cần viết toàn bộ mã nguồn của plugin vào một tệp TypeScript duy nhất (ví dụ: `plugins/vietnamese/LNHako.ts`)~~ Đã chuyển sang cấu trúc mới, Bạn sẽ tạo 1 thư mục có tên được viết theo dạng PascalCase, không có dấu cách. Entry point TypeScript là `index.ts` (ví dụ: `plugins/vietnamese/LNHako/index.ts`)

- Cấu trúc Plugin mới cho phép bạn viết nhiều tệp để có thể sử dụng (giúp mã nguồn dễ đọc hơn, xem thử triển khai ở plugin `AnimeVietsub`)

### 2. Các loại Plugin hỗ trợ

Dự án hiện tại hỗ trợ 2 khuôn mẫu plugin chính: `PluginBase` và `PagePlugin`.

- **`PluginBase`**: Loại plugin cơ bản và thông dụng nhất. Hầu hết các trang web novel đều có thể sử dụng khuôn mẫu này.
- **`PagePlugin`**: Là bản mở rộng (extends) từ `PluginBase`, được thiết kế riêng cho các trang web phân trang chương truyện (ví dụ: Web truyenfull chia danh sách 1000 chương thành nhiều trang, mỗi trang chứa 50 chương).

> **Tham khảo:** Bạn có thể tham khảo mẫu cấu trúc (template) của `PluginBase` tại `plugins/vietnamese/template.ts`, và mẫu của `PagePlugin` tại `plugins/vietnamese/template2.ts`.

### 3. Đăng ký Plugin

Để plugin của bạn được biên dịch thành gói JavaScript bundle hoàn chỉnh, bạn cần đăng ký (import) plugin đó vào tệp `plugins/index.ts` và đưa nó vào mảng danh sách xuất (export) `PLUGINS`.

Việc đăng kí sẽ được thực hiện tự động khi bạn sử dụng lệnh `npm run dev:start`

```ts
import { Plugin } from '@/types/plugin';

// Import instance của các plugin bạn vừa tạo
import p_0 from '@plugins/vietnamese/template';
import p_1 from '@plugins/vietnamese/template2';

// Khai báo mảng chứa plugin
const PLUGINS: Plugin.PluginBase[] = [p_0, p_1];

// Xuất mảng để hệ thống có thể nhận diện và biên dịch
export default PLUGINS;
```

## Hướng dẫn Debug (Gỡ lỗi)

Trong quá trình phát triển Plugin, bạn sẽ cần kiểm tra xem code của mình có hoạt động đúng hay không. Repository này cung cấp 3 phương pháp chính để gỡ lỗi, từ nhẹ nhất đến giống thực tế nhất:

> [!WARNING]
> Mã webview (Custom JS) không hỗ trợ hot-reload của Vite!
> Chạy lệnh `npm run build:full` mỗi khi thay đổi mã.

### 1. WebUI Playground (Khởi chạy trên trình duyệt web)

Đây là môi trường mô phỏng nhanh nhất, sử dụng trực tiếp trình duyệt (Chrome, Edge...) của bạn. Thích hợp để test logic parse, lọc HTML nhanh chóng.

Mở terminal ở thư mục gốc và chạy:

```bash
npm run dev
```

- Lệnh này sẽ tự động biên dịch và khởi chạy một Web Server. Truy cập vào `http://localhost:3000`.
- Bạn có thể thao tác: duyệt truyện, tìm kiếm, đọc chương.
- Gỡ lỗi: Ấn phím **F12** để mở Developer Tools, xem tab `Console` cho các lệnh `console.log()` hoặc `Network` để xem các request bị chặn.
- **Hạn chế:** Bị giới hạn bởi CORS của trình duyệt và không có cấu trúc Cookie đồng bộ mạnh mẽ như ứng dụng thật.

### 2. Electron Playground (Môi trường Desktop)

**Khuyên dùng!** Đây là môi trường mạnh mẽ mô phỏng chính xác React Native app (hỗ trợ lưu trữ persistent cookie, sandbox, fetch qua NodeJS). Giúp bạn dễ dàng test các trang web chặn Cloudflare/DDOS phức tạp.

Mở terminal ở thư mục gốc, di chuyển vào thư mục `electron` và khởi động Electron (nhớ cài thư viện trong thư mục này bằng lệnh `npm install` trước khi dùng electron):

```bash
cd electron
npm run dev
```

- Ứng dụng Desktop sẽ mở ra. Bạn có thể duyệt truyện và parse chapter tương tự WebUI nhưng ổn định hơn.
- Cung cấp tính năng **Spawn New Tab** (`Ctrl+T` hoặc `Cmd+T`) giả lập một WebView của LNReader. Tại đây, bạn có thể tự tay giải Captcha/Cloudflare, các cookie bảo mật sẽ được tự động đồng bộ xuống cho các request `fetch` của plugin.
- Gỡ lỗi: DevTools (Nếu gỡ lỗi WebView, ấn icon Debug ở cuối thanh địa chỉ)

### 3. serve:dev (Kiểm thử trực tiếp trên ứng dụng LNReader)

Dành cho bước kiểm tra cuối cùng trước khi hoàn thiện. Phương pháp này biên dịch plugin và tạo ra một local server. Bạn sẽ add link của local server này vào app LNReader trên điện thoại để test thực tế.

Chuẩn bị nội dung cho file `.env`

```
USER_CONTENT_BASE=http://<IP-của-máy-tính>:3000
```

Mở terminal ở thư mục gốc và chạy:

```bash
npm run serve:dev
```

- Một server local sẽ chạy (cổng 3000). Copy địa chỉ IP LAN của máy tính.
- Mở ứng dụng LNReader trên điện thoại (đảm bảo điện thoại và máy tính dùng chung mạng Wifi).
- Vào **Cài đặt -> Repositories**, thêm URL `http://<IP-của-máy-tính>:3000/.dist/plugins.min.json` và cập nhật.
- Gỡ lỗi: Cài đặt và sử dụng plugin của bạn trên app thực. Nó cho phép test chính xác nhất hành vi của Custom JS/CSS trong Reader, tuy nhiên không có DevTools (console) để xem log nếu không dùng debug Application

## Plugin tương thích với ứng dụng [LNReader-Extended](https://github.com/Yuneko-dev/lnreader-extended)

### 1. Sử dụng các thư viện được thêm mới

- Xem phần [Additional APIs](https://github.com/Yuneko-dev/lnreader-plugins#additional-apis)

- Để biết các API JS được phép sử dụng để tạo file `custom.js` cho plugin, có thể xem file `src/lib/reader-mock.ts`

### 2. Các hành vi mới của ứng dụng

#### API dùng để buộc tải lại 1 chapter truyện (bỏ qua cache):

```js
window.reader.refetch();
```

hoặc

```js
window.reader.post({ type: 'refetch' });
```

#### Làm thế nào để ứng dụng không cache chương hiện tại?

- Thêm vào phản hồi của `parseChapter` một thẻ meta có id `no-cache-marker`

```html
<meta id="no-cache-marker" />
```

#### Làm thế nào để ứng dụng không tải chương tiếp theo?

- Thêm vào phản hồi của `parseChapter` một thẻ meta có id `no-prefetch-marker`

```html
<meta id="no-prefetch-marker" />
```

#### Làm thế nào để fetch bỏ qua giới hạn của WebView

```js
window.reader.fetch(url, init); // Sử dụng tương đương Fetch API
```

### 3. Captcha và các vấn đề bên lề

- Ưu tiên mở trang Web bằng WebView rồi giải captcha.

- Nếu trang Web chặn WebView, có thể thử đổi User-Agent trong cài đặt.

- Nếu vẫn không được, có thể render Captcha trực tiếp trong màn hình Reader. Tuy nhiên, vì hàm `parseChapter` đã được chuẩn hóa, nên script và các thẻ khác có thể không chạy. Sử dụng customJS để xử lý hành vi.

- Trong Reader, URL (location) mặc định sử dụng sẽ là URL site của plugin (Không phải URL của Chapter). Trong Playground, nó là localhost URL.

### 4. Xây dựng Plugin Video (Anime)

LNReader cung cấp sẵn một trình phát video (Core Player) mạnh mẽ dựa trên `hls.js` và `HTML5 Video`. Nó hỗ trợ phát `m3u8`, `mp4` và cả `iframe` trực tiếp trong ứng dụng. Bạn **không cần** tự viết CSS hay nhúng thư viện bên ngoài. Chỉ cần plugin trả về một cấu trúc HTML chứa các thẻ `<meta>` đúng quy chuẩn, phần còn lại sẽ do App tự động xử lý.

Có 2 phương thức hoạt động chính:

#### Phương thức 1: Direct Mode (Phát trực tiếp)

Dành cho các trang đơn giản, nơi bạn bóc tách được trực tiếp link video (`m3u8`, `mp4` hoặc link `iframe`) ngay trong code TypeScript của plugin mà không cần thực thi code trong webview.

**Cách dùng:**
Trong hàm `parseChapter`, bạn chỉ cần trả về một chuỗi HTML chứa các thẻ `<meta>` sau:

```typescript
async parseChapter(chapterUrl: string): Promise<string> {
    const videoUrl = "https://example.com/video.m3u8";

    return [
      '<meta name="lnreader-chapter-type" content="video">', // Bắt buộc
      '<meta name="lnreader-video-mode" content="direct">',  // Chế độ direct
      '<meta name="lnreader-video-type" content="m3u8">',    // Loại: 'm3u8','video-file', 'iframe'
      `<meta name="lnreader-video-url" content="${videoUrl}">` // Link video
    ].join('\n');
}
```

_Lưu ý: App sẽ tự khởi tạo Player, tự lấy cấu hình và tự động phát video ngay lập tức._

#### Phương thức 2: Lazy Mode (Phát trì hoãn nâng cao)

Dành cho các trang phức tạp cần chạy Javascript trực tiếp trên WebView (để bypass Cloudflare, vượt Captcha, tự giải mã m3u8, hoặc tạo blob giả). Bạn sẽ gọi thủ công hàm phát video thông qua tệp `customJS`.

**Cách dùng:**
Bước 1: Hàm `parseChapter` trả về HTML báo hiệu Lazy Mode:

```typescript
async parseChapter(chapterUrl: string): Promise<string> {
    return [
      '<meta name="lnreader-chapter-type" content="video">',
      '<meta name="lnreader-video-mode" content="lazy">',
      '<meta name="lnreader-debug-mode" content="true">', // Hiện console log trên màn hình để dễ debug
      '<div id="my-player" style="display:none;"></div>'  // Các thẻ DOM khác nếu cần
    ].join('\n');
}
```

Bước 2: Trong tệp `customJS` của plugin, thực hiện logic lấy link và truyền vào API:

```javascript
(async function () {
  if (!window.LNReaderPlayer) return;

  window.LNReaderPlayer.log('Đang lấy link video...');
  try {
    // Chèn logic ở đây...
    const m3u8Url = await fetchVideoUrl();

    // Giao quyền lại cho Core Player (ví dụ: m3u8)
    window.LNReaderPlayer.playHls(m3u8Url);
  } catch (err) {
    window.LNReaderPlayer.log('Lỗi: ' + err.message);
  }
})();
```

#### Bảng API của `window.LNReaderPlayer`

Các hàm này được tiêm sẵn vào `window` cho bạn sử dụng trong tệp `customJS`:

- `playDirect(url: string)`: Phát các file / url video tĩnh như `.mp4`, `.webm`, ...
- `playHls(url: string, customHlsConfig?: object)`: Phát định dạng `.m3u8`. `customHlsConfig` cho phép ghi đè cấu hình của `hls.js` (ví dụ: dùng thuộc tính `xhrSetup` để chèn header Authorization khi stream các file fragment `.ts`).
- `playIframe(url: string)`: Nhúng link Iframe
- `log(msg: string)`: Ghi log ra console. Nếu `debug-mode` được bật, chuỗi log sẽ hiển thị dạng overlay

Các thuộc tính / phương thức khác có thể xem [tại đây](https://github.com/Yuneko-dev/lnreader-plugins/blob/master/src/lib/core-player.js)

## Các thẻ meta đặc biệt khác

| #   | Cú pháp                                        | Mô tả                                                                                                                                               |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `<meta id="lnreader-video-disable-progress"/>` | Đánh dấu chapter video này không sử dụng lưu progess (Ví dụ: Live; Không có thời gian kết thúc). Đồng thời video này cũng sẽ không hỗ trợ tải xuống |
