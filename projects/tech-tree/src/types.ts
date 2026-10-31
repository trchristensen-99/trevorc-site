export interface Source {
  title: string
  url: string
}

export interface Effort {
  who: string
  where?: string
  when?: number | string
  outcome?: "achieved" | "ongoing" | "abandoned" | "rival" | "independent"
  note?: string
}

export interface Node {
  id: string
  name: string
  kind: "precondition" | "resource" | "discovery" | "technique" | "device" | "infrastructure" | "institution" | "milestone"
  fields: string[]
  status: "achieved" | "ongoing" | "speculative" | "lost"
  tier: 1 | 2 | 3
  from: number
  to: number
  at: number
  x: number
  y: number
  z: number // the zoom at which it first shows, at the default detail
  lane: string
  track: string
  metric?: string
  threshold?: { metric: string; value: number; label?: string; series?: string }
  trendYear?: number // when the metric's trend reaches the threshold
  scenarioYears?: { id: string; year: number | null }[] // when each forecast does
  routes?: string[]
  steps?: [number, number] // checklist steps done, of all
  py?: number // log10 of the person-years it took (or has had so far)
  risk?: "low" | "moderate" | "high" | "very high" // supply risk: its own, or its riskiest resource's
  flag?: "earlier" | "later" // the best guess is outside the pooled forecasts' middle half
}

// The text of each node, loaded after the tree is drawn.
export interface Details {
  date: unknown
  summary?: string
  criterion?: string
  efforts?: Effort[]
  effort?: { span?: [number, number] | number; people?: number | string; person_years?: number; cost_usd?: number | string; compute_usd?: number; work?: string; growth?: number; rough?: boolean; note?: string }
  effortCalc?: { years: number | null; people: number | null; py: number | null; work: string; rough: boolean; vsTrend?: number }
  prereqModel?: { ready: number; last: number; waited: number; q25: number; q50: number; q75: number }
  effortModel?: { spent: number; people: number; growth: number; past: number; q10: number; q50: number; q90: number }
  pool?: Pool
  supply?: Supply
  supplyCalc?: { rp: number | null; hhi: number | null; procHhi: number | null; parts: Record<string, number>; score: number | null; rating: string; judged: boolean }
  risk?: { rating: string; resource: string }
  resourceUse?: ResourceUse[]
  checklist?: { step: string; node?: string; done: number | null; who?: string; note?: string }[]
  alsoHelps?: string[]
  usedBy?: ResourceUse[]
  forecast?: { note?: string; sources?: Source[] }
  lost?: string
  scarcity?: string
  note?: string
  sources?: Source[]
  routes?: { name: string; note?: string; requires: string[] }[]
}

// Quantiles at Models.forecasting.levels (5, 10, 25, 50, 75, 90, 95
// percent), in years; null means never, in that source.
export type Quantiles = (number | null)[]
export interface PoolInput {
  label: string
  kind: "crowd" | "market" | "survey" | "expert" | "projection" | "target" | "model" | "trend" | "outside"
  weight: number
  q: Quantiles
  url?: string
  match?: "same" | "looser" | "stricter"
  asof?: number | null
  note?: string
  year?: number // a target's own date
}
export interface Pool {
  judged: Quantiles
  pooled: Quantiles
  flag: "earlier" | "later" | null
  outsideOnly: boolean
  inputs: PoolInput[]
  sim: { outside: Quantiles; base: Quantiles; judged: Quantiles; early?: boolean }
  cond?: { source: string; r: number; direct: number; earlyBy: number; early: number; lateAfter: number; late: number }
  accel?: { shares: Record<string, number>; by: string[] }
}

export interface Supply {
  year?: number
  production?: { value: number; unit: string; what?: string }
  reserves?: { value: number; unit: string; more?: boolean }
  producers?: [string, number][]
  processing?: { stage: string; producers: [string, number][] }
  recycling?: string
  demand_2040?: number
  uses?: [string, number][]
  risk?: { rating: string; note?: string }
  note?: string
  sources?: Source[]
}

// One technology's use of one resource.
export interface ResourceUse {
  tech?: string
  resource?: string
  amount?: string
  share?: number
  substitute?: string
  source?: Source
}

export interface Edge {
  s: string
  t: string
  kind: "requires" | "uses" | "helped" | "competes"
  routes?: number[] // only on these alternative routes to the target
  via?: boolean // drawn through hidden nodes, not a direct link
}

export interface Track {
  id: string
  name: string
  count: number
  y0: number
  y1: number
}

export interface Lane {
  id: string
  name: string
  color: string
  y0: number
  y1: number
  count: number
  tracks: Track[]
}

export interface Metric {
  id: string
  name: string
  short: string
  field?: string
  milestones: string[]
  unit: string
  better: "higher" | "lower"
  log: boolean
  points: [number, number][]
  trend: { slope: number; intercept: number; r2: number; sd: number; years: number | null; linear: boolean; from: number; to: number; band?: [number, number, number][] } | null
  wright: { exponent: number; learningRate: number; r2: number; points: number } | null
  source?: Source
  license?: string
  note?: string
  scenarios: Scenario[]
  series?: Series[] // several lines sharing the chart (then points is empty)
}

// One line of a metric with several.
export interface Series {
  id: string
  name: string
  points: [number, number][]
  trend: Metric["trend"]
  scenarios: Scenario[]
}

// A forecast path for a metric, with an optional band.
export interface Scenario {
  id: string
  name: string
  kind: "trend" | "projection" | "survey" | "market" | "model" | "judgment"
  points: [number, number][]
  low: [number, number][]
  high: [number, number][]
  note?: string
  sources?: Source[]
}

export interface Tree {
  meta: {
    built: string
    now: number
    width: number
    height: number
    time: { tau: number; deep: number; futureGain: number; uMin: number; uMax: number }
    reveal: { p: number; fullZoom: number }
  }
  fields: { id: string; name: string; color: string }[]
  roots: { id: string; name: string; color: string }
  lanes: Lane[]
  nodes: Node[]
  edges: Edge[]
  metrics: Metric[]
  models: Models
}

// Fits across the whole tree (see build.mjs).
export interface Models {
  effort: { n: number; beta: number[]; sd: number; r2: number; fold: number; from: number; kinds: { name: string; kinds: string[]; n: number; shift: number }[] } | null
  cost: { n: number; slope: number; intercept: number; sd: number; r2: number; fold: number; from: number } | null
  span: { n: number; exponent: number; intercept: number; r2: number } | null
  lag: { eras: { from: number; to: number; n: number; q25: number | null; q50: number | null; q75: number | null }[]; basis: { from: number; n: number; q25: number; q50: number; q75: number } }
  forecasting: {
    levels: number[]
    weights: Record<string, number>
    slip: number
    slipHigh: number
    draws: number
    backtest: { scale: number; raw: Backtest[]; scaled: Backtest[] }
    work: Record<string, string>
    mechanisms: { id: string; name: string; from: string; work: string[]; speedup: Record<string, number>; ramp: number; only?: { tracks?: string[]; nodes?: string[] }; note?: string; sources?: Source[] }[]
  }
}
export interface Backtest { from: number; n: number; early: number; inside: number; late: number; basis: number }
