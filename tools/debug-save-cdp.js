// debug-save-cdp.js — 定位浏览器内 存→读 差异（单轮，打印第一处不同）
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

var PORT = 9334;
var ROOT = path.join(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var PROFILE = path.join(os.tmpdir(), 'microworld-bench-profile');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
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

(async function main() {
  var exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(exe)) exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  killOurs();
  await sleep(1500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(PROFILE, { recursive: true });
  var child = spawn(exe, ['--disable-gpu', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--window-size=1024,640',
    '--app=' + pathToFileURL(INDEX).href], { stdio: 'ignore' });
  var page = await waitForDevtools(20000);
  var cdp = Cdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await sleep(1000);
  try { await cdp.send('Page.bringToFront'); } catch (e) {}

  var diag = await evalJS(cdp, "(function(){"
    + "document.getElementById('btn-start').onclick();"
    + "var w = window.MW.UI.w;"
    + "for (var i=0;i<200;i++) window.MW.simTick(w);"
    + "var snap = JSON.stringify(window.MW.serialize(w));"
    + "var key = window.MW.saveWorld(w);"
    + "var raw = localStorage.getItem(key);"
    + "var loaded = window.MW.loadWorld();"
    + "var out = {key:key, hasRaw:!!raw, loadedNull: !loaded, corrupt: !!(loaded&&loaded.corrupt), hasWorld: !!(loaded&&loaded.world)};"
    + "if (loaded && loaded.world) {"
    + "  var back = JSON.stringify(window.MW.serialize(loaded.world));"
    + "  out.same = back === snap;"
    + "  if (!out.same) {"
    + "    for (var i2=0;i2<Math.max(snap.length,back.length);i2++){"
    + "      if (snap[i2]!==back[i2]) { out.at=i2;"
    + "        out.ctxA=snap.slice(Math.max(0,i2-70), i2+70);"
    + "        out.ctxB=back.slice(Math.max(0,i2-70), i2+70); break; }"
    + "    }"
    + "    if (out.at===undefined) out.lenA=snap.length, out.lenB=back.length;"
    + "  }"
    + "}"
    + "return out;})()");
  console.log(JSON.stringify(diag, null, 1));
  cdp.close();
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(function (e) { console.error('ERR:', e.message); process.exit(1); });
