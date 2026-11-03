import { describe, it, expect } from 'vitest'
import { slotOf, resolveNames, buildLibraryPlan, programExerciseNames, programExerciseId } from './program-library.js'
import { EXIDX } from './exercises.js'

const BENCH = '0025'

const program = {
  id: 'u-1', title: 'Test Block',
  variations: [{
    name: 'Default', days: ['Upper', 'Lower'],
    weeks: [
      [{ ex: [{ n: 'Bench Press (Barbell)', sets: [{ r: 5, rpe: 8, x: 5 }] }] }, { ex: [{ n: 'Zorbian Hop', sets: [{ r: 10, x: 2 }] }] }],
      [{ ex: [{ n: 'Bench Press (Barbell)', sets: [{ r: 3, rpe: 9, x: 3 }] }] }, null],
    ],
  }],
}

describe('a program exercise as a routine slot', () => {
  it('reads changing percentages as a pyramid with a percentage per set', () => {
    const slot = slotOf(BENCH, { n: 'x', sets: [{ r: 5, pct: 65 }, { r: 5, pct: 75 }, { amrap: 1, pct: 85 }] })
    expect(slot).toEqual({ id: BENCH, sets: 3, pyramid: [5, 5, 'max'], wk: { pcts: [65, 75, 85] } })
  })

  it('keeps a rep range as a range', () => {
    expect(slotOf(BENCH, { n: 'x', sets: [{ lo: 8, hi: 12, rpe: 8, x: 3 }], rest: 90 }))
      .toEqual({ id: BENCH, sets: 3, reps: 12, repsMin: 8, wk: { rpe: 8 }, restSec: 90 })
  })
})

describe('building a program into routines and a programme', () => {
  it('gives each week its own sets and reps and puts the days on weekdays', () => {
    const v = program.variations[0]
    const plan = buildLibraryPlan(program, { resolved: resolveNames(programExerciseNames(v)) })
    const [upper, lower] = plan.routines
    expect(upper).toMatchObject({ name: 'Test Block: Upper', ex: [{ id: BENCH, sets: 5, reps: 5, weight: 0 }] })
    expect(plan.programme.days).toEqual({ 1: [upper.id], 4: [lower.id] })
    expect(plan.programme.weeks[1].r[upper.id]).toEqual([{ id: BENCH, sets: 3, reps: 3, wk: { rpe: 9 } }])
    expect(plan.programme.weeks[1].r[lower.id]).toBeUndefined()
  })

  it('adds a name the catalogue does not know as one custom exercise', () => {
    const plan = buildLibraryPlan(program, { resolved: resolveNames(['Bench Press (Barbell)', 'Zorbian Hop']) })
    expect(plan.customEx).toHaveLength(1)
    expect(plan.routines[1].ex[0].id).toBe(plan.customEx[0].id)
  })

  it('guesses a plain exercise before a band version the name does not ask for', () => {
    expect(EXIDX[programExerciseId('Wrist Curl')].n).not.toMatch(/band/)
  })

  it('swaps an exercise the equipment does not allow', () => {
    const got = resolveNames(['Bench Press (Barbell)'], { equipment: ['dumbbell', 'bench'] })['Bench Press (Barbell)']
    expect(got.how).toBe('fit')
    expect(EXIDX[got.id].eq).toBe('dumbbell')
  })
})
