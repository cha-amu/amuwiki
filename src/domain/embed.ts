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
