// endings.js — 结局评估（带持续天数门槛，避免瞬间翻转）与复盘摘要。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  MW.ENDING_DEFS = {
    eradicated: { name: '扑灭纪元', desc: '研究完成、干预铺开，异常在人类协作下被彻底压制。世界进入漫长的复查期。' },
    collapse: { name: '静默方舟', desc: '人口与秩序越过不可逆的临界线。幸存者带着损失继续生活，旧日的世界已成历史。' },
    equilibrium: { name: '潮汐平衡', desc: '异常没有消失，也没有失控——它成为世界生态的一部分，与人类长期共存、反复涨落。' },
    crystal: { name: '晶界时代', desc: '晶化覆盖了小半个世界。晶林在原野上反光，人类学会了在晶界之间生活。' },
    fadeout: { name: '灰烬退潮', desc: '没有等来解药：异常自己烧完了燃料，在人类响应合围之前悄然退潮。' },
    stalemate: { name: '长夜胶着', desc: '多年过去，既没有根除，也没有崩溃。世界学会带着它运转，历史进入胶着的长夜。' }
  };

  function sus(w, key, days) {
    if (!w._sus) w._sus = {};
    w._sus[key] = (w._sus[key] || 0) + 1;
    return w._sus[key] >= days;
  }
  function reset(w, key) { if (w._sus) w._sus[key] = 0; }

  MW.endingCheck = function (w) {
    if (w.flags.ended) return;
    var tot = w._tot; if (!tot) return;
    var pop0 = MW.WORLD_POP0;
    var day = w.day;
    if (day < 40) return;

    // 根除
    if (w.research.deployed && tot.I < 60 && tot.E < 400 && tot.C < 800) {
      if (sus(w, 'erad', 25)) return finish(w, 'eradicated');
    } else reset(w, 'erad');

    // 覆没
    if (tot.L / pop0 < 0.62 || tot.D / pop0 > 0.21) {
      if (sus(w, 'collapse', 30)) return finish(w, 'collapse');
    } else reset(w, 'collapse');

    // 晶界
    if (tot.C > 0 && tot.C / pop0 > 0.27) {
      if (sus(w, 'crystal', 30)) return finish(w, 'crystal');
    } else reset(w, 'crystal');

    // 共存（低水平稳定，未根除）
    var Ishare = tot.L > 0 ? tot.I / tot.L : 0;
    if (!w.research.deployed && Ishare > 0.0005 && Ishare < 0.02 && (w._awG || 0) > 0.35) {
      if (sus(w, 'equi', 120)) return finish(w, 'equilibrium');
    } else reset(w, 'equi');

    // 自然退潮（异常自熄；阈值收紧以免季节性低谷误判）
    if (!w.research.deployed && (tot.I + tot.E) < 2000 && tot.C < 2000 && w.stats.infEver > 2000) {
      if (sus(w, 'fade', 90)) return finish(w, 'fadeout');
    } else reset(w, 'fade');

    // 长夜胶着
    if (day > 4600) return finish(w, 'stalemate');
  };

  function finish(w, id) {
    w.flags.ended = id;
    w.flags.endedDay = w.day;
    var def = MW.endingDef(id);
    MW.pushNews(w, '系统', MW.T('end.newsline', '【{n}】——世界走向已定格，可在结局摘要中查看复盘', { n: def.name }), 3);
    w.flags.endSummary = MW.buildSummary(w, id);
  }

  MW.buildSummary = function (w, id) {
    var def = MW.endingDef(id);
    var top = w.regions.map(function (r, i) { return [r.D, i]; })
      .sort(function (a, b) { return b[0] - a[0]; }).slice(0, 5)
      .map(function (x) { return { name: MW.regionName(x[1]), dead: x[0] }; });
    return {
      id: id, name: def.name, desc: def.desc, day: w.day,
      dead: w.stats.deadTotal, infEver: w.stats.infEver,
      maxI: w.stats.maxI, maxIday: w.stats.maxIday,
      start: MW.regionName(w.stats.startRegion),
      cure: w.research.deployed ? (U.fmtDay(w.research.deployedDay)) : null,
      bursts: w.stats.bursts,
      evoCount: w.evoLog.length,
      topDead: top
    };
  };

  // 结局评级（观察评价，非排位）
  MW.grade = function (summary) {
    var pop0 = MW.WORLD_POP0;
    var d = summary.dead / pop0;
    if (summary.id === 'eradicated') return d < 0.01 ? 'S' : 'A';
    if (summary.id === 'equilibrium' || summary.id === 'stalemate') return d < 0.02 ? 'A' : 'B';
    if (summary.id === 'fadeout') return 'A';
    if (summary.id === 'crystal') return 'B';
    return 'C';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
