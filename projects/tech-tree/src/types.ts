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
  threshold?: { metric: string; value: number; label?: string }
  trendYear?: number // when the metric's trend reaches the threshold
  routes?: string[]
}

// The text of each node, loaded after the tree is drawn.
export interface Details {
  date: unknown
  summary?: string
  criterion?: string
  efforts?: Effort[]
  effort?: { span?: [number, number] | number; people?: number | string; cost_usd?: number | string; note?: string }
  forecast?: { note?: string; sources?: Source[] }
  lost?: string
  scarcity?: string
  note?: string
  sources?: Source[]
  routes?: { name: string; note?: string; requires: string[] }[]
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
  trend: { slope: number; intercept: number; r2: number; sd: number; years: number | null; linear: boolean; from: number; to: number } | null
  wright: { exponent: number; learningRate: number; r2: number; points: number } | null
  source?: Source
  license?: string
  note?: string
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
}
