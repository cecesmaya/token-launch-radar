// Token Launch Radar — the dashboard's whole behaviour, no network, no framework.
//
// The data arrives as window.RADAR from ../data.js, written by main.ts from the same board that
// board.json holds, so the page and the board can never disagree. The farm steps shown here are
// the board's own steps, not a second copy of them.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const WATCH = new Set(R.watchlist);

/** Escape text for HTML: names come from DefiLlama, never from us. */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** $2.75B, $456.7M, $12.3K, $842. */
function fmtUsd(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

/** +12.5%, -4.0%, or — when DefiLlama reports none. */
function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

/** 214d, or — when DefiLlama reports no listing date. */
function fmtAge(d) {
  return d === null || d === undefined ? '—' : d + 'd';
}

/** The model's three multipliers, recomputed under the sandbox's constants. */
function sandboxImplied(row, sb) {
  const growth = Math.min(120, Math.max(-60, row.change_7d ?? 0));
  const growthMult = 1 + (growth / 100) * sb.gw;
  const age = row.age_days ?? 365;
  const maturity = sb.mf + (Math.min(Math.max(age, 0), 1095) / 1095) * (1 - sb.mf);
  const mult = Math.min(row.category_multiple, sb.cap);
  return Math.max(1, Math.round(row.tvl_usd * mult * growthMult * maturity));
}

const state = {
  view: 'board', q: '', cat: '', chain: '', minTvl: 0, gainers: false, verdict: '',
  sort: 'implied', detail: null, sb: { gw: 0.5, mf: 0.6, cap: 2.0 },
};

/** The rows the board shows now: filtered, then sorted, then re-ranked under the sandbox. */
function visibleRows() {
  const q = state.q.trim().toLowerCase();
  let rows = R.rows.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (r.tvl_usd < state.minTvl) return false;
    if (state.gainers && !(r.change_7d !== null && r.change_7d > 0)) return false;
    if (state.verdict && r.farm_verdict !== state.verdict) return false;
    return true;
  });
  const sb = state.sb;
  const scored = rows.map((r) => ({ r, v: sandboxImplied(r, sb) }));
  const key = {
    implied: (a, b) => b.v - a.v,
    tvl: (a, b) => b.r.tvl_usd - a.r.tvl_usd,
    growth: (a, b) => (b.r.change_7d ?? -999) - (a.r.change_7d ?? -999),
    age: (a, b) => (b.r.age_days ?? -1) - (a.r.age_days ?? -1),
  }[state.sort];
  scored.sort((a, b) => key(a, b) || (a.r.slug < b.r.slug ? -1 : 1));
  return scored;
}

function renderBoard() {
  const scored = visibleRows();
  $('count').textContent = scored.length + ' of ' + R.rows.length + ' protocols — ' +
    R.watchlist_size + ' on the watchlist, ' + R.early_size + ' found early below the floor.';
  $('rows').innerHTML = scored.map(({ r, v }) => {
    const cls = r.change_7d === null ? '' : r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : '';
    const vcls = r.farm_verdict === 'FARM' ? 'verdict-farm' : r.farm_verdict === 'THIN' ? 'verdict-thin' : 'verdict-skip';
    return '<tr data-slug="' + esc(r.slug) + '"><td class="rank">' + r.rank + '</td>' +
      '<td><span class="name">' + esc(r.name) + '</span>' +
      (WATCH.has(r.slug) ? '<span class="watch">WATCHLIST</span>' : '') +
      '<span class="verdict ' + vcls + '">' + r.farm_verdict + '</span></td>' +
      '<td>' + esc(r.category ?? '—') + '</td>' +
      '<td>' + r.chains.slice(0, 3).map((c) => '<span class="tag">' + esc(c) + '</span>').join('') +
      (r.chains.length > 3 ? '<span class="tag">+' + (r.chains.length - 3) + '</span>' : '') + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + cls + '">' + fmtPct(r.change_7d) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num implied">' + fmtUsd(v) + '</td></tr>';
  }).join('');
}

function renderDetail() {
  const r = R.rows.find((x) => x.slug === state.detail);
  if (!r) { showView('board'); return; }
  const math = 'implied = TVL × category multiple × growth × maturity\n' +
    fmtUsd(r.tvl_usd) + ' × ' + r.category_multiple.toFixed(3) +
    (R.predictor === 'curve'
      ? '  (size curve over ' + r.comparables + ' live protocols)'
      : (r.comparables > 0 ? '  (' + r.comparables + ' live comparables in ' + (r.category ?? 'this category') + ')'
        : '  (global median — fewer than 3 live comparables in ' + (r.category ?? 'this category') + ')')) +
    '\n× ' + r.growth_multiplier.toFixed(4) + ' growth × ' + r.maturity_multiplier.toFixed(4) +
    ' maturity = ' + fmtUsd(r.implied_value_usd);
  $('detail').innerHTML =
    '<h2>' + esc(r.name) + ' <span class="tag">rank #' + r.rank + '</span>' +
    (WATCH.has(r.slug) ? '<span class="watch">WATCHLIST</span>' : '') + '</h2>' +
    '<p class="hint">' + esc(r.category ?? 'Uncategorised') + ' · ' +
    r.chains.map(esc).join(', ') + ' · tracked since ' + esc(r.listed_at ?? 'unknown') + '</p>' +
    '<div class="kv">' +
    '<div><b>' + fmtUsd(r.tvl_usd) + '</b><span>Total value locked</span></div>' +
    '<div><b class="' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : '') + '">' + fmtPct(r.change_7d) + '</b><span>TVL change, 7 days</span></div>' +
    '<div><b>' + fmtAge(r.age_days) + '</b><span>Days tracked with no token recorded</span></div>' +
    '<div><b>' + fmtUsd(r.implied_value_usd) + '</b><span>Implied value if it launched today</span></div>' +
    '</div>' +
    '<h2>Why this value</h2><div class="math">' + esc(math) + '</div>' +
    (R.predictor === 'curve'
      ? '<p class="hint">The multiple is the size curve’s effective multiple at this TVL: the curve ' +
        'fits market cap on TVL over ' + R.curve_fit.n + ' live-token protocols ' +
        '(ln mcap = ' + R.curve_fit.a.toFixed(2) + ' + ' + R.curve_fit.b.toFixed(2) + ' × ln TVL), so a ' +
        'protocol’s multiple falls as its TVL grows — the market pays less per dollar of TVL at ' +
        'size. The curve was chosen over the category medians by a blind test on held-out live ' +
        'protocols; the Model tab shows the test. The growth multiplier clamps the 7-day change ' +
        'to −60…+120% at half weight; maturity rises from 0.6 to 1.0 over three years tracked.</p>'
      : '<p class="hint">The multiple is the median market-cap / TVL of the live-token protocols in ' +
        esc(r.category ?? 'its category') + '. A category with fewer than 3 live comparables falls back ' +
        'to the global median of ' + R.global_multiple.toFixed(3) + '. The growth multiplier clamps the ' +
        '7-day change to −60…+120% at half weight; maturity rises from 0.6 to 1.0 over three years tracked.</p>') +
    '<h2>How to farm it</h2>' +
    '<ol class="steps">' + r.farm_steps.map((s) => {
      const i = s.indexOf(' Cost: ');
      const text = i >= 0 ? s.slice(0, i) : s;
      const meta = i >= 0 ? s.slice(i + 1) : '';
      return '<li>' + esc(text) + '<span class="meta">' + esc(meta) + '</span></li>';
    }).join('') + '</ol>' +
    '<p class="hint">This plan farms the protocol as it is, so the position is worth holding even if ' +
    'no token ever comes. DefiLlama records no token for ' + esc(r.name) + ' — that is its record, ' +
    'not proof that it has none.</p>';
}

function renderLive() {
  $('liveRows').innerHTML = R.live.map((p) => {
    const cls = p.change_7d === null ? '' : p.change_7d > 0 ? 'pos' : p.change_7d < 0 ? 'neg' : '';
    return '<tr><td><span class="name">' + esc(p.name) + '</span></td>' +
      '<td>' + esc(p.category ?? '—') + '</td>' +
      '<td>' + p.chains.slice(0, 3).map((c) => '<span class="tag">' + esc(c) + '</span>').join('') + '</td>' +
      '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
      '<td class="num">' + (p.mcap_usd === null ? '—' : fmtUsd(p.mcap_usd)) + '</td>' +
      '<td class="num ' + cls + '">' + fmtPct(p.change_7d) + '</td></tr>';
  }).join('');
}

function renderModel() {
  const V = R.validation;
  const pooledRow = (p) => '<tr><td>' + esc(p.name) + '</td><td class="num">' + p.med_abs_log_err.toFixed(3) + '</td></tr>';
  const splitRows = V.splits.map((s) => {
    const c = (name) => s.candidates.find((x) => x.name === name);
    return '<tr><td>' + esc(s.split) + ' (' + s.train + ' train, ' + s.test + ' test)</td>' +
      '<td class="num">' + c('curve').med_abs_log_err.toFixed(3) + '</td>' +
      '<td class="num">' + c('median').med_abs_log_err.toFixed(3) + '</td>' +
      '<td class="num">' + c('baseline').med_abs_log_err.toFixed(3) + '</td></tr>';
  }).join('');
  const curveLine = R.predictor === 'curve' && R.curve_fit
    ? '<p>The board prices off the <strong>size curve</strong>: ln(market cap) = ' +
      R.curve_fit.a.toFixed(2) + ' + ' + R.curve_fit.b.toFixed(2) + ' × ln(TVL), fitted over ' +
      R.curve_fit.n + ' live-token protocols. The slope is below 1, so market cap grows more ' +
      'slowly than TVL: a protocol ten times as large is worth about three times as much, not ' +
      'ten. A flat multiple would overprice the giants and underprice the small ones; the curve ' +
      'is what the market’s own numbers say.</p>'
    : '<p>The board prices off the <strong>category medians</strong>: each protocol’s multiple is ' +
      'the median market-cap / TVL of the live-token protocols in its category.</p>';
  $('modelDoc').innerHTML =
    '<h2>The model, in one paragraph</h2>' +
    '<p>Every row is scored by the same function, from the snapshot’s own figures only. A ' +
    'protocol’s base is its TVL priced off the live-token set — the market’s own pricing of ' +
    'protocols that already trade — then growth multiplies by 1 + the clamped 7-day change at ' +
    'half weight, and maturity multiplies by 0.6 rising to 1.0 over three years tracked with no ' +
    'token. No protocol name is ever special-cased: the same function scores every row. Run it ' +
    'on a fresh snapshot and it finds the next launches early.</p>' +
    curveLine +
    '<p class="hint">Model ' + esc(R.model_version) + ' · snapshot ' + esc(R.as_of) + ' · ' +
    R.board_size + ' rows · ' + R.watchlist_size + ' watchlist · ' + R.early_size + ' early · ' +
    'verdicts ' + R.verdict_counts.FARM + ' FARM, ' + R.verdict_counts.THIN + ' THIN, ' +
    R.verdict_counts.SKIP + ' SKIP.</p>' +
    '<h2>Tested blind, before the board was built</h2>' +
    '<p>' + esc(V.reason) + '. Each candidate is fitted on a training half of the ' +
    'live-token protocols only and scored on the held-out half, where its predicted market cap ' +
    'meets the market’s own: the holdout takes every fifth protocol by slug, the time split ' +
    'trains on the older half and tests on the younger half. The baseline is the naive global ' +
    'median multiple on the same training half — a candidate that cannot beat it has learned ' +
    'nothing. The board then refits the winner on every live-token protocol; these numbers stay ' +
    'the train-only evidence for it.</p>' +
    '<p class="hint">The errors are large, and the table says so: the typical prediction lands ' +
    'within about three times the market’s own value (median |log error| near 1.15). Market-cap / ' +
    'TVL varies enormously across protocols, and the board is a ranking, not a price — the order ' +
    'is the claim, and the farm verdict is whether the gas is trivial next to the protocol.</p>' +
    '<table><thead><tr><th>Candidate</th><th class="num">Pooled median |log error|</th></tr></thead><tbody>' +
    V.pooled.map(pooledRow).join('') + '</tbody></table>' +
    '<h2>What else we tried — and rejected</h2>' +
    '<p>A variant is kept only when it beats the shipped model by a clear margin on held-out ' +
    'data and holds up across extra splits. Three were tried for this board; none did, so the ' +
    'model above stands. Every number below is recomputed from the sealed snapshot when the ' +
    'board is built.</p>' +
    '<table><thead><tr><th>Variant</th><th class="num">Pooled median |log error|</th><th class="num">Control</th><th>Kept?</th></tr></thead><tbody>' +
    (V.variants || []).map((v) =>
      '<tr><td>' + esc(v.name) + '</td><td class="num">' + v.pooled.toFixed(3) + '</td>' +
      '<td class="num">' + v.control_pooled.toFixed(3) + ' (' + esc(v.control) + ')</td>' +
      '<td>' + (v.kept ? 'kept' : 'rejected') + '</td></tr>').join('') + '</tbody></table>' +
    (V.variants || []).map((v) => '<p class="hint"><strong>' + esc(v.name) + ':</strong> ' + esc(v.note) + '</p>').join('') +
    '<table><thead><tr><th>Split</th><th class="num">Curve</th><th class="num">Category median</th><th class="num">Baseline</th></tr></thead><tbody>' +
    splitRows + '</tbody></table>';
  $('compRows').innerHTML = R.comparables.map((c) =>
    '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.count + '</td>' +
    '<td class="num">' + c.multiple.toFixed(3) + '</td></tr>').join('') +
    '<tr><td><strong>Global median (fallback)</strong></td><td class="num">—</td>' +
    '<td class="num">' + R.global_multiple.toFixed(3) + '</td></tr>';
}

function showView(view) {
  state.view = view;
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === view));
  $('view-board').hidden = view !== 'board';
  $('view-detail').hidden = view !== 'detail';
  $('view-live').hidden = view !== 'live';
  $('view-model').hidden = view !== 'model';
  $('controls').style.display = view === 'board' ? '' : 'none';
  if (view === 'board') renderBoard();
  if (view === 'detail') renderDetail();
  if (view === 'live') renderLive();
  if (view === 'model') renderModel();
  window.scrollTo(0, 0);
}

function fillSelect(id, values) {
  const el = $(id);
  values.forEach((v) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v; el.appendChild(o);
  });
}

function init() {
  // Deep links, so a screenshot can open one state directly: #detail/<slug>,
  // #live, #model, or #filtered/<category>.
  const hash = (location.hash || '').slice(1);
  if (hash.startsWith('detail/')) state.detail = decodeURIComponent(hash.slice(7));
  else if (hash === 'live' || hash === 'model') state.view = hash;
  else if (hash.startsWith('filtered/')) state.cat = decodeURIComponent(hash.slice(9));
  $('stats').innerHTML =
    '<div><b>' + R.board_size + '</b><span>protocols ranked</span></div>' +
    '<div><b>' + R.watchlist_size + '</b><span>watchlist</span></div>' +
    '<div><b>' + R.early_size + '</b><span>found early</span></div>' +
    '<div><b>' + fmtUsd(R.rows[0].implied_value_usd) + '</b><span>top implied value</span></div>';
  $('src').textContent = 'Source: ' + R.source + '. Snapshot date ' + R.as_of +
    '. Watchlist floor $' + R.floor_usd.toLocaleString('en-US') + ' TVL. Model ' + R.model_version + '.';
  fillSelect('cat', [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort());
  fillSelect('chain', [...new Set(R.rows.flatMap((r) => r.chains))].sort());
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.addEventListener('click', () => showView(b.dataset.view)));
  $('q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
  $('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
  $('chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
  $('minTvl').addEventListener('change', (e) => { state.minTvl = +e.target.value; renderBoard(); });
  $('gainers').addEventListener('change', (e) => { state.gainers = e.target.checked; renderBoard(); });
  $('verdict').addEventListener('change', (e) => { state.verdict = e.target.value; renderBoard(); });
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
  $('reset').addEventListener('click', () => {
    Object.assign(state, { q: '', cat: '', chain: '', minTvl: 0, gainers: false, verdict: '', sort: 'implied' });
    $('q').value = ''; $('cat').value = ''; $('chain').value = '';
    $('minTvl').value = '0'; $('gainers').checked = false; $('verdict').value = ''; $('sort').value = 'implied';
    renderBoard();
  });
  $('rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) { state.detail = tr.dataset.slug; showView('detail'); }
  });
  $('back').addEventListener('click', () => showView('board'));
  const sb = (id, out, fmt) => {
    $(id).addEventListener('input', (e) => {
      state.sb[id] = +e.target.value;
      $(out).textContent = fmt(+e.target.value);
      renderBoard();
    });
    $(out).textContent = fmt(+$(id).value);
  };
  sb('gw', 'gwOut', (v) => v.toFixed(2));
  sb('mf', 'mfOut', (v) => v.toFixed(2));
  sb('cap', 'capOut', (v) => v.toFixed(1) + '×');
  if (state.cat) $('cat').value = state.cat;
  if (state.detail) showView('detail');
  else if (state.view === 'live' || state.view === 'model') showView(state.view);
  else renderBoard();
}

init();
