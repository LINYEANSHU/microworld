// debug-http-cdp.js — 通过 HTTP 加载游戏以获得未掩码的报错（诊断工具）
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;
var execSync = require('child_process').execSync;

var PORT = 9340, DBG = 9341;
var ROOT = path.join(__dirname, '..');
var PROFILE = path.join(os.tmpdir(), 'microworld-bench-profile');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function killOurs() {
  try {
    execSync("powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='msedge.exe' or Name='chrome.exe'\\\" | Where-Object { $_.CommandLine -like '*microworld*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\"", { stdio: 'ignore' });
  } catch (e) {}
}

(async function main() {
  killOurs();
  await sleep(1200);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(PROFILE, { recursive: true });

  var server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await sleep(1200);

  var exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!fs.existsSync(exe)) exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  var child = spawn(exe, ['--disable-gpu', '--remote-debugging-port=' + DBG,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--window-size=900,600',
    '--app=http://127.0.0.1:' + PORT + '/'], { stdio: 'ignore' });
  await sleep(3500);

  var res = await fetch('http://127.0.0.1:' + DBG + '/json/list');
  var list = await res.json();
  var page = list.find(function (t) { return t.type === 'page' && t.url.indexOf(String(PORT)) >= 0; });
  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (r) { ws.onopen = r; });
  var seq = 0, pending = {};
  ws.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; }
  };
  function send(expr) {
    return new Promise(function (res2) {
      var i = ++seq; pending[i] = res2;
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    });
  }
  var served = await (await fetch('http://127.0.0.1:' + PORT + '/')).text();
  var r = await send("(function(){var pop=document.getElementById('pop-settings');"
    + "return {errs: window.__errs,"
    + " selLangCount: document.querySelectorAll('[id=sel-lang]').length,"
    + " popLen: pop?pop.innerHTML.length:-1,"
    + " popTail: pop?pop.innerHTML.slice(-260):'NONE',"
    + " popChildren: pop?pop.children.length:-1};})()");
  console.log('HTTP加载诊断:', JSON.stringify(r.result.value, null, 1));
  var lines = served.split('\n');
  console.log('--- served HTML lines 140-170 ---');
  for (var li = 139; li < 170 && li < lines.length; li++) console.log((li + 1) + ': ' + lines[li]);

  ws.close();
  try { child.kill(); } catch (e) {}
  try { server.kill(); } catch (e) {}
  killOurs();
  process.exit(0);
})().catch(function (e) { console.error('ERR', e.message); process.exit(1); });
