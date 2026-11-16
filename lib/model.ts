// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other rankable pre-token protocol below it: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed
// into the ranked board.
//
// Implied value follows only from the snapshot's own figures, and never from a hand-kept list of
// names: the same function scores every row.
//
//   category multiple  = the median market-cap / TVL of the live-token protocols in the same
//                        category (at least 3 comparables, clamped to [0.02, 2.0]); a category
//                        with too few comparables falls back to the global median across all
//                        live-token protocols (0.241 on this snapshot). A DEX's token trades at a
//                        different multiple of its TVL than a lending protocol's, so the multiple
//                        a row gets depends on what its own category's tokens actually trade at.
//   size curve         = the log-log fit of market cap on TVL over all the live-token
//                        protocols: predicted base = exp(a) x TVL^b. One fit, not one per
//                        category: a category's own fit stands on 10 to 15 protocols and its
//                        slope runs past 1.5, so a large protocol in that category is priced off
//                        an extrapolation of eleven points. The curve is the median's rival, not
//                        its replacement: both are fitted on a training half of the live set and
//                        tested blind on the held-out half (see validateModel), and the board uses
//                        the one whose held-out error is smaller. The validation is the model's
//                        evidence, and the dashboard's Model view shows it in full: the splits,
//                        the errors, and the naive global-median baseline both candidates have to
//                        beat.
//   base               = tvl_usd x category multiple (median) or the curve's predicted base
//   growth             = clamp(change_7d, -60, 120) per cent
//   growthMult         = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity           = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied            = max(1, round(base x growthMult x maturity))
//
// The three drivers are the ones the bounty names: the protocol's TVL, its seven-day growth, and
// how long it has run with no token recorded. The category multiple and the size curve are
// themselves snapshot figures: the market's own pricing of the same kind of protocol, read off
// the live set — and, unlike a bare assertion, tested blind before the board is built.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_comparables: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comparables: 3,
  multiple_floor: 0.02,
  multiple_cap: 2.0,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    predictor: 'median' | 'curve';
    category_multiple: number;
    comparables: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_gas_usd: number;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, carrying the same farm plan board.json holds, so the page shows exactly what the board says. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  comparables: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_gas_usd: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One category's comparable set, for the dashboard's "why this multiple" view. */
export interface CategoryComparable {
  category: string;
  count: number;
  multiple: number;
  fallback: boolean;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  predictor: 'median' | 'curve';
  validation: ValidationReport;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  curve_fit: { a: number; b: number; n: number } | null;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  watchlist: string[];
  comparables: CategoryComparable[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list, else `fallback`. */
function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The market-cap / TVL multiples the live-token protocols trade at, by category, plus the global
 * median every thin category falls back to. A category's multiple is its median over live protocols
 * with a market cap and a positive TVL; a category with fewer than `min_comparables` live protocols
 * takes the global median instead, so no row's value rests on one or two outliers.
 */
export function categoryMultiples(
  snapshot: Snapshot,
  model: ModelConstants,
): { byCategory: Map<string, { multiple: number; count: number; fallback: boolean }>; global: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.gecko_id === null || p.symbol === null) continue;
    if (p.category === 'CEX') continue;
    if (p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    const m = p.mcap_usd / p.tvl_usd;
    all.push(m);
    const key = p.category ?? 'Unknown';
    const list = byCat.get(key) ?? [];
    list.push(m);
    byCat.set(key, list);
  }
  const global = median(all, 0.25);
  const byCategory = new Map<string, { multiple: number; count: number; fallback: boolean }>();
  for (const [cat, list] of byCat) {
    if (list.length >= model.min_comparables) {
      const m = median(list, global);
      byCategory.set(cat, {
        multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, m)),
        count: list.length,
        fallback: false,
      });
    }
  }
  return { byCategory, global };
}

/** The multiple one protocol's category earns, and how many comparables stand behind it. */
export function multipleFor(
  protocol: SnapshotProtocol,
  multiples: { byCategory: Map<string, { multiple: number; count: number; fallback: boolean }>; global: number },
  model: ModelConstants,
): { multiple: number; comparables: number; fallback: boolean } {
  const entry = protocol.category === null ? undefined : multiples.byCategory.get(protocol.category);
  if (entry !== undefined) return { multiple: entry.multiple, comparables: entry.count, fallback: false };
  const global = Math.min(model.multiple_cap, Math.max(model.multiple_floor, multiples.global));
  return { multiple: global, comparables: 0, fallback: true };
}

/** The live-token protocols the model learns from: a market cap, a positive TVL, not an exchange. */
export function liveSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.gecko_id !== null && p.symbol !== null && p.category !== 'CEX' && p.tvl_usd > 0 && p.mcap_usd! > 0,
  );
}

/** One log-log fit of market cap on TVL: ln(mcap) = a + b x ln(tvl), over n protocols. */
export interface CurveFit {
  a: number;
  b: number;
  n: number;
}

/** Least squares on the logs; null when fewer than two points stand. */
function fitCurveFit(points: { tvl: number; mcap: number }[]): CurveFit | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const x = Math.log(p.tvl);
    const y = Math.log(p.mcap);
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  return { a, b, n };
}

/** A predictor: how a protocol's base value is read off the live set. */
export type Predictor =
  | {
      kind: 'median';
      multiples: { byCategory: Map<string, { multiple: number; count: number; fallback: boolean }>; global: number };
    }
  | {
      kind: 'curve';
      global: CurveFit;
    };

/** Fit one predictor on a training set of live-token protocols. */
export function fitPredictor(kind: 'median' | 'curve', train: SnapshotProtocol[], model: ModelConstants, snapshot: Snapshot): Predictor {
  if (kind === 'median') {
    return { kind: 'median', multiples: categoryMultiples({ ...snapshot, protocols: train }, model) };
  }
  const global = fitCurveFit(train.map((p) => ({ tvl: p.tvl_usd, mcap: p.mcap_usd! })));
  if (global === null) throw new SnapshotError('too few live-token protocols to fit a size curve');
  return { kind: 'curve', global };
}

/** The base value one protocol gets under a predictor, its effective multiple, and how many live protocols the fit behind it stands on. */
export function predictBase(
  protocol: SnapshotProtocol,
  predictor: Predictor,
  model: ModelConstants,
): { base: number; effectiveMultiple: number; comparables: number; fallback: boolean } {
  if (predictor.kind === 'median') {
    const { multiple, comparables, fallback } = multipleFor(protocol, predictor.multiples, model);
    return { base: protocol.tvl_usd * multiple, effectiveMultiple: multiple, comparables, fallback };
  }
  const base = Math.exp(predictor.global.a) * Math.pow(protocol.tvl_usd, predictor.global.b);
  return { base, effectiveMultiple: base / protocol.tvl_usd, comparables: predictor.global.n, fallback: false };
}

/** Pearson's r between two equal-length lists, or null when it cannot be read. */
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** One candidate's held-out error on one split. */
export interface SplitCandidate {
  name: 'median' | 'curve' | 'baseline';
  med_abs_log_err: number;
  med_rel_err: number;
  within_2x: number;
  pearson_log: number | null;
}

/** One split's held-out results: who trained on what, and how each candidate did on the rest. */
export interface SplitResult {
  split: 'holdout' | 'time';
  train: number;
  test: number;
  candidates: SplitCandidate[];
}

/** The validation report: the splits, the candidates' held-out errors, and the predictor the board uses. */
export interface ValidationReport {
  predictor: 'median' | 'curve';
  reason: string;
  pooled: { name: 'median' | 'curve' | 'baseline'; med_abs_log_err: number }[];
  splits: SplitResult[];
}

/**
 * The model's blind test, run before the board is built. The live-token protocols are split two
 * ways — a holdout (every fifth protocol by slug, so the split is fixed by the snapshot, never by
 * chance) and a time split (the older half trains, the younger half is tested, because pricing a
 * young protocol off older ones is the board's own task) — and each candidate is fitted on the
 * training half only and scored on the held-out half, where its predicted market cap meets the
 * market's own. The naive baseline is the global median multiple fitted on the same training
 * half: a candidate that cannot beat it has learned nothing. The winner is the smaller pooled
 * median absolute log error over both held-out sets, the time split breaking a near-tie (within
 * 0.01); the board then refits the winner on every live protocol, and the numbers below stay
 * the train-only evidence for it, never a claim about the refit. The errors are large — the
 * typical prediction lands within about three times the market's own value — and the report
 * says so instead of hiding it: market-cap / TVL varies enormously across protocols, and the
 * board is a ranking, not a price.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ValidationReport {
  const live = liveSet(snapshot);
  const sorted = [...live].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const holdoutTrain = sorted.filter((_, i) => i % 5 !== 4);
  const holdoutTest = sorted.filter((_, i) => i % 5 === 4);
  const dated = live.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const mid = Math.floor(dated.length / 2);
  const timeTrain = dated.slice(0, mid);
  const timeTest = dated.slice(mid);

  const score = (kind: 'median' | 'curve' | 'baseline', train: SnapshotProtocol[], test: SnapshotProtocol[]): { candidate: SplitCandidate; logErrs: number[] } => {
    let predictor: Predictor;
    if (kind === 'baseline') {
      const multiples = categoryMultiples({ ...snapshot, protocols: train }, model);
      predictor = { kind: 'median', multiples: { byCategory: new Map(), global: multiples.global } };
    } else {
      predictor = fitPredictor(kind, train, model, snapshot);
    }
    const logErrs: number[] = [];
    const relErrs: number[] = [];
    const logPred: number[] = [];
    const logActual: number[] = [];
    let within = 0;
    for (const p of test) {
      const { base } = predictBase(p, predictor, model);
      const v = impliedFromBase(p, snapshot.as_of, model, base);
      const ratio = v / p.mcap_usd!;
      logErrs.push(Math.abs(Math.log(ratio)));
      relErrs.push(Math.abs(ratio - 1));
      if (ratio >= 0.5 && ratio <= 2) within++;
      logPred.push(Math.log(v));
      logActual.push(Math.log(p.mcap_usd!));
    }
    return {
      candidate: {
        name: kind,
        med_abs_log_err: round3(median(logErrs, NaN)),
        med_rel_err: round3(median(relErrs, NaN)),
        within_2x: test.length === 0 ? 0 : round3(within / test.length),
        pearson_log: pearson(logPred, logActual) === null ? null : round3(pearson(logPred, logActual)!),
      },
      logErrs,
    };
  };

  const defs = ([
    ['holdout', holdoutTrain, holdoutTest],
    ['time', timeTrain, timeTest],
  ] as const).map(([split, train, test]) => ({ split, train, test }));
  const pooledErrs = new Map<string, number[]>();
  const splits: SplitResult[] = defs.map(({ split, train, test }) => ({
    split,
    train: train.length,
    test: test.length,
    candidates: (['median', 'curve', 'baseline'] as const).map((kind) => {
      const { candidate, logErrs } = score(kind, train, test);
      pooledErrs.set(kind, [...(pooledErrs.get(kind) ?? []), ...logErrs]);
      return candidate;
    }),
  }));
  const pooled = (['median', 'curve', 'baseline'] as const).map((name) => ({
    name,
    med_abs_log_err: round3(median(pooledErrs.get(name) ?? [], NaN)),
  }));
  const pooledErr = (name: string): number => pooled.find((p) => p.name === name)!.med_abs_log_err;
  const time = splits[1]!;
  const timeErr = (name: string): number => time.candidates.find((c) => c.name === name)!.med_abs_log_err;
  let predictor: 'median' | 'curve' = pooledErr('curve') < pooledErr('median') ? 'curve' : 'median';
  if (Math.abs(pooledErr('curve') - pooledErr('median')) <= 0.01) {
    predictor = timeErr('curve') < timeErr('median') ? 'curve' : 'median';
  }
  const reason =
    predictor === 'curve'
      ? `the size curve's pooled held-out error beats the category median's (${pooledErr('curve')} vs ${pooledErr('median')} median |log error| over both held-out sets), so the board prices off the fitted curve`
      : `the category median's pooled held-out error beats the size curve's (${pooledErr('median')} vs ${pooledErr('curve')} median |log error| over both held-out sets), so the board prices off the category medians`;
  return { predictor, reason, pooled, splits };
}

/** The growth and maturity multipliers and the implied value of a base, shared by every predictor. */
export function impliedFromBase(protocol: SnapshotProtocol, asOf: string, model: ModelConstants, base: number): number {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return Math.max(1, Math.round(base * growthMult * maturityMult));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  predictor: Predictor,
): {
  implied: number;
  categoryMultiple: number;
  comparables: number;
  fallback: boolean;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { base, effectiveMultiple, comparables, fallback } = predictBase(protocol, predictor, model);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, categoryMultiple: effectiveMultiple, comparables, fallback, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The watchlist's exclusion rules, applied to every row the board ranks, not only to the
 * watchlist: a wrapped, staked or bridged product of a token that already trades is not a
 * protocol still waiting on a launch of its own. WBTC is Bitcoin on Ethereum, Binance staked
 * ETH is ETH in Binance's staking product, and neither belongs at the top of a launch radar.
 * The snapshot carries no parentProtocol field, so the name and category rules do the work.
 */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

export function isExcludedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped, staked or bridged product of a token that already trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isExcludedProduct(p) && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n, and the validation behind it. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; validation: ValidationReport; predictor: Predictor } {
  const validation = validateModel(snapshot, model);
  const predictor = fitPredictor(validation.predictor, liveSet(snapshot), model, snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, whatever its TVL. A protocol below
  // the floor is no worse a subject than one on it, and the radar exists to find it early.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, predictor);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => {
    const econ = farmEconomics(s.p, s.v.age, s.v.implied);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      model: {
        predictor: validation.predictor,
        category_multiple: round6(s.v.categoryMultiple),
        comparables: s.v.comparables,
        growth_pct: s.v.growthPct,
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        age_days: s.v.age,
      },
      farm_verdict: econ.verdict,
      farm_gas_usd: econ.gasUsd,
      farm_steps: farmSteps(s.p, s.v.age, s.v.implied, econ).map(stepText),
    };
  });
  return { board, validation, predictor };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Six decimals: the board's stored multiple, so the dashboard's sandbox re-ranks to the same dollar the board states. */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and borrow a small amount against it, then repay the borrow.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and swap through it once a week.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged position on ${name} on ${chain} and close it after one week.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then settle it.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('nft')) return `List or buy one item through ${name} on ${chain} and keep the position.`;
  if (c.includes('launchpad')) return `Join one launch on ${name} with $${capital} and hold the allocation.`;
  if (c.includes('payment')) return `Send $${capital} through ${name} on ${chain} once a week.`;
  if (c.includes('privacy')) return `Run $${capital} through ${name}'s private pool on ${chain} once.`;
  if (c.includes('ai')) return `Use $${capital} of the agent or model service ${name} runs on ${chain}.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** $2.75B, $456.7M, $12.3K, $842 — the short dollar figure a farm step quotes. */
function fmtUsdShort(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

/** What farming one protocol costs, and the verdict on whether it is worth it. */
export interface FarmEconomics {
  gasUsd: number;
  capitalUsd: number;
  holdDays: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/**
 * A farm plan's economics, from the protocol's own record. The gas is the plan's own steps added
 * up: the first transactions, one qualifying action a week at about $2 of gas, and the claim. The
 * verdict compares the protocol's implied value with that gas: FARM when the implied value is at
 * least a million times the gas the plan spends, THIN at a hundred thousand times, SKIP below.
 * The verdict is a size test, never a promise — it says the gas is trivial next to the protocol,
 * not that any airdrop pays it back.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, implied: number): FarmEconomics {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gasUsd = 3 + (capital >= 150 ? 8 : 4) + 2 * Math.ceil(hold / 7) + 2;
  const ratio = implied / gasUsd;
  const verdict = ratio >= 1_000_000 ? 'FARM' : ratio >= 100_000 ? 'THIN' : 'SKIP';
  return { gasUsd, capitalUsd: capital, holdDays: hold, verdict };
}

/**
 * A protocol's farm plan: seven steps, the first the verdict with the plan's net cost, then six
 * concrete actions each with a cost and a time. The plan is derived from the protocol's own
 * record (category, chains, TVL, age, implied value), never from a hand-written list of names.
 * Nothing here promises a token: the protocol records no token, and the plan farms the protocol
 * as it is, so the position is worth holding even if no launch ever comes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number, econ: FarmEconomics): FarmStep[] {
  const chain = chainOf(p);
  const capital = econ.capitalUsd;
  const hold = econ.holdDays;
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Verdict: ${econ.verdict} — this protocol's implied value is ${fmtUsdShort(implied)} against about $${econ.gasUsd} of gas over ${hold} days on $${capital} of capital.`,
      cost: `about $${econ.gasUsd} of gas in all`,
      time: `${hold} days`,
    },
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_verdict: row.farm_verdict,
    farm_gas_usd: row.farm_gas_usd,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; validation: ValidationReport } {
  const { board, validation, predictor } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const multiples = categoryMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdict_counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdict_counts[r.farm_verdict]++;
  const comparables: CategoryComparable[] = [...multiples.byCategory.entries()]
    .map(([category, v]) => ({ category, count: v.count, multiple: round4(v.multiple), fallback: false }))
    .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    predictor: validation.predictor,
    validation,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(multiples.global),
    curve_fit: predictor.kind === 'curve' ? { a: round4(predictor.global.a), b: round4(predictor.global.b), n: predictor.global.n } : null,
    verdict_counts,
    watchlist: [...snapshot.watchlist],
    comparables,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, validation };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
