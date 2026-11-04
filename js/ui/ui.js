// ui.js — DOM 界面：HUD、新闻带、"刚才发生了什么"、抽屉（区域/演化/趋势/时间线）、
// 菜单、设置、结局摘要。全部非阻塞（无 alert/confirm）。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;
  var $ = function (id) { return document.getElementById(id); };

  var UI = MW.UI = {
    w: null, tab: 'region', sel: -1,
    style: 1, tickerSev: 1,
    trendSel: 'inf',
    tlFilter: '全部',
    hooks: {} // main 注入的回调
  };

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
      o.value = s.id; o.textContent = s.name + '（复杂度·' + MW.COMPLEXITY[s.complexity] + '）';
      selS.appendChild(o);
    });
    selA.innerHTML = '';
    MW.ANOMALIES.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a.id; o.textContent = a.name + ' · ' + a.mech;
      selA.appendChild(o);
    });
    selR.innerHTML = '<option value="-1">随机（按人口）</option>';
    MW.REGIONS.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.id; o.textContent = r.name;
      selR.appendChild(o);
    });
    function syncDesc() {
      var s = MW.scenById(selS.value);
      $('scen-desc').textContent = s.desc;
      var a = selA.value;
      for (var i = 0; i < MW.ANOMALIES.length; i++) {
        if (MW.ANOMALIES[i].id === a) { $('anom-desc').textContent = MW.ANOMALIES[i].tagline; break; }
      }
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
  UI.updateHUD = function () {
    var w = UI.w; if (!w) return;
    var tot = w._tot; if (!tot) return;
    var pop0 = MW.WORLD_POP0;
    $('hud-day').textContent = U.fmtDay(w.day);
    // 世界状态词
    var phase = w.aiPhase || '监测期';
    var infShare = tot.L > 0 ? tot.I / tot.L : 0;
    var cls = 'chip';
    if (w.flags.ended) { phase = '已定格'; cls += ' warn'; }
    else if (tot.D / pop0 > 0.05 || infShare > 0.08) { phase = '危机'; cls += ' bad'; }
    else if (infShare > 0.02) { phase = '蔓延'; cls += ' warn'; }
    $('chip-phase').textContent = phase;
    $('chip-phase').className = cls;
    // 感染（含趋势）
    var infEl = $('st-inf').querySelector('b');
    infEl.textContent = U.fmtPop(tot.I);
    var dI = tot.I - (lastTot.I || tot.I);
    var tr = $('tr-inf');
    tr.textContent = dI > tot.I * 0.0005 ? '▲' : (dI < -tot.I * 0.0005 ? '▼' : '―');
    tr.className = dI > 0 ? 'tr-up' : 'tr-down';
    lastTot.I = tot.I;
    $('st-dead').querySelector('b').textContent = U.fmtPop(tot.D);
    var curePct = Math.round(w.research.progress * 100);
    $('st-cure').querySelector('b').textContent = (w.research.deployed ? '已部署' : curePct + '%');
    $('bar-cure').style.width = (w.research.progress * 100) + '%';
    $('st-aw').querySelector('b').textContent = Math.round((w._awG || 0) * 100) + '%';
    $('st-ap').querySelector('b').textContent = Math.floor(w.ap);
    // 速度按钮状态（⏸在暂停时点亮）
    var spd = document.querySelectorAll('.spd');
    for (var i = 0; i < spd.length; i++) {
      var sv = +spd[i].dataset.s;
      var on = sv === 0 ? UI.hooks.isPaused() : (sv === (w.speedIdx || 1) && !UI.hooks.isPaused());
      spd[i].classList.toggle('on', on);
    }
  };

  // ---------- 新闻带 & 刚才发生 ----------
  UI.pushNewsItem = function (item) {
    var t = $('ticker-text');
    t.textContent = '【' + item.cat + '】' + item.text + '　·　' + U.fmtDay(item.day);
    var tk = $('ticker');
    tk.className = '';
    if (item.sev >= 3) tk.classList.add('sev3');
    else if (item.sev === 2) tk.classList.add('sev2');
    UI.tickerSev = item.sev;
    if (item.sev >= 2) MW.addNewsFx(UI.w, item);
    renderWhatnow();
    if (UI.tab === 'timeline' && !$('drawer').classList.contains('hidden')) renderTimeline();
  };
  function styleOf(w, n) {
    if (UI.style === 0 && n < 2) return null;      // 安静：只看大事
    if (UI.style === 2) return true;                // 详尽
    return n >= 1;                                  // 简洁：中等以上
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
    if (!items.length) body.appendChild(el('div', 'wn-item dim', '暂无——世界暂时平静。'));
  }

  // ---------- 抽屉 ----------
  UI.openDrawer = function (tab) {
    $('drawer').classList.remove('hidden');
    $('drawer-open').classList.add('hidden');
    if (tab) UI.tab = tab;
    document.querySelectorAll('.dtab').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === UI.tab);
    });
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
    tip.innerHTML = '<b>' + rd.name + '</b> <span class="dim">' + MW.CLIMATES[rd.clim] + ' · 人口' + U.fmtPop(L) + '</span><br>' +
      '感染 <b>' + U.fmtPop(r.I + r.E) + '</b>（' + U.fmtPct(prev) + '）· 死亡 ' + U.fmtPop(r.D) +
      (r.cA || r.cS || r.cL ? '<br><span class="dim">管制：' + (r.cA ? '空 ' : '') + (r.cS ? '海 ' : '') + (r.cL ? '陆' : '') + '</span>' : '');
    tip.classList.remove('hidden');
    tip.style.left = Math.min(window.innerWidth - 250, x + 14) + 'px';
    tip.style.top = (y + 14) + 'px';
  };

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
      body.appendChild(el('p', 'dim', '点击地图上的区域查看详情。<br><br>提示：滚轮缩放，拖拽平移。'));
      return;
    }
    var rd = MW.REGIONS[UI.sel], r = UI.w.regions[UI.sel];
    var L = r.S + r.E + r.I + r.R + r.C;
    body.appendChild(el('h3', '', rd.name + ' <span class="dim">' + rd.en + '</span>'));
    body.appendChild(el('div', '', '<span class="tag">' + MW.CLIMATES[rd.clim] + '</span>' +
      '<span class="tag">城市化' + Math.round(rd.urb * 100) + '%</span>' +
      '<span class="tag">医疗' + rd.med + '/5</span>' +
      '<span class="tag">研究' + rd.res + '/5</span>'));
    body.appendChild(el('div', 'sec-title', '人口'));
    body.appendChild(el('div', 'kv', '<i>现存人口</i><b>' + U.fmtPop(L) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>死亡</i><b>' + U.fmtPop(r.D) + '</b>'));
    body.appendChild(el('div', 'sec-title', '构成'));
    var comps = [['S', r.S, '#4d8f96'], ['E', r.E, '#caa84d'], ['I', r.I, UI.w ? anomCss(UI.w) : '#f60'],
    ['R', r.R, '#5fae7f'], ['C', r.C, '#a5d8e8']];
    comps.forEach(function (c) {
      var pct = L > 0 ? c[1] / L : 0;
      body.appendChild(el('div', 'comp-row', '<i>' + c[0] + '</i>' +
        '<div class="cbar"><div style="width:' + Math.min(100, pct * 100) + '%;background:' + c[2] + '"></div></div>' +
        '<b>' + U.fmtPop(c[1]) + '</b>'));
    });
    body.appendChild(el('div', 'sec-title', '响应状态'));
    var closed = [];
    if (r.cA) closed.push('空路'); if (r.cS) closed.push('海路'); if (r.cL) closed.push('陆路');
    body.appendChild(el('div', 'kv', '<i>交通管制</i><b>' + (closed.length ? closed.join('、') : '无') + '</b>'));
    body.appendChild(el('div', 'kv', '<i>公众警觉</i><b>' + Math.round(r.aw * 100) + '%</b>'));
    body.appendChild(el('div', 'kv', '<i>援助加成</i><b>' + U.fmtPct(r.aid, 0) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>卫生运动</i><b>' + U.fmtPct(r.camp, 0) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>经济产出</i><b>' + Math.round(r.outMul * 100) + '%</b>'));
    var near = nearRegions(UI.sel);
    if (near.length) {
      body.appendChild(el('div', 'sec-title', '邻接区域'));
      near.forEach(function (i) {
        var rr = UI.w.regions[i];
        var ll = rr.S + rr.E + rr.I + rr.R + rr.C;
        var p = ll > 0 ? (rr.I + rr.E) / ll : 0;
        body.appendChild(el('div', 'kv', '<i>' + MW.REGIONS[i].name + '</i><b>' +
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
    body.appendChild(el('div', 'kv', '<i>适应点</i><b>' + Math.floor(w.ap) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>模式</i><b>' + ($('ck-autoevo').checked ? '自动（评分决策）' : '手动') + '</b>'));
    var last = w.evoLog[w.evoLog.length - 1];
    if (last) body.appendChild(el('div', 'evo-why', '<b>' + U.fmtDay(last.day) + ' · ' + last.name + '</b><br>' + (last.reason || '')));
    var ownedSet = {};
    w.owned.forEach(function (id) { ownedSet[id] = true; });
    body.appendChild(el('div', 'sec-title', '特性树（' + w.owned.length + ' 已获得）'));
    MW.TRAITS.forEach(function (t) {
      if (t.type !== w.anomalyId) return;
      var isOwned = ownedSet[t.id];
      var reqOk = t.req.every(function (r) { return ownedSet[r]; });
      var cls = 'evo-node ' + (isOwned ? 'owned' : (reqOk ? '' : 'locked'));
      var div = el('div', cls, '<div><div class="nm">' + t.name + ' <span class="dim">' + t.cost + '点</span></div>' +
        '<div class="ds">' + t.desc + '</div></div>');
      if (!isOwned && reqOk && !UI.hooks.isAutoEvo()) {
        var b = document.createElement('button');
        b.className = 'btn-mini'; b.textContent = '购买';
        b.onclick = function () { UI.hooks.manualBuy(t.id); };
        div.appendChild(b);
      }
      body.appendChild(div);
    });
    if (w.refineLvl > 0) {
      body.appendChild(el('div', 'sec-title', '精炼'));
      body.appendChild(el('div', 'evo-node owned', '<div><div class="nm">' + MW.REFINE[w.anomalyId].name + ' Lv.' + w.refineLvl + '</div>' +
        '<div class="ds">每级：传播 +6%，可见度 +3%</div></div>'));
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
      ['inf', '感染规模', anomCss(w)],
      ['dead', '累计死亡', '#ff6b6b'],
      ['cure', '研究进度', '#6fb8e8'],
      ['aw', '公众警觉', '#e8b45a']
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
    var col = [{}, {}, {}, { inf: anomCss(w), dead: '#ff6b6b', cure: '#6fb8e8', aw: '#e8b45a' }];
    sparkline(cv, series, col[3][sel]);
    var maxV = 0;
    for (var i = 0; i < series.length; i++) if (series[i] > maxV) maxV = series[i];
    body.appendChild(el('div', 'dim', '峰值：' + (sel === 'cure' ? U.fmtPct(maxV, 0) : U.fmtPop(maxV)) +
      ' · 采样每2日（上限1500点）'));
    body.appendChild(el('div', 'sec-title', '世界概况'));
    var tot = w._tot || { I: 0, E: 0, D: 0, C: 0, L: 1 };
    body.appendChild(el('div', 'kv', '<i>现存感染</i><b>' + U.fmtPop(tot.I + tot.E) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>晶化载体</i><b>' + U.fmtPop(tot.C) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>历史感染人次</i><b>' + U.fmtPop(w.stats.infEver) + '</b>'));
    body.appendChild(el('div', 'kv', '<i>齐鸣爆发次数</i><b>' + w.stats.bursts + '</b>'));
    body.appendChild(el('div', 'kv', '<i>世界种子</i><b>' + w.seedStr + '</b>'));
    body.appendChild(el('div', 'kv', '<i>场景</i><b>' + MW.scenById(w.scenarioId).name + '</b>'));
  }

  var TL_CATS = ['全部', '封锁', '援助', '研究', '异常', '演化', '自然', '社会', '医疗', '系统'];
  function renderTimeline() {
    var body = $('drawer-body');
    body.innerHTML = '';
    var fl = el('div', 'tl-filters');
    TL_CATS.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'tf' + (UI.tlFilter === c ? ' on' : '');
      b.textContent = c;
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
        '<span class="d">' + U.fmtDay(n.day) + '</span>【' + n.cat + '】' + n.text));
      shown++;
    }
    if (!shown) body.appendChild(el('p', 'dim', '暂无记录。'));
  }

  // ---------- 结局 ----------
  UI.showEnding = function (w) {
    var s = w.flags.endSummary || MW.buildSummary(w, w.flags.ended);
    var def = MW.ENDING_DEFS[s.id];
    $('end-name').textContent = def.name;
    $('end-desc').textContent = def.desc;
    $('end-grade').textContent = MW.grade(s);
    var g = $('end-stats');
    g.innerHTML = '';
    function kv(k, v) { g.appendChild(el('div', 'kv', '<i>' + k + '</i><b>' + v + '</b>')); }
    kv('历经时间', U.fmtDay(s.day));
    kv('累计死亡', U.fmtPop(s.dead) + '（' + U.fmtPct(s.dead / MW.WORLD_POP0) + '）');
    kv('历史感染', U.fmtPop(s.infEver));
    kv('感染峰值', U.fmtPop(s.maxI) + '（' + U.fmtDay(s.maxIday) + '）');
    kv('始发区域', s.start);
    kv('解药部署', s.cure || '未完成');
    kv('演化决策', s.evoCount + ' 次');
    kv('爆发事件', s.bursts + ' 次');
    var evo = $('end-evo');
    evo.innerHTML = '<b>演化之路：</b><br>' + w.evoLog.slice(-10).map(function (e2) {
      return U.fmtDay(e2.day) + ' ' + e2.name;
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
    $('whatnow-head').onclick = function () { $('whatnow').classList.toggle('folded'); };
    $('whatnow-toggle').onclick = function (e) { e.stopPropagation(); $('whatnow').classList.toggle('folded'); };
    $('ck-autoevo').onchange = function () { if (UI.hooks.onAutoEvo) UI.hooks.onAutoEvo(this.checked); };
    // 菜单
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
      if (e.key === ' ' && UI.hooks.togglePause) { e.preventDefault(); UI.hooks.togglePause(); }
      if (e.key >= '1' && e.key <= '4' && UI.hooks.setSpeed) UI.hooks.setSpeed([1, 2, 4, 8][+e.key - 1]);
    });
    document.querySelectorAll('.spd').forEach(function (b) {
      b.onclick = function () { if (UI.hooks.setSpeed) UI.hooks.setSpeed(+b.dataset.s); };
    });
    $('sel-quality').onchange = function () { if (UI.hooks.setQuality) UI.hooks.setQuality(+this.value); };
  };

  // 设置控件初始值
  UI.initSettings = function (st) {
    $('ck-autoevo').checked = st.autoEvo !== false;
    $('ck-muted').checked = true;
    $('sel-quality').value = String(st.quality);
  };
})();
