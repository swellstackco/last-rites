/** A fake `fetch` for tests. Records every call and fails loudly on any unmatched request. */

export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
  credentials: string | undefined;
}

export interface FakeResponseSpec {
  status?: number;
  headers?: Record<string, string>;
  /** Strings are sent as is; anything else is JSON.stringify'd. */
  body?: unknown;
}

export type FakeHandler = FakeResponseSpec | ((call: RecordedCall) => FakeResponseSpec | Promise<FakeResponseSpec>);

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export interface FakeFetch {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
  /** Requests that matched no route (also thrown into the caller). */
  unexpected: string[];
  /** Registers a route, "METHOD /path". Later registrations replace earlier ones. */
  on(key: string, handler: FakeHandler): void;
  /** Registers a route whose response is released by the test. */
  hold(key: string): Deferred<FakeResponseSpec>;
  /** Throws if any request was unmatched. */
  assertNoUnexpected(): void;
}

function abortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

function headersToRecord(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  new Headers(h).forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function toResponse(spec: FakeResponseSpec): Response {
  const status = spec.status ?? 200;
  const body = spec.body === undefined ? "" : typeof spec.body === "string" ? spec.body : JSON.stringify(spec.body);
  const nullBody = status === 204 || status === 205 || status === 304;
  return new Response(nullBody ? null : body, { status, headers: spec.headers ?? {} });
}

/** Answers a request that matched no explicit route; undefined leaves it unexpected. Explicit routes always win. */
export type FakeFallback = (call: RecordedCall) => FakeResponseSpec | undefined;

export function createFakeFetch(routes: Record<string, FakeHandler> = {}, fallback?: FakeFallback): FakeFetch {
  const table = new Map<string, FakeHandler>(Object.entries(routes));
  const calls: RecordedCall[] = [];
  const unexpected: string[] = [];

  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const call: RecordedCall = {
      method,
      url,
      headers: headersToRecord(init?.headers),
      body: typeof init?.body === "string" ? init.body : undefined,
      credentials: init?.credentials,
    };
    calls.push(call);
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(abortError());

    const handler = table.get(`${method} ${url}`) ?? (fallback ? fallback(call) : undefined);
    if (handler === undefined) {
      const key = `${method} ${url}`;
      unexpected.push(key);
      return Promise.reject(new Error(`Unexpected fetch: ${key}`));
    }
    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve()
        .then(() => (typeof handler === "function" ? handler(call) : handler))
        .then(
          (spec) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            resolve(toResponse(spec));
          },
          (err: unknown) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            reject(err);
          },
        );
    });
  };

  return {
    fetch: fetchImpl as typeof globalThis.fetch,
    calls,
    unexpected,
    on(key, handler) {
      table.set(key, handler);
    },
    hold(key) {
      const d = deferred<FakeResponseSpec>();
      table.set(key, () => d.promise);
      return d;
    },
    assertNoUnexpected() {
      if (unexpected.length > 0) throw new Error(`Unexpected fetch calls: ${unexpected.join(", ")}`);
    },
  };
}
