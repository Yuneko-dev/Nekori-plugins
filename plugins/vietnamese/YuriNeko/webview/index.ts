void (async () => {
  const reader = window.nekori;
  if (!reader) throw new Error('Reader is unavailable');
  await reader.ready;

  function log(msg: string) {
    reader.player?.log?.(`[YuriNeko] ${msg}`);
  }

  function b64UrlDecode(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function decodeD(signedUrl: string): { keyHex: string; key: Uint8Array } {
    const query = signedUrl.split('?')[1] ?? '';
    const d = new URLSearchParams(query).get('d') ?? '';
    const decoded = new TextDecoder().decode(b64UrlDecode(d));
    const keyHex = decoded.split('|')[1] ?? '';
    if (!/^[0-9a-f]+$/i.test(keyHex) || keyHex.length % 2 !== 0) {
      throw new Error('Missing image key');
    }
    const key = new Uint8Array(keyHex.length / 2);
    for (let i = 0; i < key.length; i++) {
      key[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
    }
    return { keyHex, key };
  }

  async function decodeImage(img: HTMLImageElement): Promise<void> {
    const src = img.dataset.yurinekoSrc;
    if (!src || img.dataset.yurinekoDecoded) return;
    const { keyHex, key } = decodeD(src);

    const absolute = src.startsWith('http') ? src : `${location.origin}${src}`;
    const init = {
      headers: {
        'X-Ik': keyHex,
        Referer: `${location.origin}/`,
      },
    };
    let res: Response;
    try {
      res = await reader.fetch(absolute, init);
    } catch {
      res = await fetch(absolute, init);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('X-Ct') || 'image/webp';
    const data = new Uint8Array(await res.arrayBuffer());
    for (let i = 0; i < data.length; i++) {
      data[i] ^= key[i % key.length];
    }
    const blob = new Blob([data.buffer as ArrayBuffer], {
      type: contentType,
    });
    img.src = URL.createObjectURL(blob);
    img.dataset.yurinekoDecoded = '1';
    img.removeAttribute('data-yurineko-src');
  }

  const pending = new Set<HTMLImageElement>();
  let decoding = false;

  async function pump(): Promise<void> {
    if (decoding) return;
    decoding = true;
    try {
      for (const img of pending) {
        pending.delete(img);
        try {
          await decodeImage(img);
        } catch (err) {
          log(`decode failed: ${(err as Error).message}`);
        }
      }
    } finally {
      decoding = false;
      if (pending.size) void pump();
    }
  }

  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        pending.add(entry.target as HTMLImageElement);
      }
      if (pending.size) void pump();
    },
    { rootMargin: '600px 0px' },
  );

  function collect(root: Element | Document) {
    root
      .querySelectorAll<HTMLImageElement>('img[data-yurineko-src]')
      .forEach(img => observer.observe(img));
  }

  collect(document);

  // CustomJS runs once; watch for chapters appended later (infinite scroll).
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element) collect(node);
      }
    }
  }).observe(document.getElementById('nekori-reader') ?? document.body, {
    childList: true,
    subtree: true,
  });
})().catch(error => window.nekori?.error(String(error)));
