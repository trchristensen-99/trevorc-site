// Importance calibration: maps raw user-supplied 1-10 scores onto a target
// log inverse-J distribution that scales with corpus size.
//
//   count(b) = c1 + c2 * ln(11 - b)^p
//
// where c1 = floor(log2(N/10)) + 1 (count of 10s, doubles per doubling of N),
// c2 is chosen so totals sum to N, and p is steepness (1 = smooth log,
// >1 makes top buckets rarer; default 1.5).
//
// The user's raw importance is treated as a *rank hint*. Files are sorted by
// raw importance (with stable tiebreaks), then assigned bucket positions
// 1..10 according to the target distribution.
import { QuartzPluginData } from "../plugins/vfile"

export interface CalibratedImportance {
  raw: number
  bucket: number
  rank: number
  total: number
  percentile: number
}

export interface CalibrationOptions {
  steepness: number
  minCorpusForBucketing: number
}

const DEFAULT_OPTIONS: CalibrationOptions = {
  steepness: 2.0,
  minCorpusForBucketing: 10,
}

function targetCounts(N: number, p: number): number[] {
  const counts = new Array(11).fill(0)
  if (N <= 0) return counts

  let c1 = Math.max(1, Math.floor(Math.log2(N / 10)) + 1)
  c1 = Math.min(c1, Math.floor(N / 10))
  c1 = Math.max(c1, 1)

  const logTerms = []
  for (let k = 1; k <= 10; k++) logTerms.push(Math.pow(Math.log(k), p))
  const sumLogs = logTerms.reduce((a, b) => a + b, 0)

  const c2 = sumLogs > 0 ? Math.max(0, (N - 10 * c1) / sumLogs) : 0

  const raw: number[] = []
  for (let b = 1; b <= 10; b++) {
    if (b === 10) {
      raw.push(c1)
    } else {
      raw.push(c1 + c2 * Math.pow(Math.log(11 - b), p))
    }
  }

  const rounded = raw.map((x) => Math.max(0, Math.round(x)))
  let diff = N - rounded.reduce((a, b) => a + b, 0)
  const fracs = raw.map((x, i) => ({ frac: x - rounded[i], i }))

  if (diff > 0) {
    fracs.sort((a, b) => b.frac - a.frac)
    for (let k = 0; k < diff; k++) rounded[fracs[k].i] += 1
  } else if (diff < 0) {
    fracs.sort((a, b) => a.frac - b.frac)
    for (let k = 0; k < -diff; k++) rounded[fracs[k].i] = Math.max(0, rounded[fracs[k].i] - 1)
  }

  for (let b = 1; b <= 10; b++) counts[b] = rounded[b - 1]
  return counts
}

function rateableFiles(allFiles: QuartzPluginData[]): QuartzPluginData[] {
  return allFiles
    .filter((f) => typeof (f.frontmatter as Record<string, unknown> | undefined)?.importance === "number")
    .slice()
    .sort((a, b) => {
      const ai = (a.frontmatter as Record<string, unknown>).importance as number
      const bi = (b.frontmatter as Record<string, unknown>).importance as number
      if (ai !== bi) return ai - bi
      const am = a.dates?.modified?.getTime() ?? 0
      const bm = b.dates?.modified?.getTime() ?? 0
      return am - bm
    })
}

export function calibrate(
  allFiles: QuartzPluginData[],
  file: QuartzPluginData,
  options: Partial<CalibrationOptions> = {},
): CalibratedImportance | null {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const fm = file.frontmatter as Record<string, unknown> | undefined
  const raw = fm?.importance
  if (typeof raw !== "number") return null

  const ranked = rateableFiles(allFiles)
  const total = ranked.length
  if (total === 0) return null

  const idx = ranked.findIndex((f) => f.slug === file.slug)
  if (idx < 0) return null
  const rank = idx + 1
  const percentile = (rank / total) * 100

  // Below threshold: just return rank/percentile, no bucketing
  if (total < opts.minCorpusForBucketing) {
    return { raw, bucket: raw, rank, total, percentile }
  }

  // Compute target counts for current corpus, then assign buckets by rank
  const counts = targetCounts(total, opts.steepness)
  // counts[1] = how many essays end up in bucket 1, etc.
  // Bucket assignment: bottom counts[1] ranks → bucket 1, next counts[2] → bucket 2, etc.
  let cumulative = 0
  let bucket = 1
  for (let b = 1; b <= 10; b++) {
    cumulative += counts[b]
    if (rank <= cumulative) {
      bucket = b
      break
    }
  }

  return { raw, bucket, rank, total, percentile }
}
