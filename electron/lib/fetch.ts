import { parse as parseProto } from 'protobufjs';

export type FetchInit = {
  headers?: Record<string, string | undefined> | Headers;
  method?: string;
  body?: FormData | string;
  [x: string]: any;
};

export async function fetchApi(
  url: string,
  init?: FetchInit,
): Promise<Response> {
  const mergedInit = { ...init };

  // Flatten Headers instance to plain object for IPC serialization
  if (mergedInit.headers instanceof Headers) {
    mergedInit.headers = Object.fromEntries(mergedInit.headers.entries());
  }

  const result = await window.electronAPI!.invoke(
    'fetch:request',
    url,
    mergedInit,
  );
  const bodyBytes = Uint8Array.from(atob(result.body), c => c.charCodeAt(0));
  const response = new Response(bodyBytes, {
    status: result.status,
    statusText: result.statusText,
    headers: new Headers(result.headers),
  });
  Object.defineProperty(response, 'url', { value: result.url });
  return response;
}

export async function fetchText(
  url: string,
  init?: FetchInit,
  encoding?: string,
): Promise<string> {
  try {
    const res = await fetchApi(url, init);
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    return new TextDecoder(encoding).decode(buf);
  } catch {
    return '';
  }
}

type ProtoRequestInit = {
  proto: string;
  requestType: string;
  requestData?: any;
  responseType: string;
};

const BYTE_MARK = BigInt((1 << 8) - 1);

export const fetchProto = async function <ReturnType>(
  protoInit: ProtoRequestInit,
  url: string,
  init?: FetchInit,
) {
  const protoRoot = parseProto(protoInit.proto).root;
  const RequestMessge = protoRoot.lookupType(protoInit.requestType);
  if (RequestMessge.verify(protoInit.requestData || {})) {
    throw new Error('Invalid Proto');
  }
  const encodedrequest = RequestMessge.encode(
    protoInit.requestData || {},
  ).finish();
  const requestLength = BigInt(encodedrequest.length);
  const headers = new Uint8Array(
    Array(5)
      .fill(0)
      .map((v, idx) => {
        if (idx === 0) return 0;
        return Number((requestLength >> BigInt(8 * (5 - idx - 1))) & BYTE_MARK);
      }),
  );

  const mergedInit = { ...init };
  if (!mergedInit.headers) mergedInit.headers = {};

  const bodyArray = new Uint8Array(headers.length + encodedrequest.length);
  bodyArray.set(headers, 0);
  bodyArray.set(encodedrequest, headers.length);

  return fetchApi(url, {
    method: 'POST',
    ...mergedInit,
    body: bodyArray,
  } as any)
    .then(r => r.arrayBuffer())
    .then(arr => {
      const payload = new Uint8Array(arr);
      const length = Number(
        BigInt(payload[1] << 24) |
          BigInt(payload[2] << 16) |
          BigInt(payload[3] << 8) |
          BigInt(payload[4]),
      );
      const ResponseMessage = protoRoot.lookupType(protoInit.responseType);
      return ResponseMessage.decode(payload.slice(5, 5 + length));
    }) as ReturnType;
};
