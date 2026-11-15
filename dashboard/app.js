// Token Radar's dashboard: one page, no network. It reads window.RADAR (written by main.ts
// from the same board.json the gate checks), renders the board, the live-token view, a detail
// view for every protocol and the model's calibration, and it answers to the URL hash so a
// state can be linked: #tab=all|watchlist|live, #cat=<category>, #chain=<chain>, #q=<text>,
// #sort=<key>, #detail=<slug>.
//
// The page never fetches and never calls out: every number on it comes from the snapshot the
// program read, and every farm step is the one board.json carries for that row.

(function () {
  'use strict';
  var D = window.RADAR;
  var root = document.getElementById('board');
  if (!D || !D.rows) {
    root.textContent = 'Token Radar: no data. Run main.ts to write data.js beside this page.';
    root.removeAttribute('aria-busy');
    return;
  }

  /** The state the controls and the hash both write. */
  var state = { tab: 'all', q: '', cat: '', chain: '', sort: 'rank', dir: 1, detail: null };

  /** Read the hash into the state, so a link opens the view it names. */
  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    var parts = h.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var k = kv[0];
      var v = kv[1] ? decodeURIComponent(kv[1].replace(/\+/g, ' ')) : '';
      if (k === 'tab' && (v === 'all' || v === 'watchlist' || v === 'live')) state.tab = v;
      else if (k === 'cat') state.cat = v;
      else if (k === 'chain') state.chain = v;
      else if (k === 'q') state.q = v;
      else if (k === 'sort') state.sort = v;
      else if (k === 'detail') state.detail = v;
    }
  }

  /** Write the state back to the hash, without scrolling the page. */
  function writeHash() {
    var bits = [];
    if (state.tab !== 'all') bits.push('tab=' + encodeURIComponent(state.tab));
    if (state.cat) bits.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) bits.push('chain=' + encodeURIComponent(state.chain));
    if (state.q) bits.push('q=' + encodeURIComponent(state.q));
    if (state.sort !== 'rank') bits.push('sort=' + encodeURIComponent(state.sort));
    if (state.detail) bits.push('detail=' + encodeURIComponent(state.detail));
    var h = bits.join('&');
    if (('' + location.hash).replace(/^#/, '') !== h) history.replaceState(null, '', h ? '#' + h : '#');
  }

  /** Escape text for the page: names come from the snapshot, never from the reader. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** $1.24B, $312M, $48.2K, $950. */
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  /** +12.5% or -4.0%, coloured. */
  function changeHtml(v) {
    if (v == null) return '<span class="num">—</span>';
    var cls = v >= 0 ? 'pos' : 'neg';
    return '<span class="num ' + cls + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }

  function ageText(days) {
    if (days == null) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }

  function chainsText(chains) {
    if (!chains || chains.length === 0) return '—';
    return chains.length <= 2 ? chains.join(', ') : chains.slice(0, 2).join(', ') + ' +' + (chains.length - 2);
  }

  /** The rows the current filters keep, in the current sort order. */
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.tab === 'watchlist' && !r.on_watchlist) return false;
      if (state.cat && (r.category || 'Uncategorized') !== state.cat) return false;
      if (state.chain && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'change') { av = a.change_7d == null ? -Infinity : a.change_7d; bv = b.change_7d == null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days == null ? -1 : a.age_days; bv = b.age_days == null ? -1 : b.age_days; }
      else { av = a.rank; bv = b.rank; }
      return (av - bv) * dir || (a.rank - b.rank);
    });
    return rows;
  }

  /** A farm step's body and its cost/time tail, split for the detail view. */
  function splitStep(step) {
    var m = step.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.?$/);
    if (!m) return { text: step, cost: '', time: '' };
    return { text: m[1], cost: m[2], time: m[3] };
  }

  /** The live protocols in one category, by market cap, for the detail view's comparables. */
  function comparables(category) {
    return D.live
      .filter(function (l) { return (l.category || 'Uncategorized') === (category || 'Uncategorized'); })
      .sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); })
      .slice(0, 3);
  }

  function sortArrow(key) {
    return state.sort === key ? '<span class="arrow">' + (state.dir === 1 ? '▲' : '▼') + '</span>' : '';
  }

  function th(key, label) {
    return '<th><button type="button" data-sort="' + key + '">' + label + ' ' + sortArrow(key) + '</button></th>';
  }

  /** The board table, or the live-token table when the Live tab is open. */
  function tableHtml() {
    if (state.tab === 'live') {
      var live = D.live.slice();
      var lrows = live.map(function (l, i) {
        return '<tr data-live="' + esc(l.slug) + '"><td class="num">' + (i + 1) + '</td>' +
          '<td><span class="name"><b>' + esc(l.name) + '</b><span class="sub">' + esc(l.category || 'Uncategorized') + ' · ' + esc(chainsText(l.chains)) + '</span></span></td>' +
          '<td class="num">' + money(l.tvl_usd) + '</td>' +
          '<td class="num">' + money(l.mcap_usd) + '</td>' +
          '<td class="num">' + (l.mcap_tvl == null ? '—' : l.mcap_tvl.toFixed(2) + '×') + '</td>' +
          '<td>' + changeHtml(l.change_7d) + '</td>' +
          '<td><span class="badge live">TRADES</span></td></tr>';
      }).join('');
      return '<div class="table-wrap"><table><thead><tr><th>#</th><th>Protocol</th><th>TVL</th><th>Market cap</th><th>Mcap / TVL</th><th>7d</th><th>Status</th></tr></thead><tbody>' +
        lrows + '</tbody></table></div>' +
        '<p class="note" style="padding:12px 16px">These tokens already trade, so the radar shows the market\u2019s own value for them — never a model\u2019s. Their mcap / TVL ratios are what calibrate the board\u2019s category multiples.</p>';
    }
    var rows = filteredRows();
    var maxImplied = rows.length ? rows[0].implied_value_usd : 1;
    // The bar is scaled to the board's top row, not the filtered top, so filtering never re-prices a row.
    maxImplied = D.rows.length ? D.rows[0].implied_value_usd : 1;
    if (rows.length === 0) {
      return '<div class="empty"><h2>Nothing on the radar matches</h2><p>Loosen the search or the filters — the board holds ' + D.rows.length + ' pre-token protocols.</p><button class="button primary" type="button" id="clear-filters">Clear the filters</button></div>';
    }
    var body = rows.map(function (r) {
      var pct = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.detail === r.slug) + '">' +
        '<td class="rank-num">' + r.rank + '</td>' +
        '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Uncategorized') + ' · ' + esc(chainsText(r.chains)) + '</span></span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td>' + changeHtml(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td><span class="implied"><span class="bar"><i style="width:' + pct + '%"></i></span><span class="num">' + money(r.implied_value_usd) + '</span></span></td>' +
        '<td>' + (r.on_watchlist ? '<span class="badge watch">WATCHLIST</span>' : '<span class="badge early">EARLY</span>') + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table><thead><tr>' +
      th('rank', 'Rank') + '<th>Protocol</th>' + th('tvl', 'TVL') + th('change', '7d') + th('age', 'Age') + th('implied', 'Implied value') + '<th>Status</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /** The detail drawer for one protocol: the model, the farm plan, the comparables. */
  function detailHtml() {
    var r = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === state.detail) { r = D.rows[i]; break; }
    if (!r) return '<aside class="detail" id="detail" hidden></aside>';
    var comps = comparables(r.category);
    var compHtml = comps.length === 0
      ? '<p>No live-token protocol in this category yet — the board prices it at the global median multiple of ' + D.global_multiple.toFixed(2) + '× TVL.</p>'
      : '<div class="comp">' + comps.map(function (l) {
          return '<div><span>' + esc(l.name) + '</span><b>' + (l.mcap_tvl == null ? '—' : l.mcap_tvl.toFixed(2) + '×') + ' · ' + money(l.mcap_usd) + '</b></div>';
        }).join('') + '</div>';
    var steps = r.farm_steps.map(function (s) {
      var p = splitStep(s);
      return '<li>' + esc(p.text) + (p.cost ? '<span class="cost">Cost: ' + esc(p.cost) + ' · Time: ' + esc(p.time) + '</span>' : '') + '</li>';
    }).join('');
    return '<aside class="detail" id="detail" aria-label="Protocol detail">' +
      '<div class="detail-head"><div><span class="badge ' + (r.on_watchlist ? 'watch' : 'early') + '">' + (r.on_watchlist ? 'WATCHLIST · RANK #' + r.rank : 'EARLY · RANK #' + r.rank) + '</span>' +
      '<h2>' + esc(r.name) + '</h2><p class="sub">' + esc(r.category || 'Uncategorized') + ' · ' + esc((r.chains || []).join(', ') || '—') + (r.listed_at ? ' · tracked since ' + esc(r.listed_at) : '') + '</p></div>' +
      '<button class="close" type="button" id="detail-close">Close ×</button></div>' +
      '<div class="detail-stats">' +
      '<div><b>' + money(r.tvl_usd) + '</b><span>Total value locked</span></div>' +
      '<div><b>' + (r.change_7d == null ? '—' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b><span>TVL change, 7 days</span></div>' +
      '<div><b>' + ageText(r.age_days) + '</b><span>Age with no token recorded</span></div>' +
      '<div><b>' + money(r.implied_value_usd) + '</b><span>Implied launch value</span></div>' +
      '<div><b>' + r.category_multiple.toFixed(2) + '×</b><span>Category multiple</span></div>' +
      '<div><b>' + money(r.base_value_usd) + '</b><span>Base value (TVL × multiple)</span></div></div>' +
      '<section class="detail-section"><h3>How the value is built</h3><div class="equation">' +
      '<div><span>TVL × category multiple</span><b>' + money(r.tvl_usd) + ' × ' + r.category_multiple.toFixed(2) + ' = ' + money(r.base_value_usd) + '</b></div>' +
      '<div><span>Growth (7d ' + (r.change_7d == null ? 'unreported' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + ')</span><b>× ' + r.growth_multiplier.toFixed(2) + '</b></div>' +
      '<div><span>Maturity (' + ageText(r.age_days) + ' with no token)</span><b>× ' + r.maturity_multiplier.toFixed(2) + '</b></div>' +
      '<div><span>Breadth (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')</span><b>× ' + r.breadth_multiplier.toFixed(2) + '</b></div>' +
      '<div class="total"><span>Implied launch value</span><b>' + money(r.implied_value_usd) + '</b></div></div></section>' +
      '<section class="detail-section"><h3>How to farm it</h3><ol class="steps">' + steps + '</ol></section>' +
      '<section class="detail-section"><h3>Live comparables in ' + esc(r.category || 'Uncategorized') + '</h3>' +
      '<p>Tokens that already trade in this category, at the market\u2019s own mcap / TVL. The board\u2019s multiple for this category comes from their median.</p>' + compHtml + '</section>' +
      '<section class="detail-section"><p class="note">This protocol records no token in the snapshot — that is DefiLlama\u2019s record, not proof it has none. The implied value is this radar\u2019s own claim, never a promise a token launches or what it would be worth.</p></section>' +
      '</aside>';
  }

  /** The methodology: the formula in words and the calibration table the model computed. */
  function methodHtml() {
    var cal = D.calibration.map(function (c) {
      return '<div><span>' + esc(c.category) + ' (' + c.live_n + ' live)</span><b>' + c.multiple.toFixed(2) + '×</b></div>';
    }).join('');
    return '<section class="panel model"><h2>How the radar prices a launch</h2>' +
      '<p>Every row is priced the same way, from the snapshot\u2019s own figures — <b>no protocol name is ever special-cased</b>. The category multiple is calibrated from the live market inside this snapshot: the median mcap / TVL of the protocols in that category whose token already trades, winsorized to 0.02–3.0× and shrunk toward the global median (' + D.global_multiple.toFixed(2) + '×) so a category with one live token does not set its own price.</p>' +
      '<div class="formula"><b>implied</b> = TVL × category multiple × (1 + clamp(7d change, −50%, +150%) × 0.6) × (0.7 + min(age, 4y) / 4y × 0.5) × (1 + 0.03 × extra chains, max 5)</div>' +
      '<p>Growth rewards momentum, maturity rewards a long run with no token recorded, and breadth rewards multi-chain reach. The watchlist is the floor, never the ceiling: the board ranks all ' + D.rows.length + ' rankable pre-token protocols — the ' + D.watchlist_size + ' on the watchlist plus ' + D.early_size + ' early ones below its $' + (D.floor_usd / 1e6) + 'M floor — and keeps the ' + D.live_size + ' live tokens apart, at the market\u2019s value.</p>' +
      '<div class="calib">' + cal + '</div>' +
      '<p class="note">Source: ' + esc(D.source) + '. Snapshot date ' + esc(D.as_of) + '. Model ' + esc(D.model_version) + '. A board that ranks nothing by value is not a ranking, so every row\u2019s implied value is computed, never copied.</p>' +
      '</section>';
  }

  function render() {
    var cats = [];
    var seen = {};
    D.rows.forEach(function (r) { var c = r.category || 'Uncategorized'; if (!seen[c]) { seen[c] = 1; cats.push(c); } });
    cats.sort();
    var chains = [];
    var seenCh = {};
    D.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (!seenCh[c]) { seenCh[c] = 1; chains.push(c); } }); });
    chains.sort();
    var count = state.tab === 'live' ? D.live.length : filteredRows().length;
    var top = D.rows.length ? D.rows[0] : null;
    root.innerHTML = '<div class="shell">' +
      '<header class="top"><div><div class="brand"><span class="mark"></span><span class="brand-name">Token Radar · model ' + esc(D.model_version) + '</span></div>' +
      '<h1 style="margin-top:8px">Which pre-token protocol is worth farming next?</h1></div>' +
      '<div class="top-meta"><span>Snapshot <b>' + esc(D.as_of) + '</b></span><span>Floor <b>$' + (D.floor_usd / 1e6) + 'M</b></span><span>Protocols <b>' + D.rows.length + ' ranked</b></span></div></header>' +
      '<div class="lede"><div><h2>The board, not a TVL table</h2>' +
      '<p>Every protocol here <b>records no token</b> and is not a wrapped, staked or bridged product of one that trades. Each is priced by what its launch would be worth if its record stayed as it is — TVL times the live market\u2019s own multiple for its category, then growth, maturity and reach. Click any row for the model behind it and the steps to farm it.</p></div>' +
      '<div class="facts">' +
      '<div class="fact"><span>Top implied value</span><b>' + (top ? money(top.implied_value_usd) + ' · ' + esc(top.name) : '—') + '</b></div>' +
      '<div class="fact"><span>Watchlist covered</span><b>' + D.watchlist_size + ' of ' + D.watchlist_size + '</b></div>' +
      '<div class="fact"><span>Pre-token protocols in the snapshot</span><b>' + D.pre_token_total + '</b></div>' +
      '<div class="fact"><span>Global market multiple</span><b>' + D.global_multiple.toFixed(2) + '× TVL</b></div>' +
      '</div></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + D.rows.length + '</b><span>protocols ranked</span><em>' + D.watchlist_size + ' watchlist + ' + D.early_size + ' early</em></div>' +
      '<div class="stat"><b>' + money(D.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0)) + '</b><span>combined implied value</span><em>this radar\u2019s own claim</em></div>' +
      '<div class="stat"><b>' + D.live_size + '</b><span>live tokens set apart</span><em>shown at the market\u2019s value</em></div>' +
      '<div class="stat"><b>' + D.calibration.length + '</b><span>categories calibrated</span><em>from the live market in-snapshot</em></div></div>' +
      '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Name, slug or category…" value="' + esc(state.q) + '"></div>' +
      '<div class="field"><label for="cat">Category</label><select id="cat"><option value="">All categories</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain"><option value="">All chains</option>' + chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="tabs" role="group" aria-label="Board view">' +
      '<button type="button" data-tab="all" aria-pressed="' + (state.tab === 'all') + '">Board</button>' +
      '<button type="button" data-tab="watchlist" aria-pressed="' + (state.tab === 'watchlist') + '">Watchlist</button>' +
      '<button type="button" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live tokens</button></div>' +
      '<span class="count">' + count + ' of ' + (state.tab === 'live' ? D.live.length : D.rows.length) + ' shown</span></div>' +
      '<section class="panel" id="board-panel">' + tableHtml() + '</section>' +
      methodHtml() +
      '</div>' + detailHtml();
    root.removeAttribute('aria-busy');
    bind();
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; state.detail = state.detail; writeHash(); render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; writeHash(); render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var tabs = root.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function (e) { state.tab = e.currentTarget.getAttribute('data-tab'); writeHash(); render(); });
    var sorts = root.querySelectorAll('[data-sort]');
    for (var j = 0; j < sorts.length; j++) sorts[j].addEventListener('click', function (e) {
      var k = e.currentTarget.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
      writeHash(); render();
    });
    var rows = root.querySelectorAll('tbody tr[data-slug]');
    for (var m = 0; m < rows.length; m++) rows[m].addEventListener('click', function (e) { state.detail = e.currentTarget.getAttribute('data-slug'); writeHash(); render(); });
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () { state.q = ''; state.cat = ''; state.chain = ''; state.tab = 'all'; writeHash(); render(); });
    var close = document.getElementById('detail-close');
    if (close) close.addEventListener('click', function () { state.detail = null; writeHash(); render(); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.detail) { state.detail = null; writeHash(); render(); }
  });

  readHash();
  render();
})();
