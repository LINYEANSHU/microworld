// workshop.js — 本地场景包（创意工坊式扩展）。
// 场景全部是数据表（js/data/scenarios.js），本模块提供：校验 → 注册进 MW.SCENARIOS →
// 持久化（localStorage/内存后端）→ 导入/导出。不做编辑器 UI、不做上传分享链路。
// 校验从严：未知键、越界数值、非法 id 一律拒绝；注册后的包与内置场景走完全相同的
// 合成路径（composeParams/scenById），保证"包场景 ≠ 二等公民"。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  var KEY_PACKS = 'mw_packs';
  var mem = {}; // Node 测试用内存后端（与 persist.js 同模式）
  var useMem = (typeof localStorage === 'undefined');
  function store() {
    if (useMem) return {
      getItem: function (k) { return mem[k] !== undefined ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
    return localStorage;
  }

  // 参数白名单（与 traits.js P() 的基础参数集一致）；climAff0..3 为数组元素特例
  var KNOWN_PARAMS = ['beta', 'latent', 'recover', 'leth', 'vis', 'wane', 'envRes', 'crystal',
    'burstP', 'burstAmp', 'seasonAmp', 'urbSens', 'reappear', 'erosion', 'burn',
    'lnAff', 'seaAff', 'airAff', 'cureR', 'aidR', 'campR'];
  var KNOWN_RULES = ['pop', 'cold', 'coast', 'latent'];
  var KNOWN_MOD_KEYS = ['params', 'aiAggr', 'researchMult', 'apMul', 'eventFreq'];
  var ID_RE = /^[a-z][a-z0-9_]{1,23}$/;

  function fail(msg) { return { ok: false, err: msg }; }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function inRange(x, a, b) { return isNum(x) && x >= a && x <= b; }

  // 校验并归一化一个场景定义 → {ok:true, def} | {ok:false, err}
  MW.validateScenario = function (raw) {
    if (!isObj(raw)) return fail('场景定义必须是对象');
    var id = raw.id, k;
    if (typeof id !== 'string' || !ID_RE.test(id)) return fail('id 非法（需小写字母开头的 2–24 位小写/数字/下划线）');
    for (k = 0; k < MW.SCENARIOS.length; k++) if (MW.SCENARIOS[k].id === id) return fail('id 与现有场景冲突: ' + id);
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 24) return fail('name 需为 1–24 字符');
    if (typeof raw.desc !== 'string' || !raw.desc.trim() || raw.desc.length > 240) return fail('desc 需为 1–240 字符');
    if (raw.complexity !== 0 && raw.complexity !== 1 && raw.complexity !== 2) return fail('complexity 需为 0/1/2');
    var anomOk = false;
    for (k = 0; k < MW.ANOMALIES.length; k++) if (MW.ANOMALIES[k].id === raw.anomaly) anomOk = true;
    if (!anomOk) return fail('未知异常类型: ' + raw.anomaly);

    var def = {
      id: id, name: String(raw.name), desc: String(raw.desc),
      complexity: raw.complexity, anomaly: raw.anomaly,
      startRule: 'pop', startSeedE: 60, mods: {}
    };
    if (raw.startRule !== undefined) {
      if (KNOWN_RULES.indexOf(raw.startRule) < 0) return fail('startRule 需为 pop/cold/coast/latent');
      def.startRule = raw.startRule;
    }
    if (raw.startSeedE !== undefined) {
      if (!inRange(raw.startSeedE, 10, 300) || (raw.startSeedE | 0) !== raw.startSeedE) return fail('startSeedE 需为 10–300 的整数');
      def.startSeedE = raw.startSeedE | 0;
    }
    if (raw.mods !== undefined) {
      if (!isObj(raw.mods)) return fail('mods 必须是对象');
      for (k in raw.mods) if (KNOWN_MOD_KEYS.indexOf(k) < 0) return fail('mods 含未知键: ' + k);
      var m = raw.mods;
      if (m.aiAggr !== undefined) { if (!inRange(m.aiAggr, 0.2, 3)) return fail('aiAggr 越界（0.2–3）'); def.mods.aiAggr = m.aiAggr; }
      if (m.researchMult !== undefined) { if (!inRange(m.researchMult, 0.1, 3)) return fail('researchMult 越界（0.1–3）'); def.mods.researchMult = m.researchMult; }
      if (m.apMul !== undefined) { if (!inRange(m.apMul, 0.2, 3)) return fail('apMul 越界（0.2–3）'); def.mods.apMul = m.apMul; }
      if (m.eventFreq !== undefined) { if (!inRange(m.eventFreq, 0.2, 4)) return fail('eventFreq 越界（0.2–4）'); def.mods.eventFreq = m.eventFreq; }
      if (m.params !== undefined) {
        if (!isObj(m.params)) return fail('mods.params 必须是对象');
        var pm = {};
        for (k in m.params) {
          var isClim = k.indexOf('climAff') === 0 && k.length === 8 && k.charAt(7) >= '0' && k.charAt(7) <= '3';
          if (!isClim && KNOWN_PARAMS.indexOf(k) < 0) return fail('mods.params 含未知参数: ' + k);
          if (!inRange(m.params[k], 0.05, 20)) return fail('参数 ' + k + ' 越界（0.05–20）');
          pm[k] = m.params[k];
        }
        if (Object.keys(pm).length) def.mods.params = pm;
      }
    }
    def._pack = true; // 标记来源：可卸载、可列出；内置场景无此标记
    return { ok: true, def: def };
  };

  // 注册：校验通过后加入 MW.SCENARIOS（fillSetup / scenById / composeParams 即刻生效）
  MW.registerScenario = function (raw) {
    var v = MW.validateScenario(raw);
    if (!v.ok) return v;
    MW.SCENARIOS.push(v.def);
    return { ok: true, id: v.def.id };
  };

  // 仅允许卸载带 _pack 标记的场景
  MW.unregisterScenario = function (id) {
    for (var i = 0; i < MW.SCENARIOS.length; i++) {
      if (MW.SCENARIOS[i].id === id && MW.SCENARIOS[i]._pack) {
        MW.SCENARIOS.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  MW.clearScenarioPacks = function () {
    var removed = 0;
    for (var i = MW.SCENARIOS.length - 1; i >= 0; i--) {
      if (MW.SCENARIOS[i]._pack) { MW.SCENARIOS.splice(i, 1); removed++; }
    }
    return removed;
  };

  MW.listPackDefs = function () {
    var out = [];
    for (var i = 0; i < MW.SCENARIOS.length; i++) if (MW.SCENARIOS[i]._pack) out.push(MW.SCENARIOS[i]);
    return out;
  };

  // —— 持久化：注册过的包随会话保存，启动时 restore ——
  MW.Packs = {
    save: function () {
      try { store().setItem(KEY_PACKS, JSON.stringify(MW.listPackDefs())); return true; }
      catch (e) { return false; }
    },
    restore: function () {
      var s = store(), raw = null, arr;
      try { raw = s.getItem(KEY_PACKS); } catch (e) { raw = null; }
      if (!raw) return 0;
      try { arr = JSON.parse(raw); } catch (e) { return 0; }
      if (!Array.isArray(arr)) return 0;
      var n = 0;
      for (var i = 0; i < arr.length; i++) {
        var r = MW.registerScenario(arr[i]);
        if (r.ok) n++;
      }
      return n;
    },
    clearStored: function () {
      try { store().removeItem(KEY_PACKS); } catch (e) { /* 忽略 */ }
    },
    // 导入（文件文本）：接受 {pack:'microworld-scenpack', v:1, scenario:{...}} 信封
    importPack: function (text) {
      var outer;
      try { outer = JSON.parse(text); } catch (e) { throw new Error('不是有效的 JSON 文件'); }
      var def = outer && outer.pack === 'microworld-scenpack' ? outer.scenario : null;
      if (!def) throw new Error('不是本游戏的场景包文件');
      var r = MW.registerScenario(def);
      if (!r.ok) throw new Error('场景包被拒绝：' + r.err);
      MW.Packs.save();
      return r.id;
    },
    // 导出为可分享的 JSON 文本（本地文件，无上传链路）
    exportPack: function (id) {
      var defs = MW.listPackDefs();
      for (var i = 0; i < defs.length; i++) {
        if (defs[i].id === id) {
          return JSON.stringify({ pack: 'microworld-scenpack', v: 1, scenario: defs[i] }, null, 1);
        }
      }
      throw new Error('未找到场景包: ' + id);
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
