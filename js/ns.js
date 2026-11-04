// ns.js — 全局命名空间与通用工具（浏览器与 Node 共用）
'use strict';
(function () {
  var MW = (globalThis.MW = globalThis.MW || {});

  var U = MW.U = {};

  U.clamp = function (x, a, b) { return x < a ? a : (x > b ? b : x); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };

  // 大数字格式化（游戏人口以"人"为单位存储）
  U.fmtPop = function (n) {
    if (!isFinite(n)) return '—';
    n = Math.max(0, n);
    if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 2 : 1) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + '万';
    return Math.round(n) + '';
  };
  U.fmtPct = function (x, digits) {
    if (!isFinite(x)) return '—';
    return (x * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  };
  U.fmtDay = function (day) {
    var y = Math.floor(day / 365) + 1, d = (day % 365) + 1;
    return '第' + y + '年·第' + d + '天';
  };

  // FNV-1a 32位哈希：用于种子与存档校验和
  U.hashStr = function (s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  };
  U.fnv1a = function (s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };

  // 大圆距离（km）。仅在世界生成/绘制阶段使用；仿真热路径不调用超越函数，
  // 以保证跨引擎浮点一致性。
  var RAD = Math.PI / 180, ER = 6371;
  U.distKM = function (lon1, lat1, lon2, lat2) {
    var dLat = (lat2 - lat1) * RAD, dLon = (lon2 - lon1) * RAD;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * ER * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  // 无超越函数的分段线性"季节"曲线（0..1 循环），供仿真使用
  U.seasonWave = function (phase) { // phase in [0,1)
    var x = phase - Math.floor(phase);
    if (x < 0.25) return x * 4;
    if (x < 0.5) return 1;
    if (x < 0.75) return (0.75 - x) * 4;
    return 0;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
