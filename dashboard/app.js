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
  view: 'board', q: '', cat: '', chain: '', minTvl: 0, gainers: false,
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
    return '<tr data-slug="' + esc(r.slug) + '"><td class="rank">' + r.rank + '</td>' +
      '<td><span class="name">' + esc(r.name) + '</span>' +
      (WATCH.has(r.slug) ? '<span class="watch">WATCHLIST</span>' : '') + '</td>' +
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
    (r.comparables > 0 ? '  (' + r.comparables + ' live comparables in ' + (r.category ?? 'this category') + ')'
      : '  (global median — fewer than 3 live comparables in ' + (r.category ?? 'this category') + ')') +
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
    '<p class="hint">The multiple is the median market-cap / TVL of the live-token protocols in ' +
    esc(r.category ?? 'its category') + '. A category with fewer than 3 live comparables falls back ' +
    'to the global median of ' + R.global_multiple.toFixed(3) + '. The growth multiplier clamps the ' +
    '7-day change to −60…+120% at half weight; maturity rises from 0.6 to 1.0 over three years tracked.</p>' +
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
  $('modelDoc').innerHTML =
    '<h2>The model, in one paragraph</h2>' +
    '<p>Every row is scored by the same function, from the snapshot’s own figures only. A ' +
    'protocol’s base is its TVL times its category’s multiple — the median market-cap / TVL of ' +
    'the live-token protocols in that category, at least 3 of them, clamped to 0.02…2.0, falling ' +
    'back to the global median of ' + R.global_multiple.toFixed(3) + ' where a category is too thin. ' +
    'Growth multiplies by 1 + the clamped 7-day change at half weight; maturity multiplies by ' +
    '0.6 rising to 1.0 over three years tracked with no token. No protocol name is ever ' +
    'special-cased: the same function scores every row, and the board re-ranks if the snapshot ' +
    'moves. That is what makes the radar dynamic — run it on a fresh snapshot and it finds the ' +
    'next launches early, without anyone hand-keeping a list.</p>' +
    '<p class="hint">Model ' + esc(R.model_version) + ' · snapshot ' + esc(R.as_of) + ' · ' +
    R.board_size + ' rows · ' + R.watchlist_size + ' watchlist · ' + R.early_size + ' early.</p>';
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
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
  $('reset').addEventListener('click', () => {
    Object.assign(state, { q: '', cat: '', chain: '', minTvl: 0, gainers: false, sort: 'implied' });
    $('q').value = ''; $('cat').value = ''; $('chain').value = '';
    $('minTvl').value = '0'; $('gainers').checked = false; $('sort').value = 'implied';
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
