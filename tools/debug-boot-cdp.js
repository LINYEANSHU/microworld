// debug-boot-cdp.js — 页面启动诊断：错误/命名空间/按钮处理器
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;
var pathToFileURL = require('url').pathToFileURL;
var execSync = require('child_process').execSync;

var PORT = 9339;
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
async function evalJS(cdp, expr) {
  var r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  return r.result.value;
}

(async function main() {
  killOurs();
  await sleep(1500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(PROFILE, { recursive: true });
  var exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(exe)) exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  var child = spawn(exe, ['--disable-gpu', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--window-size=900,600',
    '--app=' + pathToFileURL(INDEX).href], { stdio: 'ignore' });
  var page = await waitForDevtools(20000);
  var cdp = Cdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await sleep(1500);
  var r = await evalJS(cdp, "({errs: window.__errs, hasMW: typeof window.MW !== 'undefined',"
    + " lang: typeof window.MW !== 'undefined' ? window.MW.LANG : '-',"
    + " btnLang: typeof document.getElementById('btn-lang'),"
    + " onclick: typeof document.getElementById('btn-lang') === 'object' ? String(typeof document.getElementById('btn-lang').onclick) : '-',"
    + " startVisible: !document.getElementById('screen-start').classList.contains('hidden')})");
  console.log(JSON.stringify(r, null, 1));
  cdp.close();
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(function (e) { console.error('ERR:', e.message); process.exit(1); });
