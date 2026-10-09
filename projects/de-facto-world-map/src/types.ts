export interface Source {
  title: string
  url: string
  archived?: string
}

export interface Entity {
  name?: string
  // Shorter name for map labels, where one exists ("Dem. Rep. Congo").
  short?: string
  formal?: string
  kind?: string
  parent?: string
  recognition?: string
  note?: string
  color: string
  label?: [number, number]
  km2?: number
}

// How an area is held. "control" is ordinary governance; the rest get
// their own fill treatment on the map.
export type Kind =
  | "control"
  | "dependency"
  | "lease"
  | "occupation"
  | "contested"
  | "uncontrolled"
  | "international"

export interface AreaDetail {
  name: string
  c: string
  k: Kind
  asOf?: string
  confidence?: string
  note?: string
  sources?: Source[]
}

export interface ClaimDetail {
  name: string
  claimant: string
  note?: string
  sources?: Source[]
}

export interface PresenceDetail {
  name: string
  group: string
  asOf?: string
  confidence?: string
  note?: string
  sources?: Source[]
}

export interface Details {
  areas: Record<string, AreaDetail>
  claims: Record<string, ClaimDetail>
  presence: Record<string, PresenceDetail>
}

export interface Station {
  name: string
  op: string
  lon: number
  lat: number
  year?: number
  season?: string
}

export interface Meta {
  asOf: string
  built: string
}

// Properties carried on every TopoJSON feature: area id, controller (or
// claimant / group), and for the control layer the kind of hold.
export interface FeatureProps {
  a: string
  c: string
  k?: Kind
}
