// smoke.js — 快速无头冒烟：跑通若干种子/场景/异常，输出节奏统计（调参用，非正式测试）
'use strict';
require('../js/ns.js');
require('../js/rng.js');
require('../js/data/land.js');
require('../js/data/regions.js');
require('../js/data/traits.js');
require('../js/data/scenarios.js');
require('../js/core/world.js');
require('../js/core/sim.js');
require('../js/core/response.js');
require('../js/core/evolution.js');
require('../js/core/events.js');
require('../js/core/endings.js');
require('../js/core/catchup.js');
require('../js/core/persist.js');

var MW = globalThis.MW;
var U = MW.U;
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

function run(scen, anomaly, seedStr, maxDays) {
  var w = MW.createWorld({ seedStr: seedStr, scenario: scen, anomaly: anomaly });
  var day = 0;
  while (day < maxDays && !w.flags.ended) {
    MW.simTick(w);
    day++;
  }
  var tot = w._tot || { I: 0, E: 0, D: 0, C: 0, L: 0 };
  return {
    scen: scen, anomaly: anomaly, seed: seedStr,
    days: w.day, ended: w.flags.ended || 'running',
    inf: tot.I + tot.E, dead: tot.D, L: tot.L, C: tot.C,
    evo: w.evoLog.length, owned: w.owned.length,
    maxI: w.stats.maxI, infEver: w.stats.infEver,
    cure: w.research.deployed ? ('day' + w.research.deployedDay) : Math.round(w.research.progress * 100) + '%',
    aw: (w._awG || 0).toFixed(2),
    bursts: w.stats.bursts, news: w.news.length
  };
}

var scens = ['std', 'frost', 'isles', 'steel', 'sleep', 'ash'];
var anomalies = ['cry', 'fog', 'res', 'dor', 'et', 'emb'];
var t0 = Date.now();
console.log('worldPop=', U.fmtPop(MW.WORLD_POP0));
console.log('links=', MW.buildLinks(new MW.Rng(1)).length);
for (var s = 0; s < scens.length; s++) {
  for (var a = 0; a < anomalies.length; a++) {
    var r = run(scens[s], anomalies[a], 'seed' + (s * 10 + a), 5200);
    console.log(
      pad(scens[s], 6), pad(anomalies[a], 4),
      'day', String(r.days).padStart(4),
      'end', pad(r.ended, 12),
      'inf', U.fmtPop(r.inf).padStart(6),
      'dead', U.fmtPop(r.dead).padStart(6),
      'C', U.fmtPop(r.C).padStart(6),
      'cure', String(r.cure).padStart(6),
      'evo', String(r.evo).padStart(2),
      'burst', String(r.bursts).padStart(3),
      'aw', r.aw
    );
  }
}
console.log('elapsed ms=', Date.now() - t0);
