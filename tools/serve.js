// serve.js — 开发/测试用极简静态服务器（游戏本体可脱离此文件直接以 file:// 运行）
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var port = process.argv[2] ? +process.argv[2] : 8391;
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
http.createServer(function (req, res) {
  var p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  var f = path.join(root, p);
  if (f.indexOf(root) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, function (e, buf) {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', function () { console.log('serving http://127.0.0.1:' + port); });
