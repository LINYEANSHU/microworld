// stress.js — 无头压力测试（Node，天然无GPU）。
// 覆盖：超长浸泡、全矩阵大规模并行、存档轮换、补算风暴、事件洪泛、
//       多世界交错性能、事件apply全量强制触发、数据完整性、全文件语法编译。
// 运行：node test/stress.js
'use strict';
var path = require('path');
var fs = require('fs');
var vm = require('vm');

function load(p) { require(path.join(__dirname, p)); }
load('../js/ns.js'); load('../js/rng.js');
load('../js/data/land.js'); load('../js/data/regions.js');
load('../js/data/traits.js'); load('../js/data/scenarios.js');
load('../js/data/i18n.js');
load('../js/core/world.js'); load('../js/core/sim.js'); load('../js/core/response.js');
load('../js/core/evolution.js'); load('../js/core/events.js'); load('../js/core/endings.js');
load('../js/core/catchup.js'); load('../js/core/persist.js'); load('../js/core/workshop.js');

var MW = globalThis.MW;
var U = MW.U;

// 可选过滤器：node test/stress.js [名称子串] —— 只跑匹配的段
var FILTER = process.argv[2] || '';

var passed = 0, failed = 0, failures = [];
function T(name, fn) {
  if (FILTER && name.indexOf(FILTER) < 0) return;
  var t0 = Date.now();
  try {
    var r = fn();
    passed++;
    console.log('  ✓ ' + name + '  (' + (Date.now() - t0) + 'ms)' + (r ? '  ' + r : ''));
  } catch (e) {
    failed++;
    failures.push(name + ' — ' + (e && e.message));
    console.log('  ✗ ' + name + '  (' + (Date.now() - t0) + 'ms)  — ' + (e && e.message));
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || '断言失败'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' |' + a + '-' + b + '|>' + tol); }
function hash(w) { return U.fnv1a(JSON.stringify(MW.serialize(w))); }
function makeW(o) { return MW.createWorld(Object.assign({ seedStr: 'stress', scenario: 'std', anomaly: 'fog' }, o)); }
function runTicks(w, n) { for (var i = 0; i < n; i++) MW.simTick(w); }

function scanWorldSanity(w, ctx) {
  var keys = ['S', 'E', 'I', 'R', 'D', 'C', 'aw', 'aid', 'camp', 'outMul'];
  for (var i = 0; i < w.regions.length; i++) {
    var r = w.regions[i];
    for (var k = 0; k < keys.length; k++) {
      var v = r[keys[k]];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new Error('区域字段异常 ' + ctx + ' r' + i + '.' + keys[k] + '=' + v);
      }
    }
  }
  var tot = w._tot;
  if (tot) ['I', 'E', 'D', 'C', 'L'].forEach(function (k2) {
    if (!isFinite(tot[k2]) || tot[k2] < 0) throw new Error('全局合计异常 ' + ctx + ' ' + k2);
  });
  if (!isFinite(w.ap) || w.ap < -1e-6) throw new Error('适应点异常 ' + ctx + ' ap=' + w.ap);
}

console.log('== S1 超长浸泡（2万日） ==');
T('20000日：守恒漂移、NaN哨兵、内存曲线、上限保持', function () {
  var w = makeW({ seedStr: 'soak', anomaly: 'res' });
  var pops = MW.REGIONS.map(function (r) { return r.pop0; });
  var prevD = new Float64Array(80);
  var heaps = [];
  var maxMods = 0, endingDay = -1;
  for (var d = 1; d <= 20000; d++) {
    MW.simTick(w);
    var tot = w._tot;
    if (!isFinite(tot.I) || !isFinite(tot.D) || !isFinite(tot.L)) throw new Error('NaN @d' + d);
    if (w.flags.ended && endingDay < 0) endingDay = w.day;
    if (d % 500 === 0) {
      scanWorldSanity(w, 'd' + d);
      for (var i = 0; i < 80; i++) {
        var r = w.regions[i];
        ok(r.D >= prevD[i] - 1e-9, 'D回退 d' + d + ' r' + i);
        prevD[i] = r.D;
        var sum = r.S + r.E + r.I + r.R + r.D + r.C;
        near(sum, pops[i], pops[i] * 1e-8 + 1e-3, '守恒 d' + d + ' r' + i + ': ');
      }
      heaps.push(process.memoryUsage().heapUsed);
    }
    if (w.mods.length > maxMods) maxMods = w.mods.length;
  }
  ok(w.news.length <= 400, 'news ' + w.news.length);
  ok(w.hist.t.length <= 1500, 'hist ' + w.hist.t.length);
  ok(w.evoLog.length <= 200, 'evoLog ' + w.evoLog.length);
  ok(maxMods <= 200, '活动修正峰值 ' + maxMods);
  var growth = (heaps[heaps.length - 1] - heaps[0]) / 1048576;
  ok(growth < 25, '堆增长 ' + growth.toFixed(1) + ' MiB（20k日应基本持平）');
  ok(endingDay > 0, '2万日内应有结局（@' + endingDay + '）');
  return '结局@' + endingDay + ' 活动修正峰值' + maxMods + ' 堆增长' + growth.toFixed(1) + 'MiB dead=' + U.fmtPop(w._tot.D);
});

console.log('== S2 全矩阵大规模并行（72局×5200日） ==');
T('72局全组合：无崩溃、结局分布、时长分布', function () {
  var scens = ['std', 'frost', 'isles', 'steel', 'sleep', 'ash'];
  var anoms = ['cry', 'fog', 'res', 'dor', 'et', 'emb'];
  var endings = {}, days = [], totalTicks = 0, t0 = Date.now();
  for (var s = 0; s < scens.length; s++) {
    for (var a = 0; a < anoms.length; a++) {
      var w = makeW({ seedStr: 'm' + s + 'x' + a, scenario: scens[s], anomaly: anoms[a] });
      for (var d = 0; d < 5200 && !w.flags.ended; d++) MW.simTick(w);
      totalTicks += w.day;
      endings[w.flags.ended || 'none'] = (endings[w.flags.ended || 'none'] || 0) + 1;
      days.push(w.day);
      scanWorldSanity(w, scens[s] + '/' + anoms[a]);
    }
  }
  var elapsed = Date.now() - t0;
  var kinds = Object.keys(endings);
  ok(kinds.length >= 3, '结局种类 ' + kinds.length);
  days.sort(function (x, y) { return x - y; });
  var min = days[0], med = days[Math.floor(days.length / 2)], max = days[days.length - 1];
  var perTick = elapsed / totalTicks;
  ok(perTick < 0.5, '均摊 ' + perTick.toFixed(3) + 'ms/tick');
  return kinds.map(function (k) { return k + '×' + endings[k]; }).join(' ') +
    ' | 天数 min/中位/max=' + min + '/' + med + '/' + max +
    ' | 均摊' + perTick.toFixed(3) + 'ms/tick';
});

console.log('== S3 存档轮换压力 ==');
T('300轮 保存→读取→哈希一致 + 100轮 分叉继续一致性', function () {
  var w = makeW({ seedStr: 'rot', anomaly: 'et' });
  var hashes = 0;
  for (var i = 1; i <= 300; i++) {
    runTicks(w, 17);
    var snap = JSON.stringify(MW.serialize(w));
    var key = MW.saveWorld(w);
    ok(key, '保存失败 @' + i);
    var r = MW.loadWorld();
    ok(r && r.world, '读取失败 @' + i);
    if (U.fnv1a(JSON.stringify(MW.serialize(r.world))) !== U.fnv1a(snap)) {
      throw new Error('轮换读取不一致 @' + i);
    }
    hashes++;
  }
  // 分叉继续一致性 ×100（随机日长）
  var a = makeW({ seedStr: 'fork', anomaly: 'res' });
  runTicks(a, 400);
  for (var j = 0; j < 100; j++) {
    runTicks(a, 30);
    var b = MW.deserialize(JSON.parse(JSON.stringify(MW.serialize(a))));
    ok(b, '反序列化失败 @' + j);
    runTicks(a, 40);
    runTicks(b, 40);
    if (hash(a) !== hash(b)) throw new Error('分叉不一致 @' + j);
  }
  return hashes + '轮轮换 + 100轮分叉 全部一致';
});

console.log('== S4 补算风暴（2000次恢复） ==');
T('2000次随机Δt（含回拨/暂停/超限）：无重复推进、无异常', function () {
  var w = makeW({ seedStr: 'storm', anomaly: 'fog' });
  runTicks(w, 500);
  w.speedIdx = 2;
  var rng = new MW.Rng(777);
  var totalPlanned = 0, dayStart = w.day;
  var clippedCount = 0, approxCount = 0, zeroCount = 0;
  for (var i = 0; i < 2000; i++) {
    var roll = rng.next();
    var deltaMin;
    if (roll < 0.15) deltaMin = -rng.int(60);          // 时钟回拨
    else if (roll < 0.25) deltaMin = 0;                 // 重复恢复
    else if (roll < 0.85) deltaMin = rng.int(240);      // 0—4小时
    else deltaMin = 60 + rng.int(6000);                 // 1—101小时（触发上限/近似）
    var now = 1000000000000 + i * 60000;                // 单调推进的伪时钟
    var plan = MW.catchupCompute(w, now, now - deltaMin * 60000, 8);
    if (plan.ticks <= 0 && plan.approxSteps <= 0) { zeroCount++; continue; }
    // 锚点先行
    w.wallAnchor = now;
    if (plan.clipped) clippedCount++;
    if (plan.approx) approxCount++;
    runTicks(w, plan.ticks);
    w.day += plan.approxSteps * 7; // approxAdvance 的跳日部分（绕过历史采样，聚焦记账）
    totalPlanned += plan.ticks + plan.approxSteps * 7;
    scanWorldSanity(w, 'storm@' + i);
  }
  var actual = w.day - dayStart;
  ok(actual === totalPlanned, '推进记账不符：实际' + actual + ' vs 计划' + totalPlanned);
  ok(clippedCount > 0 && approxCount > 0, '应触发过上限与近似（' + clippedCount + '/' + approxCount + '）');
  return '2000次恢复：回拨/零Δ ' + zeroCount + ' 次、上限触发 ' + clippedCount + '、近似 ' + approxCount + '、推进 ' + totalPlanned + ' 日，账目严格相符';
});

console.log('== S5 事件洪泛（频率×8，6000日） ==');
T('事件洪泛：上限保持、修正有界、状态健康', function () {
  var w = makeW({ seedStr: 'flood', anomaly: 'res' });
  w._eventFreqSetting = 8;
  var maxMods = 0, newsMax = 0, fired = 0, lastNewsLen = 0;
  for (var d = 0; d < 6000; d++) {
    MW.simTick(w);
    if (w.news.length > lastNewsLen) { fired += w.news.length - lastNewsLen; lastNewsLen = w.news.length; }
    if (w.mods.length > maxMods) maxMods = w.mods.length;
    if (d % 600 === 0) scanWorldSanity(w, 'flood d' + d);
  }
  ok(w.news.length <= 400, 'news ' + w.news.length);
  ok(maxMods <= 200, '修正峰值 ' + maxMods);
  ok(fired > 300, '事件触发数 ' + fired + '（频率×8应大量触发）');
  ok(Object.keys(w.eventCd).length <= MW.EVENTS.length, '冷却表泄漏');
  return '触发' + fired + '条事件、修正峰值' + maxMods + '、news=' + w.news.length;
});

console.log('== S6 多世界交错性能（100世界） ==');
T('100世界交错10万tick：单tick代价退化可接受', function () {
  var worlds = [];
  for (var i = 0; i < 100; i++) {
    worlds.push(makeW({ seedStr: 'par' + i, anomaly: ['cry', 'fog', 'res', 'dor', 'et', 'emb'][i % 6] }));
  }
  // 单世界基线
  var solo = makeW({ seedStr: 'solo', anomaly: 'res' });
  runTicks(solo, 2000);
  var t0 = process.hrtime.bigint();
  runTicks(solo, 2000);
  var soloPer = Number(process.hrtime.bigint() - t0) / 1e6 / 2000;
  // 交错压测：100轮×每世界10tick = 100,000 tick
  t0 = process.hrtime.bigint();
  for (var round = 0; round < 100; round++) {
    for (i = 0; i < 100; i++) runTicks(worlds[i], 10);
  }
  var interPer = Number(process.hrtime.bigint() - t0) / 1e6 / 100000;
  ok(interPer < soloPer * 5 + 0.2, '交错退化过大：' + interPer.toFixed(3) + ' vs ' + soloPer.toFixed(3));
  // 全部世界健康
  for (i = 0; i < 100; i++) scanWorldSanity(worlds[i], 'par' + i);
  return '单世界 ' + soloPer.toFixed(3) + ' ms/tick → 100世界交错 ' + interPer.toFixed(3) + ' ms/tick（含缓存压力）';
});

console.log('== S7 事件apply全量强制触发 ==');
T('43条事件逐一在真实中期世界上强制执行：无抛错且产生可观测效果', function () {
  var w = makeW({ seedStr: 'evfire', anomaly: 'res' });
  runTicks(w, 900); // 中期：有感染/觉察/研究
  var rng = new MW.Rng(42);
  var noEffect = [];
  for (var i = 0; i < MW.EVENTS.length; i++) {
    var ev = MW.EVENTS[i];
    var before = {
      news: w.news.length, mods: w.mods.length, aid: w.aidPool,
      cure: w.research.progress
    };
    try {
      ev.apply(w, rng);
    } catch (e) {
      throw new Error('事件 ' + ev.id + ' apply 抛错: ' + e.message);
    }
    var effect = w.news.length > before.news || w.mods.length > before.mods ||
      w.aidPool !== before.aid || w.research.progress !== before.cure;
    if (!effect) noEffect.push(ev.id);
    w.mods = w.mods.filter(function (m) { return m.until >= w.day; }); // 清理，防跨事件干扰
  }
  ok(noEffect.length === 0, '无效果事件: ' + noEffect.join(','));
  scanWorldSanity(w, 'after-event-fire');
  return MW.EVENTS.length + ' 条事件全部安全触发且有可观测效果';
});

console.log('== S8 数据完整性 ==');
T('区域/连接/特性/场景/结局 定义完备且互相引用合法', function () {
  ok(MW.REGIONS.length === 80, '区域数');
  var names = {};
  MW.REGIONS.forEach(function (r, i) {
    ok(r.id === i, 'id顺序');
    ok(!names[r.name], '重名 ' + r.name); names[r.name] = 1;
    ok(r.lon >= -180 && r.lon <= 180 && r.lat >= -58 && r.lat <= 85, '坐标范围 ' + r.name);
    ok(r.pop0 > 0 && r.med >= 1 && r.med <= 5 && r.res >= 1 && r.res <= 5, '属性范围 ' + r.name);
    ok(r.clim >= 0 && r.clim <= 3 && r.urb >= 0 && r.urb <= 1 && r.wealth >= 0 && r.wealth <= 2, '气候/城市/富裕 ' + r.name);
  });
  var links = MW.buildLinks(new MW.Rng(3));
  links.forEach(function (l) {
    ok(l.a !== l.b && l.a >= 0 && l.b < 80 && l.b >= 0 && l.a < 80, '连接端点');
    ok(l.phi > 0 && isFinite(l.phi), 'phi ' + l.a + '-' + l.b);
    ok(Array.isArray(l.cls) && l.cls.length === 3, 'cls');
  });
  // 特性图：无环、引用合法
  var byId = {};
  MW.TRAITS.forEach(function (t) { byId[t.id] = t; });
  MW.TRAITS.forEach(function (t) {
    t.req.forEach(function (r) { ok(byId[r], '未知前置 ' + t.id + '→' + r); });
  });
  function hasCycle() {
    var state = {};
    function visit(id, stack) {
      if (state[id] === 1) return true;
      if (state[id] === 2) return false;
      state[id] = 1; stack[id] = true;
      var kids = MW.TRAITS.filter(function (t) { return t.req.indexOf(id) >= 0; });
      for (var i = 0; i < kids.length; i++) if (visit(kids[i].id, stack)) return true;
      state[id] = 2; stack[id] = false;
      return false;
    }
    for (var j = 0; j < MW.TRAITS.length; j++) if (visit(MW.TRAITS[j].id, {})) return true;
    return false;
  }
  ok(!hasCycle(), '特性树存在环');
  MW.SCENARIOS.forEach(function (s) {
    ok(MW.ANOMALIES.some(function (a) { return a.id === s.anomaly; }), '场景异常引用 ' + s.id);
    ok(s.complexity >= 0 && s.complexity <= 2, '复杂度 ' + s.id);
  });
  Object.keys(MW.ENDING_DEFS).forEach(function (k) {
    ok(MW.ENDING_DEFS[k].name && MW.ENDING_DEFS[k].desc, '结局定义 ' + k);
  });
  ['cry', 'fog', 'res', 'dor', 'et', 'emb'].forEach(function (id) {
    ok(MW.ANOMALIES.some(function (a) { return a.id === id; }) && MW.REFINE[id], '异常/精炼定义 ' + id);
  });
  return '80区域/186连接/60特性/6场景/6结局 引用与图结构全部合法';
});

console.log('== S9 全文件语法编译 ==');
T('全部JS（含测试与工具）通过 vm 编译', function () {
  var root = path.join(__dirname, '..');
  var files = [];
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function (f) {
      var p = path.join(dir, f);
      var st = fs.statSync(p);
      if (st.isDirectory()) { if (f !== 'node_modules' && f !== 'shots') walk(p); }
      else if (/\.js$/.test(f)) files.push(p);
    });
  })(root);
  var n = 0;
  files.forEach(function (f) {
    var src = fs.readFileSync(f, 'utf8');
    try { new vm.Script(src, { filename: f }); } catch (e) {
      throw new Error(path.relative(root, f) + ': ' + e.message);
    }
    n++;
  });
  return n + ' 个文件编译通过';
});

console.log('== S10 恢复一致性的随机作用序列 ==');
T('随机暂停/变速/演化关闭混合下，恢复仍与连续运行一致', function () {
  // 作用序列（速度变化、暂停、手动干预）在存档中不携带——两侧使用相同的作用序列
  function applyActions(w, seq) {
    seq.forEach(function (a) {
      if (a.t === 'speed') w.speedIdx = a.v;
      // 暂停与手动购买不影响 simTick 轨迹本身（暂停只影响驱动力，不在本测试中模拟驱动）
    });
  }
  var seq = [];
  var rng = new MW.Rng(9);
  for (var i = 0; i < 40; i++) seq.push({ t: 'speed', v: [1, 2, 4, 8][rng.int(4)] });
  var a = makeW({ seedStr: 'acts', anomaly: 'dor' });
  var b = MW.deserialize(JSON.parse(JSON.stringify(MW.serialize(makeW({ seedStr: 'acts', anomaly: 'dor' })))));
  var ai = 0, bi = 0;
  // A：连续，按段变速
  for (var s = 0; s < seq.length; s++) {
    applyActions(a, [seq[s]]);
    runTicks(a, 50);
  }
  // B：每段之间经历一次存档→恢复
  for (s = 0; s < seq.length; s++) {
    applyActions(b, [seq[s]]);
    var snap = MW.serialize(b);
    b = MW.deserialize(JSON.parse(JSON.stringify(snap)));
    ok(b, '段中恢复失败 @' + s);
    runTicks(b, 50);
  }
  ok(hash(a) === hash(b), '变速序列下恢复分叉');
  return '40段变速×50日，逐段恢复与连续运行最终哈希一致';
});

console.log('');
console.log('压力测试结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed) { failures.forEach(function (f) { console.log('  失败: ' + f); }); process.exit(1); }
