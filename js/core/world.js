// world.js — 世界状态创建、参数合成、序列化/反序列化。
// 设计约束：仿真内不使用 Math.random / Date.now / 超越函数；
// 所有区域人口守恒（死亡进入 D，交通为"出行暴露"耦合，不复制人口）。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  var SAVE_VERSION = 3;
  MW.SAVE_VERSION = SAVE_VERSION;

  // 特性 fx 应用到参数对象（climAffN 特例为数组元素）
  function applyFx(p, node) {
    var k, v;
    for (k in node.m) {
      v = node.m[k];
      if (k.indexOf('climAff') === 0) {
        var ci = +k.charAt(7);
        p.climAff[ci] *= v;
      } else p[k] *= v;
    }
    for (k in node.a) {
      v = node.a[k];
      if (k.indexOf('climAff') === 0) p.climAff[+k.charAt(7)] += v;
      else p[k] += v;
    }
  }

  // 合成初始参数：异常基础 × 场景修正
  MW.composeParams = function (anomalyId, scenMods) {
    var a = null;
    for (var i = 0; i < MW.ANOMALIES.length; i++) if (MW.ANOMALIES[i].id === anomalyId) a = MW.ANOMALIES[i];
    if (!a) a = MW.ANOMALIES[0];
    var p = JSON.parse(JSON.stringify(a.base));
    if (scenMods && scenMods.params) {
      var m = scenMods.params;
      for (var k in m) {
        if (k.indexOf('climAff') === 0) p.climAff[+k.charAt(7)] *= m[k];
        else if (typeof p[k] === 'number') p[k] *= m[k];
      }
    }
    return p;
  };

  MW.createWorld = function (opts) {
    opts = opts || {};
    var seedStr = opts.seedStr || ('MW-' + Math.floor(Math.random() * 1e9).toString(36));
    var seed = U.hashStr(seedStr);
    var scen = opts.scenario || 'std';
    var scenDef = null;
    for (var i = 0; i < MW.SCENARIOS.length; i++) if (MW.SCENARIOS[i].id === scen) scenDef = MW.SCENARIOS[i];
    if (!scenDef) scenDef = MW.SCENARIOS[0];

    var rng = new MW.Rng(seed);
    var rngEv = new MW.Rng(seed ^ 0x51ab3f17);
    var rngEvo = new MW.Rng((seed ^ 0x9e3779b9) >>> 0);

    var links = MW.buildLinks(rng);
    var regions = [];
    for (i = 0; i < MW.REGIONS.length; i++) {
      var rd = MW.REGIONS[i];
      regions.push({
        S: rd.pop0, E: 0, I: 0, R: 0, D: 0, C: 0,
        aw: 0, aid: 0, camp: 0, sev: 0, outMul: 1,
        cA: false, cS: false, cL: false,
        awBoost: 0, medBoost: 0, betaR: 1
      });
    }

    var w = {
      v: SAVE_VERSION,
      seed: seed, seedStr: seedStr,
      scenarioId: scen, anomalyId: opts.anomaly || scenDef.anomaly,
      day: 0, speedIdx: 1,
      params: MW.composeParams(opts.anomaly || scenDef.anomaly, scenDef.mods),
      owned: [], refineLvl: 0,
      ap: 0, evoCd: 0,
      regions: regions, links: links,
      research: { progress: 0, deployed: false, deployedDay: -1 },
      aidPool: 0, aidPriority: -1,
      mods: [], eventCd: {},
      rngS: rng.getState(), rngEv: rngEv.getState(), rngEvo: rngEvo.getState(),
      hist: { t: [], inf: [], dead: [], cure: [], aw: [], pop: [] },
      news: [], evoLog: [],
      stats: { infEver: 0, deadTotal: 0, maxI: 0, maxIday: 0, startRegion: -1, bursts: 0 },
      flags: { ended: null, endReason: '', endedDay: -1, approx: false, catchupTicks: 0 },
      wallAnchor: 0, seq: 0
    };

    // 初始感染源
    var startR = opts.startRegion;
    if (startR === undefined || startR === null || startR < 0) {
      // 按场景规则或人口加权随机
      var rule = scenDef.startRule || 'pop';
      if (rule === 'cold') {
        var cands = [];
        for (i = 0; i < MW.REGIONS.length; i++) if (MW.REGIONS[i].clim === 2) cands.push(i);
        startR = cands[rng.int(cands.length)];
      } else if (rule === 'coast') {
        var cs = [];
        for (i = 0; i < MW.REGIONS.length; i++) if (MW.REGIONS[i].coast) cs.push(i);
        startR = cs[rng.int(cs.length)];
      } else if (rule === 'latent') {
        startR = rng.int(MW.REGIONS.length);
      } else {
        var tot = 0, k;
        for (k = 0; k < MW.REGIONS.length; k++) tot += MW.REGIONS[k].pop0;
        var x = rng.next() * tot;
        for (k = 0; k < MW.REGIONS.length; k++) { x -= MW.REGIONS[k].pop0; if (x <= 0) { startR = k; break; } }
        if (startR < 0) startR = 0;
      }
    }
    w.stats.startRegion = startR;
    // 初始感染源：从易感者中转移（严格守恒：总人口不变）
    var seedE = scenDef.startSeedE || 60;
    regions[startR].S -= seedE;
    if (regions[startR].S < 0) regions[startR].S = 0;
    regions[startR].E = seedE;
    if (scenDef.id === 'sleep') { // 长眠之地：多点潜伏预置
      var n = 0;
      for (i = 0; i < MW.REGIONS.length && n < 14; i++) {
        if (i !== startR && rng.next() < 0.2) {
          var e2 = 30 + rng.int(60);
          if (regions[i].S > e2) { regions[i].S -= e2; regions[i].E = e2; n++; }
        }
      }
    }
    w.rngS = rng.getState();
    return w;
  };

  // —— 序列化（含校验和的完整状态；不依赖外部静态数据的一致性由版本号保证） ——
  MW.serialize = function (w) {
    return {
      v: w.v, seed: w.seed, seedStr: w.seedStr, scenarioId: w.scenarioId, anomalyId: w.anomalyId,
      day: w.day, speedIdx: w.speedIdx,
      params: w.params, owned: w.owned, refineLvl: w.refineLvl, ap: w.ap, evoCd: w.evoCd,
      regions: w.regions.map(function (r) {
        return [r.S, r.E, r.I, r.R, r.D, r.C, r.aw, r.aid, r.camp, r.outMul, r.cA ? 1 : 0, r.cS ? 1 : 0, r.cL ? 1 : 0, r.lastAidNews || 0];
      }),
      links: w.links.map(function (l) { return l.cls; }),
      research: w.research, aidPool: w.aidPool, aidPriority: w.aidPriority | 0,
      mods: w.mods, eventCd: w.eventCd,
      rng: [w.rngS, w.rngEv, w.rngEvo],
      hist: w.hist, news: w.news, evoLog: w.evoLog,
      stats: w.stats, flags: w.flags, sus: w._sus || null,
      wallAnchor: w.wallAnchor
      // seq 是存档信封的元数据（由 persist 维护），不进入状态载荷：
      // 否则保存时的递增会让"保存前后快照"永不相等。
    };
  };

  MW.deserialize = function (o) {
    if (!o || typeof o !== 'object') return null;
    if (o.v !== SAVE_VERSION) return null; // 未来版本迁移位
    var w = {};
    w.v = o.v; w.seed = o.seed >>> 0; w.seedStr = o.seedStr || '?';
    w.scenarioId = o.scenarioId; w.anomalyId = o.anomalyId;
    w.day = o.day | 0; w.speedIdx = o.speedIdx | 0;
    w.params = o.params; w.owned = o.owned || []; w.refineLvl = o.refineLvl | 0;
    w.ap = +o.ap || 0; w.evoCd = o.evoCd | 0;
    var R = MW.REGIONS;
    if (!Array.isArray(o.regions) || o.regions.length !== R.length) return null;
    w.regions = o.regions.map(function (a, i) {
      return {
        S: +a[0], E: +a[1], I: +a[2], R: +a[3], D: +a[4], C: +a[5],
        aw: +a[6], aid: +a[7], camp: +a[8], outMul: +a[9],
        cA: !!a[10], cS: !!a[11], cL: !!a[12],
        lastAidNews: +a[13] || 0,
        sev: 0, awBoost: 0, medBoost: 0, betaR: 1
      };
    });
    var links = MW.buildLinks(new MW.Rng(w.seed));
    if (Array.isArray(o.links) && o.links.length === links.length) {
      for (var i = 0; i < links.length; i++) links[i].cls = o.links[i];
    }
    w.links = links;
    w.research = o.research; w.aidPool = +o.aidPool || 0;
    // 手动援助优先级（v3 新增可选字段；旧存档缺省 → -1，无优先）
    w.aidPriority = (typeof o.aidPriority === 'number' && isFinite(o.aidPriority) &&
      o.aidPriority >= -1 && o.aidPriority < R.length) ? (o.aidPriority | 0) : -1;
    w.mods = Array.isArray(o.mods) ? o.mods : [];
    w.eventCd = o.eventCd || {};
    w.rngS = o.rng[0] >>> 0; w.rngEv = o.rng[1] >>> 0; w.rngEvo = o.rng[2] >>> 0;
    w.hist = o.hist; w.news = o.news || []; w.evoLog = o.evoLog || [];
    w.stats = o.stats; w.flags = o.flags || { ended: null, endReason: '', endedDay: -1, approx: false, catchupTicks: 0 };
    w._sus = o.sus || null;
    // wallAnchor 是毫秒级时间戳（>2^31），禁止位运算截断
    w.wallAnchor = isFinite(+o.wallAnchor) ? +o.wallAnchor : 0;
    w.seq = 0; // 由 loadWorld/importSave 用信封 seq 恢复
    // 状态健全化：非负与有限性
    for (i = 0; i < w.regions.length; i++) {
      var r = w.regions[i], keys = ['S', 'E', 'I', 'R', 'D', 'C'];
      for (var k = 0; k < keys.length; k++) {
        if (!isFinite(r[keys[k]]) || r[keys[k]] < 0) r[keys[k]] = 0;
      }
    }
    return w;
  };

  // —— 手动干预（可选深度）：指定某区域优先获得援助 ——
  // idx=-1 取消；非法 idx 拒绝并返回 false。纯状态标记，分配加权在 response.js。
  MW.setAidPriority = function (w, idx) {
    if (!w || w.flags.ended) return false;
    if (idx === -1 || idx === undefined || idx === null) {
      if (w.aidPriority === -1) return true; // 幂等
      w.aidPriority = -1;
      MW.pushNews(w, '援助', MW.T('aidprio.off', '观察者撤回了优先援助指示'), 1);
      return true;
    }
    if (typeof idx !== 'number' || !isFinite(idx) || (idx | 0) !== idx || idx < 0 || idx >= MW.REGIONS.length) return false;
    if (w.aidPriority === idx) return true; // 幂等
    w.aidPriority = idx | 0;
    MW.pushNews(w, '援助', MW.T('aidprio.on', '观察者指示：{r}获得援助优先权', { r: MW.regionName(idx) }), 1);
    return true;
  };

  MW.rngOf = function (w, which) {
    // 惰性重建 rng 对象（tick 内使用）
    if (!w._rng) w._rng = [new MW.Rng(w.rngS), new MW.Rng(w.rngEv), new MW.Rng(w.rngEvo)];
    var r = w._rng[which];
    if (w._rngDirty) { r.setState([w.rngS, w.rngEv, w.rngEvo][which]); w._rngDirty = false; }
    return r;
  };
  MW.syncRng = function (w) {
    if (w._rng) {
      w.rngS = w._rng[0].getState(); w.rngEv = w._rng[1].getState(); w.rngEvo = w._rng[2].getState();
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
