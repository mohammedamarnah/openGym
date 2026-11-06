import { describe, expect, it } from 'vitest'
import { decodeEntities, looksLikeHtml, parseRichText, richTextLength } from './rich-text.js'

describe('rich-text', () => {
  it('tells HTML descriptions from plain ones', () => {
    expect(looksLikeHtml('<p>Hi</p>')).toBe(true)
    expect(looksLikeHtml('Squat 5x5, rest < 3 min')).toBe(false)
    expect(looksLikeHtml('')).toBe(false)
    expect(looksLikeHtml(null)).toBe(false)
  })

  it('decodes named and numeric entities', () => {
    expect(decodeEntities('A &amp; B&nbsp;&gt; &#39;x&#x27; &unknown;')).toBe('A & B > \'x\' &unknown;')
  })

  it('parses the coach-program subset into a tree', () => {
    const html = '<h2><strong>70s Powerlifter</strong></h2><ul><li><p>4 Days per week</p></li>\n<li><p>Upper/Lower</p></li></ul>'
      + '<p>Many <a href="https://example.com/a?x=1&amp;y=2" rel="noopener"><strong>compound</strong></a> lifts.</p>'
    expect(parseRichText(html)).toEqual([
      { tag: 'h2', children: [{ tag: 'strong', children: ['70s Powerlifter'] }] },
      { tag: 'ul', children: [
        { tag: 'li', children: [{ tag: 'p', children: ['4 Days per week'] }] },
        { tag: 'li', children: [{ tag: 'p', children: ['Upper/Lower'] }] },
      ] },
      { tag: 'p', children: ['Many ', { tag: 'a', href: 'https://example.com/a?x=1&y=2', children: [{ tag: 'strong', children: ['compound'] }] }, ' lifts.'] },
    ])
  })

  it('keeps the text of unknown tags, drops scripts, empties and unsafe links', () => {
    const html = '<p><span style="color:red">Red</span> <b>bold</b> <i>it</i></p><p></p><p><strong> </strong></p>'
      + '<script>alert(1)</script><p><a href="javascript:alert(1)">bad</a><img src=x onerror=y></p>'
    expect(parseRichText(html)).toEqual([
      { tag: 'p', children: ['Red', ' ', { tag: 'strong', children: ['bold'] }, ' ', { tag: 'em', children: ['it'] }] },
      { tag: 'p', children: [{ tag: 'a', href: null, children: ['bad'] }] },
    ])
  })

  it('keeps line breaks and survives unclosed or stray tags', () => {
    expect(parseRichText('<p>one<br>two<br/>three</p></li><p>open')).toEqual([
      { tag: 'p', children: ['one', { tag: 'br', children: [] }, 'two', { tag: 'br', children: [] }, 'three'] },
      { tag: 'p', children: ['open'] },
    ])
  })

  it('counts the visible text', () => {
    expect(richTextLength(parseRichText('<p>ab<strong>cd</strong></p><ul><li>e</li></ul>'))).toBe(5)
  })
})
