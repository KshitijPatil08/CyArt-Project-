import xss from 'xss'

export function sanitizeHtml(input: string): string {
  if (!input) return ''
  return xss(input)
}

export function sanitizeText(input: string): string {
  if (!input) return ''
  // strip tags to plain text
  return xss(input, { whiteList: {} })
}
