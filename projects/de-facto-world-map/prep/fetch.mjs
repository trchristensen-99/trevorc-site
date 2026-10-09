// Downloads the raw inputs into raw/ (gitignored). Run once, or again to
// pick up a new Natural Earth release.
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const HERE = path.dirname(new URL(import.meta.url).pathname)
const RAW = path.join(HERE, "raw")
const MAPSHAPER = path.join(HERE, "node_modules", ".bin", "mapshaper")

const NE_LAYERS = [
  "admin_0_countries",
  "admin_0_disputed_areas",
  "admin_0_antarctic_claims",
  "admin_1_states_provinces",
]

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

for (const layer of NE_LAYERS) {
  const zip = path.join(RAW, "ne", `ne_10m_${layer}.zip`)
  const dir = path.join(RAW, "ne", `ne_10m_${layer}`)
  await download(`https://naciscdn.org/naturalearth/10m/cultural/ne_10m_${layer}.zip`, zip)
  fs.mkdirSync(dir, { recursive: true })
  execFileSync("unzip", ["-q", "-o", zip, "-d", dir])
  const shp = fs.readdirSync(dir).find((f) => f.endsWith(".shp"))
  execFileSync(MAPSHAPER, ["-i", path.join(dir, shp), "encoding=utf8", "-o", path.join(RAW, "ne", `${layer}.geojson`), "format=geojson"], { stdio: "ignore" })
  console.log(`ne ${layer}`)
}

// geoBoundaries (gbOpen) administrative units for countries whose control
// lines don't follow Natural Earth's provinces, at full resolution so the
// zoomed-in map stays sharp. Ukraine's units only serve as a reference grid
// (and the full file is 120 MB), so it uses the simplified geometry.
const GB = ["UKR/ADM3", "YEM/ADM2", "SDN/ADM2", "COD/ADM2", "SOM/ADM2", "MMR/ADM3", "SYR/ADM2", "PSE/ADM2", "MLI/ADM2", "BFA/ADM2", "NER/ADM2", "NGA/ADM2"]
const SIMPLIFIED = new Set(["UKR/ADM3"])
for (const q of GB) {
  const meta = await (await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${q}/`)).json()
  const url = SIMPLIFIED.has(q) ? meta.simplifiedGeometryGeoJSON : meta.gjDownloadURL
  await download(url, path.join(RAW, "gb", `${q.replace("/", "-")}.geojson`))
  fs.writeFileSync(path.join(RAW, "gb", `${q.replace("/", "-")}.meta.json`), JSON.stringify({ license: meta.boundaryLicense, source: meta.boundarySource, year: meta.boundaryYearRepresented, url: meta.apiURL }))
  console.log(`geoBoundaries ${q} (${meta.boundaryLicense})`)
}

// DeepStateMap's current snapshot, used only as a reference for which
// Ukrainian units are occupied (see areas.json); its geometry isn't shipped.
await download("https://deepstatemap.live/api/history/last", path.join(RAW, "deepstate", "last.json"))
console.log("deepstate snapshot")

await download(
  "https://raw.githubusercontent.com/PolarGeospatialCenter/comnap-antarctic-facilities/master/dist/geojson/COMNAP_Antarctic_Facilities_Master.json",
  path.join(RAW, "comnap", "facilities.json"),
)
console.log("comnap facilities")
