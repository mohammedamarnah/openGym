// Renders the Node[] tree from lib/rich-text.js as React elements: only the tags the parser
// allows exist, and a link is only a link when the parser accepted its http(s) href.
import { Fragment } from 'react'

function render(nodes, keyPrefix = '') {
  return nodes.map((n, i) => {
    const key = keyPrefix + i
    if (typeof n === 'string') return <Fragment key={key}>{n}</Fragment>
    if (n.tag === 'br') return <br key={key} />
    const children = render(n.children, key + '.')
    if (n.tag === 'a') return n.href
      ? <a key={key} href={n.href} target="_blank" rel="noopener noreferrer">{children}</a>
      : <Fragment key={key}>{children}</Fragment>
    const Tag = n.tag
    return <Tag key={key}>{children}</Tag>
  })
}

export default function RichText({ nodes, className = '' }) {
  return <div className={('rich-text ' + className).trim()}>{render(nodes)}</div>
}
