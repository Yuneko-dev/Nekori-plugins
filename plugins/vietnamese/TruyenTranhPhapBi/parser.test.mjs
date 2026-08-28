import assert from 'node:assert/strict';

const parser = await import('./parser.ts').catch(() => ({}));

assert.equal(typeof parser.feedPath, 'function');
assert.equal(parser.feedPath(), '/feeds/posts/default');
assert.equal(
  parser.feedPath('Xì trum'),
  '/feeds/posts/default/-/X%C3%AC%20trum',
);

assert.equal(typeof parser.parseFeed, 'function');
assert.deepEqual(
  parser.parseFeed({
    feed: {
      entry: [
        {
          title: { $t: 'Amelia Woods Tập 1' },
          link: [
            {
              rel: 'alternate',
              href: 'https://truyentranhphapbi.blogspot.com/2022/06/amelia.html',
            },
          ],
          content: {
            $t: '<p>Giới thiệu</p><a href="https://images.example/cover.jpg"><img src="thumb.jpg"></a>',
          },
        },
      ],
    },
  }),
  [
    {
      name: 'Amelia Woods Tập 1',
      path: '/2022/06/amelia.html',
      cover: 'https://images.example/cover.jpg',
    },
  ],
);

assert.equal(typeof parser.parsePost, 'function');
const post = parser.parsePost(`
  <article class="post">
    <h3 class="post-title">Amelia Woods Tập 1</h3>
    <div class="post-body">Giới thiệu truyện<img src="https://images.example/page-1.jpg"><script>bad()</script></div>
    <span class="post-labels"><a>Magic</a><a>New</a></span>
  </article>
`);
assert.deepEqual(
  {
    name: post.name,
    summary: post.summary,
    cover: post.cover,
    genres: post.genres,
  },
  {
    name: 'Amelia Woods Tập 1',
    summary: 'Giới thiệu truyện',
    cover: 'https://images.example/page-1.jpg',
    genres: 'Magic,New',
  },
);
assert.match(post.content, /page-1\.jpg/);
assert.doesNotMatch(post.content, /<script/);

const overlayPost = parser.parsePost(`
  <article class="post">
    <h3 class="post-title">Doremon Tập 32</h3>
    <div class="post-body">
      Phần giới thiệu dư thừa
      <img src="cover.jpg">
      <button>Click để đọc truyện</button>
      <div class="overlay-data"><img src="https://blogger.googleusercontent.com/s3000-rw/page-1.jpg"><img src="https://blogger.googleusercontent.com/s3000-rw/page-2.jpg"><img src="https://blogger.googleusercontent.com/w1600-rw/page-3.jpg"></div>
    </div>
  </article>
`);
assert.match(overlayPost.content, /page-1\.jpg/);
assert.match(overlayPost.content, /page-2\.jpg/);
assert.doesNotMatch(overlayPost.content, /Phần giới thiệu|cover\.jpg|button/);
assert.match(
  overlayPost.content,
  /page-1\.jpg[^>]*style="display:block;width:100%;height:auto;margin:0;padding:0"[^>]*loading="eager"[^>]*fetchpriority="high"/,
);
assert.match(
  overlayPost.content,
  /page-2\.jpg[^>]*loading="lazy"[^>]*decoding="async"/,
);
assert.match(
  overlayPost.content,
  /src="https:\/\/blogger\.googleusercontent\.com\/w1000-rw\/page-1\.jpg"/,
);
assert.match(
  overlayPost.content,
  /srcset="https:\/\/blogger\.googleusercontent\.com\/w600-rw\/page-1\.jpg 600w, https:\/\/blogger\.googleusercontent\.com\/w900-rw\/page-1\.jpg 900w, https:\/\/blogger\.googleusercontent\.com\/w1200-rw\/page-1\.jpg 1200w"/,
);
assert.match(overlayPost.content, /sizes="100vw"/);
assert.match(
  overlayPost.content,
  /src="https:\/\/blogger\.googleusercontent\.com\/w1000-rw\/page-3\.jpg"/,
);
