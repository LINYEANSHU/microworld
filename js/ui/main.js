// main.js — 主循环：60FPS 渲染 + 1—2Hz 仿真（固定步长、债务有上限）、
// 可见性处理（隐藏停绘计时，恢复分批补算，锚点先行防重复推进）、自动存档。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;
  var $ = function (id) { return document.getElementById(id); };

  var settings = MW.loadSettings();
  settings.autoEvo = settings.autoEvo !== false;

  var world = null;
  var running = false;
  var paused = false;
  var resumeSpeed = 1;
  var hiddenAt = 0;
  var lastFrame = 0;
  var debt = 0;            // 待消耗 tick 债务（有上限）
  var catchupQueue = -1;   // >0 表示正在分批补算
  var catchupTotal = 0;
  var autosaveT = 0;
  var perf = { fps: 0, frameMs: 0, tickMs: 0, ticks: 0, catchups: 0 };
  var _tickAcc = 0, _tickN = 0;
  var _fpsC = 0, _fpsT = 0;
  var _hudT = 0, _autoevoSetting = true;

  // ---------- 启动 ----------
  function boot() {
    MW.LANG = settings.lang === 'en' ? 'en' : 'zh';
    applyMini();
    if (typeof MW.applyLang === 'function') MW.applyLang();
    MW.Renderer.init($('map'));
    MW.Renderer.bindInput($('map'), MW.UI);
    try { MW.Packs.restore(); } catch (e) { /* 场景包损坏不阻塞启动 */ }
    MW.UI.fillSetup();
    MW.UI.initSettings(settings);
    MW.UI.bind({
      isPaused: function () { return paused; },
      isAutoEvo: function () { return _autoevoSetting; },
      onAutoEvo: function (v) { _autoevoSetting = v; settings.autoEvo = v; MW.saveSettings(settings); },
      manualBuy: manualBuy,
      setAidPriority: setAidPriority,
      togglePause: togglePause,
      setSpeed: setSpeed,
      setQuality: setQuality,
      toggleMini: toggleMini,
      toggleLang: toggleLang,
      setLang: setLang,
      perf: perfText
    });
    $('sel-lang').value = MW.LANG;
    // 开始屏
    $('btn-start').onclick = function () {
      var o = defaultStart();
      startGame(o);
    };
    $('btn-setup').onclick = function () { MW.UI.fillSetup(); MW.UI.show('screen-setup'); };
    $('btn-about').onclick = function () { MW.UI.show('screen-about'); };
    $('btn-about-back').onclick = function () { MW.UI.show('screen-start'); };
    $('btn-setup-back').onclick = function () { MW.UI.show('screen-start'); };
    $('btn-setup-start').onclick = function () {
      var o = MW.UI.readSetup();
      settings.eventFreq = o.eventFreq; settings.style = o.style; settings.offCapH = o.offCapH;
      MW.saveSettings(settings);
      startGame(o);
    };
    $('btn-reroll').onclick = function () {
      $('in-seed').value = 'MW-' + Math.floor(Math.random() * 1e9).toString(36);
    };
    // 继续上次
    try {
      var r = MW.loadWorld();
      if (r && r.world) {
        $('btn-continue').classList.remove('hidden');
        $('btn-continue').onclick = function () { resumeFrom(r.world); };
        $('start-news').classList.remove('hidden');
        $('start-news').textContent = '上次观察：' + U.fmtDay(r.world.day) + ' · ' + MW.scenById(r.world.scenarioId).name;
      }
    } catch (e) { /* 存档损坏也不阻塞开始屏 */ }
    // 菜单
    $('mi-save').onclick = function () {
      if (world) { var k = MW.saveWorld(world); MW.UI.toast(k ? MW.T('toast.saved', '已保存') : MW.T('toast.saveFail', '保存失败（存储空间不足？）'), !k); }
    };
    $('mi-export').onclick = exportSave;
    $('mi-import').onclick = function () { $('file-import').click(); };
    $('file-import').onchange = importSave;
    $('mi-pack').onclick = function () { $('file-pack').click(); };
    $('file-pack').onchange = importPack;
    function toggleLang() { setLang(MW.LANG === 'en' ? 'zh' : 'en'); }
    function setLang(l) {
      MW.LANG = l === 'en' ? 'en' : 'zh';
      settings.lang = MW.LANG;
      MW.saveSettings(settings);
      if (typeof MW.applyLang === 'function') MW.applyLang();
      MW.UI.fillSetup();
      MW.UI.updateHUD();
      if (world) { MW.UI.pushNewsItem(world.news[world.news.length - 1] || { day: world.day, cat: '', text: '', sev: 1 }); }
    }
    $('btn-lang').onclick = toggleLang;
    $('sel-lang').onchange = function () { setLang(this.value); };
    $('mi-quit').onclick = function () {
      if (world) MW.saveWorld(world);
      running = false;
      MW.UI.show('screen-start');
      location.reload ? null : null;
      setTimeout(function () { location.reload(); }, 50);
    };
    $('btn-end-continue').onclick = function () { $('overlay-ending').classList.add('hidden'); };
    $('btn-end-new').onclick = function () {
      $('overlay-ending').classList.add('hidden');
      running = false;
      setTimeout(function () { location.reload(); }, 30);
    };
    // 窗口尺寸记忆
    window.addEventListener('resize', onResize);
    restoreWindowSize();
    // 可见性
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', function () { if (world && running) MW.saveWorld(world); });
    // 请求主循环
    requestAnimationFrame(function loop(t) { requestAnimationFrame(loop); driveLoop(t); });
    // RAF饥饿看门狗：窗口被遮挡/合成器节流时RAF可能停发。
    // 可见但>600ms无帧 → 由定时器低速驱动（有帧锁，不会与RAF双重推进）。
    setInterval(function () {
      if (!running || document.hidden) return;
      if (performance.now() - lastFrameCall > 600) driveLoop(performance.now());
    }, 150);
  }

  var lastFrameCall = 0;
  function driveLoop(now) {
    if (now - lastFrameCall < 8) return; // 帧锁
    lastFrameCall = now;
    frame(now);
  }

  function defaultStart() {
    return {
      scenario: 'std', anomaly: null, seedStr: 'MW-' + Math.floor(Math.random() * 1e9).toString(36),
      startRegion: -1, speedIdx: settings.speedDefault || 1,
      eventFreq: settings.eventFreq || 1, style: settings.style === undefined ? 1 : settings.style,
      offCapH: settings.offCapH || 8
    };
  }

  function startGame(o) {
    world = MW.createWorld(o);
    settings.eventFreq = o.eventFreq; settings.style = o.style; settings.offCapH = o.offCapH;
    settings.speedDefault = o.speedIdx;
    MW.saveSettings(settings);
    world._eventFreqSetting = o.eventFreq;
    world.speedIdx = o.speedIdx || 1;
    enterGame();
    MW.UI.toast(MW.T('toast.obsStart', '观察开始：{r}出现首个感染灶', { r: MW.regionName(world.stats.startRegion) }));
  }

  function resumeFrom(w) {
    world = w;
    world._eventFreqSetting = settings.eventFreq || 1;
    enterGame();
    // 恢复时的离线补算（锚点先行）
    scheduleCatchup(Date.now() - (w.wallAnchor || Date.now()));
  }

  function enterGame() {
    running = true;
    paused = world.speedIdx === 0;
    resumeSpeed = world.speedIdx || settings.speedDefault || 1;
    debt = 0; lastFrame = 0; catchupQueue = -1;
    MW.UI.show('screen-game');
    MW.UI.style = (settings.style === undefined ? 1 : settings.style);
    MW.UI.bindWorld(world);
    MW.Renderer.bindWorld(world);
    MW.Renderer.setQuality(settings.quality);
    _autoevoSetting = settings.autoEvo;
    MW.UI.openDrawer ? null : null;
    MW.UI.closeDrawer();
    world.wallAnchor = Date.now();
    MW.saveWorld(world);
  }

  // ---------- 主循环（由 driveLoop 统一驱动：RAF 为主、看门狗兜底） ----------
  function frame(now) {
    if (!running || !world) return;
    var dtMs = lastFrame ? Math.min(100, now - lastFrame) : 16;
    lastFrame = now;
    var t0 = performance.now();

    var hidden = document.hidden;
    if (!hidden) {
      // —— 仿真推进（固定步长债务） ——
      if (!paused && catchupQueue < 0) {
        var tps = MW.tpsOf(world.speedIdx);
        if (tps > 0) {
          debt += dtMs / 1000 * tps;
          if (debt > MW.MAX_DEBT_TICKS) debt = MW.MAX_DEBT_TICKS;
        }
        var n = Math.floor(debt);
        if (n > 0) {
          debt -= n;
          if (n > MW.MAX_TICKS_PER_FRAME) n = MW.MAX_TICKS_PER_FRAME;
          runTicks(n);
        }
      }
      // —— 分批补算 ——
      if (catchupQueue > 0) {
        var step = Math.min(600, catchupQueue);
        var t1 = performance.now();
        runTicks(step);
        catchupQueue -= step;
        // 补算期间的视觉更新压到每帧一次
        MW.Renderer.onSimTick(world);
        MW.UI.catchupProgress(catchupTotal - catchupQueue, catchupTotal,
          '已补算 ' + (catchupTotal - catchupQueue) + ' / ' + catchupTotal + ' 天');
        if (catchupQueue <= 0) {
          MW.UI.showCatchup(false);
          MW.UI.toast(MW.T('toast.catchupDone', '离线进度补算完成'));
          afterCatchup();
        }
        perf.tickMs = performance.now() - t1;
      } else {
        MW.Renderer.onSimTick(world);
      }
      // —— 渲染（60FPS目标） ——
      MW.Renderer.draw(now);
      // —— HUD（4Hz） ——
      _hudT += dtMs;
      if (_hudT > 250) { _hudT = 0; MW.UI.updateHUD(); }
      // —— 自动存档（45s） ——
      autosaveT += dtMs;
      if (autosaveT > 45000) { autosaveT = 0; MW.saveWorld(world); }
    }
    // perf
    var fr = performance.now() - t0;
    perf.frameMs = perf.frameMs * 0.9 + fr * 0.1;
    _fpsC++; _fpsT += dtMs;
    if (_fpsT >= 1000) { perf.fps = Math.round(_fpsC * 1000 / _fpsT); _fpsC = 0; _fpsT = 0; }
  }

  function runTicks(n) {
    var t0 = performance.now();
    for (var i = 0; i < n; i++) {
      MW.simTick(world);
      perf.ticks++;
      if (_autoevoSetting === false && world.evoCd === 0) world.evoCd = 1; // 手动模式下暂停自动购买
      checkEnding();
      checkNews();
    }
    _tickAcc += performance.now() - t0; _tickN += n;
    if (_tickN >= 30) { perf.tickMs = _tickAcc / _tickN; _tickAcc = 0; _tickN = 0; }
  }

  function checkNews() {
    var w = world;
    if (w.news.length && w.news[w.news.length - 1].day > (MW.UI.lastNewsDay || -1)) {
      var item = w.news[w.news.length - 1];
      // 逐条推送（低频，模拟中一次可能生成多条——只推最后一条，其余进时间线）
      MW.UI.lastNewsDay = item.day;
      MW.UI.pushNewsItem(item);
    }
  }

  function checkEnding() {
    if (world.flags.ended && !MW.UI.endNoted) {
      MW.UI.endNoted = true;
      MW.saveWorld(world);
      MW.UI.showEnding(world);
    }
  }

  // ---------- 可见性 / 补算 ----------
  function onVisibility() {
    if (!world || !running) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      world.wallAnchor = hiddenAt;
      MW.saveWorld(world);
    } else if (hiddenAt) {
      var ha = hiddenAt;
      hiddenAt = 0;
      scheduleCatchup(Date.now() - ha);
    }
  }

  // 锚点先行：先写新锚点并存档，再分批补算 —— 中断只会少推，不会重推
  function scheduleCatchup(deltaMs) {
    var plan = MW.catchupCompute(world, Date.now(), Date.now() - Math.max(0, deltaMs), settings.offCapH || 8);
    if (plan.ticks <= 0 && plan.approxSteps <= 0) return;
    world.wallAnchor = Date.now();
    MW.saveWorld(world);
    world.flags.catchupTicks = (world.flags.catchupTicks || 0) + plan.ticks + plan.approxSteps * 7;
    perf.catchups++;
    var total = plan.ticks;
    var note = '';
    if (plan.clipped) note += MW.T('catchup.clipped', '离线时长超出上限（{h}小时），超出部分不再逐日模拟。', { h: settings.offCapH || 8 });
    if (plan.approx) note += ' ' + MW.T('catchup.approx', '另有约 {d} 天以“快速推进”方式跳过（近似处理，与实时运行不完全等价）。', { d: plan.approxSteps * 7 });
    if (plan.ticks > 240) {
      MW.UI.showCatchup(true);
      MW.UI.catchupProgress(0, total, note);
    }
    catchupQueue = plan.ticks;
    catchupTotal = Math.max(1, plan.ticks);
    world._pendingApprox = plan.approxSteps;
    world._catchupNote = note;
    if (plan.ticks === 0 && plan.approxSteps > 0) afterCatchup();
  }

  function afterCatchup() {
    var steps = world._pendingApprox || 0;
    world._pendingApprox = 0;
    if (steps > 0) {
      // 分帧近似推进（每帧最多60步）
      var chunk = function () {
        var s = Math.min(60, steps);
        MW.approxAdvance(world, s);
        steps -= s;
        if (steps > 0) requestAnimationFrame(chunk);
        else {
          catchupQueue = -1;
          MW.pushNews(world, '系统', MW.T('news.fastforward', '离线期间部分时间以快速推进方式度过（近似处理）'), 1);
          MW.saveWorld(world);
          MW.UI.toast(MW.T('toast.fastDone', '快速推进完成：{n} 天被跳过', { n: world.flags.approxDays || 0 }));
        }
      };
      chunk();
    } else {
      catchupQueue = -1;
      if (world._catchupNote) MW.UI.toast(world._catchupNote.trim());
    }
    world._catchupNote = '';
  }

  // ---------- 手动干预（可选） ----------
  function manualBuy(traitId) {
    var t = null;
    for (var i = 0; i < MW.TRAITS.length; i++) if (MW.TRAITS[i].id === traitId) t = MW.TRAITS[i];
    if (!t || world.ap < t.cost) { MW.UI.toast('适应点不足', true); return; }
    var ownedSet = {};
    world.owned.forEach(function (x) { ownedSet[x] = true; });
    for (var k = 0; k < t.req.length; k++) if (!ownedSet[t.req[k]]) { MW.UI.toast('前置未满足', true); return; }
    world.ap -= t.cost;
    world.owned.push(t.id);
    world.stats.evoLastDay = world.day;
    MW.applyFxPublic(world.params, t);
    world.evoLog.push({
      day: world.day, id: t.id, name: MW.traitName(t.id), cost: t.cost,
      reason: MW.T('evo.manualReason', '观察者手动干预购买')
    });
    MW.pushNews(world, '演化', MW.T('evo.manual', '观察者主动引导异常演化出【{n}】', { n: MW.traitName(t.id) }), 1);
    MW.UI.renderTab();
  }

  // ---------- 手动干预（可选）：优先援助 ----------
  function setAidPriority(idx) {
    if (!world) return;
    var okp = MW.setAidPriority(world, idx);
    MW.UI.toast(okp ? MW.T('aidprio.toast', '已更新援助优先级') : MW.T('aidprio.bad', '无效的区域'), !okp);
  }

  // ---------- 速度 / 暂停 / 迷你 / 画质 ----------
  function togglePause() {
    if (!world) return;
    setSpeed(paused ? resumeSpeed : 0);
  }
  function setSpeed(s) {
    if (!world) return;
    if (MW.SPEEDS.indexOf(s) < 0) return;
    if (s === 0 && world.speedIdx > 0) resumeSpeed = world.speedIdx;
    paused = (s === 0);
    world.speedIdx = s;
    // Persist pause itself so hidden/reloaded worlds cannot accrue offline ticks.
    world.wallAnchor = Date.now();
    MW.saveWorld(world);
    MW.UI.updateHUD();
  }
  function toggleMini() {
    settings.mini = !settings.mini;
    MW.saveSettings(settings);
    applyMini();
    MW.Renderer.resize();
  }
  function applyMini() {
    document.body.classList.toggle('mini', !!settings.mini);
    $('btn-mini').textContent = settings.mini ? MW.T('btn.standard', '标准') : MW.T('btn.mini', '迷你');
    $('btn-menu').textContent = MW.T('btn.menu', '菜单');
  }
  function setQuality(q) {
    settings.quality = q;
    MW.saveSettings(settings);
    MW.Renderer.setQuality(q);
  }

  // ---------- 窗口尺寸记忆 ----------
  var rsT = 0;
  function onResize() {
    clearTimeout(rsT);
    rsT = setTimeout(function () {
      MW.Renderer.resize();
      if (!settings.mini && window.outerWidth > 0) {
        settings.winW = window.innerWidth; settings.winH = window.innerHeight;
        MW.saveSettings(settings);
      }
    }, 700);
  }
  function restoreWindowSize() {
    try {
      if (settings.winW >= 320 && settings.winH >= 240 && window.history.length <= 2) {
        window.resizeTo(settings.winW, settings.winH);
      }
    } catch (e) { /* 非 app 模式下可能被拒绝：忽略 */ }
  }

  // ---------- 导入/导出 ----------
  function exportSave() {
    if (!world) return;
    try {
      var str = MW.exportSave(world);
      var blob = new Blob([str], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '微疫世界存档_' + world.seedStr + '_第' + world.day + '天.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      MW.UI.toast(MW.T('toast.exported', '已导出存档文件'));
    } catch (e) { MW.UI.toast(MW.T('toast.exportFail', '导出失败：') + e.message, true); }
  }
  function importSave(evt) {
    var f = evt.target.files && evt.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var w = MW.importSave(rd.result);
        w._eventFreqSetting = settings.eventFreq || 1;
        world = w;
        enterGame();
        MW.UI.toast(MW.T('toast.imported', '导入成功：继续第 {d} 天的观察', { d: w.day }));
      } catch (e) {
        MW.UI.toast(MW.T('toast.importFail', '导入失败：') + e.message, true); // 坏文件不影响现有存档
      }
    };
    rd.readAsText(f);
    evt.target.value = '';
  }

  // ---------- 场景包导入（创意工坊，本地文件） ----------
  function importPack(evt) {
    var f = evt.target.files && evt.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var id = MW.Packs.importPack(rd.result);
        MW.UI.fillSetup(); // 新场景立即可选
        MW.UI.toast(MW.T('pack.imported', '场景包已导入：{id}', { id: id }));
      } catch (e) {
        MW.UI.toast(MW.T('pack.importFail', '场景包导入失败：') + e.message, true);
      }
    };
    rd.readAsText(f);
    evt.target.value = '';
  }

  // ---------- 性能文本 ----------
  function perfText() {
    var mem = '';
    if (performance.memory) {
      mem = '<br>JS堆 ' + (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MiB（上限 ' +
        (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0) + ' MiB）';
    }
    return 'FPS ' + perf.fps + ' · 帧 ' + perf.frameMs.toFixed(1) + 'ms · 仿真 ' + perf.tickMs.toFixed(2) + 'ms/tick' +
      '<br>累计模拟 ' + perf.ticks + ' 天 · 补算 ' + perf.catchups + ' 次' + mem +
      '<br><span class="dim">目标：60FPS · 常态≤1核 · 进程树≤512MiB（实测见测试报告）</span>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
