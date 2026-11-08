// Program descriptions (programs/p/*.json desc) are plain text for most programs and a small
// subset of HTML for the coach ones: <p>, <strong>, <a>, lists, headings, entities. This turns
// that HTML into a tree of a few allowed tags that React renders as elements, so nothing from
// the file ever reaches innerHTML. Any other tag is dropped and its text kept.
//
//   Node = string | { tag, href?, children: Node[] }

const BLOCK = new Set(['p', 'ul', 'ol', 'li', 'h2', 'h3', 'h4'])
const INLINE = new Set(['strong', 'em', 'a'])
const ALIAS = { b: 'strong', i: 'em', h1: 'h2', h5: 'h4', h6: 'h4', div: 'p' }
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr', 'source'])
const DROP = new Set(['script', 'style', 'iframe', 'object', 'template'])

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '\u2014', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

/** True when the text carries markup worth parsing (a known tag), not just a stray "<". */
export function looksLikeHtml(s) {
  return typeof s === 'string' && /<\/?(p|br|strong|b|em|i|a|ul|ol|li|h[1-6]|span|div)\b[^>]*>/i.test(s)
}

const safeHref = raw => {
  const href = decodeEntities(raw || '').trim()
  return /^https?:\/\//i.test(href) ? href : null
}

/** Parses the HTML subset into Node[]. Unclosed tags close at the end; stray closers are ignored. */
export function parseRichText(html) {
  const root = { tag: 'root', children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]
  let dropping = null
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+|<)/g
  let m
  while ((m = re.exec(html))) {
    const [, close, rawTag, attrs, text] = m
    if (dropping) {
      if (close && rawTag?.toLowerCase() === dropping) dropping = null
      continue
    }
    if (text != null) {
      const s = decodeEntities(text)
      if (s) top().children.push(s)
      continue
    }
    if (!rawTag) continue // a comment
    let tag = rawTag.toLowerCase()
    if (DROP.has(tag)) { if (!close && !/\/\s*$/.test(attrs)) dropping = tag; continue }
    if (tag === 'br') { if (!close) top().children.push({ tag: 'br', children: [] }); continue }
    if (VOID.has(tag)) continue
    tag = ALIAS[tag] || tag
    if (!BLOCK.has(tag) && !INLINE.has(tag)) continue // span, font...: keep the text only
    if (close) {
      const i = stack.findLastIndex((n, k) => k > 0 && n.tag === tag)
      if (i > 0) stack.length = i
      continue
    }
    const node = { tag, children: [] }
    if (tag === 'a') node.href = safeHref((attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])
      .slice(2).find(x => x != null))
    top().children.push(node)
    stack.push(node)
  }
  return tidy(root.children)
}

// Drops elements left empty (an empty <p></p> or <strong></strong>) and whitespace-only text
// between blocks, so the layout has no blank gaps.
function tidy(nodes, inList = false) {
  const out = []
  const isBlock = n => n && typeof n !== 'string' && BLOCK.has(n.tag)
  nodes.forEach((n, i) => {
    if (typeof n === 'string') {
      if (!n.trim() && (inList || isBlock(nodes[i - 1]) || isBlock(nodes[i + 1]))) return
      out.push(n)
      return
    }
    if (n.tag === 'br') { out.push(n); return }
    const children = tidy(n.children, n.tag === 'ul' || n.tag === 'ol')
    if (!children.some(c => typeof c !== 'string' || c.trim())) return
    out.push({ ...n, children })
  })
  return out
}

/** The visible text of a Node[] (for length checks and search). */
export function richTextLength(nodes) {
  let n = 0
  for (const x of nodes) n += typeof x === 'string' ? x.length : richTextLength(x.children)
  return n
}
