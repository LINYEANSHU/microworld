// rng.js — 可序列化的确定性随机数（mulberry32）。
// 仿真内所有随机数必须来自本文件；视觉随机数使用 MW.visualRng（不进存档）。
'use strict';
(function () {
  var MW = globalThis.MW;

  function Rng(seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  Rng.prototype.nextU32 = function () {
    var t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  Rng.prototype.next = function () { return this.nextU32() / 4294967296; };
  Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  Rng.prototype.int = function (n) { return Math.floor(this.next() * n) % n; };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };
  Rng.prototype.getState = function () { return this.s; };
  Rng.prototype.setState = function (s) { this.s = s >>> 0; };

  MW.Rng = Rng;

  // 视觉专用：不参与模拟，不保存
  MW.visualRng = new Rng((Date.now() & 0xffffffff) >>> 0);
  MW.visualRng.next = MW.visualRng.next.bind(MW.visualRng);

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
