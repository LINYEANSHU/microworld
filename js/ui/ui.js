// ui.js — DOM 界面：HUD、新闻带、"刚才发生了什么"、抽屉（区域/演化/趋势/时间线）、
// 菜单、设置、结局摘要。全部非阻塞（无 alert/confirm）。中英双语经 MW.T。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;
  var $ = function (id) { return document.getElementById(id); };
  function T(key, fb, p) { return MW.T(key, fb, p); }

  var UI = MW.UI = {
    w: null, tab: 'region', sel: -1,
    style: 1, tickerSev: 1,
    trendSel: 'inf',
    tlFilter: '全部',
    hooks: {} // main 注入的回调
  };

  function catDisplay(cat) {
    if (MW.LANG !== 'en') return cat;
    var m = MW.DATA_EN.events.cats;
    return m[cat] || cat;
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ---------- toast ----------
  UI.toast = function (msg, isErr) {
    var t = el('div', 'toast' + (isErr ? ' err' : ''), msg);
    $('toasts').appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(function () { t.remove(); }, 3100);
  };

  // ---------- 屏幕切换 ----------
  UI.show = function (id) {
    ['screen-start', 'screen-setup', 'screen-about', 'screen-game'].forEach(function (s) {
      $(s).classList.toggle('hidden', s !== id);
    });
  };

  // ---------- 开始/设置屏 ----------
  UI.fillSetup = function () {
    var selS = $('sel-scenario'), selA = $('sel-anomaly'), selR = $('sel-region');
    selS.innerHTML = '';
    MW.SCENARIOS.forEach(function (s) {
      var o = document.createElement('option');
      var cx = MW.LANG === 'en' ? MW.DATA_EN.complexity[s.complexity] : MW.COMPLEXITY[s.complexity];
      o.value = s.id; o.textContent = MW.scenName(s.id) + '（' + (MW.LANG === 'en' ? 'complexity' : '复杂度') + '·' + cx + '）';
      selS.appendChild(o);
    });
    selA.innerHTML = '';
    MW.ANOMALIES.forEach(function (a) {
      var o = document.createElement('option');
      var mech = MW.LANG === 'en' ? MW.DATA_EN.anomalies[a.id].mech : a.mech;
      o.value = a.id; o.textContent = MW.anomName(a.id) + ' · ' + mech;
      selA.appendChild(o);
    });
    selR.innerHTML = '<option value="-1">' + T('setup.regionRand') + '</option>';
    MW.REGIONS.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.id; o.textContent = MW.regionName(r.id);
      selR.appendChild(o);
    });
    function syncDesc() {
      $('scen-desc').textContent = MW.scenDesc(selS.value);
      var a = selA.value;
      $('anom-desc').textContent = MW.anomTagline(a);
    }
    selS.onchange = syncDesc; selA.onchange = syncDesc;
    syncDesc();
    $('in-seed').value = 'MW-' + Math.floor(Math.random() * 1e9).toString(36);
  };
  UI.readSetup = function () {
    return {
      scenario: $('sel-scenario').value,
      anomaly: $('sel-anomaly').value,
      seedStr: $('in-seed').value.trim() || 'MW',
      startRegion: +$('sel-region').value,
      speedIdx: +$('sel-speed').value,
      eventFreq: +$('sel-freq').value,
      style: +$('sel-style').value,
      offCapH: +$('sel-offcap').value
    };
  };

  // ---------- 绑定世界 ----------
  UI.bindWorld = function (w) {
    UI.w = w;
    UI.sel = -1; UI.tab = 'region'; UI.tlFilter = '全部';
    UI.lastNewsDay = -1;
    UI.lastEvoCount = w.evoLog.length;
    UI.endNoted = !!w.flags.ended;
    renderWhatnow();
  };

  // ---------- HUD（低频更新） ----------
  var lastTot = { I: 0 };
  UI._tlDirty = false; // 时间线待刷新标记（抽屉打开时新闻推送只标记，由 4Hz HUD 节拍统一重建）
  UI.updateHUD = function () {
    // 时间线增量节流：新闻高频时避免每条都全量重建 ≤200 个 DOM 节点
    if (UI._tlDirty) {
      UI._tlDirty = false;
      if (UI.tab === 'timeline' && !$('drawer').classList.contains('hidden')) renderTimeline();
    }
    var w = UI.w; if (!w) return;
    var tot = w._tot; if (!tot) return;
    var pop0 = MW.WORLD_POP0;
    $('hud-day').textContent = U.fmtDay(w.day);
    var phase = w.aiPhase || '监测期';
    var phaseKey = w.aiPhase === '恢复期' ? 'Recovery' : w.aiPhase === '遏制期' ? 'Contain' : w.aiPhase === '冲刺期' ? 'Sprint' : 'Watch';
    var infShare = tot.L > 0 ? tot.I / tot.L : 0;
    var cls = 'chip';
    if (w.flags.ended) { phase = T('phase.locked', '已定格'); cls += ' warn'; }
    else if (tot.D / pop0 > 0.05 || infShare > 0.08) { phase = T('phase.crisis', '危机'); cls += ' bad'; }
    else if (infShare > 0.02) { phase = T('phase.spread', '蔓延'); cls += ' warn'; }
    else { phase = T('phase.monitor', '监测期'); }
    if (MW.LANG === 'en' && !w.flags.ended && !(tot.D / pop0 > 0.05 || infShare > 0.08) && infShare <= 0.02) {
      phase = T('phase.' + (w.aiPhase === '恢复期' ? 'recovery' : 'monitor'), phaseKey === 'Watch' ? 'Watch' : phase);
    }
    $('chip-phase').textContent = phase;
    $('chip-phase').className = cls;
    var infEl = $('st-inf').querySelector('b');
    infEl.textContent = U.fmtPop(tot.I);
    var dI = tot.I - (lastTot.I || tot.I);
    var tr = $('tr-inf');
    tr.textContent = dI > tot.I * 0.0005 ? '▲' : (dI < -tot.I * 0.0005 ? '▼' : '―');
    tr.className = dI > 0 ? 'tr-up' : 'tr-down';
    lastTot.I = tot.I;
    $('st-dead').querySelector('b').textContent = U.fmtPop(tot.D);
    var curePct = Math.round(w.research.progress * 100);
    $('st-cure').querySelector('b').textContent = (w.research.deployed ? T('cure.deployed', '已部署') : curePct + '%');
    $('bar-cure').style.width = (w.research.progress * 100) + '%';
    $('st-aw').querySelector('b').textContent = Math.round((w._awG || 0) * 100) + '%';
    $('st-ap').querySelector('b').textContent = Math.floor(w.ap);
    var spd = document.querySelectorAll('.spd');
    for (var i = 0; i < spd.length; i++) {
      var sv = +spd[i].dataset.s;
      var on = sv === 0 ? UI.hooks.isPaused() : (sv === (w.speedIdx || 1) && !UI.hooks.isPaused());
      spd[i].classList.toggle('on', on);
      spd[i].setAttribute('aria-pressed', String(on));
    }
  };

  // ---------- 新闻带 & 刚才发生 ----------
  UI.pushNewsItem = function (item) {
    var t = $('ticker-text');
    t.textContent = '【' + catDisplay(item.cat) + '】' + item.text + '　·　' + U.fmtDay(item.day);
    var tk = $('ticker');
    tk.className = '';
    if (item.sev >= 3) tk.classList.add('sev3');
    else if (item.sev === 2) tk.classList.add('sev2');
    UI.tickerSev = item.sev;
    if (item.sev >= 2) MW.addNewsFx(UI.w, item);
    renderWhatnow();
    if (UI.tab === 'timeline' && !$('drawer').classList.contains('hidden')) UI._tlDirty = true;
  };
  function styleOf(w, n) {
    if (UI.style === 0 && n < 2) return null;
    if (UI.style === 2) return true;
    return n >= 1;
  }
  function renderWhatnow() {
    var w = UI.w; if (!w) return;
    var body = $('whatnow-body');
    body.innerHTML = '';
    var items = [];
    for (var i = w.news.length - 1; i >= 0 && items.length < 5; i--) {
      var n = w.news[i];
      if (styleOf(w, n.sev || 1)) items.push(n);
    }
    items.forEach(function (n) {
      body.appendChild(el('div', 'wn-item sev' + (n.sev || 1),
        '<span class="d">' + U.fmtDay(n.day) + '</span>' + n.text));
    });
    if (!items.length) body.appendChild(el('div', 'wn-item dim', T('what.none', '暂无——世界暂时平静。')));
  }

  // ---------- 抽屉 ----------
  UI.openDrawer = function (tab) {
    $('drawer').classList.remove('hidden');
    $('drawer-open').classList.add('hidden');
    if (tab) UI.tab = tab;
    document.querySelectorAll('.dtab').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === UI.tab);
    });
    UI._tlDirty = false; // 立即渲染即为最新，无需再等 4Hz 刷新
    renderTab();
  };
  UI.closeDrawer = function () {
    $('drawer').classList.add('hidden');
    $('drawer-open').classList.remove('hidden');
  };
  UI.select = function (id) {
    UI.sel = id;
    if (id >= 0) UI.openDrawer('region');
    renderTab();
  };
  UI.hover = function (id, x, y) {
    var tip = $('tooltip');
    if (id < 0) { tip.classList.add('hidden'); return; }
    var rd = MW.REGIONS[id], r = UI.w.regions[id];
    var L = r.S + r.E + r.I + r.R + r.C;
    var prev = L > 0 ? (r.I + r.E) / L : 0;
    tip.innerHTML = '<b>' + MW.regionName(id) + '</b> <span class="dim">' + MW.climName(rd.clim) + ' · ' +
      T('region.pop', '人口') + U.fmtPop(L) + '</span><br>' +
      T('stat.inf', '感染') + ' <b>' + U.fmtPop(r.I + r.E) + '</b>（' + U.fmtPct(prev) + '）· ' +
      T('region.dead', '死亡') + ' ' + U.fmtPop(r.D) +
      (r.cA || r.cS || r.cL ? '<br><span class="dim">' + closuresText(r) + '</span>' : '');
    tip.classList.remove('hidden');
    tip.style.left = Math.min(window.innerWidth - 250, x + 14) + 'px';
    tip.style.top = (y + 14) + 'px';
  };
  function closuresText(r) {
    if (MW.LANG === 'en') {
      var s = [];
      if (r.cA) s.push('air'); if (r.cS) s.push('sea'); if (r.cL) s.push('land');
      return 'Closed: ' + s.join(' / ');
    }
    var s2 = [];
    if (r.cA) s2.push('空'); if (r.cS) s2.push('海'); if (r.cL) s2.push('陆');
    return '管制：' + s2.join('、');
  }

  function renderTab() {
    var body = $('drawer-body');
    if (UI.tab === 'region') renderRegion(body);
    else if (UI.tab === 'evo') renderEvo(body);
    else if (UI.tab === 'trend') renderTrend(body);
    else renderTimeline();
  }
  UI.renderTab = renderTab;

  function renderRegion(body) {
    body.innerHTML = '';
    if (UI.sel < 0) {
      body.appendChild(el('p', 'dim', T('drawer.clickHint', '点击地图上的区域查看详情。<br><br>提示：滚轮缩放，拖拽平移。')));
      return;
    }
    var rd = MW.REGIONS[UI.sel], r = UI.w.regions[UI.sel];
    var L = r.S + r.E + r.I + r.R + r.C;
    body.appendChild(el('h3', '', MW.regionName(UI.sel) + ' <span class="dim">' + rd.en + '</span>'));
    body.appendChild(el('div', '', '<span class="tag">' + MW.climName(rd.clim) + '</span>' +
      '<span class="tag">' + T('tag.urban', '城市化') + Math.round(rd.urb * 100) + '%</span>' +
      '<span class="tag">' + T('tag.med', '医疗') + rd.med + '/5</span>' +
      '<span class="tag">' + T('tag.res', '研究') + rd.res + '/5</span>'));
    body.appendChild(el('div', 'sec-title', T('region.pop', '人口')));
    body.appendChild(el('div', 'kv', '<i>' + T('region.pop', '人口') + '</i><b>' + U.fmtPop(L) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('region.dead', '死亡') + '</i><b>' + U.fmtPop(r.D) + '</b>'));
    body.appendChild(el('div', 'sec-title', T('region.comp', '构成')));
    var comps = [['S', r.S, '#4d8f96'], ['E', r.E, '#caa84d'], ['I', r.I, anomCss(UI.w)],
    ['R', r.R, '#5fae7f'], ['C', r.C, '#a5d8e8']];
    comps.forEach(function (c) {
      var pct = L > 0 ? c[1] / L : 0;
      body.appendChild(el('div', 'comp-row', '<i>' + c[0] + '</i>' +
        '<div class="cbar"><div style="width:' + Math.min(100, pct * 100) + '%;background:' + c[2] + '"></div></div>' +
        '<b>' + U.fmtPop(c[1]) + '</b>'));
    });
    body.appendChild(el('div', 'sec-title', T('region.resp', '响应状态')));
    var closed = [];
    if (r.cA) closed.push('Air'); if (r.cS) closed.push('Sea'); if (r.cL) closed.push('Land');
    var closedTxt = closed.length ? (MW.LANG === 'en' ? closed.join(', ') : closed.join('、').replace(/Air/g, '空').replace(/Sea/g, '海').replace(/Land/g, '陆')) : T('region.none', '无');
    body.appendChild(el('div', 'kv', '<i>' + T('region.closures', '交通管制') + '</i><b>' + closedTxt + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('region.aware', '公众警觉') + '</i><b>' + Math.round(r.aw * 100) + '%</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('region.aid', '援助加成') + '</i><b>' + U.fmtPct(r.aid, 0) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('region.camp', '卫生运动') + '</i><b>' + U.fmtPct(r.camp, 0) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('region.output', '经济产出') + '</i><b>' + Math.round(r.outMul * 100) + '%</b>'));
    // 手动干预（可选）：优先援助开关
    var prioBtn = document.createElement('button');
    prioBtn.className = 'btn-mini' + (UI.w.aidPriority === UI.sel ? ' on' : '');
    prioBtn.textContent = UI.w.aidPriority === UI.sel ? T('region.aidUnset', '取消优先援助') : T('region.aidSet', '设为优先援助');
    prioBtn.onclick = function () {
      if (UI.hooks.setAidPriority) UI.hooks.setAidPriority(UI.sel);
      renderTab(); // 重新渲染本页以反映状态
    };
    body.appendChild(prioBtn);
    var near = nearRegions(UI.sel);
    if (near.length) {
      body.appendChild(el('div', 'sec-title', T('region.neighbors', '邻接区域')));
      near.forEach(function (i) {
        var rr = UI.w.regions[i];
        var ll = rr.S + rr.E + rr.I + rr.R + rr.C;
        var p = ll > 0 ? (rr.I + rr.E) / ll : 0;
        body.appendChild(el('div', 'kv', '<i>' + MW.regionName(i) + '</i><b>' +
          (p > 0.0001 ? U.fmtPct(p) : '—') + '</b>'));
      });
    }
  }
  function anomCss(w) {
    for (var i = 0; i < MW.ANOMALIES.length; i++) if (MW.ANOMALIES[i].id === w.anomalyId) return MW.ANOMALIES[i].color;
    return '#f60';
  }
  function nearRegions(id) {
    var set = {};
    UI.w.links.forEach(function (l) {
      if (l.a === id) set[l.b] = 1;
      else if (l.b === id) set[l.a] = 1;
    });
    return Object.keys(set).map(Number).slice(0, 8);
  }

  function renderEvo(body) {
    body.innerHTML = '';
    var w = UI.w;
    body.appendChild(el('div', 'kv', '<i>' + T('evo.points', '适应点') + '</i><b>' + Math.floor(w.ap) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('evo.mode', '模式') + '</i><b>' +
      ($('ck-autoevo').checked ? T('evo.auto', '自动（评分决策）') : T('evo.manual', '手动')) + '</b>'));
    var last = w.evoLog[w.evoLog.length - 1];
    if (last) body.appendChild(el('div', 'evo-why', '<b>' + U.fmtDay(last.day) + ' · ' +
      (last.id === 'refine' ? last.name : MW.traitName(last.id)) + '</b><br>' + (last.reason || '')));
    var ownedSet = {};
    w.owned.forEach(function (id) { ownedSet[id] = true; });
    body.appendChild(el('div', 'sec-title', T('evo.tree', '特性树') + '（' + w.owned.length + T('evo.owned', ' 已获得') + '）'));
    MW.TRAITS.forEach(function (t) {
      if (t.type !== w.anomalyId) return;
      var isOwned = ownedSet[t.id];
      var reqOk = t.req.every(function (r) { return ownedSet[r]; });
      var cls = 'evo-node ' + (isOwned ? 'owned' : (reqOk ? '' : 'locked'));
      var div = el('div', cls, '<div><div class="nm">' + MW.traitName(t.id) + ' <span class="dim">' + t.cost + '</span></div>' +
        '<div class="ds">' + MW.traitDesc(t.id) + '</div></div>');
      if (!isOwned && reqOk && !UI.hooks.isAutoEvo()) {
        var b = document.createElement('button');
        b.className = 'btn-mini'; b.textContent = T('evo.buy', '购买');
        b.onclick = function () { UI.hooks.manualBuy(t.id); };
        div.appendChild(b);
      }
      body.appendChild(div);
    });
    if (w.refineLvl > 0) {
      body.appendChild(el('div', 'sec-title', T('evo.refine', '精炼')));
      var rn = MW.LANG === 'en' ? MW.DATA_EN.refine[w.anomalyId] : MW.REFINE[w.anomalyId].name;
      body.appendChild(el('div', 'evo-node owned', '<div><div class="nm">' + rn + ' Lv.' + w.refineLvl + '</div>' +
        '<div class="ds">' + T('evo.refineDesc', '每级：传播 +6%，可见度 +3%') + '</div></div>'));
    }
  }

  function sparkline(canvas, series, color) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width = canvas.clientWidth * 2, H = canvas.height = 180;
    ctx.clearRect(0, 0, W, H);
    if (series.length < 2) return;
    var mx = 0;
    for (var i = 0; i < series.length; i++) if (series[i] > mx) mx = series[i];
    if (mx <= 0) mx = 1;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i < series.length; i++) {
      var x = i / (series.length - 1) * (W - 8) + 4;
      var y = H - 8 - (series[i] / mx) * (H - 20);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function renderTrend(body) {
    body.innerHTML = '';
    var w = UI.w, h = w.hist;
    var defs = [
      ['inf', T('stat.inf', '感染'), anomCss(w)],
      ['dead', T('region.dead', '死亡'), '#ff6b6b'],
      ['cure', T('stat.cure', '研究'), '#6fb8e8'],
      ['aw', T('stat.aw', '警觉'), '#e8b45a']
    ];
    var sel = UI.trendSel;
    defs.forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'tf' + (sel === d[0] ? ' on' : '');
      b.textContent = d[1];
      b.onclick = function () { UI.trendSel = d[0]; renderTrend(body); };
      body.appendChild(b);
    });
    var idx = { inf: 1, dead: 2, cure: 3, aw: 4 }[sel];
    var cv = document.createElement('canvas');
    cv.className = 'spark';
    body.appendChild(cv);
    var series = [h.inf, h.dead, h.cure, h.aw][idx - 1] || [];
    var cols = { inf: anomCss(w), dead: '#ff6b6b', cure: '#6fb8e8', aw: '#e8b45a' };
    sparkline(cv, series, cols[sel]);
    var maxV = 0;
    for (var i = 0; i < series.length; i++) if (series[i] > maxV) maxV = series[i];
    body.appendChild(el('div', 'dim', T('trend.peak', '峰值') + '：' + (sel === 'cure' ? U.fmtPct(maxV, 0) : U.fmtPop(maxV)) +
      ' · ' + T('trend.sample', '采样每2日（上限1500点）')));
    body.appendChild(el('div', 'sec-title', T('trend.overview', '世界概况')));
    var tot = w._tot || { I: 0, E: 0, D: 0, C: 0, L: 1 };
    body.appendChild(el('div', 'kv', '<i>' + T('trend.live', '现存感染') + '</i><b>' + U.fmtPop(tot.I + tot.E) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('trend.crystal', '晶化载体') + '</i><b>' + U.fmtPop(tot.C) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('trend.ever', '历史感染人次') + '</i><b>' + U.fmtPop(w.stats.infEver) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('trend.bursts', '齐鸣爆发次数') + '</i><b>' + w.stats.bursts + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('trend.seed', '世界种子') + '</i><b>' + w.seedStr + '</b>'));
    body.appendChild(el('div', 'kv', '<i>' + T('trend.scen', '场景') + '</i><b>' + MW.scenName(w.scenarioId) + '</b>'));
  }

  var TL_CATS = ['全部', '封锁', '援助', '研究', '异常', '演化', '自然', '社会', '医疗', '系统'];
  function catLabel(c) {
    if (c === '全部') return T('timeline.by', '全部');
    return catDisplay(c);
  }
  function renderTimeline() {
    var body = $('drawer-body');
    body.innerHTML = '';
    var fl = el('div', 'tl-filters');
    TL_CATS.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'tf' + (UI.tlFilter === c ? ' on' : '');
      b.textContent = catLabel(c);
      b.onclick = function () { UI.tlFilter = c; renderTimeline(); };
      fl.appendChild(b);
    });
    body.appendChild(fl);
    var w = UI.w;
    var shown = 0;
    for (var i = w.news.length - 1; i >= 0 && shown < 200; i--) {
      var n = w.news[i];
      if (UI.tlFilter !== '全部' && n.cat !== UI.tlFilter) continue;
      body.appendChild(el('div', 'tl-item sev' + (n.sev || 1),
        '<span class="d">' + U.fmtDay(n.day) + '</span>【' + catDisplay(n.cat) + '】' + n.text));
      shown++;
    }
    if (!shown) body.appendChild(el('p', 'dim', T('tl.none', '暂无记录。')));
  }

  // ---------- 结局 ----------
  UI.showEnding = function (w) {
    var s = w.flags.endSummary || MW.buildSummary(w, w.flags.ended);
    var def = MW.endingDef(s.id);
    $('end-name').textContent = def.name;
    $('end-desc').textContent = def.desc;
    $('end-grade').textContent = MW.grade(s);
    var g = $('end-stats');
    g.innerHTML = '';
    function kv(k, v) { g.appendChild(el('div', 'kv', '<i>' + k + '</i><b>' + v + '</b>')); }
    kv(T('end.time', '历经时间'), U.fmtDay(s.day));
    kv(T('end.dead', '累计死亡'), U.fmtPop(s.dead) + '（' + U.fmtPct(s.dead / MW.WORLD_POP0) + '）');
    kv(T('end.ever', '历史感染'), U.fmtPop(s.infEver));
    kv(T('end.peak', '感染峰值'), U.fmtPop(s.maxI) + '（' + U.fmtDay(s.maxIday) + '）');
    kv(T('end.start', '始发区域'), MW.regionName(w.stats.startRegion));
    kv(T('end.cure', '解药部署'), s.cure || T('end.cureNo', '未完成'));
    kv(T('end.evo', '演化决策'), s.evoCount + ' ' + (MW.LANG === 'en' ? 'times' : '次'));
    kv(T('end.bursts', '爆发事件'), s.bursts + ' ' + (MW.LANG === 'en' ? 'times' : '次'));
    var evo = $('end-evo');
    evo.innerHTML = '<b>' + T('end.road', '演化之路：') + '</b><br>' + w.evoLog.slice(-10).map(function (e2) {
      return U.fmtDay(e2.day) + ' ' + MW.traitName(e2.id);
    }).join(' · ');
    $('overlay-ending').classList.remove('hidden');
  };

  // ---------- 补算进度 ----------
  UI.showCatchup = function (show) {
    $('overlay-catchup').classList.toggle('hidden', !show);
  };
  UI.catchupProgress = function (done, total, note) {
    $('catchup-bar').style.width = total > 0 ? (done / total * 100) + '%' : '100%';
    $('catchup-note').textContent = note || '';
  };

  // ---------- 事件绑定（main 调用一次） ----------
  UI.bind = function (hooks) {
    UI.hooks = hooks;
    document.querySelectorAll('.dtab').forEach(function (b) {
      b.onclick = function () { UI.tab = b.dataset.tab; UI.openDrawer(); };
    });
    $('drawer-close').onclick = UI.closeDrawer;
    $('drawer-open').onclick = function () { UI.openDrawer(); };
    $('ticker').onclick = function () { UI.openDrawer('timeline'); };
    $('whatnow-head').onclick = function () {
      var folded = $('whatnow').classList.toggle('folded');
      this.setAttribute('aria-expanded', String(!folded));
    };
    $('whatnow-head').onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.click(); }
    };
    $('ck-autoevo').onchange = function () { if (UI.hooks.onAutoEvo) UI.hooks.onAutoEvo(this.checked); };
    $('btn-menu').onclick = function (e) { e.stopPropagation(); $('menu-pop').classList.toggle('hidden'); $('pop-settings').classList.add('hidden'); };
    $('mi-settings').onclick = function () { $('pop-settings').classList.toggle('hidden'); };
    $('btn-set-close').onclick = function () { $('pop-settings').classList.add('hidden'); };
    $('mi-perf').onclick = function () {
      var p = UI.hooks.perf();
      $('perf-line').innerHTML = p;
      $('pop-settings').classList.remove('hidden');
    };
    $('btn-mini').onclick = function () { if (UI.hooks.toggleMini) UI.hooks.toggleMini(); };
    document.addEventListener('click', function (e) {
      if (!$('menu-pop').contains(e.target) && e.target !== $('btn-menu')) $('menu-pop').classList.add('hidden');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { $('menu-pop').classList.add('hidden'); $('pop-settings').classList.add('hidden'); }
      if (e.target.closest('input, textarea, select, button, [role="button"]') || e.target.isContentEditable) return;
      if (e.key === ' ' && UI.hooks.togglePause) { e.preventDefault(); UI.hooks.togglePause(); }
      if (e.key >= '1' && e.key <= '4' && UI.hooks.setSpeed) UI.hooks.setSpeed([1, 2, 4, 8][+e.key - 1]);
    });
    document.querySelectorAll('.spd').forEach(function (b) {
      b.onclick = function () { if (UI.hooks.setSpeed) UI.hooks.setSpeed(+b.dataset.s); };
    });
    $('sel-quality').onchange = function () { if (UI.hooks.setQuality) UI.hooks.setQuality(+this.value); };
    $('btn-lang').onclick = function () { if (UI.hooks.toggleLang) UI.hooks.toggleLang(); };
    $('sel-lang').onchange = function () { if (UI.hooks.setLang) UI.hooks.setLang(this.value); };
  };

  // 设置控件初始值
  UI.initSettings = function (st) {
    $('ck-autoevo').checked = st.autoEvo !== false;
    $('ck-muted').checked = true;
    $('sel-quality').value = String(st.quality);
    $('sel-lang').value = MW.LANG;
  };
})();
