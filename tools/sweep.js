// sweep.js — 批量平衡扫描（无头，纯 Node，天然无 GPU）。
// 用途（docs/未完成清单.md 第9条）：按百分位审视结局时长/类型分布，为调参提供依据。
// 两种用法：
//   1) CLI：node tools/sweep.js [--scen std,ash] [--anom fog,res] [--seeds 3] [--days 5200]
//   2) 编程：require('./sweep.js').runBatch({...}) —— run-tests.js 用它做小规模确定性断言
'use strict';
(function () {
  require('../js/ns.js'); require('../js/rng.js');
  require('../js/data/land.js'); require('../js/data/regions.js');
  require('../js/data/traits.js'); require('../js/data/scenarios.js');
  require('../js/data/i18n.js');
  require('../js/core/world.js'); require('../js/core/sim.js'); require('../js/core/response.js');
  require('../js/core/evolution.js'); require('../js/core/events.js'); require('../js/core/endings.js');
  require('../js/core/catchup.js'); require('../js/core/persist.js');
  require('../js/core/workshop.js');
  var MW = globalThis.MW;

  // 确定性百分位（线性插值）：sorted 为升序数组
  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    var idx = (sorted.length - 1) * Math.min(1, Math.max(0, p));
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  // 单局：跑到一个世界至多 maxDays 日（或结局）
  function runOne(scen, anomaly, seedStr, maxDays) {
    var w = MW.createWorld({ seedStr: seedStr, scenario: scen, anomaly: anomaly });
    var d = 0;
    while (d < maxDays && !w.flags.ended) { MW.simTick(w); d++; }
    var tot = w._tot || { I: 0, E: 0, D: 0, C: 0, L: 0 };
    return {
      scen: scen, anomaly: anomaly, seed: seedStr, days: w.day, ended: w.flags.ended || 'running',
      dead: tot.D, deadPct: tot.D / MW.WORLD_POP0, cure: w.research.progress,
      evo: w.evoLog.length, maxI: w.stats.maxI
    };
  }

  // 批量：scenarios × anomalies × seeds 组合，逐局确定性运行
  function runBatch(opts) {
    var o = opts || {};
    var scens = o.scenarios || ['std', 'frost', 'isles', 'steel', 'sleep', 'ash'];
    var anoms = o.anomalies || ['cry', 'fog', 'res', 'dor', 'et', 'emb'];
    var nSeeds = o.seeds || 3;
    var maxDays = o.maxDays || 5200;
    var runs = [];
    for (var s = 0; s < scens.length; s++) {
      for (var a = 0; a < anoms.length; a++) {
        for (var k = 0; k < nSeeds; k++) {
          runs.push(runOne(scens[s], anoms[a], o.seedPrefix ? (o.seedPrefix + s + '_' + a + '_' + k) : ('sweep' + s + '_' + a + '_' + k), maxDays));
        }
      }
    }
    return summarize(runs, maxDays);
  }

  function summarize(runs, maxDays) {
    var days = runs.map(function (r) { return r.days; }).sort(function (x, y) { return x - y; });
    var dead = runs.map(function (r) { return r.deadPct; }).sort(function (x, y) { return x - y; });
    var kinds = {};
    runs.forEach(function (r) { kinds[r.ended] = (kinds[r.ended] || 0) + 1; });
    return {
      runs: runs,
      total: runs.length,
      maxDays: maxDays || 5200,
      endingKinds: kinds,
      daysP10: percentile(days, 0.10), daysP50: percentile(days, 0.50), daysP90: percentile(days, 0.90),
      deadPctP50: percentile(dead, 0.50), deadPctP90: percentile(dead, 0.90)
    };
  }

  var sweep = {
    percentile: percentile,
    runOne: runOne,
    runBatch: runBatch,
    summarize: summarize
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = sweep;

  // —— CLI ——
  if (typeof require !== 'undefined' && require.main === module) {
    function argOf(name, dft) {
      var i = process.argv.indexOf(name);
      return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dft;
    }
    var scens = argOf('--scen', 'std,frost,isles,steel,sleep,ash').split(',');
    var anoms = argOf('--anom', 'cry,fog,res,dor,et,emb').split(',');
    var nSeeds = parseInt(argOf('--seeds', '3'), 10) || 3;
    var maxDays = parseInt(argOf('--days', '5200'), 10) || 5200;
    var t0 = Date.now();
    var sum = runBatch({ scenarios: scens, anomalies: anoms, seeds: nSeeds, maxDays: maxDays });
    console.log('局数 ' + sum.total + ' | 上限 ' + sum.maxDays + ' 日 | 耗时 ' + (Date.now() - t0) + 'ms');
    console.log('结局分布: ' + Object.keys(sum.endingKinds).map(function (k2) { return k2 + '×' + sum.endingKinds[k2]; }).join('  '));
    console.log('时长(日) P10 ' + Math.round(sum.daysP10) + ' / P50 ' + Math.round(sum.daysP50) + ' / P90 ' + Math.round(sum.daysP90));
    console.log('死亡占比 P50 ' + (sum.deadPctP50 * 100).toFixed(1) + '% / P90 ' + (sum.deadPctP90 * 100).toFixed(1) + '%');
  }
})();
