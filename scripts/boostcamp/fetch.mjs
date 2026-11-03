#!/usr/bin/env node
// Downloads the public Boostcamp program library into programs/ (index.json + p/<id>.json).
//
//   node scripts/boostcamp/fetch.mjs              download what is not cached yet, then write
//   node scripts/boostcamp/fetch.mjs --offline    rewrite programs/ from the cache only
//   node scripts/boostcamp/fetch.mjs --refresh    ignore the cache and download everything again
//
// Sources (found in the www.boostcamp.app page code):
//   community programs  POST https://newapi.boostcamp.app/api/www/user_programs/list
//   coach programs      GET  https://www.boostcamp.app/_next/data/<buildId>/programs/all.json
//                       GET  https://www.boostcamp.app/_next/data/<buildId>/<coach>/<program>.json
// Paid coach programs are skipped. Raw responses are kept gzipped in .cache/boostcamp/.
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compactCommunity, compactCoach } from './compact.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE = join(ROOT, '.cache', 'boostcamp')
const OUT = join(ROOT, 'programs')
const API = 'https://newapi.boostcamp.app/api/www/'
const WWW = 'https://www.boostcamp.app'
const PAGE_SIZE = 100
const DELAY_MS = 400
const HEADERS = { 'User-Agent': 'openGym program importer', Origin: WWW, Referer: WWW + '/' }

const offline = process.argv.includes('--offline')
const refresh = process.argv.includes('--refresh')
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function request(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...HEADERS, ...init.headers } })
      if (res.ok) return res
      if (res.status < 500 && res.status !== 429) throw new Error(`${res.status} ${url}`)
      throw Object.assign(new Error(`${res.status} ${url}`), { retry: true })
    } catch (err) {
      if (attempt >= 5 || (err.message.match(/^\d{3} /) && !err.retry)) throw err
      await sleep(2000 * attempt)
    }
  }
}

async function cached(name, load) {
  const file = join(CACHE, name + '.json.gz')
  if (!refresh && existsSync(file)) return JSON.parse(gunzipSync(await readFile(file)))
  if (offline) return null
  const data = await load()
  await writeFile(file, gzipSync(JSON.stringify(data)))
  await sleep(DELAY_MS)
  return data
}

async function communityPage(page) {
  return cached(`community-${String(page).padStart(4, '0')}`, async () => {
    const res = await request(API + 'user_programs/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sorter: { field: 'join_count', order: 'desc' }, pagination: { current: page, pageSize: PAGE_SIZE } }),
    })
    return (await res.json()).data
  })
}

async function* communityPrograms() {
  const first = await communityPage(1)
  if (!first) return
  const pages = Math.ceil(first.pagination.total / PAGE_SIZE)
  for (let page = 1; page <= pages; page++) {
    const data = page === 1 ? first : await communityPage(page)
    if (!data) continue
    process.stdout.write(`\rcommunity page ${page}/${pages}`)
    yield* data.rows
  }
  process.stdout.write('\n')
}

async function buildId() {
  const res = await request(WWW + '/programs/all')
  const html = await res.text()
  const m = html.match(/"buildId":"([^"]+)"/)
  if (!m) throw new Error('No Next.js buildId on /programs/all')
  return m[1]
}

async function* coachPrograms() {
  let id = null
  const nextData = async path => {
    id ??= await buildId()
    return (await (await request(`${WWW}/_next/data/${id}/${path}.json`)).json()).pageProps
  }
  const list = await cached('coach-list', async () => (await nextData('programs/all')).programsData.rows)
  if (!list) return
  const free = list.filter(p => p.pricing?.type === 'free')
  let i = 0
  for (const p of free) {
    process.stdout.write(`\rcoach program ${++i}/${free.length}`)
    const detail = await cached(`coach-${p.instructor_slug}--${p.slug}`, async () =>
      (await nextData(`${p.instructor_slug}/${p.slug}`)).programData)
    if (detail?.has_view_right !== false) yield { ...detail, rate: detail?.rate ?? p.rate, rate_count: detail?.rate_count ?? p.rate_count }
  }
  process.stdout.write(`\n${list.length - free.length} paid coach programs skipped\n`)
}

async function main() {
  await mkdir(CACHE, { recursive: true })
  await mkdir(join(OUT, 'p'), { recursive: true })
  const index = new Map()
  let seen = 0, skipped = 0
  const keep = async c => {
    if (!c) { skipped++; return }
    if (index.has(c.index.id)) return
    index.set(c.index.id, c.index)
    await writeFile(join(OUT, 'p', c.index.id + '.json'), JSON.stringify(c.program))
  }
  for await (const p of coachPrograms()) { seen++; await keep(compactCoach(p)) }
  for await (const r of communityPrograms()) { seen++; await keep(compactCommunity(r)) }

  const ids = new Set(index.keys())
  for (const f of await readdir(join(OUT, 'p'))) if (!ids.has(f.replace(/\.json$/, ''))) await rm(join(OUT, 'p', f))
  const rows = [...index.values()].sort((a, b) => b.joins - a.joins || a.title.localeCompare(b.title))
  await writeFile(join(OUT, 'index.json'), JSON.stringify({ fetched: new Date().toISOString(), programs: rows }))
  console.log(`${rows.length} programs written (${seen} read, ${skipped} empty or unpublished, ${seen - skipped - rows.length} duplicates)`)
}

main().catch(err => { console.error(err); process.exit(1) })
