import { describe, it, expect } from 'vitest'
import {
  getPlanStart,
  isInRunwayPeriod,
  getRacePlanInfo,
  getPhase,
  getWorkoutForDateWithProfile,
} from '../../lib/training-plan'
import type { PlanProfile, WorkoutInfo } from '../../lib/training-plan'

function makeProfile(overrides: Partial<PlanProfile> = {}): PlanProfile {
  return {
    goal: 'marathon' as const,
    daysPerWeek: 4,
    preferredLongDay: 'Sat',
    trainingLevel: 'intermediate',
    customPlan: null,
    raceDate: null,
    planAdjustment: 1.0,
    ...overrides,
  }
}

// ─── Group 1: getPlanStart — signup day logic ──────────────────────────────────

describe('getPlanStart', () => {
  it('Wednesday Apr 15 2026 signup → planStart = Monday Apr 20 2026', () => {
    const profile = makeProfile({ createdAt: '2026-04-15' })
    const start = getPlanStart(profile)!
    expect(start).not.toBeNull()
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(3) // April (0-indexed)
    expect(start.getDate()).toBe(20)
  })

  it('Tuesday Apr 14 2026 signup → planStart = Monday Apr 20 (6 days later)', () => {
    // Apr 14 2026 is a Tuesday (jsDay=2): ((8-2)%7)=6 days → Apr 20
    const profile = makeProfile({ createdAt: '2026-04-14' })
    const start = getPlanStart(profile)!
    expect(start).not.toBeNull()
    expect(start.getDate()).toBe(20)
  })

  it('Sunday Apr 19 2026 signup → planStart = Monday Apr 20 (next day)', () => {
    const profile = makeProfile({ createdAt: '2026-04-19' })
    const start = getPlanStart(profile)!
    expect(start).not.toBeNull()
    expect(start.getDate()).toBe(20)
  })

  it('Tuesday Apr 21 2026 signup → planStart = Monday Apr 27', () => {
    const profile = makeProfile({ createdAt: '2026-04-21' })
    const start = getPlanStart(profile)!
    expect(start).not.toBeNull()
    expect(start.getDate()).toBe(27)
  })

  it('null createdAt → returns null', () => {
    expect(getPlanStart(makeProfile({ createdAt: null }))).toBeNull()
  })
})

// ─── Group 2: isInRunwayPeriod ─────────────────────────────────────────────────
// All use createdAt = '2026-04-15' (Wednesday), so planStart = Apr 21

describe('isInRunwayPeriod', () => {
  const profile = makeProfile({ createdAt: '2026-04-15' })

  it('Apr 16 (Thu) → true (before planStart)', () => {
    expect(isInRunwayPeriod(new Date(2026, 3, 16), profile)).toBe(true)
  })

  it('Apr 19 (Sun) → true (day before planStart Apr 20)', () => {
    // planStart = Apr 20 (Mon). Apr 19 is the last day of runway.
    expect(isInRunwayPeriod(new Date(2026, 3, 19), profile)).toBe(true)
  })

  it('Apr 20 (Mon) → false (planStart itself = plan started)', () => {
    // planStart = Apr 20. On or after planStart → not in runway.
    expect(isInRunwayPeriod(new Date(2026, 3, 20), profile)).toBe(false)
  })

  it('Apr 28 (Mon) → false (week 2 of plan)', () => {
    expect(isInRunwayPeriod(new Date(2026, 3, 28), profile)).toBe(false)
  })
})

// ─── Group 3: Distance scaling by training level ───────────────────────────────
// createdAt = '2026-04-08' (Tuesday Apr 8), planStart = Apr 14 (Monday)
// raceDate = '2026-08-25' (20 weeks after Apr 14)
// Test date Apr 14 = week 1 day 0 (Mon), Apr 18 = week 1 day 5 (Sat = long run)

describe('Distance scaling by training level', () => {
  const week1Profile = makeProfile({
    createdAt: '2026-04-08',
    raceDate: '2026-08-25',
    trainingLevel: 'beginner',
    planAdjustment: 1.0,
  })

  const satDate = new Date(2026, 3, 18) // Apr 18 — Sat, week 1, long run day (day 5)
  // planStart = Apr 13 (Mon). Apr 13 = day 0 (Mon = easy run). Apr 14 = Tue = Gym.
  const monDate = new Date(2026, 3, 13) // Apr 13 — Mon (planStart), week 1, easy run day (day 0)

  it('beginner week 1 long run ≤ 5km (cap)', () => {
    const beginnerLongRun = getWorkoutForDateWithProfile(satDate, week1Profile)
    const kmMatch = beginnerLongRun.label.match(/(\d+(?:\.\d+)?)\s*km/)
    const km = kmMatch ? parseFloat(kmMatch[1]) : null
    expect(km).not.toBeNull()
    expect(km!).toBeLessThanOrEqual(5)
  })

  it('beginner week 1 easy run ≤ 4km (cap)', () => {
    const beginnerEasyRun = getWorkoutForDateWithProfile(monDate, week1Profile)
    const kmMatch = beginnerEasyRun.label.match(/(\d+(?:\.\d+)?)\s*km/)
    const km = kmMatch ? parseFloat(kmMatch[1]) : null
    expect(km).not.toBeNull()
    expect(km!).toBeLessThanOrEqual(4)
  })

  it('intermediate week 1 long run: 5–12km (reasonable range)', () => {
    const intermediateProfile = { ...week1Profile, trainingLevel: 'intermediate' }
    const interLongRun = getWorkoutForDateWithProfile(satDate, intermediateProfile)
    const kmMatch = interLongRun.label.match(/(\d+(?:\.\d+)?)\s*km/)
    const km = kmMatch ? parseFloat(kmMatch[1]) : null
    expect(km).not.toBeNull()
    expect(km!).toBeGreaterThanOrEqual(5)
    expect(km!).toBeLessThanOrEqual(12)
  })

  it('advanced week 1 long run > intermediate', () => {
    const intermediateProfile = { ...week1Profile, trainingLevel: 'intermediate' }
    const advancedProfile = { ...week1Profile, trainingLevel: 'advanced' }

    const interLongRun = getWorkoutForDateWithProfile(satDate, intermediateProfile)
    const advLongRun = getWorkoutForDateWithProfile(satDate, advancedProfile)

    const kmInter = interLongRun.label.match(/(\d+(?:\.\d+)?)\s*km/)
    const kmAdv = advLongRun.label.match(/(\d+(?:\.\d+)?)\s*km/)

    expect(kmInter).not.toBeNull()
    expect(kmAdv).not.toBeNull()
    expect(parseFloat(kmAdv![1])).toBeGreaterThan(parseFloat(kmInter![1]))
  })

  it('beginner week 2 long run is type run (no crash)', () => {
    const week2Sat = new Date(2026, 3, 25) // Apr 25
    const beginnerWeek2 = getWorkoutForDateWithProfile(week2Sat, { ...week1Profile, trainingLevel: 'beginner' })
    expect(beginnerWeek2.type).toBe('run')
  })
})

// ─── Group 4: planAdjustment multiplier ───────────────────────────────────────

describe('planAdjustment multiplier', () => {
  const satDate = new Date(2026, 3, 18) // Apr 18

  const week1Profile = makeProfile({
    createdAt: '2026-04-08',
    raceDate: '2026-08-25',
    trainingLevel: 'intermediate',
    planAdjustment: 1.0,
  })

  function extractKm(workout: WorkoutInfo): number | null {
    const m = (workout.label + ' ' + workout.description).match(/(\d+(?:\.\d+)?)\s*km/)
    return m ? parseFloat(m[1]) : null
  }

  it('higher planAdjustment → more km', () => {
    const base = getWorkoutForDateWithProfile(satDate, { ...week1Profile, planAdjustment: 1.0 })
    const high = getWorkoutForDateWithProfile(satDate, { ...week1Profile, planAdjustment: 1.1 })
    expect(extractKm(high)!).toBeGreaterThan(extractKm(base)!)
  })

  it('lower planAdjustment → fewer km', () => {
    const base = getWorkoutForDateWithProfile(satDate, { ...week1Profile, planAdjustment: 1.0 })
    const low  = getWorkoutForDateWithProfile(satDate, { ...week1Profile, planAdjustment: 0.8 })
    expect(extractKm(low)!).toBeLessThan(extractKm(base)!)
  })

  it('planAdjustment 1.5 is clamped to 1.3 (same result)', () => {
    const clamped15 = getWorkoutForDateWithProfile(satDate, { ...week1Profile, planAdjustment: 1.5 })
    const clamped13 = getWorkoutForDateWithProfile(satDate, { ...week1Profile, planAdjustment: 1.3 })
    expect(extractKm(clamped15)!).toBe(extractKm(clamped13)!)
  })

  it('planAdjustment 0.3 is clamped to 0.6 (same result)', () => {
    const clamped03 = getWorkoutForDateWithProfile(satDate, { ...week1Profile, planAdjustment: 0.3 })
    const clamped06 = getWorkoutForDateWithProfile(satDate, { ...week1Profile, planAdjustment: 0.6 })
    expect(extractKm(clamped03)!).toBe(extractKm(clamped06)!)
  })
})

// ─── Group 5: Phase calculation (getPhase with 42 total weeks) ────────────────
// computePhases(42): taper=4, base=13, build=17, specific=8
// phase 1: weeks 1-13, phase 2: 14-30, phase 3: 31-38, phase 4: 39-42, phase 5: 43+

describe('getPhase with 42-week plan', () => {
  it('week 1 → phase 1 (Base Building)', () => {
    expect(getPhase(1, 42)).toBe(1)
  })

  it('week 20 → phase 2 (Build/Volume)', () => {
    expect(getPhase(20, 42)).toBe(2)
  })

  it('week 36 → phase 3 (Race Specific)', () => {
    expect(getPhase(36, 42)).toBe(3)
  })

  it('week 40 → phase 4 (Taper)', () => {
    expect(getPhase(40, 42)).toBe(4)
  })

  it('week 43 → phase 5 (Post-Race)', () => {
    expect(getPhase(43, 42)).toBe(5)
  })
})

// ─── Group 6: Non-race goals ───────────────────────────────────────────────────

describe('Non-race goals', () => {
  it('getRacePlanInfo returns null for get_fit', () => {
    expect(getRacePlanInfo(new Date(), makeProfile({ goal: 'get_fit' }))).toBeNull()
  })

  it('getRacePlanInfo returns null for lose_weight', () => {
    expect(getRacePlanInfo(new Date(), makeProfile({ goal: 'lose_weight' }))).toBeNull()
  })

  it('getRacePlanInfo returns null for other', () => {
    expect(getRacePlanInfo(new Date(), makeProfile({ goal: 'other' }))).toBeNull()
  })

  it('null goal → REST_DAY (type = rest)', () => {
    const restWorkout = getWorkoutForDateWithProfile(new Date(), makeProfile({ goal: null }))
    expect(restWorkout.type).toBe('rest')
  })
})
