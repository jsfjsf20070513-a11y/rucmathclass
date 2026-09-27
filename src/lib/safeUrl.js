// 资源书架合并本地目录和云端书目。读取与渲染都校验 URL，
// 避免 javascript:、data: 等协议进入链接。

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/**
 * Returns the URL if it parses cleanly and uses an allowed protocol;
 * otherwise returns the fallback (defaults to '#'). Never throws.
 *
 * Note: empty / missing input returns the fallback so callers can
 * pass through `resource.url` without a separate truthiness check.
 */
export function sanitizeHttpUrl(input, fallback = '#') {
  if (!input || typeof input !== 'string') {
    return fallback
  }
  const trimmed = input.trim()
  if (!trimmed) {
    return fallback
  }
  try {
    // Use the current origin as a base so relative URLs resolve and
    // bare domains like "example.com/path" don't get treated as
    // unparseable.
    const candidate = new URL(trimmed, 'https://placeholder.invalid')
    if (!ALLOWED_PROTOCOLS.has(candidate.protocol)) {
      return fallback
    }
    return candidate.toString()
  } catch {
    return fallback
  }
}

/**
 * Validate URLs read from stored resource rows. Requires an absolute URL,
 * returns '' for invalid input and preserves an allowed URL's spelling.
 * The backend uses this when mapping cloud rows into resource entries.
 */
export function sanitizeStoredUrl(input) {
  if (!input || typeof input !== 'string') {
    return ''
  }
  const trimmed = input.trim()
  if (!trimmed) {
    return ''
  }
  try {
    const parsed = new URL(trimmed)
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? trimmed : ''
  } catch {
    return ''
  }
}

/**
 * Convenience for inline external links: returns props that are safe
 * to spread onto an <a> tag. Always sets `rel="noopener noreferrer"`
 * even though modern browsers imply `noopener` for `target="_blank"`,
 * and falls back to a non-clickable href when the URL is unsafe.
 */
export function externalLinkProps(rawUrl, { fallback = '#' } = {}) {
  const href = sanitizeHttpUrl(rawUrl, fallback)
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
  }
}
