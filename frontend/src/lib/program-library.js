// The program library: published programs (scripts/boostcamp/fetch.mjs writes programs/ at the
// repository root, the web image serves it at /programs/) turned into routines and a programme.
//
//   Program   = { id, title, author, desc, url, variations: Variation[], ... }
//   Variation = { name, days: string[], weekdays?: number[], weeks: (Workout | null)[][] }
//   Workout   = { note?, ex: (Exercise | { ss: Exercise[] })[] }
//   Exercise  = { n, sets: Set[], note?, rest? }
//   Set       = { r?, lo?, hi?, amrap?, max?, sec?, secHi?, rpe?, rpeHi?, pct?, pctHi?, x? }
//
// Every week of the program becomes a programme week with its own exercise list for each
// routine (Week.r, lib/programmes.js), so week 4's 3 × 3 is trained as 3 × 3. Week 1's lists
// are the routines themselves.
import { uid } from './format.js'
import { EXIDX } from './exercises.js'
import { matchExercise, exerciseCandidates, bpFromName } from './import-csv.js'
import { eqAvailable } from './equipment.js'
import { substituteFor } from './starter.js'
import { PYRAMID_MAX, MAX_PYRAMID_SETS } from './pyramid.js'
import { cleanPct, cleanRpe, normalizeProgramme, MAX_WEEKS } from './programmes.js'

const SPREAD = {
  1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
}

/** The weekdays (getDay()) a variation trains on: its own when it has them, else spread over the week. */
export const defaultWeekdays = v => (v.weekdays?.length === v.days.length ? v.weekdays.slice() : (SPREAD[v.days.length] || []).slice())

const expand = sets => sets.flatMap(s => { const { x = 1, ...one } = s; return Array(x).fill(one) })
const same = list => list.every(v => v === list[0])
const repsOf = s => (s.amrap || s.max ? PYRAMID_MAX : s.r ?? s.hi ?? s.lo ?? null)

/** One program exercise as a routine slot: the sets, reps (or range, pyramid, hold) and %1RM or RPE. */
export function slotOf(id, ex) {
  const sets = expand(ex.sets || [])
  const n = Math.max(1, sets.length)
  const out = { id, sets: n }
  const rpes = sets.map(s => cleanRpe(s.rpeHi ?? s.rpe)).filter(v => v != null)
  const pcts = sets.map(s => cleanPct(s.pct))
  const wk = {}
  if (rpes.length) wk.rpe = Math.max(...rpes)
  if (rpes.length === n && !same(rpes)) wk.rpes = rpes
  if (sets.length && sets.every(s => s.sec > 0)) {
    out.mode = 'time'
    out.sec = Math.max(...sets.map(s => s.sec))
  } else if (sets.length) {
    const reps = sets.map(repsOf)
    const ranged = sets.every(s => s.lo > 0 && s.hi > s.lo && !s.r)
    const varyPct = pcts.some(p => p != null) && !same(pcts)
    const varyLoad = varyPct || (rpes.length === n && !same(rpes))
    if (ranged && same(sets.map(s => s.lo)) && same(sets.map(s => s.hi)) && !varyLoad) {
      out.reps = sets[0].hi
      out.repsMin = sets[0].lo
    } else if (same(reps) && reps[0] !== PYRAMID_MAX && !varyLoad) {
      out.reps = reps[0] ?? 10
    } else if (n > 1 && same(reps.slice(0, -1)) && reps[n - 1] === PYRAMID_MAX && reps[0] !== PYRAMID_MAX && !varyLoad) {
      out.reps = reps[0] ?? 10
      out.lastToFailure = true
    } else if (n <= MAX_PYRAMID_SETS) {
      out.pyramid = reps.map(r => r ?? 10)
      if (varyPct && pcts.every(p => p != null)) wk.pcts = pcts
    } else {
      out.reps = reps.find(r => typeof r === 'number') ?? 10
    }
  }
  if (!wk.pcts && pcts[0] != null && same(pcts)) wk.pct = pcts[0]
  else if (!wk.pcts && pcts.some(p => p != null)) wk.pct = Math.max(...pcts.filter(p => p != null))
  if (Object.keys(wk).length) out.wk = wk
  if (ex.note) out.note = ex.note
  if (ex.rest > 0) out.restSec = ex.rest
  return out
}

const exercisesOf = workout => (workout?.ex || []).flatMap(e => (e.ss ? e.ss : [e]))

/** Every exercise name a variation uses, once, in the order they first appear. */
export function programExerciseNames(v) {
  const names = []
  for (const week of v.weeks) for (const day of week) for (const e of exercisesOf(day)) if (!names.includes(e.n)) names.push(e.n)
  return names
}

const ALIASES = {
  'chest supported row (machine)': '1350', 'tricep rope push down (cable)': '0200', 'seated hamstring curl': '0599',
  'reverse pec deck': '0602', 'skull crusher (barbell)': '0060', 'skull crusher (dumbbell)': '0351',
  'calf raise (leg press)': '1391', 'abs crunch (machine)': '1452', 'v-handle tricep pushdown (cable)': '0241',
  'rear delt fly (cable)': '0225', 'single arm tricep extension (cable)': '0231', 'ab wheel': '0857',
  "farmer's walk (weighted)": '2133', 'seated overhead press (dumbbell)': '0405', 'abs crunch (weighted)': '0832',
  'abs crunch (bodyweight)': '0274', 'reverse bicep curl (ez bar)': '0451', 'reverse bicep curl (dumbbell)': '0429',
  'standing pullover (cable)': '0238', 'tricep kickback': '0333', 'alternating dumbbell curl': '0285',
  'underhand lat pulldown': '0673', 'neck curl': '10780', 'reverse abs crunch (bodyweight)': '0872',
  'standing shoulder press (dumbbell)': '0426', 'overhead tricep extension (dumbbell)': '0430',
  'overhead extension (dumbbell)': '0430', 'pec fly (dumbbell)': '0308', 'single arm overhead tricep extension': '4343',
  'single arm iso row': '1313', 'single arm pushdown': '1723', 'pendulum squat': '4951',
  'standing behind neck shoulder press (barbell)': '0788', 'lying tricep extension (barbell)': '0061',
  'pull-up (neutral grip, bodyweight)': '0651', 'straight leg calf raise': '3018', 'deficit push up': '0662',
  'dumbbell bench pullover': '0375', 'incline tricep extension (dumbbell)': '0330', "knee raise (captain's chair)": '9819',
  'reverse lunge (barbell)': '0078', 'med ball slam': '1354', 'seated military press (smith machine)': '0765',
  'stair climber': '2311', 'hack squat': '0743', 'good morning': '0044', 'wrist curls': '0126',
  'stiff leg deadlift': '1543', 'concentration curl': '0297', 'back extension': '0489', 'back extension (weighted)': '5035',
  'chin-up (bodyweight)': '1326', 'dip (bodyweight)': '0251', 'chest fly (cable)': '0227', 'calf raise (machine)': '0605',
  'walk': '2258', 'single arm rear delt fly (cable)': '4122', 'reverse lunge (dumbbell)': '0381',
}

const UNWANTED = /\b(band|resistance|smith|assisted|bosu|stability ball|stretch|v\. \d)\b/

/**
 * The catalogue exercise a program's name most likely means: a curated alias, the importer's
 * strict match, else the closest candidate, a plain version before a band, Smith or assisted one
 * the name does not ask for. A close guess is worth more here than a new custom exercise: the
 * program page shows it, and a tap swaps it.
 */
export function programExerciseId(name) {
  const key = name.trim().toLowerCase()
  if (ALIASES[key] && EXIDX[ALIASES[key]]) return ALIASES[key]
  const plain = name.replace(/\((bodyweight|weighted|paused|machine)\)/ig, '').trim()
  for (const n of plain && plain !== name ? [name, plain] : [name]) {
    const id = matchExercise(n)
    if (id) return id
    const c = exerciseCandidates(n, 20)
    if (c.id) return c.id
    if (c.kind === 'none' || !c.candidates.length) continue
    const asked = UNWANTED.test(n.toLowerCase())
    return (asked ? c.candidates : [...c.candidates].sort((a, b) =>
      UNWANTED.test(EXIDX[a]?.n || '') - UNWANTED.test(EXIDX[b]?.n || '')))[0]
  }
  return null
}

/**
 * Each name of `names` to the exercise it is trained as: a swap you chose, else your custom
 * exercise of that name, else the catalogue's match, else null (it becomes a custom exercise).
 * With `equipment`, a catalogue exercise you can't do is swapped for its closest stand-in.
 */
export function resolveNames(names, { swaps = {}, customEx = [], equipment = null } = {}) {
  const out = {}
  const taken = new Set()
  for (const name of names) {
    if (swaps[name]) { out[name] = { id: swaps[name], how: 'swap' }; continue }
    const mine = customEx.find(c => (c.n || '').toLowerCase() === name.toLowerCase())
    if (mine) { out[name] = { id: mine.id, how: 'custom' }; continue }
    const id = programExerciseId(name)
    if (!id) { out[name] = { id: null, how: 'new' }; continue }
    const ex = EXIDX[id]
    if (equipment && ex && !eqAvailable(equipment, ex)) {
      const sub = substituteFor(ex, equipment, taken)
      if (sub) { taken.add(sub.id); out[name] = { id: sub.id, how: 'fit', from: id }; continue }
    }
    taken.add(id)
    out[name] = { id, how: 'match' }
  }
  return out
}

const routineName = (title, day) => `${title}: ${day}`.slice(0, 80)

function dayItems(workout, idOf) {
  const items = []
  ;(workout?.ex || []).forEach((e, i) => {
    const group = e.ss ? e.ss : [e]
    const sg = e.ss && group.length > 1 ? `ss${i}` : null
    for (const one of group) items.push({ ...slotOf(idOf(one.n), one), ...(sg ? { sg } : {}) })
  })
  return items
}

const asRoutineSlot = ({ wk, ...slot }) => ({ ...slot, weight: 0 })

/**
 * The routines, custom exercises and programme for variation `variation` of `program`, trained
 * on `weekdays` (one getDay() per day of the variation; a variation of more than seven days runs
 * as a loop). `resolved` comes from resolveNames. Nothing is saved.
 */
export function buildLibraryPlan(program, { variation = 0, weekdays, resolved = {} } = {}) {
  const v = program.variations[variation]
  if (!v) return null
  const customEx = []
  const ids = {}
  const idOf = name => {
    if (ids[name]) return ids[name]
    const known = resolved[name]?.id
    if (known) return (ids[name] = known)
    const c = { id: uid(), n: name, bp: bpFromName(name) || 'upper legs', eq: '', custom: true }
    customEx.push(c)
    return (ids[name] = c.id)
  }
  const weeks = v.weeks.slice(0, MAX_WEEKS)
  const byDay = v.days.map((day, d) => {
    const first = weeks.find(week => week[d])?.[d]
    const ex = dayItems(first, idOf).map(asRoutineSlot)
    return ex.length ? { id: uid(), name: routineName(program.title, day), emoji: 'barbell', ex } : null
  })
  const routines = byDay.filter(Boolean)
  const dayRoutine = d => byDay[d]
  const programmeWeeks = weeks.map(week => {
    const r = {}
    week.forEach((workout, d) => {
      const routine = dayRoutine(d)
      if (workout && routine) r[routine.id] = dayItems(workout, idOf)
    })
    return Object.keys(r).length ? { r } : {}
  })
  const days = weekdays || defaultWeekdays(v)
  const schedule = v.days.length <= 7 && days.length === v.days.length
    ? { days: Object.fromEntries(days.map((wd, d) => [wd, dayRoutine(d)?.id]).filter(([, id]) => id).map(([wd, id]) => [wd, [id]])) }
    : { sequence: routines.map(r => r.id) }
  const programme = normalizeProgramme({
    id: uid(), at: Date.now(), name: program.title.slice(0, 80), weeks: programmeWeeks, ...schedule,
    src: `library:${program.id}`,
  })
  return { routines, customEx, programme }
}

const LEVELS = { Beginner: ['Beginner', 'Novice'], Intermediate: ['Intermediate'], Advanced: ['Advanced'] }
export const LIBRARY_LEVELS = Object.keys(LEVELS)
export const LIBRARY_LENGTHS = { short: [0, 45], medium: [46, 75], long: [76, Infinity] }

/**
 * The index rows that pass filter `f` ({ q, days, level, goal, equipment, length, src, sort }),
 * sorted most popular first, or best rated first with sort 'rating' (rated by at least 5 people).
 */
export function filterPrograms(rows, f = {}) {
  const q = (f.q || '').trim().toLowerCase()
  const out = rows.filter(p =>
    (!q || p.title.toLowerCase().includes(q) || (p.author || '').toLowerCase().includes(q)) &&
    (!f.days || p.days.some(d => (f.days >= 6 ? d >= 6 : d === f.days))) &&
    (!f.level || p.level.some(l => LEVELS[f.level].includes(l))) &&
    (!f.goal || p.goals.includes(f.goal)) &&
    (!f.equipment || p.equipment.includes(f.equipment)) &&
    (!f.length || (p.minutes >= LIBRARY_LENGTHS[f.length][0] && p.minutes <= LIBRARY_LENGTHS[f.length][1])) &&
    (!f.src || p.src === f.src))
  if (f.sort === 'rating') {
    const score = p => (p.rateCount >= 5 ? p.rate : 0)
    return out.sort((a, b) => score(b) - score(a) || b.rateCount - a.rateCount)
  }
  return out.sort((a, b) => b.joins - a.joins)
}

/** The values of `key` across the index, most common first: the goal and equipment chips. */
export function libraryValues(rows, key) {
  const n = new Map()
  for (const p of rows) for (const v of p[key] || []) n.set(v, (n.get(v) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
}

const range = (a, b, unit = '') => (b != null && b !== a ? `${a}–${b}${unit}` : `${a}${unit}`)
const secText = s => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`)

/** "3 × 5 @ 75%, 1 × AMRAP @ 85%" or "3 × 8–12 RPE 8": a program exercise's sets in one line. */
export function setsText(sets) {
  return (sets || []).map(s => {
    const reps = s.amrap || s.max ? 'AMRAP' : s.sec ? (s.secHi ? `${secText(s.sec)}–${secText(s.secHi)}` : secText(s.sec))
      : s.lo ? range(s.lo, s.hi) : s.r ?? '?'
    const effort = s.pct != null ? ` @ ${range(s.pct, s.pctHi, '%')}` : s.rpe != null ? ` RPE ${range(s.rpe, s.rpeHi)}` : ''
    return `${s.x || 1} × ${reps}${effort}`
  }).join(', ')
}
