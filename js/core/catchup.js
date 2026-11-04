// catchup.js — 离线/隐藏期进度：纯逻辑（可单测）。
// 原则：
//  - 时钟回拨 / 重复恢复（delta<=0）→ 不推进
//  - 暂停速度(0) → 不推进、不累计离线进度
//  - 默认离线上限8小时（可设置4/8/12h）；上限内逐日全量补算（分批执行，不卡帧）
//  - 超出全量补算预算的时间：按周"跳过并记录"（明确标记近似推进，不等价于实时运行）
//  - 锚点先行：调用方必须在执行前就把新锚点写入存档 —— 中断只会"少推"，绝不会"重推"
'use strict';
(function () {
  var MW = globalThis.MW;

  MW.SPEEDS = [0, 1, 2, 4, 8];          // 速度档（×）
  MW.BASE_TPS = 1.0;                    // 1× = 1 tick/秒（仿真基础更新1—2Hz；2×时为2Hz）
  MW.MAX_TICKS_PER_FRAME = 30;          // 单帧补跑上限（保持60FPS与CPU预算）
  MW.MAX_DEBT_TICKS = 90;               // 帧间债务上限（长时间卡顿不爆发补算）
  MW.FULL_CATCHUP_BUDGET = 20000;       // 全量补算tick预算（约2—4秒CPU）

  // speedIdx 存的是倍率本身（0/1/2/4/8）；非法值按暂停处理
  MW.tpsOf = function (speedIdx) {
    var s = +speedIdx || 0;
    if (MW.SPEEDS.indexOf(s) < 0) s = 0;
    return s * MW.BASE_TPS;
  };

  // 纯函数：计算应补的 tick 数
  MW.catchupCompute = function (w, nowMs, hiddenAtMs, offCapH) {
    var tps = MW.tpsOf(w.speedIdx);
    var out = { ticks: 0, approxSteps: 0, approx: false, clipped: false, deltaMs: 0 };
    if (tps <= 0) return out; // 暂停不累计离线进度
    var deltaMs = nowMs - hiddenAtMs;
    out.deltaMs = deltaMs;
    if (!(deltaMs > 0)) return out;    // 时钟回拨或重复恢复
    var capMs = (offCapH || 8) * 3600e3;
    if (deltaMs > capMs) { out.clipped = true; deltaMs = capMs; }
    var total = Math.floor(deltaMs / 1000 * tps);
    out.ticks = Math.min(total, MW.FULL_CATCHUP_BUDGET);
    out.approxSteps = Math.max(0, Math.floor((total - out.ticks) / 7));
    out.approx = out.approxSteps > 0;
    return out;
  };

  // 近似推进：每周跳过并记录（疾病动力学不逐日模拟——诚实标注，不假装等价）
  MW.approxAdvance = function (w, steps) {
    for (var s = 0; s < steps; s++) {
      w.day += 7;
      var tot = w._tot;
      if (tot) {
        var h = w.hist;
        h.t.push(w.day); h.inf.push(tot.I); h.dead.push(tot.D);
        h.cure.push(w.research.progress); h.aw.push(MW.globalAwareness(w)); h.pop.push(tot.L);
        if (h.t.length > 1500) { h.t.shift(); h.inf.shift(); h.dead.shift(); h.cure.shift(); h.aw.shift(); h.pop.shift(); }
      }
      MW.endingCheck(w);
    }
    if (steps > 0) {
      w.flags.approx = true;
      w.flags.approxDays = steps * 7;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
