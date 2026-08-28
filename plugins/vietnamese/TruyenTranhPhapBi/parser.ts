import { load } from 'cheerio';

export type BloggerEntry = {
  title?: { $t?: string };
  link?: { rel?: string; href?: string }[];
  content?: { $t?: string };
};

type BloggerResponse = { feed?: { entry?: BloggerEntry[] } };

export function feedPath(label?: string) {
  return `/feeds/posts/default${label ? `/-/${encodeURIComponent(label)}` : ''}`;
}

export function parseFeed(json: BloggerResponse) {
  return (json.feed?.entry || []).flatMap(entry => {
    const link = entry.link?.find(item => item.rel === 'alternate')?.href;
    const name = entry.title?.$t?.trim();
    if (!link || !name) return [];

    const $ = load(entry.content?.$t || '');
    const image = $('img').first();
    const cover = image.closest('a').attr('href') || image.attr('src');

    return [{ name, path: new URL(link).pathname, cover }];
  });
}

export function parsePost(html: string) {
  const $ = load(html);
  const post = $('.post').first();
  const body = post.find('.post-body').first().clone();
  const summary = body.clone().find('img,script,style').remove().end().text();
  const overlayImages = body.find('.overlay-data img');
  const images = overlayImages.length ? overlayImages : body.find('img');
  images.each((index, image) => {
    const element = $(image).attr(
      'style',
      'display:block;width:100%;height:auto;margin:0;padding:0',
    );
    const src = element.attr('src');
    if (
      src?.includes('blogger.googleusercontent.com') &&
      /\/[sw]\d+(?:-rw)?\//.test(src)
    ) {
      const resized = (width: number) =>
        src.replace(/\/[sw]\d+(?:-rw)?\//, `/w${width}-rw/`);
      element.attr({
        src: resized(1000),
        srcset: `${resized(600)} 600w, ${resized(900)} 900w, ${resized(1200)} 1200w`,
        sizes: '100vw',
      });
    }
    if (index === 0) {
      element.attr('loading', 'eager').attr('fetchpriority', 'high');
    } else {
      element.attr('loading', 'lazy').attr('decoding', 'async');
    }
  });

  return {
    name: post.find('.post-title').first().text().trim(),
    summary: summary.replace(/\s+/g, ' ').trim(),
    cover: body.find('img').first().attr('src'),
    genres: post
      .find('.post-labels a')
      .map((_, element) => $(element).text().trim())
      .get()
      .join(','),
    content: images
      .toArray()
      .map(image => $.html(image))
      .join(''),
  };
}
