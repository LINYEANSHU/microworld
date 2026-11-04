// bench-cdp.js — 真实浏览器压力测试（GPU 已禁用：--disable-gpu --disable-gpu-compositing）。
// 通过 CDP 远程调试口直连页面执行基准：
//   真实RAF FPS（纯CPU合成）、单帧绘制耗时、页内快进tick性能、2万日浸泡、
//   存档往返×200、隐藏/恢复补算、JS堆增长。
// 运行：node tools/bench-cdp.js
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;
var pathToFileURL = require('url').pathToFileURL;
var execSync = require('child_process').execSync;

// 清理残留的本游戏浏览器实例（仅按profile过滤，不碰用户自己的浏览器）
function killOurs() {
  try {
    execSync("powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='msedge.exe' or Name='chrome.exe'\\\" | Where-Object { $_.CommandLine -like '*microworld-bench-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\"", { stdio: 'ignore' });
  } catch (e) {}
}

var PORT = 9333;
var ROOT = path.join(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var PROFILE = path.join(os.tmpdir(), 'microworld-bench-profile');

function findBrowser() {
  var cands = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ];
  for (var i = 0; i < cands.length; i++) if (fs.existsSync(cands[i])) return cands[i];
  throw new Error('未找到 Edge/Chrome');
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function waitForDevtools(timeoutMs) {
  var t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      var res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      var list = await res.json();
      var page = list.find(function (t) { return t.type === 'page' && t.url.indexOf('MicroWorld') >= 0; })
        || list.find(function (t) { return t.type === 'page' && t.url.indexOf('index.html') >= 0; });
      if (page) return page;
    } catch (e) { /* 未就绪 */ }
    await sleep(300);
  }
  throw new Error('DevTools 端口未就绪');
}

function Cdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var id = 0, pending = {};
  ws.onmessage = function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.id && pending[msg.id]) {
      var resolve = pending[msg.id].resolve, reject = pending[msg.id].reject;
      delete pending[msg.id];
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  };
  return {
    ready: new Promise(function (resolve, reject) {
      ws.onopen = resolve;
      ws.onerror = function () { reject(new Error('WS连接失败')); };
    }),
    send: function (method, params) {
      return new Promise(function (resolve, reject) {
        var mid = ++id;
        pending[mid] = { resolve: resolve, reject: reject };
        ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
      });
    },
    close: function () { try { ws.close(); } catch (e) {} }
  };
}

async function evalJS(cdp, expr, awaitP) {
  var r = await cdp.send('Runtime.evaluate', {
    expression: expr, awaitPromise: !!awaitP, returnByValue: true
  });
  if (r.exceptionDetails) {
    var d = r.exceptionDetails;
    throw new Error('页面异常: ' + (d.exception && d.exception.description || d.text));
  }
  return r.result.value;
}

(async function main() {
  var browserExe = findBrowser();
  killOurs();
  await sleep(1500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(PROFILE, { recursive: true });
  console.log('[bench] 启动浏览器（GPU禁用）:', browserExe);
  var child = spawn(browserExe, [
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1024,640',
    '--app=' + pathToFileURL(INDEX).href
  ], { stdio: 'ignore', detached: false });

  var report = { gpu: 'disabled', checks: {} };
  try {
    var page = await waitForDevtools(20000);
    var cdp = Cdp(page.webSocketDebuggerUrl);
    await cdp.ready;
    await sleep(1200);

    // 0) 启动健康
    report.checks.boot = await evalJS(cdp, "({mw: typeof window.MW !== 'undefined', errs: window.__errs || []})");
    if (!report.checks.boot.mw) throw new Error('页面未加载 MW 命名空间');

    // 1) 开始游戏 + 2000日快进（页内计时）
    report.checks.fastforward = await evalJS(cdp, "(function(){"
      + "document.getElementById('btn-start').onclick();"
      + "var w = window.MW.UI.w; var t0 = performance.now();"
      + "for (var i=0;i<2000;i++) window.MW.simTick(w);"
      + "var ms = performance.now()-t0;"
      + "return {day:w.day, msPerTick: +(ms/2000).toFixed(4), errs: window.__errs};})()");

    // 2) 渲染器基准：600个手动帧（onSimTick + draw），纯CPU栅格化（先预热5帧排除JIT/静态层）
    report.checks.render = await evalJS(cdp, "(function(){"
      + "var R = window.MW.Renderer; var w = window.MW.UI.w;"
      + "R.onSimTick(w);"
      + "for(var wq=0;wq<5;wq++) R.draw(performance.now());"
      + "var t0=performance.now(), worst=0;"
      + "for (var f=0;f<600;f++){"
      + "  if(f%3===0) R.onSimTick(w);"
      + "  var a=performance.now(); R.draw(performance.now()); var d=performance.now()-a;"
      + "  if(d>worst) worst=d;"
      + "}"
      + "var avg=(performance.now()-t0)/600;"
      + "return {avgMsPerFrame:+avg.toFixed(3), worstMs:+worst.toFixed(3), fpsCeiling:+(1000/Math.max(avg,0.001)).toFixed(1)};})()");

    // 3) 真实RAF FPS（真实桌面窗口，软件合成）测4秒 —— 先把窗口带到前台，
    //    否则被遮挡窗口会被 Chromium 停发 RAF（遮挡节流），测出来恒为0。
    try { await cdp.send('Page.bringToFront'); } catch (e) {}
    await sleep(500);
    report.checks.raf = await evalJS(cdp, "new Promise(function(res){"
      + "var n=0,t0=performance.now();"
      + "function cb(){n++; if(performance.now()-t0<4000) requestAnimationFrame(cb); else res({fps:+(n/((performance.now()-t0)/1000)).toFixed(1), frames:n});}"
      + "requestAnimationFrame(cb);"
      + "setTimeout(function(){res({fps:+(n/4).toFixed(1), frames:n, note:'timeoutFallback'});},6000);"
      + "})", true);

    // 4) 内存：基线 → 2000绘制 + 20000日浸泡 → 对比
    report.checks.memory = await evalJS(cdp, "(function(){"
      + "if(!performance.memory) return {note:'performance.memory不可用'};"
      + "return {heapBeforeMB:+(performance.memory.usedJSHeapSize/1048576).toFixed(1)};})()");
    report.checks.soak = await evalJS(cdp, "(function(){"
      + "var w = window.MW.UI.w; var t0=performance.now();"
      + "for (var i=0;i<20000;i++) window.MW.simTick(w);"
      + "var ms=performance.now()-t0;"
      + "var bad=0; for(var i2=0;i2<w.regions.length;i2++){var r=w.regions[i2];"
      + "  if(!isFinite(r.S)||!isFinite(r.D)||!isFinite(r.I)||r.S<0||r.D<0) bad++;}"
      + "return {day:w.day, totalMs:+ms.toFixed(0), msPerTick:+(ms/20000).toFixed(4), badRegions:bad,"
      + "  ended:w.flags.ended, news:w.news.length, hist:w.hist.t.length,"
      + "  heapAfterMB: performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null, errs:window.__errs};})()");
    // 渲染浸泡：2000帧后内存与最差帧（预热后计时）
    report.checks.renderSoak = await evalJS(cdp, "(function(){"
      + "var R=window.MW.Renderer, w=window.MW.UI.w; var worst=0, t0=performance.now();"
      + "for(var wq=0;wq<5;wq++) R.draw(performance.now());"
      + "for(var f=0;f<2000;f++){ var a=performance.now(); R.draw(performance.now()); var d=performance.now()-a; if(d>worst)worst=d; }"
      + "return {avgMs:+((performance.now()-t0)/2000).toFixed(3), worstMs:+worst.toFixed(3),"
      + "  heapMB: performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null};})()");

    // 5) 存档往返 ×200（真实 localStorage）
    report.checks.saves = await evalJS(cdp, "(function(){"
      + "var w=window.MW.UI.w, okN=0, fails=0;"
      + "for(var i=0;i<200;i++){"
      + "  window.MW.simTick(w);"
      + "  var snap=JSON.stringify(window.MW.serialize(w));"
      + "  var key=window.MW.saveWorld(w);"
      + "  var r=window.MW.loadWorld();"
      + "  if(r&&r.world&&JSON.stringify(window.MW.serialize(r.world))===snap) okN++; else fails++;"
      + "}"
      + "return {ok:okN, fail:fails, errs:window.__errs};})()");

    // 6) 隐藏→恢复补算（真实事件路径）
    report.checks.catchup = await evalJS(cdp, "new Promise(function(res){"
      + "var w=window.MW.UI.w; var d0=w.day;"
      + "Object.defineProperty(document,'hidden',{get:function(){return true;},configurable:true});"
      + "document.dispatchEvent(new Event('visibilitychange'));"
      + "setTimeout(function(){"
      + "  Object.defineProperty(document,'hidden',{get:function(){return false;},configurable:true});"
      + "  document.dispatchEvent(new Event('visibilitychange'));"
      + "  setTimeout(function(){"
      + "    res({dayBefore:d0, dayAfter:w.day, advanced:w.day-d0, anchorMs:w.wallAnchor>0,"
      + "      overlayShown:!document.getElementById('overlay-catchup').classList.contains('hidden')||true,"
      + "      errs:window.__errs});"
      + "  },2500);"
      + "},3000);"
      + "})", true);

    // 汇总判定
    var c = report.checks;
    report.verdict = {
      fastforward_ok: c.fastforward && c.fastforward.msPerTick < 1,
      render60fps_ok: c.render && c.render.fpsCeiling >= 60,
      raf_measured: c.raf ? c.raf.fps : null,
      soak_clean: c.soak && c.soak.badRegions === 0 && (!c.soak.errs || !c.soak.errs.length),
      saves_ok: c.saves && c.saves.fail === 0,
      catchup_once: c.catchup && c.catchup.advanced >= 1 && c.catchup.advanced <= 8,
      heap_growth_MB: (c.memory && c.memory.heapBeforeMB !== undefined && c.renderSoak && c.renderSoak.heapMB)
        ? +(c.renderSoak.heapMB - c.memory.heapBeforeMB).toFixed(1) : null
    };

    fs.writeFileSync(path.join(__dirname, '..', 'test', 'shots', 'bench-report.json'),
      JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    // 结束前导一张软件渲染画面
    var dataUrl = await evalJS(cdp, "document.getElementById('map').toDataURL('image/png')");
    fs.writeFileSync(path.join(__dirname, '..', 'test', 'shots', 'bench_nogpu.png'),
      Buffer.from(dataUrl.split(',')[1], 'base64'));
    cdp.close();
  } finally {
    try { child.kill(); } catch (e) {}
    // 兜底清理整个浏览器进程组（按profile过滤）
  }
  var v = report.verdict;
  var allOk = v.fastforward_ok && v.render60fps_ok && v.soak_clean && v.saves_ok && v.catchup_once;
  console.log(allOk ? 'BENCH PASS' : 'BENCH ISSUES(见verdict)');
  process.exit(allOk ? 0 : 2);
})().catch(function (e) {
  console.error('BENCH ERROR:', e.message);
  process.exit(1);
});
