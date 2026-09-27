import { describe, it, expect } from 'vitest'
import { sanitizeHttpUrl, sanitizeStoredUrl, externalLinkProps } from './safeUrl'

// Stored resource URLs must not introduce executable protocols into links.

const DANGEROUS = [
  'javascript:alert(1)',
  'JavaScript:alert(1)', // case-insensitive protocol
  '  javascript:alert(1)  ', // padded
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
]

describe('sanitizeHttpUrl (render path)', () => {
  it('passes through allowed protocols', () => {
    expect(sanitizeHttpUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(sanitizeHttpUrl('http://example.com')).toBe('http://example.com/')
    expect(sanitizeHttpUrl('mailto:teacher@example.com')).toBe('mailto:teacher@example.com')
  })

  it('resolves a bare domain against the placeholder base', () => {
    // base-resolving behaviour is intentional for the render layer
    expect(sanitizeHttpUrl('example.com/path')).toBe('https://placeholder.invalid/example.com/path')
  })

  it('rejects every dangerous protocol → fallback', () => {
    for (const url of DANGEROUS) {
      expect(sanitizeHttpUrl(url)).toBe('#')
    }
  })

  it('returns the fallback for empty / non-string / whitespace input', () => {
    expect(sanitizeHttpUrl('')).toBe('#')
    expect(sanitizeHttpUrl('   ')).toBe('#')
    expect(sanitizeHttpUrl(null)).toBe('#')
    expect(sanitizeHttpUrl(undefined)).toBe('#')
    expect(sanitizeHttpUrl(42)).toBe('#')
  })

  it('honours a custom fallback', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)', '/safe')).toBe('/safe')
  })

  it('never throws', () => {
    expect(() => sanitizeHttpUrl('http://[invalid')).not.toThrow()
  })
})

describe('sanitizeStoredUrl (stored resources)', () => {
  it('preserves an absolute allowed URL verbatim (no normalization)', () => {
    expect(sanitizeStoredUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1')
    expect(sanitizeStoredUrl('mailto:a@b.com')).toBe('mailto:a@b.com')
  })

  it('rejects a bare domain without resolving it against a placeholder', () => {
    expect(sanitizeStoredUrl('example.com/path')).toBe('')
  })

  it('rejects dangerous protocols → empty string', () => {
    for (const url of DANGEROUS) {
      expect(sanitizeStoredUrl(url)).toBe('')
    }
  })

  it('returns empty for empty / non-string input', () => {
    expect(sanitizeStoredUrl('')).toBe('')
    expect(sanitizeStoredUrl(null)).toBe('')
    expect(sanitizeStoredUrl(undefined)).toBe('')
  })
})

describe('externalLinkProps', () => {
  it('always sets rel=noopener noreferrer and target=_blank', () => {
    const props = externalLinkProps('https://example.com')
    expect(props.rel).toBe('noopener noreferrer')
    expect(props.target).toBe('_blank')
    expect(props.href).toBe('https://example.com/')
  })

  it('falls back to a non-clickable href when the URL is unsafe', () => {
    expect(externalLinkProps('javascript:alert(1)').href).toBe('#')
    expect(externalLinkProps('javascript:alert(1)', { fallback: '/x' }).href).toBe('/x')
  })
})
