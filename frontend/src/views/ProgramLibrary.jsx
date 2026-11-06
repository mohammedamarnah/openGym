// Plan → Programs tab (and Plan → Programmes → Browse programs): published programs (lib/program-library.js) to browse,
// fit to your equipment, swap exercises in, and add as routines and a programme.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { DAYS, exerciseNameText, fmtNum, weekOrder, weekStartOf } from '../lib/format.js'
import { exOr } from '../lib/exercises.js'
import { profileEquipment } from '../lib/equipment.js'
import { saveProgramme } from '../lib/programmes.js'
import {
  filterPrograms, libraryValues, setsText, programExerciseNames, resolveNames, buildLibraryPlan, defaultWeekdays,
  LIBRARY_LEVELS,
} from '../lib/program-library.js'
import { exercisePicker } from '../sheets.jsx'
import { looksLikeHtml, parseRichText, richTextLength } from '../lib/rich-text.js'
import Icon from '../components/Icon.jsx'
import RichText from '../components/RichText.jsx'
import { Button, SearchField, Section } from '../components/ui.jsx'

let indexLoad = null
const loadIndex = () => (indexLoad ??= fetch('programs/index.json').then(r => {
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}).catch(err => { indexLoad = null; throw err }))
const loadProgram = id => fetch(`programs/p/${encodeURIComponent(id)}.json`).then(r => {
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
})

const PAGE = 40
const DAY_CHOICES = [1, 2, 3, 4, 5, 6]

function Chips({ label, value, options, onChange }) {
  return <div className="chips lib-chips" style={{ margin: '0 0 8px' }}>
    <div className="small dim" style={{ width: '100%' }}>{label}</div>
    <button className={'chip nocap' + (value == null ? ' on' : '')} onClick={() => onChange(null)}>{t('Any')}</button>
    {options.map(([v, text]) => <button key={v} className={'chip nocap' + (value === v ? ' on' : '')}
      onClick={() => onChange(value === v ? null : v)}>{text}</button>)}
  </div>
}

function Header({ title, sub, back, nav }) {
  return <div className="hdr">
    <button className="iconbtn" data-back={back} onClick={() => nav(back)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, margin: '0 12px', minWidth: 0 }}><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
  </div>
}

const daysText = days => (days.length > 1 ? `${days[0]}–${days[days.length - 1]}` : String(days[0] ?? '?'))

function programLine(p) {
  return [
    p.author,
    t('{0} days a week', daysText(p.days)),
    tn('{0} week', '{0} weeks', p.weeks),
    p.level.join(', '),
    p.rateCount >= 5 ? `★ ${p.rate.toFixed(1)}` : '',
    p.joins ? t('{0} joined', fmtNum(p.joins)) : '',
  ].filter(Boolean).join(' · ')
}

export default function ProgramLibrary() {
  const nav = useNavigate()
  return <div className="narrow">
    <Header title={t('Program library')} back="/plan/programmes" nav={nav} />
    <ProgramBrowser />
  </div>
}

/** The library list with its filters, no page header: Plan's Programs tab shows it in place. */
export function ProgramBrowser() {
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const [f, setF] = useState({ sort: 'popular' })
  const [shown, setShown] = useState(PAGE)
  const [more, setMore] = useState(false)
  useEffect(() => { loadIndex().then(d => setRows(d.programs), () => setError(true)) }, [])
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setShown(PAGE) }
  const list = useMemo(() => (rows ? filterPrograms(rows, f) : []), [rows, f])
  const goals = useMemo(() => (rows ? libraryValues(rows, 'goals').slice(0, 8) : []), [rows])
  const equipment = useMemo(() => (rows ? libraryValues(rows, 'equipment').slice(0, 6) : []), [rows])

  return <div className="plan-programs">
    {rows && <div className="small dim" style={{ margin: '0 2px 8px' }}>{t('Programs: {0}', fmtNum(rows.length))}</div>}
    {error && <div className="empty">{t('The program library is not on this server. Run scripts/boostcamp/fetch.mjs and rebuild.')}</div>}
    {!rows && !error && <div className="empty">{t('Loading…')}</div>}
    {rows && <>
      <div style={{ marginBottom: 10 }}>
        <SearchField value={f.q || ''} placeholder={t('Search programs or authors')}
          onChange={e => set('q', e.target.value)} onClear={() => set('q', '')} />
      </div>
      <Chips label={t('Days a week')} value={f.days ?? null} onChange={v => set('days', v)}
        options={DAY_CHOICES.map(d => [d, d === 6 ? '6+' : String(d)])} />
      <Chips label={t('Level')} value={f.level ?? null} onChange={v => set('level', v)}
        options={LIBRARY_LEVELS.map(l => [l, t(l)])} />
      {more ? <>
        <Chips label={t('Goal')} value={f.goal ?? null} onChange={v => set('goal', v)} options={goals.map(g => [g, g])} />
        <Chips label={t('Equipment')} value={f.equipment ?? null} onChange={v => set('equipment', v)} options={equipment.map(e => [e, e])} />
        <Chips label={t('Session length')} value={f.length ?? null} onChange={v => set('length', v)}
          options={[['short', t('Up to 45 min')], ['medium', t('45 to 75 min')], ['long', t('Over 75 min')]]} />
        <Chips label={t('Made by')} value={f.src ?? null} onChange={v => set('src', v)}
          options={[['coach', t('Coaches')], ['community', t('Community')]]} />
      </> : <Button size="sm" variant="plain" onClick={() => setMore(true)}>{t('More filters')}</Button>}
      <div className="row between" style={{ margin: '8px 2px' }}>
        <span className="small dim">{t('Matches: {0}', fmtNum(list.length))}</span>
        <span className="chips" style={{ margin: 0 }}>
          <button className={'chip nocap' + (f.sort !== 'rating' ? ' on' : '')} onClick={() => set('sort', 'popular')}>{t('Popular')}</button>
          <button className={'chip nocap' + (f.sort === 'rating' ? ' on' : '')} onClick={() => set('sort', 'rating')}>{t('Top rated')}</button>
        </span>
      </div>
      <div className="sect-b">
        {list.slice(0, shown).map(p => <button key={p.id} className="lrow tap" onClick={() => nav('/plan/library/' + encodeURIComponent(p.id))}>
          <span className="lrow-i"><Icon name={p.src === 'coach' ? 'star' : 'clipboard'} /></span>
          <span className="lrow-m"><span className="lrow-t">{p.title}</span><span className="lrow-s">{programLine(p)}</span></span>
          <Icon name="chevronRight" className="lrow-c" />
        </button>)}
        {!list.length && <div className="empty">{t('No program matches. Try fewer filters.')}</div>}
      </div>
      {list.length > shown && <Button style={{ marginTop: 8 }} onClick={() => setShown(n => n + PAGE)}>{t('Show more')}</Button>}
    </>}
  </div>
}

const SWAP_TAG = { fit: () => t('fitted'), swap: () => t('swapped'), new: () => t('new exercise'), custom: () => t('yours') }

function ExerciseRows({ names, resolved, onSwap, onReset }) {
  return <>
    {names.map(name => {
      const r = resolved[name]
      const shownName = r?.id ? exerciseNameText(exOr(r.id)) : name
      const tag = SWAP_TAG[r?.how]?.()
      return <div key={name} className="lrow">
        <span className="lrow-m">
          <span className="lrow-t">{shownName}{tag && <span className={'tag' + (r.how === 'new' ? '' : ' acc')} style={{ marginLeft: 6 }}>{tag}</span>}</span>
          {shownName.toLowerCase() !== name.toLowerCase() && <span className="lrow-s">{t('Program: {0}', name)}</span>}
        </span>
        {r?.how === 'swap' && <Button size="sm" variant="plain" onClick={() => onReset(name)}>{t('Undo')}</Button>}
        <Button size="sm" variant="tinted" onClick={() => onSwap(name, r?.id)}>{t('Swap')}</Button>
      </div>
    })}
  </>
}

function WeekPreview({ variation, week, idName }) {
  const days = variation.weeks[week] || []
  return <>{variation.days.map((day, d) => {
    const w = days[d]
    return <Section key={d} title={day}>
      {!w ? <div className="lrow"><span className="lrow-m"><span className="lrow-s">{t('Rest or not planned this week')}</span></span></div>
        : w.ex.map((e, i) => (e.ss ? e.ss : [e]).map((one, j) => <div key={`${i}.${j}`} className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">{e.ss ? `${String.fromCharCode(65 + i % 26)}${j + 1}. ` : ''}{idName(one.n)}</span>
            <span className="lrow-s">{setsText(one.sets)}{one.rest ? ' · ' + t('rest {0} s', one.rest) : ''}</span>
            {one.note && <span className="lrow-s dim">{one.note}</span>}
          </span>
        </div>))}
    </Section>
  })}</>
}

export function ProgramDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [program, setProgram] = useState(null)
  const [error, setError] = useState(false)
  const [variation, setVariation] = useState(0)
  const [week, setWeek] = useState(0)
  const [fitId, setFitId] = useState('')
  const [swaps, setSwaps] = useState({})
  const [weekdays, setWeekdays] = useState(null)
  const [fullDesc, setFullDesc] = useState(false)
  useEffect(() => { loadProgram(id).then(setProgram, () => setError(true)) }, [id])

  const v = program?.variations[variation]
  const names = useMemo(() => (v ? programExerciseNames(v) : []), [v])
  const profiles = S.equipProfiles || []
  const fit = profiles.find(p => p.id === fitId) || null
  const resolved = useMemo(() => resolveNames(names, {
    swaps, customEx: S.customEx || [], equipment: fit ? profileEquipment(fit) : null,
  }), [names, swaps, S.customEx, fit])
  const days = weekdays || (v ? defaultWeekdays(v) : [])
  const order = weekOrder(weekStartOf(S))

  if (error) return <div className="narrow"><Header title={t('Program')} back="/plan" nav={nav} />
    <div className="empty">{t('This program could not be loaded.')}</div></div>
  if (!program || !v) return <div className="narrow"><Header title={t('Program')} back="/plan" nav={nav} />
    <div className="empty">{t('Loading…')}</div></div>

  const idName = name => (resolved[name]?.id ? exerciseNameText(exOr(resolved[name].id)) : name)
  const swap = (name, current) => {
    const picker = exercisePicker(ex => { picker.close(); setSwaps(s => ({ ...s, [name]: ex.id })) },
      { title: t('Swap {0}', name), like: current || undefined })
  }
  const unswap = name => setSwaps(s => { const { [name]: _, ...rest } = s; return rest })
  const pickVariation = i => { setVariation(i); setWeek(0); setWeekdays(null) }
  const setDay = (d, wd) => setWeekdays(days.map((x, i) => (i === d ? wd : x)))
  const loop = v.days.length > 7
  const clash = new Set(days).size !== days.length

  const add = () => {
    const plan = buildLibraryPlan(program, { variation, weekdays: loop ? null : days, resolved })
    if (!plan) return
    update(s => {
      s.customEx = [...(s.customEx || []), ...plan.customEx]
      s.routines = [...(s.routines || []), ...plan.routines]
      saveProgramme(s, plan.programme)
    })
    useUI.getState().toast(tn('Added with {0} new routine.', 'Added with {0} new routines.', plan.routines.length))
    nav('/plan/prog/' + plan.programme.id)
  }

  const desc = program.desc || ''
  const rich = looksLikeHtml(desc) ? parseRichText(desc) : null
  const descLen = rich ? richTextLength(rich) : desc.length
  return <div className="narrow">
    <Header title={program.title} sub={[program.author, program.src === 'coach' ? t('Coach program') : t('Community program')].filter(Boolean).join(' · ')} back="/plan" nav={nav} />
    {desc && <div className="card" style={{ marginBottom: 12 }}>
      {rich
        ? <RichText nodes={rich} className={'small' + (fullDesc || descLen < 400 ? '' : ' clipped')} />
        : <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{fullDesc || desc.length < 400 ? desc : desc.slice(0, 400) + '…'}</div>}
      {descLen >= 400 && <Button size="sm" variant="plain" onClick={() => setFullDesc(x => !x)}>{fullDesc ? t('Show less') : t('Show more')}</Button>}
      {program.url && <div className="small dim" style={{ marginTop: 6 }}><a href={program.url} target="_blank" rel="noreferrer">{t('Open on Boostcamp')}</a></div>}
    </div>}

    {program.variations.length > 1 && <Chips label={t('Version')} value={variation} onChange={i => pickVariation(i ?? 0)}
      options={program.variations.map((x, i) => [i, x.name])} />}

    <Section title={t('Exercises')} footer={t('A swap applies to every week of the program.')}>
      {profiles.length > 0 && <div className="chips" style={{ margin: '8px 12px' }}>
        <div className="small dim" style={{ width: '100%' }}>{t('Fit to my equipment')}</div>
        <button className={'chip nocap' + (!fit ? ' on' : '')} onClick={() => setFitId('')}>{t('As written')}</button>
        {profiles.map(p => <button key={p.id} className={'chip nocap' + (fit?.id === p.id ? ' on' : '')} onClick={() => setFitId(p.id)}>{p.name}</button>)}
      </div>}
      <ExerciseRows names={names} resolved={resolved} onSwap={swap} onReset={unswap} />
    </Section>

    <Section title={t('Schedule')} footer={loop ? t('More than seven days: the days run as a loop.') : clash ? t('Two days are on the same weekday.') : null}>
      {!loop && v.days.map((day, d) => <div key={d} className="lrow" style={{ flexWrap: 'wrap' }}>
        <span className="lrow-m"><span className="lrow-t">{day}</span></span>
        <span className="chips" style={{ margin: 0 }}>
          {order.map(wd => <button key={wd} className={'chip' + (days[d] === wd ? ' on' : '')} onClick={() => setDay(d, wd)}>{t(DAYS[wd])}</button>)}
        </span>
      </div>)}
    </Section>

    <Section title={t('Weeks')}>
      <div className="chips" style={{ margin: '8px 12px' }}>
        {v.weeks.map((_, i) => <button key={i} className={'chip' + (week === i ? ' on' : '')} onClick={() => setWeek(i)}>{i + 1}</button>)}
      </div>
    </Section>
    <WeekPreview variation={v} week={week} idName={idName} />

    <Button variant="primary" icon="plus" style={{ margin: '14px 0 24px' }} disabled={clash && !loop} onClick={add}>{t('Add as programme')}</Button>
  </div>
}
