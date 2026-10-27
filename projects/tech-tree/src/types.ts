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
  kind: "precondition" | "resource" | "discovery" | "technique" | "device" | "infrastructure" | "institution"
  fields: string[]
  status: "achieved" | "ongoing" | "speculative" | "lost"
  tier: 1 | 2 | 3
  from: number
  to: number
  at: number
  date: unknown
  x: number
  y: number
  lane: string
  summary?: string
  efforts?: Effort[]
  effort?: { span?: [number, number] | number; people?: number | string; cost_usd?: number | string; note?: string }
  forecast?: { note?: string; sources?: Source[] }
  lost?: string
  scarcity?: string
  note?: string
  metric?: string
  sources?: Source[]
}

export interface Edge {
  s: string
  t: string
  kind: "requires" | "uses" | "helped" | "competes"
  levels: number // bit L-1 set: drawn when tiers up to L are showing
  direct: boolean
}

export interface Lane {
  id: string
  name: string
  color: string
  y0: number
  y1: number
  count: number
}

export interface Metric {
  id: string
  name: string
  unit: string
  better: "higher" | "lower"
  log: boolean
  points: [number, number][]
  trend: { slope: number; intercept: number; r2: number; years: number; from: number; to: number } | null
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
    tierZoom: Record<string, number>
  }
  fields: { id: string; name: string; color: string }[]
  roots: { id: string; name: string; color: string }
  lanes: Lane[]
  nodes: Node[]
  edges: Edge[]
  metrics: Metric[]
}
