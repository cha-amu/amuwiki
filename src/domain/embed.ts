function parsedHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

const isLoopback = (url: URL) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

// The browser enforces this exact targetOrigin against the real parent. Production
// embeds can only signal the configured blog. An explicit/referrer-derived loopback
// parent is allowed only while the wiki itself is served on loopback for local QA.
export function embedParentOrigin(
  currentUrl: string,
  blogUrl: string,
  referrer = '',
): string | undefined {
  const current = parsedHttpUrl(currentUrl);
  const blog = parsedHttpUrl(blogUrl);
  if (!current || !blog || current.searchParams.get('embed') !== 'graph')
    return undefined;
  const explicit = current.searchParams.get('parentOrigin');
  const candidate = explicit
    ? parsedHttpUrl(explicit)
    : referrer
      ? parsedHttpUrl(referrer)
      : blog;
  if (!candidate) return undefined;
  if (
    explicit &&
    (candidate.pathname !== '/' || candidate.search || candidate.hash)
  )
    return undefined;
  if (candidate.origin === blog.origin) return candidate.origin;
  if (isLoopback(current) && isLoopback(candidate)) return candidate.origin;
  return undefined;
}

export const PARENT_RESOURCES_TIMEOUT_MS = 4_000;

// Keep message validation independent of the DOM so both identity boundaries
// and the complete payload can be checked before accepting a replacement.
export function resourceKeysFromMessage(
  event: { source: unknown; origin: string; data: unknown },
  parent: unknown,
  targetOrigin: string | undefined,
): ReadonlySet<string> | undefined {
  if (
    !parent ||
    !targetOrigin ||
    event.source !== parent ||
    event.origin !== targetOrigin ||
    !event.data ||
    typeof event.data !== 'object' ||
    Array.isArray(event.data)
  )
    return undefined;
  const data = event.data as { type?: unknown; keys?: unknown };
  if (
    data.type !== 'amuwiki:resources' ||
    !Array.isArray(data.keys) ||
    data.keys.length > 50_000
  )
    return undefined;
  for (const key of data.keys) {
    if (typeof key !== 'string' || key.length < 1 || key.length > 600)
      return undefined;
  }
  return new Set(data.keys);
}

export type ParentResourcesState =
  | { status: 'waiting' }
  | { status: 'ready'; keys: ReadonlySet<string> };

export function updateParentResources(
  state: ParentResourcesState,
  action: { type: 'received'; keys: ReadonlySet<string> } | { type: 'timeout' },
): ParentResourcesState {
  if (action.type === 'received')
    return { status: 'ready', keys: action.keys };
  return state.status === 'waiting'
    ? { status: 'ready', keys: new Set() }
    : state;
}
