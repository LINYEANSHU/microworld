// persist.js — 存档：双槽轮换 + FNV校验和 + 版本检查 + 导入/导出 + 设置持久化。
// 存档内容为完整状态（模拟时间、三个随机数流、关键事件、环形历史），而非几个统计数字。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  var KEY_A = 'mw_save_A', KEY_B = 'mw_save_B', KEY_SET = 'mw_settings';
  var mem = {}; // Node 测试用内存后端
  var useMem = typeof window === 'undefined' && typeof localStorage === 'undefined';

  function store() {
    if (useMem) return {
      getItem: function (k) { return mem[k] !== undefined ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
    return localStorage;
  }
  MW.PersistTestMem = function () { return useMem; };

  function envelope(snapshot, seq) {
    var payload = JSON.stringify(snapshot);
    return { fmt: 'microworld', v: MW.SAVE_VERSION, seq: seq, t: Date.now(), ck: U.fnv1a(payload), payload: payload };
  }

  function trimSnapshot(snapshot) {
    var hist = {};
    Object.keys(snapshot.hist).forEach(function (key) { hist[key] = snapshot.hist[key].slice(-400); });
    return Object.assign({}, snapshot, { hist: hist, news: snapshot.news.slice(-120), evoLog: snapshot.evoLog.slice(-80) });
  }

  function isEnvelope(env) {
    return env && env.fmt === 'microworld' && env.v === MW.SAVE_VERSION
      && typeof env.payload === 'string' && Number.isSafeInteger(env.seq) && env.seq >= 0
      && env.seq < Number.MAX_SAFE_INTEGER && Number.isFinite(env.t);
  }

  function readSlots(storage) {
    var candidates = [], occupied = 0;
    [KEY_A, KEY_B].forEach(function (key) {
      var raw = storage.getItem(key);
      if (raw === null) return;
      occupied++;
      try {
        var env = JSON.parse(raw);
        if (isEnvelope(env)) candidates.push({ key: key, env: env });
      } catch (e) { /* Check the other slot. */ }
    });
    candidates.sort(function (a, b) { return (b.env.seq - a.env.seq) || (b.env.t - a.env.t); });
    var skipped = candidates.length !== occupied;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      try {
        if (U.fnv1a(c.env.payload) === c.env.ck) {
          var world = MW.deserialize(JSON.parse(c.env.payload));
          if (world) {
            world._lastSlot = c.key;
            world.seq = c.env.seq;
            return { world: world, env: c.env, recovered: skipped };
          }
        }
      } catch (e) { /* Check the other slot. */ }
      skipped = true;
    }
    return occupied ? { corrupt: true } : null;
  }

  MW.saveWorld = function (w, storage) {
    try {
      var s = storage || store();
      var last = readSlots(s);
      var key = last && last.world && last.world._lastSlot === KEY_A ? KEY_B : KEY_A;
      var seq = (last && last.env ? last.env.seq : 0) + 1;
      var snapshot = MW.serialize(w);
      try {
        s.setItem(key, JSON.stringify(envelope(snapshot, seq)));
      } catch (e) {
        s.setItem(key, JSON.stringify(envelope(trimSnapshot(snapshot), seq)));
      }
      w.seq = seq;
      w._lastSlot = key;
      w._saveOk = true;
      return key;
    } catch (e) {
      w._saveOk = false;
      return null;
    }
  };

  MW.loadWorld = function (storage) {
    try { return readSlots(storage || store()); }
    catch (e) { return { unavailable: true }; }
  };

  MW.clearSaves = function () {
    var s = store();
    s.removeItem(KEY_A); s.removeItem(KEY_B);
  };

  MW.hasSave = function () {
    var r = MW.loadWorld();
    return !!(r && r.world);
  };

  // 导入/导出（文件备份）
  MW.exportSave = function (w) {
    return JSON.stringify({ export: 'microworld-save', env: envelope(MW.serialize(w), w.seq) }, null, 1);
  };
  MW.importSave = function (str) {
    var outer = JSON.parse(str); // 坏文件在此抛出，由调用方提示
    var env = outer && outer.export === 'microworld-save' ? outer.env : outer;
    if (!env || env.fmt !== 'microworld') throw new Error('不是本游戏的存档文件');
    if (!isEnvelope(env)) throw new Error('存档格式或版本不兼容');
    if (U.fnv1a(env.payload) !== env.ck) throw new Error('校验和不符：文件已损坏');
    var w = MW.deserialize(JSON.parse(env.payload));
    if (!w) throw new Error('存档版本不兼容（期望 v' + MW.SAVE_VERSION + '）');
    w._lastSlot = null;
    w.seq = env.seq;
    return w;
  };

  // —— 设置（窗口尺寸记忆、画质、离线上限、观察风格等） ——
  var DEF_SETTINGS = {
    mini: false, quality: 2, offCapH: 8, style: 1, eventFreq: 1,
    winW: 1024, winH: 640, muted: false, speedDefault: 1,
    lang: 'zh', autoEvo: true
  };
  MW.loadSettings = function () {
    var o = null;
    try { o = JSON.parse(store().getItem(KEY_SET) || 'null'); } catch (e) { o = null; }
    var out = {};
    for (var k in DEF_SETTINGS) out[k] = (o && o[k] !== undefined) ? o[k] : DEF_SETTINGS[k];
    return out;
  };
  MW.saveSettings = function (st) {
    try { store().setItem(KEY_SET, JSON.stringify(st)); } catch (e) { /* 忽略 */ }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
