// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, navs: [], picked: null, params: {} }
  state.snapshot = () => ({
    S: state.S,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => (selector ? selector(mocks.snapshot()) : mocks.snapshot())
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const api = { openSheet: () => {}, toast: () => {} }
  const useUI = sel => (sel ? sel(api) : api)
  useUI.getState = () => api
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => to => mocks.navs.push(to), useParams: () => mocks.params }))
vi.mock('../sheets.jsx', () => ({
  exercisePicker: onPick => { const picker = { close: () => {} }; queueMicrotask(() => onPick(mocks.picked)); return picker },
}))

const { ProgramDetail } = await import('./ProgramLibrary.jsx')

const PROGRAM = {
  id: 'u-1', title: 'Test Block', author: 'Someone', src: 'community', desc: 'Two days.',
  variations: [{
    name: 'Default', days: ['Upper', 'Lower'],
    weeks: [
      [{ ex: [{ n: 'Bench Press (Barbell)', sets: [{ r: 5, x: 5 }] }] }, { ex: [{ n: 'Squat (Barbell)', sets: [{ r: 5, x: 3 }] }] }],
      [{ ex: [{ n: 'Bench Press (Barbell)', sets: [{ r: 3, x: 3 }] }] }, { ex: [{ n: 'Squat (Barbell)', sets: [{ r: 3, x: 3 }] }] }],
    ],
  }],
}

let host, root
beforeEach(() => {
  mocks.S = { unit: 'kg', weekStart: 1, workouts: [], routines: [], customEx: [], programmes: {}, programme: null, week: {} }
  mocks.navs = []; mocks.params = { id: 'u-1' }; mocks.picked = { id: '0289' }
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => PROGRAM }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

describe('a program page', () => {
  it('adds the program with a swapped exercise in every week', async () => {
    act(() => root.render(<ProgramDetail />))
    await flush()
    act(() => button('Swap').click())
    await flush()
    act(() => button('Add as programme').click())
    const [p] = Object.values(mocks.S.programmes)
    const upper = mocks.S.routines.find(r => r.name === 'Test Block: Upper')
    expect(upper.ex[0].id).toBe('0289')
    expect(p.weeks[1].r[upper.id]).toEqual([{ id: '0289', sets: 3, reps: 3 }])
    expect(mocks.navs).toEqual(['/plan/prog/' + p.id])
  })
})
