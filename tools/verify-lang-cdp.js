// verify-lang-cdp.js — 验证游戏内中英切换：开始屏/战局HUD/演化树/结局 + 无JS错误
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;
var pathToFileURL = require('url').pathToFileURL;
var execSync = require('child_process').execSync;

var PORT = 9338;
var ROOT = path.join(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var OUT = path.join(ROOT, 'assets', 'readme');
var PROFILE = path.join(os.tmpdir(), 'microworld-bench-profile');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function killOurs() {
  try {
    execSync("powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='msedge.exe' or Name='chrome.exe'\\\" | Where-Object { $_.CommandLine -like '*microworld*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\"", { stdio: 'ignore' });
  } catch (e) {}
}
async function waitForDevtools(timeoutMs) {
  var t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      var res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      var list = await res.json();
      var page = list.find(function (t) { return t.type === 'page' && t.url.indexOf('index.html') >= 0; });
      if (page) return page;
    } catch (e) {}
    await sleep(300);
  }
  throw new Error('DevTools 未就绪');
}
function Cdp(wsUrl) {
  var ws = new WebSocket(wsUrl), id = 0, pending = {};
  ws.onmessage = function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.id && pending[msg.id]) {
      var p = pending[msg.id]; delete pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    }
  };
  return {
    ready: new Promise(function (res, rej) { ws.onopen = res; ws.onerror = function () { rej(new Error('WS失败')); }; }),
    send: function (method, params) {
      return new Promise(function (resolve, reject) {
        var mid = ++id; pending[mid] = { resolve: resolve, reject: reject };
        ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
      });
    },
    close: function () { try { ws.close(); } catch (e) {} }
  };
}
async function evalJS(cdp, expr, awaitP) {
  var r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: !!awaitP, returnByValue: true });
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  return r.result.value;
}
async function shot(cdp, name) {
  var r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('  已保存 ' + name);
}

(async function main() {
  killOurs();
  await sleep(1500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(PROFILE, { recursive: true });
  var exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(exe)) exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  var child = spawn(exe, ['--disable-gpu', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--window-size=1024,640',
    '--app=' + pathToFileURL(INDEX).href], { stdio: 'ignore' });
  var page = await waitForDevtools(20000);
  var cdp = Cdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  try { await cdp.send('Page.bringToFront'); } catch (e) {}
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 640, deviceScaleFactor: 2, mobile: false });
  await sleep(1000);

  // 默认中文 → 切英文 → 开始屏文本
  var zh = await evalJS(cdp, "({lang: window.MW.LANG, big: document.getElementById('btn-start').textContent, sub: document.getElementById('start-sub').textContent.slice(0,14)})");
  await evalJS(cdp, "document.getElementById('btn-lang').onclick(); 'switched'");
  await sleep(400);
  var en = await evalJS(cdp, "({lang: window.MW.LANG, big: document.getElementById('btn-start').textContent, sub: document.getElementById('start-sub').textContent.slice(0,22)})");

  // 英文开局 → 推进 → 演化树/HUD/时间线 英文
  await evalJS(cdp, "(function(){"
    + "document.getElementById('sel-scenario').value='steel';document.getElementById('sel-scenario').onchange();"
    + "document.getElementById('sel-anomaly').value='res';document.getElementById('sel-anomaly').onchange();"
    + "document.getElementById('in-seed').value='readme';"
    + "document.getElementById('btn-setup-start').onclick(); return 1;})()");
  await evalJS(cdp, "(function(){var w=window.MW.UI.w; for(var i=0;i<1500;i++) window.MW.simTick(w);"
    + "window.MW.UI.lastNewsDay=w.news.length?w.news[w.news.length-1].day:-1;"
    + "window.MW.UI.pushNewsItem(w.news[w.news.length-1]); return w.day;})()");
  await sleep(1800);
  var hudEn = await evalJS(cdp, "({inf: document.getElementById('st-inf').querySelector('i').textContent,"
    + " phase: document.getElementById('chip-phase').textContent,"
    + " hudDay: document.getElementById('hud-day').textContent,"
    + " ticker: document.getElementById('ticker-text').textContent.slice(0,60)})");
  await evalJS(cdp, "window.MW.UI.openDrawer('evo'); 'open'");
  await sleep(300);
  var evoEn = await evalJS(cdp, "(function(){var b=document.getElementById('drawer-body');"
    + "return {first: (b.querySelector('.evo-node .nm')||{textContent:''}).textContent.slice(0,30),"
    + " why: (b.querySelector('.evo-why')||{textContent:''}).textContent.slice(0,70)};})()");
  await shot(cdp, 'shot-game-en.png');

  // 切回中文确认可逆
  await evalJS(cdp, "document.getElementById('btn-lang').onclick(); 'back'");
  await sleep(400);
  var backZh = await evalJS(cdp, "({phase: document.getElementById('chip-phase').textContent,"
    + " stat: document.getElementById('st-inf').querySelector('i').textContent})");

  console.log(JSON.stringify({ zh: zh, en: en, hudEn: hudEn, evoEn: evoEn, backZh: backZh,
    errs: await evalJS(cdp, "window.__errs||[]") }, null, 1));
  cdp.close();
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(function (e) { console.error('ERR:', e.message); process.exit(1); });
