// Forecasts for what isn't done yet, beside the judgment behind each
// window (see SCHEMA.md, "Forecasts"):
//
// - Every source becomes a distribution over the year it happens: the
//   judgment itself, outside forecasts (forecasts.yaml), the trend of a
//   milestone's metric, and the tree simulated as a whole.
// - The trend: a random walk with drift from the latest data point, whose
//   spread grows with the horizon (Farmer and Lafond 2016), rather than the
//   scatter around a fitted line.
// - The simulation: every future technology comes some time after what it
//   needs, so uncertainty flows downstream; and AI milestones speed up the
//   kinds of work they can do (acceleration.yaml), by Amdahl's law: the
//   rest of the work goes no faster. It runs twice: from base rates (the
//   time after prerequisites since 1950: an outside view) and from the
//   judgment (each window, with what it needs and the AI milestones at
//   their likely dates, gives the work it stands for; then everything
//   varies together).
// - The pool: a weighted average of the sources' quantiles, on a scale of
//   log years from now. The judgment stays the tree's date; a technology
//   is flagged when its best guess falls outside the pool's middle half.

export const LEVELS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]
const Z = { 0.05: -1.6449, 0.1: -1.2816, 0.25: -0.6745, 0.5: 0, 0.75: 0.6745, 0.9: 1.2816, 0.95: 1.6449 }
const QKEYS = { q05: 0.05, q10: 0.1, q25: 0.25, median: 0.5, q75: 0.75, q90: 0.9, q95: 0.95 }
export const FORECAST_KINDS = ["crowd", "market", "survey", "expert", "projection", "target", "model"]

// How much each kind of source counts in the pool, before adjustments for
// horizon, age and how well its question matches the criterion.
export const WEIGHTS = {
  crowd: 3, // aggregated forecasters with a track record (Metaculus, Good Judgment)
  market: 2, // prediction markets; long-dated ones are thin and lean on time value
  projection: 2, // official projections (UN, IEA)
  survey: 1.5, // expert surveys
  expert: 1, // one expert or team
  model: 1, // a published model
  target: 1, // a company's or agency's own date, after the usual slip
  trend: 3, // the metric's trend, scaled by how well it fits and how far it's carried
  outside: 1, // the tree simulated from base rates
}
// Announced dates slip. A target set in year A for year T is read as a
// median of A + SLIP * (T - A), with T itself at the 10th percentile and
// A + SLIP_HIGH * (T - A) at the 90th. See the sources in SCHEMA.md.
export const SLIP = 1.6
export const SLIP_HIGH = 3
const DEFAULT_SIGMA = { crowd: 0.45, market: 0.45, survey: 0.6, expert: 0.5, projection: 0.4, model: 0.5 }

// ------------------------------------------------------------ helpers

const normCdf = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}
// Mulberry32: the same draws on every build.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (rand) => {
  let u = 0
  while (u === 0) u = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}
const sortedQuantile = (a, q) => {
  if (!a.length) return null
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = a[Math.min(lo + 1, a.length - 1)]
  if (i === lo || !Number.isFinite(a[lo])) return a[lo]
  return Number.isFinite(hi) ? a[lo] + (hi - a[lo]) * (i - lo) : Infinity
}

export function forecasting({ NOW, kept, live, warn, techPrereqs, recentLags, metricById, lineFor, accel, forecastsYaml }) {
  // Years as log years from now: x = ln(1 + years from now).
  const X = (y) => Math.log(1 + Math.max(0, y - NOW))
  const Y = (x) => NOW + Math.exp(x) - 1
  const open = (n) => n.status === "ongoing" || n.status === "speculative"
  // A distribution as its quantiles at LEVELS, in years (Infinity: never,
  // in that source).
  const fromNormal = (mu, sLo, sHi = sLo) => LEVELS.map((q) => Y(mu + Z[q] * (Z[q] < 0 ? sLo : sHi)))
  const qOf = (d, q) => d[LEVELS.indexOf(q)]

  // The judgment: the window as its 10th to 90th percentiles, the best
  // guess as its median.
  const judged = (n) => {
    const m = X(n._date.at)
    const sLo = Math.max(0.02, (m - X(n._date.from)) / -Z[0.1]), sHi = Math.max(0.02, (X(n._date.to) - m) / Z[0.9])
    return fromNormal(m, sLo, sHi)
  }

  // ------------------------------------------- outside forecasts (yaml)
  const forecasts = new Map()
  for (const [id, entries] of Object.entries(forecastsYaml ?? {})) {
    const n = live.get(id)
    if (!n) { warn(`forecasts.yaml: unknown node ${id}`); continue }
    if (!open(n)) warn(`forecasts.yaml: ${id} is already ${n.status}`)
    const out = []
    for (const [i, f] of (entries ?? []).entries()) {
      const where = `forecasts.yaml: ${id} #${i + 1}`
      if (!FORECAST_KINDS.includes(f.kind)) { warn(`${where}: unknown kind ${f.kind}`); continue }
      if (!f.title || !f.url) warn(`${where}: needs a title and url`)
      if (f.match && !["same", "looser", "stricter"].includes(f.match)) warn(`${where}: match should be same, looser or stricter`)
      const asof = Number(String(f.asof ?? "").replace(/-(\d\d)$/, (_, m) => `.${Math.round(((Number(m) - 1) / 12) * 100)}`))
      if (!Number.isFinite(asof)) warn(`${where}: asof should be a year-month`)
      let q
      if (f.kind === "target") {
        const T = Number(f.year)
        if (!Number.isFinite(T)) { warn(`${where}: a target needs a year`); continue }
        const A = Math.min(Number.isFinite(asof) ? asof : NOW, T)
        // Already past: the target is missed, so it's at least now.
        const med = Math.max(A + SLIP * (T - A), NOW + 0.5), hi = Math.max(A + SLIP_HIGH * (T - A), med + 1)
        const lo = Math.max(T, NOW + 0.25)
        const m = X(med)
        q = fromNormal(m, Math.max(0.05, (m - X(lo)) / -Z[0.1]), Math.max(0.05, (X(hi) - m) / Z[0.9]))
      } else {
        const given = Object.entries(QKEYS).filter(([k]) => f[k] != null).map(([k, lv]) => [lv, Number(f[k])])
        if (!given.length) { warn(`${where}: needs a median or quantiles`); continue }
        // A normal in log years from now, through the quantiles given: the
        // median, and the spread from the others (or a default for the kind).
        const med = given.find(([lv]) => lv === 0.5)
        const lows = given.filter(([lv]) => lv < 0.5), highs = given.filter(([lv]) => lv > 0.5)
        // A single quantile and no median ("11 percent before 2030") says
        // little about the spread: assume a wide one.
        const dflt = !med && given.length === 1 ? 0.8 : DEFAULT_SIGMA[f.kind]
        const mu = med ? X(med[1]) : given.reduce((a, [lv, y]) => a + X(y) - Z[lv] * dflt, 0) / given.length
        const spread = (side) => side.length ? side.reduce((a, [lv, y]) => a + (X(y) - mu) / Z[lv], 0) / side.length : null
        const sLo = spread(lows), sHi = spread(highs)
        q = fromNormal(mu, Math.max(0.03, sLo ?? sHi ?? dflt), Math.max(0.03, sHi ?? sLo ?? dflt))
      }
      out.push({ ...f, asof: Number.isFinite(asof) ? asof : null, q })
    }
    forecasts.set(id, out)
  }

  // ------------------------------------------------ trends (random walk)
  // From the latest point, the log value (or the value, for a linear
  // metric) moves at the trend's slope a year, with yearly noise K^2 (from
  // the gaps between the points used for the fit) plus the uncertainty in
  // the slope, which grows with the square of the horizon: variance
  // K^2 (t + t^2 / T) after t years, from a record T years long.
  const walkOf = (line) => {
    const tr = line.trend, pts = line._fitPts
    if (!tr || !pts || pts.length < 3) return null
    const f = (v) => (line.log !== false ? Math.log10(v) : v)
    let ss = 0, k = 0
    for (let i = 1; i < pts.length; i++) {
      const dt = pts[i][0] - pts[i - 1][0]
      if (dt <= 0) continue
      ss += (f(pts[i][1]) - f(pts[i - 1][1]) - tr.slope * dt) ** 2 / dt
      k++
    }
    if (k < 2) return null
    const last = line.points.at(-1)
    return { mu: tr.slope, K: Math.sqrt(ss / (k - 1)), T: pts.at(-1)[0] - pts[0][0], t0: last[0], y0: f(last[1]), f }
  }
  const walkAt = (w, year, z) => {
    const t = Math.max(0, year - w.t0)
    return w.y0 + w.mu * t + z * w.K * Math.sqrt(t + (t * t) / w.T)
  }
  // The year by which the line has crossed `value` with probability q:
  // the chance it's past the value at t, kept from falling (once crossed,
  // it counts as crossed), on a grid out to 300 years. A level never
  // reached in that time is Infinity.
  const walkCrossing = (w, value, better) => {
    const target = w.f(value), sign = better === "lower" ? -1 : 1
    const p = (t) => {
      const sd = w.K * Math.sqrt(t + (t * t) / w.T)
      return sd > 0 ? normCdf((sign * (w.y0 + w.mu * t - target)) / sd) : sign * (w.y0 + w.mu * t - target) >= 0 ? 1 : 0
    }
    const grid = []
    let best = 0
    for (let t = 0; t <= 300; t += t < 50 ? 0.1 : 0.5) { best = Math.max(best, p(t)); grid.push([t, best]) }
    return LEVELS.map((q) => {
      const hit = grid.find(([, pr]) => pr >= q)
      return hit ? Math.max(NOW, w.t0 + hit[0]) : Infinity
    })
  }
  // An 80% band for the chart, from the latest point out to 2100 or 60
  // years, whichever comes first.
  const bands = new Map()
  const bandOf = (line) => {
    const w = walkOf(line)
    if (!w) return null
    const end = Math.min(2100, w.t0 + 60), inv = (v) => (line.log !== false ? 10 ** v : v)
    const ys = Array.from({ length: 16 }, (_, i) => w.t0 + ((end - w.t0) * i) / 15)
    return ys.map((y) => [Math.round(y * 10) / 10, +inv(walkAt(w, y, -1.2816)).toPrecision(4), +inv(walkAt(w, y, 1.2816)).toPrecision(4)])
  }
  for (const m of metricById.values())
    for (const line of m.series ?? [m]) {
      const b = bandOf({ ...m, ...line })
      if (b) bands.set(line, b)
    }
  const trendOf = (n) => {
    if (!n.threshold) return null
    const line = lineFor(metricById.get(n.threshold.metric), n.threshold.series)
    const w = line && walkOf(line)
    if (!w || line.points.some(([, y]) => (line.better === "lower" ? y <= n.threshold.value : y >= n.threshold.value))) return null
    // The data has fallen behind its own trend line, which says this
    // should already have happened: the trend is no guide.
    if (n._trend && !n._trend.crossed && n._trend.year < NOW - 2) return null
    return { q: walkCrossing(w, Number(n.threshold.value), line.better), record: w.T, r2: line.trend.r2, last: w.t0, scenarios: line.scenarios ?? [] }
  }

  // --------------------------------------------- acceleration (yaml)
  const WORK = accel?.work ?? {}
  const mechanisms = (accel?.mechanisms ?? []).filter((m, i) => {
    const where = `acceleration.yaml: mechanism ${m.id ?? i + 1}`
    if (!live.get(m.from)) { warn(`${where}: unknown node ${m.from}`); return false }
    for (const [w, k] of Object.entries(m.speedup ?? {})) {
      if (!(w in WORK)) warn(`${where}: unknown work ${w}`)
      if (!(Number(k) >= 1)) warn(`${where}: speedup for ${w} should be 1 or more`)
    }
    return true
  }).map((m) => ({ ...m, work: Object.keys(m.speedup ?? {}), speedup: Object.fromEntries(Object.entries(m.speedup ?? {}).map(([w, k]) => [w, Number(k)])), ramp: Number(m.ramp ?? 1) }))
  // Each technology's remaining work, split by kind: its own `work` in
  // acceleration.yaml, else its track's, else its field's.
  const sharesOf = (n) => {
    const s = accel?.nodes?.[n.id] ?? accel?.tracks?.[n._track] ?? accel?.fields?.[n.fields[0]]
    if (!s) return null
    const tot = Object.values(s).reduce((a, v) => a + Number(v), 0)
    for (const w of Object.keys(s)) if (!(w in WORK)) warn(`acceleration.yaml: ${n.id}: unknown work ${w}`)
    return tot > 0 ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v) / tot])) : null
  }
  for (const id of Object.keys(accel?.nodes ?? {})) if (!live.get(id)) warn(`acceleration.yaml: unknown node ${id}`)
  // Work done from `start` to `end` (in years at today's pace), when the
  // mechanisms' sources arrive at `arrive` (id -> year).
  const accelCache = new Map()
  const accelOf = (n) => {
    if (!accelCache.has(n.id)) accelCache.set(n.id, accelOf1(n))
    return accelCache.get(n.id)
  }
  const accelOf1 = (n) => {
    const shares = sharesOf(n)
    if (!shares) return null
    // A mechanism can be limited to some tracks or technologies (`only`).
    const inScope = (m) => !m.only || (m.only.tracks ?? []).includes(n._track) || (m.only.nodes ?? []).includes(n.id)
    const mech = mechanisms.filter((m) => m.from !== n.id && inScope(m) && m.work.some((w) => shares[w]))
    return mech.length ? { shares, mech, list: Object.entries(shares).map(([w, sh]) => [w, sh, mech.filter((m) => m.work.includes(w))]) } : null
  }
  // Speedup of one kind of work at time t: the most any source that has
  // arrived gives it, growing geometrically over the ramp.
  const speedAt = (ms, w, t, arrive) => {
    let k = 1
    for (const m of ms) {
      const e = arrive(m.from)
      if (!(t > e)) continue
      const f = m.ramp > 0 ? Math.min(1, (t - e) / m.ramp) : 1
      k = Math.max(k, m.speedup[w] ** f)
    }
    return k
  }
  const rateAt = (a, t, arrive) => {
    let s = 0
    for (const [w, sh, ms] of a.list) s += ms.length ? sh / speedAt(ms, w, t, arrive) : sh
    return 1 / s
  }
  // Breakpoints where the rate changes: each arrival and its ramp in steps.
  const STEPS = 4
  const breaks = (a, from, arrive) => {
    const out = []
    for (const m of a.mech) {
      const e = arrive(m.from)
      if (!Number.isFinite(e)) continue
      for (let i = 0; i <= STEPS; i++) out.push(e + (m.ramp * i) / STEPS)
    }
    return out.filter((t) => t > from).sort((x, y) => x - y)
  }
  // Integrate: work done between start and end.
  const workBetween = (a, start, end, arrive) => {
    if (!a) return Math.max(0, end - start)
    let t = start, done = 0
    for (const b of [...breaks(a, start, arrive), Infinity]) {
      const stop = Math.min(b, end)
      if (stop > t) { done += (stop - t) * rateAt(a, (t + stop) / 2, arrive); t = stop }
      if (t >= end) break
    }
    return done
  }
  // Solve: the year `work` is done, starting at `start`.
  const finish = (a, start, work, arrive) => {
    if (!a) return start + work
    let t = start, left = work
    for (const b of [...breaks(a, start, arrive), Infinity]) {
      const r = rateAt(a, b === Infinity ? t + 1e-6 : (t + Math.min(b, t + 1e9)) / 2, arrive)
      const span = b - t
      if (left <= span * r) return t + left / r
      left -= span * r
      t = b
    }
    return t + left
  }

  // ------------------------------------------- the base rate, tested
  // Pretend it's an earlier year C: for everything whose prerequisites
  // were all in place before C and that wasn't done by C, predict from the
  // lags of what was achieved in the 50 years before C (at least as long as
  // it had waited), then see where it actually came. Those still not done
  // count as late once the prediction's upper quartile has passed. The
  // lags are then scaled by the factor that best balances early and late
  // over the four tests, and the simulation uses them scaled.
  const testAt = (C, scale) => {
    const basis = kept.filter((n) => n.status === "achieved" && n.kind !== "milestone" && n.kind !== "resource" && n.kind !== "precondition" && n._date.at < C && n._date.at >= C - 50)
      .map((n) => { const ps = techPrereqs(n._requires); return ps.length ? n._date.at - Math.max(...ps.map((p) => p._date.at)) : null })
      .filter((x) => x != null && x >= 0).map((x) => x * scale).sort((a, b) => a - b)
    let early = 0, inside = 0, late = 0
    for (const n of kept) {
      if (n.kind === "milestone" || n.kind === "resource" || n.kind === "precondition" || n.status === "lost") continue
      const ps = techPrereqs(n._requires)
      if (!ps.length || ps.some((p) => p._date.at >= C)) continue
      if (n.status === "achieved" && n._date.at < C) continue
      const last = Math.max(...ps.map((p) => p._date.at))
      let l = basis.filter((x) => x >= C - last)
      if (l.length < 20) l = basis.slice(-20)
      const q25 = last + Math.max(C - last, sortedQuantile(l, 0.25)), q75 = last + Math.max(C - last, sortedQuantile(l, 0.75))
      if (n.status === "achieved") { if (n._date.at < q25) early++; else if (n._date.at > q75) late++; else inside++ }
      else if (q75 < NOW) late++
    }
    return { from: C, n: early + inside + late, early, inside, late, basis: basis.length }
  }
  const CUTS = [1980, 1990, 2000, 2010]
  const scales = Array.from({ length: 30 }, (_, i) => 0.1 + i * 0.05)
  const score = (sc) => { const r = CUTS.map((C) => testAt(C, sc)); const e = r.reduce((a, x) => a + x.early, 0), l = r.reduce((a, x) => a + x.late, 0); return Math.abs(e - l) }
  const lagScale = scales.reduce((best, sc) => (score(sc) < score(best) ? sc : best), 1)
  const backtest = { raw: CUTS.map((C) => testAt(C, 1)), scaled: CUTS.map((C) => testAt(C, lagScale)), scale: lagScale }

  // ------------------------------------------------- the simulation
  const future = kept.filter(open)
  const order = []
  {
    const seen = new Set()
    const visit = (n) => {
      if (seen.has(n.id)) return
      seen.add(n.id)
      for (const id of n._all) { const p = live.get(id); if (open(p)) visit(p) }
      for (const m of mechanisms) if (m.from !== n.id && accelOf(n)?.mech.includes(m)) visit(live.get(m.from))
      order.push(n)
    }
    future.forEach(visit)
  }
  const fixed = (p) => p._date.at
  // When everything it needs is in place, on its earliest route. Each
  // route's prerequisites: the latest one already done, and the open ones.
  const needs = new Map()
  const needsOf = (n) => {
    if (!needs.has(n.id)) {
      const split = (ids) => { const ps = techPrereqs(ids); return { done: Math.max(-Infinity, ...ps.filter((p) => !open(p)).map(fixed)), open: ps.filter(open).map((p) => p.id) } }
      needs.set(n.id, n._routes.length ? n._routes.map((r) => split([...n._requires, ...r.requires])) : [split(n._requires)])
    }
    return needs.get(n.id)
  }
  const readyOf = (n, dateOf) => {
    let best = Infinity
    for (const r of needsOf(n)) {
      let t = r.done
      for (const id of r.open) { const d = dateOf(id); if (d > t) t = d }
      if (t < best) best = t
    }
    return best
  }
  const sortedLags = recentLags.map((x) => x * lagScale).sort((a, b) => a - b)
  const longer = new Map()
  const longerThan = (waited) => {
    const k = Math.round(waited * 4)
    if (!longer.has(k)) {
      let l = sortedLags.filter((x) => x >= k / 4)
      if (l.length < 20) l = sortedLags.slice(-20)
      longer.set(k, l)
    }
    return longer.get(k)
  }
  const DRAWS = 3000
  const sampleFrom = (q, u) => {
    // Inverse of a distribution given as quantiles at LEVELS, linear in
    // log years between them and normal beyond.
    const xs = q.map((y) => (Number.isFinite(y) ? X(y) : Infinity))
    const at = (x) => (Number.isFinite(x) ? Y(x) : Infinity)
    const z = (() => { let lo = -8, hi = 8; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (normCdf(m) < u) lo = m; else hi = m } return lo })()
    const zs = LEVELS.map((lv) => Z[lv])
    if (z <= zs[0]) return at(xs[0] + (z - zs[0]) * (xs[1] - xs[0]) / (zs[1] - zs[0]))
    for (let i = 1; i < zs.length; i++) if (z <= zs[i]) return !Number.isFinite(xs[i]) ? Infinity : at(xs[i - 1] + ((z - zs[i - 1]) / (zs[i] - zs[i - 1])) * (xs[i] - xs[i - 1]))
    const k = zs.length - 1
    return at(xs[k] + (z - zs[k]) * (xs[k] - xs[k - 1]) / (zs[k] - zs[k - 1]))
  }

  // Calibration for the run from the judgment: with what it needs and the
  // AI milestones at their likely dates, the work each window stands for.
  const likely = (id) => { const p = live.get(id); return open(p) ? p._date.at : fixed(p) }
  const calib = new Map()
  for (const n of order) {
    const a = accelOf(n)
    const start = Math.max(NOW, readyOf(n, likely))
    const J = judged(n)
    const w = (y) => workBetween(a, start, Math.max(start, y), likely)
    const med = w(n._date.at)
    // Its own uncertainty is three quarters of its window's, as some of the
    // window's width is uncertainty about what it needs.
    const lo = Math.log(Math.max(0.1, med)) - Math.log(Math.max(0.05, w(qOf(J, 0.1)))), hi = Math.log(Math.max(0.1, w(qOf(J, 0.9)))) - Math.log(Math.max(0.1, med))
    calib.set(n.id, { a, med: Math.max(0.1, med), sLo: Math.max(0.05, (0.75 * lo) / -Z[0.1]), sHi: Math.max(0.05, (0.75 * hi) / Z[0.9]), early: n._date.at < start - 0.25, start })
  }

  const simulate = (mode, seed, withAI = true) => {
    const rand = rng(seed)
    const draws = new Map(order.map((n) => [n.id, new Float64Array(DRAWS)]))
    const trends = new Map(order.map((n) => [n.id, mode === "outside" ? trendOf(n) : null]))
    for (let d = 0; d < DRAWS; d++) {
      const date = new Map()
      const dateOf = (id) => date.get(id) ?? likely(id)
      for (const n of order) {
        const a = withAI ? accelOf(n) : null
        const ready = readyOf(n, dateOf)
        let t
        if (mode === "judged") {
          const c = calib.get(n.id)
          const z = gauss(rand)
          const work = c.med * Math.exp(z * (z < 0 ? c.sLo : c.sHi))
          t = finish(a, Math.max(NOW, ready), work, dateOf)
        } else {
          const tr = trends.get(n.id)
          if (tr && Number.isFinite(qOf(tr.q, 0.5))) t = Math.max(ready, sampleFrom(tr.q, rand()))
          else if (Number.isFinite(ready)) {
            // The lags seen since 1950, at least as long as it has waited.
            const waited = Math.max(0, NOW - ready)
            const pool = longerThan(waited)
            const lag = pool[Math.floor(rand() * pool.length)] * Math.exp(0.15 * gauss(rand))
            const total = Math.max(waited + 0.1, lag)
            // The part still ahead of us is work at today's pace, sped up
            // as AI milestones arrive.
            t = finish(a, Math.max(NOW, ready), ready + total - Math.max(NOW, ready), dateOf)
          } else t = sampleFrom(judged(n), rand())
        }
        date.set(n.id, t)
        draws.get(n.id)[d] = t
      }
    }
    return draws
  }
  const sims = { outside: simulate("outside", 1), base: simulate("outside", 1, false), judged: simulate("judged", 2) }
  const summarize = (arr) => {
    const a = Array.from(arr).sort((x, y) => x - y)
    return LEVELS.map((q) => sortedQuantile(a, q))
  }

  const ranks = new Map()
  const rankOf = (id) => {
    if (!ranks.has(id)) {
      const v = sims.judged.get(id)
      const idx = Array.from(v.keys()).sort((i, j) => v[i] - v[j])
      const r = new Float64Array(v.length)
      idx.forEach((i, k) => (r[i] = k))
      ranks.set(id, r)
    }
    return ranks.get(id)
  }
  // What would move it most: the AI milestone whose speedup touches the
  // largest share of its work, and its date in the earliest and latest
  // thirds of the runs from the judgment.
  const conditional = (n) => {
    const a = accelOf(n)
    if (!a) return null
    const impact = new Map()
    for (const m of a.mech) for (const w of m.work) if (a.shares[w]) impact.set(m.from, (impact.get(m.from) ?? 0) + a.shares[w] * (1 - 1 / m.speedup[w]))
    // Through its prerequisites too: the milestone with the most draws in
    // common counts, so take the one most correlated with its date.
    const own = sims.judged.get(n.id)
    const corr = (src) => {
      if (!sims.judged.get(src)) return 0
      const ra = rankOf(n.id), rb = rankOf(src), m = (DRAWS - 1) / 2
      let sab = 0, saa = 0
      for (let i = 0; i < DRAWS; i++) { sab += (ra[i] - m) * (rb[i] - m); saa += (ra[i] - m) ** 2 }
      return sab / saa
    }
    const cands = [...new Set(mechanisms.map((m) => m.from))].filter((id) => id !== n.id && open(live.get(id)))
    const best = cands.map((id) => ({ id, r: corr(id) })).sort((x, y) => y.r - x.r)[0]
    if (!best || best.r < 0.08) return null
    const src = sims.judged.get(best.id)
    const idx = Array.from(src.keys()).sort((i, j) => src[i] - src[j])
    const third = Math.floor(DRAWS / 3)
    const med = (ids) => sortedQuantile(ids.map((i) => own[i]).sort((x, y) => x - y), 0.5)
    return {
      source: best.id, r: Math.round(best.r * 100) / 100,
      direct: Math.round((impact.get(best.id) ?? 0) * 100) / 100,
      earlyBy: src[idx[third - 1]], early: med(idx.slice(0, third)),
      lateAfter: src[idx[DRAWS - third]], late: med(idx.slice(DRAWS - third)),
    }
  }

  // --------------------------------------------------------- the pool
  const results = new Map()
  for (const n of future) {
    const J = judged(n)
    const inputs = []
    const horizonFactor = (q) => { const yrs = qOf(q, 0.5) - NOW; return yrs <= 10 ? 1 : yrs <= 25 ? 0.67 : 0.5 }
    for (const f of forecasts.get(n.id) ?? []) {
      let w = WEIGHTS[f.kind] * ((f.kind === "projection" || f.kind === "model" || f.kind === "target") ? 1 : horizonFactor(f.q))
      if (f.match && f.match !== "same") w *= 0.5
      if (f.asof != null && NOW - f.asof > 2) w *= 0.5
      inputs.push({ label: f.title, kind: f.kind, weight: w, q: f.q, url: f.url, match: f.match ?? "same", asof: f.asof, note: f.note, ...(f.kind === "target" ? { year: Number(f.year) } : {}) })
    }
    const tr = trendOf(n)
    if (tr && Number.isFinite(qOf(tr.q, 0.5))) {
      const ahead = qOf(tr.q, 0.5) - tr.last
      let w = WEIGHTS.trend * tr.r2 * (ahead <= tr.record / 2 ? 1 : ahead <= tr.record ? 0.67 : 0.33)
      // Behind its own trend line: the line is no longer a good guide.
      inputs.push({ label: "Its metric's trend", kind: "trend", weight: w, q: tr.q })
    }
    // Forecast paths drawn on the metric (projections, surveys, models):
    // the year each crosses the threshold, as a point.
    if (tr) for (const sc of tr.scenarios) {
      if (!WEIGHTS[sc.kind] || sc.kind === "trend") continue
      const y = n._scenarioYears?.get(sc.id)
      if (y == null) continue
      inputs.push({ label: sc.name, kind: sc.kind, weight: WEIGHTS[sc.kind] * 0.67, q: fromNormal(X(y), DEFAULT_SIGMA[sc.kind] ?? 0.5) })
    }
    const outside = summarize(sims.outside.get(n.id))
    // A milestone's run from base rates follows its trend, so it would
    // count the trend twice.
    if (!(tr && Number.isFinite(qOf(tr.q, 0.5)))) inputs.push({ label: accelOf(n) ? "Base rates, with AI speedups" : "Base rates", kind: "outside", weight: WEIGHTS.outside, q: outside })
    const poolOf = (list) => {
      const tot = list.reduce((a, i) => a + i.weight, 0)
      return LEVELS.map((lv, k) => {
        // Some source says never at this level: pool the share that does.
        const fin = list.filter((i) => Number.isFinite(i.q[k]))
        const wf = fin.reduce((a, i) => a + i.weight, 0)
        if (wf < tot / 2) return Infinity
        return Y(fin.reduce((a, i) => a + i.weight * X(i.q[k]), 0) / wf)
      })
    }
    // A forecast for a looser bar is a lower bound (this can't come before
    // it), and one for a stricter bar an upper bound: each counts only
    // where the pool of the others is on the wrong side of it.
    const same = inputs.filter((i) => !i.match || i.match === "same")
    const base = poolOf(same)
    const bounded = inputs.map((i) => !i.match || i.match === "same" ? i
      : { ...i, q: i.q.map((v, k) => (i.match === "looser" ? Math.max(v, base[k]) : Math.min(v, base[k]))) })
    const pooled = poolOf(bounded)
    const lo = qOf(pooled, 0.25), hi = qOf(pooled, 0.75)
    const outsideOnly = inputs.every((i) => i.kind === "outside")
    // Outside the middle half by more than half a year, or a tenth of the
    // time from now, so rounding doesn't raise flags.
    const tol = Math.max(0.5, 0.1 * (n._date.at - NOW))
    const flag = n._date.at < lo - tol ? "earlier" : n._date.at > hi + tol ? "later" : null
    results.set(n.id, {
      judged: J, pooled, inputs, flag, outsideOnly,
      sim: { outside, base: summarize(sims.base.get(n.id)), judged: summarize(sims.judged.get(n.id)), early: calib.get(n.id)?.early || undefined },
      cond: conditional(n),
      accel: accelOf(n) && { shares: accelOf(n).shares, by: accelOf(n).mech.map((m) => m.id) },
    })
  }

  return { results, bands, backtest, mechanisms, work: WORK, draws: DRAWS }
}
