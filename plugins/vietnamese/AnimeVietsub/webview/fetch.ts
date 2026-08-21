export async function nativeFetch(
  url: string,
  headers?: Record<string, string>,
): Promise<{ status: number; text: string; headers: Record<string, string> }> {
  // Use reader.fetch if available, otherwise fallback to global fetch
  const fetchFn =
    window.reader && window.reader.fetch
      ? window.reader.fetch.bind(window.reader)
      : fetch;
  // eslint-disable-next-line
  const init: RequestInit = { credentials: 'include', headers };

  const r = await fetchFn(url, init);
  const h: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    h[k.toLowerCase()] = v;
  });

  const text = await r.text();
  return { status: r.status, text, headers: h };
}
