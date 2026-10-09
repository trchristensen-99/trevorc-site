// d3-geo-projection ships without type declarations; these are the only
// two projections the app uses.
declare module "d3-geo-projection" {
  import type { GeoProjection } from "d3-geo"
  export function geoWinkel3(): GeoProjection
  export function geoRobinson(): GeoProjection
}
