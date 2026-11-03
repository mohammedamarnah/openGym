const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const pair = v => (Array.isArray(v) ? [num(v[0]), num(v[1])] : [num(v), null])
const text = v => (typeof v === 'string' ? v.trim() : '')

const SECONDS = { seconds: 1, minutes: 60, hours: 3600 }

export function compactSet(s, timeUnit) {
  const out = {}
  const type = s.target_type
  const toSec = v => (v == null ? null : Math.round(v * (SECONDS[s.target_unit || timeUnit] || 1)))
  if (type === 'reps') out.r = num(s.target)
  else if (type === 'reps_range') { out.lo = num(s.target_min); out.hi = num(s.target_max) }
  else if (type === 'AMRAP') out.amrap = 1
  else if (type === 'reps_max') { out.max = 1; if (num(s.target)) out.r = num(s.target) }
  else if (type === 'time') out.sec = toSec(num(s.target))
  else if (type === 'time_range') { out.sec = toSec(num(s.target_min)); out.secHi = toSec(num(s.target_max)) }
  const [a, b] = pair(s.intensity)
  if (a != null) {
    if (s.intensity_unit === '%') { out.pct = a; if (b != null && b !== a) out.pctHi = b }
    else { out.rpe = a; if (b != null && b !== a) out.rpeHi = b }
  }
  for (const k of Object.keys(out)) if (out[k] == null) delete out[k]
  return out
}

const sameSet = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function compactSets(sets, timeUnit) {
  const out = []
  for (const s of Array.isArray(sets) ? sets : []) {
    const c = compactSet(s || {}, timeUnit)
    const last = out[out.length - 1]
    const { x, ...lastBody } = last || {}
    if (last && sameSet(lastBody, c)) last.x = (x || 1) + 1
    else out.push(c)
  }
  return out
}

function compactExercise(e) {
  if (Array.isArray(e?.supersets)) {
    const ss = e.supersets.map(compactExercise).filter(Boolean)
    return ss.length ? { ss } : null
  }
  const n = text(e?.name)
  if (!n) return null
  const out = { n, sets: compactSets(e.sets, e.time_unit) }
  const note = text(e.notes)
  if (note) out.note = note
  if (num(e.rest_timer) > 0) out.rest = num(e.rest_timer)
  return out
}

function compactWorkout(w) {
  const ex = (w?.exercises || []).map(compactExercise).filter(Boolean)
  if (!ex.length) return null
  const out = { ex }
  const name = text(w.name) || text(w.subTitle)
  if (name) out.name = name
  const note = Array.isArray(w.dayNotes) ? w.dayNotes.map(text).filter(Boolean).join('\n') : text(w.dayNotes)
  if (note) out.note = note
  return out
}

function compactVariation(v) {
  const workouts = Array.isArray(v?.workouts) ? v.workouts : []
  const weekCount = Math.max(Array.isArray(v?.weeks) ? v.weeks.length : 0, ...workouts.map(w => (num(w.week) ?? -1) + 1))
  const dayCount = Math.max(0, ...workouts.map(w => (num(w.day) ?? -1) + 1))
  if (!weekCount || !dayCount) return null
  const weeks = Array.from({ length: weekCount }, () => Array(dayCount).fill(null))
  const dayNames = Array(dayCount).fill('')
  for (const w of workouts) {
    const wk = num(w.week), d = num(w.day)
    if (wk == null || d == null || w.isRestDay) continue
    const c = compactWorkout(w)
    if (!c) continue
    weeks[wk][d] = c
    if (!dayNames[d] && c.name) dayNames[d] = c.name
    delete c.name
  }
  if (!weeks.some(week => week.some(Boolean))) return null
  const out = { name: text(v.name) || 'Default', days: dayNames.map((n, i) => n || `Day ${i + 1}`), weeks }
  const weekdays = (Array.isArray(v.weekdays) ? v.weekdays : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
  if (weekdays.length === dayCount) out.weekdays = weekdays
  return out
}

const list = v => (Array.isArray(v) ? v.map(text).filter(Boolean) : text(v) ? [text(v)] : [])

function finish(base, rawVariations) {
  const variations = rawVariations.map(compactVariation).filter(Boolean)
  if (!variations.length) return null
  const days = variations.map(v => v.weeks[0].filter(Boolean).length || v.days.length)
  const program = { ...base, variations }
  const index = {
    id: base.id, src: base.src, title: base.title, author: base.author,
    level: base.level, goals: base.goals, equipment: base.equipment,
    minutes: base.minutes, joins: base.joins, rate: base.rate, rateCount: base.rateCount,
    days: [...new Set(days)].sort((a, b) => a - b),
    weeks: Math.max(...variations.map(v => v.weeks.length)),
  }
  return { program, index }
}

export function compactCommunity(r) {
  const id = String(r.id || '').replace(/^user-/, '')
  if (!id || r.status !== 'published') return null
  return finish({
    id: 'u-' + id, src: 'community',
    title: text(r.title), author: text(r.name),
    url: r.slug ? `https://www.boostcamp.app/users/${r.slug}` : '',
    desc: text(r.description),
    level: list(r.difficulties), goals: list(r.goals), equipment: list(r.equipments),
    minutes: num(r.time_per_workout) || 0,
    joins: num(r.join_count) || 0, rate: num(r.rate) || 0, rateCount: num(r.rate_count) || 0,
    updated: text(r.updated_at),
  }, r.variations || [])
}

export function compactCoach(p) {
  if (!p?.slug || !p.instructor_slug) return null
  return finish({
    id: `c-${p.instructor_slug}--${p.slug}`, src: 'coach',
    title: text(p.title), author: text(p.instructor_name),
    url: `https://www.boostcamp.app/coaches/${p.instructor_slug}/${p.slug}`,
    desc: text(p.description) || text(p.short_description),
    level: list(p.difficulties), goals: list(p.goals), equipment: list(p.equipments),
    minutes: num(p.workout_duration) || 0,
    joins: num(p.count_people_done) || 0, rate: num(p.rate) || 0, rateCount: num(p.rate_count) || 0,
    updated: text(p.updated_at),
  }, p.variations?.length ? p.variations : [{ name: 'Default', weeks: p.weeks, weekdays: p.weekdays, workouts: (p.weeks || []).flatMap(w => w.workouts || []) }])
}
