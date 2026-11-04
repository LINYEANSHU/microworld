// debug-mini-cdp.js — 诊断迷你模式切换后的渲染/HUD状态
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;
var pathToFileURL = require('url').pathToFileURL;
var execSync = require('child_process').execSync;

var PORT = 9336;
var ROOT = path.join(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
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
function probe(tag) {
  return evalJS(cdp, "(function(){var w=window.MW&&window.MW.UI?window.MW.UI.w:null;var c=document.getElementById('map');"
    + "return {tag:'" + tag + "', errs:(window.__errs||[]).slice(-3), hasW:!!w, day:w?w.day:-1,"
    + " totI:w&&w._tot?Math.round(w._tot.I):-1,"
    + " cw:c?c.clientWidth:-1, ch:c?c.clientHeight:-1, cwAttr:c?c.width:-1,"
    + " mini:document.body.classList.contains('mini'),"
    + " screenGameHidden:document.getElementById('screen-game').classList.contains('hidden')};})()");
}

var cdp;
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
  cdp = Cdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  try { await cdp.send('Page.bringToFront'); } catch (e) {}
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 640, deviceScaleFactor: 2, mobile: false });
  await sleep(1000);

  console.log(JSON.stringify(await probe('boot'), null, 1));
  await evalJS(cdp, "(function(){document.getElementById('btn-setup').onclick();"
    + "document.getElementById('sel-scenario').value='steel';document.getElementById('sel-scenario').onchange();"
    + "document.getElementById('sel-anomaly').value='res';document.getElementById('sel-anomaly').onchange();"
    + "document.getElementById('in-seed').value='readme';"
    + "document.getElementById('btn-setup-start').onclick(); return 1;})()");
  await evalJS(cdp, "(function(){var w=window.MW.UI.w; for(var i=0;i<1500;i++) window.MW.simTick(w); return w.day;})()");
  await sleep(1500);
  console.log(JSON.stringify(await probe('game'), null, 1));

  // 切迷你 + 改视口
  await evalJS(cdp, "document.getElementById('btn-mini').onclick(); 'toggled'");
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 320, deviceScaleFactor: 2, mobile: false });
  await sleep(1500);
  console.log(JSON.stringify(await probe('mini'), null, 1));
  // 等更久看是否恢复
  await sleep(2000);
  console.log(JSON.stringify(await probe('mini+2s'), null, 1));

  cdp.close();
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(function (e) { console.error('ERR:', e.message); process.exit(1); });
