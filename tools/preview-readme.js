// preview-readme.js — GitHub 宽度预览：hero/workflow/截图在 900px 与 360px 下的渲染检查
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;
var pathToFileURL = require('url').pathToFileURL;
var execSync = require('child_process').execSync;

var PORT = 9337;
var ROOT = path.join(__dirname, '..');
var A = path.join(ROOT, 'assets', 'readme');
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
      var page = list.find(function (t) { return t.type === 'page' && t.url.indexOf('preview.html') >= 0; });
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
async function fullShot(cdp, name) {
  var r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('  已保存 ' + name);
}
var OUT = path.join(ROOT, 'test', 'shots');

(async function main() {
  killOurs();
  await sleep(1200);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(PROFILE, { recursive: true });

  var html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:sans-serif}'
    + '.wrap{padding:12px}.dark{background:#0d1117;padding:12px}'
    + 'img{display:block;width:100%;border:1px solid #ddd;border-radius:6px;margin:6px 0}'
    + '.dark img{border-color:#222}h4{margin:8px 0 2px;color:#555}</style>'
    + '<div class="wrap"><h4>桌面 900px（浅色页面）</h4>'
    + '<img style="width:900px" src="' + pathToFileURL(path.join(A, 'hero.svg')).href + '">'
    + '<img style="width:900px" src="' + pathToFileURL(path.join(A, 'shot-game.png')).href + '">'
    + '<img style="width:900px" src="' + pathToFileURL(path.join(A, 'workflow.svg')).href + '">'
    + '</div>'
    + '<div class="dark"><h4 style="color:#999">桌面 900px（深色页面）</h4>'
    + '<img style="width:900px" src="' + pathToFileURL(path.join(A, 'hero.svg')).href + '">'
    + '</div>'
    + '<div class="wrap"><h4>手机 360px（浅色页面）</h4>'
    + '<img style="width:360px" src="' + pathToFileURL(path.join(A, 'hero.svg')).href + '">'
    + '<img style="width:360px" src="' + pathToFileURL(path.join(A, 'workflow.svg')).href + '">'
    + '</div>';
  var previewPath = path.join(os.tmpdir(), 'mw-preview.html');
  fs.writeFileSync(previewPath, html);

  var exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(exe)) exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  var child = spawn(exe, ['--disable-gpu', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--window-size=960,900',
    '--app=' + pathToFileURL(previewPath).href], { stdio: 'ignore' });
  var page = await waitForDevtools(20000);
  var cdp = Cdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await sleep(1200);
  var h = await evalJS(cdp, "document.body.scrollHeight");
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 940, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await fullShot(cdp, 'preview-wide.png');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await fullShot(cdp, 'preview-narrow.png');
  console.log('[preview] 完成');
  cdp.close();
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(function (e) { console.error('ERR:', e.message); process.exit(1); });
