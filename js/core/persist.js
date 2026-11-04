// persist.js — 存档：双槽轮换 + FNV校验和 + 版本检查 + 导入/导出 + 设置持久化。
// 存档内容为完整状态（模拟时间、三个随机数流、关键事件、环形历史），而非几个统计数字。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  var KEY_A = 'mw_save_A', KEY_B = 'mw_save_B', KEY_SET = 'mw_settings';
  var mem = {}; // Node 测试用内存后端
  var useMem = (typeof localStorage === 'undefined');

  function store() {
    if (useMem) return {
      getItem: function (k) { return mem[k] !== undefined ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
    return localStorage;
  }
  MW.PersistTestMem = function () { return useMem; };

  function envelope(w) {
    var payload = JSON.stringify(MW.serialize(w));
    return { fmt: 'microworld', v: MW.SAVE_VERSION, seq: w.seq, t: Date.now(), ck: U.fnv1a(payload), payload: payload };
  }

  function writeSlot(key, env) {
    var s = store();
    try {
      s.setItem(key, JSON.stringify(env));
      return true;
    } catch (e) {
      // 配额不足：裁剪历史后重试一次
      try {
        env.payload = JSON.stringify(MW.serialize((function trim(w2) {
          w2.hist.t = w2.hist.t.slice(-400); w2.hist.inf = w2.hist.inf.slice(-400);
          w2.hist.dead = w2.hist.dead.slice(-400); w2.hist.cure = w2.hist.cure.slice(-400);
          w2.hist.aw = w2.hist.aw.slice(-400); w2.hist.pop = w2.hist.pop.slice(-400);
          w2.news = w2.news.slice(-120); w2.evoLog = w2.evoLog.slice(-80);
          return w2;
        })(env._w)));
        env.ck = U.fnv1a(env.payload);
        s.setItem(key, JSON.stringify(env));
        return true;
      } catch (e2) { return false; }
    }
  }

  // 保存（轮换双槽）。seq 单调递增——loadWorld 依此判定"最新"，平局再比时间戳。
  MW.saveWorld = function (w) {
    w.seq = (w.seq | 0) + 1;
    var env = envelope(w);
    env._w = w;
    var lastKey = w._lastSlot === KEY_A ? KEY_B : KEY_A;
    var okNew = writeSlot(lastKey, env);
    if (okNew) {
      w._lastSlot = lastKey;
      w._saveOk = true;
      return lastKey;
    }
    // 新槽失败：覆写当前槽
    var curKey = w._lastSlot === KEY_B ? KEY_B : KEY_A;
    var okCur = writeSlot(curKey, env);
    w._saveOk = okCur;
    return okCur ? curKey : null;
  };

  // 读取：按 seq 从新到旧尝试两个槽；校验失败自动回退。
  // 返回 {world, env} 或 {corrupt:true} 或 null
  MW.loadWorld = function () {
    var s = store();
    var cands = [];
    for (var i = 0; i < 2; i++) {
      var key = i === 0 ? KEY_A : KEY_B;
      var raw = null;
      try { raw = s.getItem(key); } catch (e) { raw = null; }
      if (!raw) continue;
      try {
        var env = JSON.parse(raw);
        if (!env || env.fmt !== 'microworld') continue;
        var ok = U.fnv1a(env.payload) === env.ck;
        cands.push({ key: key, env: env, ok: ok, seq: env.seq | 0 });
      } catch (e) { /* 坏槽：跳过 */ }
    }
    if (!cands.length) return null;
    cands.sort(function (a, b) { return (b.seq - a.seq) || (b.env.t - a.env.t); });
    for (i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c.ok) continue;
      try {
        var obj = JSON.parse(c.env.payload);
        var w = MW.deserialize(obj);
        if (w) { w._lastSlot = c.key; w.seq = c.seq; return { world: w, env: c.env }; }
      } catch (e) { /* 继续下一槽 */ }
    }
    return { corrupt: true };
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
    var env = envelope(w); env._w = w;
    return JSON.stringify({ export: 'microworld-save', env: { fmt: env.fmt, v: env.v, seq: env.seq, t: env.t, ck: env.ck, payload: env.payload } }, null, 1);
  };
  MW.importSave = function (str) {
    var outer = JSON.parse(str); // 坏文件在此抛出，由调用方提示
    var env = outer && outer.export === 'microworld-save' ? outer.env : outer;
    if (!env || env.fmt !== 'microworld') throw new Error('不是本游戏的存档文件');
    if (U.fnv1a(env.payload) !== env.ck) throw new Error('校验和不符：文件已损坏');
    var w = MW.deserialize(JSON.parse(env.payload));
    if (!w) throw new Error('存档版本不兼容（期望 v' + MW.SAVE_VERSION + '）');
    w._lastSlot = null;
    w.seq = env.seq | 0;
    return w;
  };

  // —— 设置（窗口尺寸记忆、画质、离线上限、观察风格等） ——
  var DEF_SETTINGS = {
    mini: false, quality: 2, offCapH: 8, style: 1, eventFreq: 1,
    winW: 1024, winH: 640, muted: false, speedDefault: 1
  };
  MW.loadSettings = function () {
    var s = store(), o = null;
    try { o = JSON.parse(s.getItem(KEY_SET) || 'null'); } catch (e) { o = null; }
    var out = {};
    for (var k in DEF_SETTINGS) out[k] = (o && o[k] !== undefined) ? o[k] : DEF_SETTINGS[k];
    return out;
  };
  MW.saveSettings = function (st) {
    try { store().setItem(KEY_SET, JSON.stringify(st)); } catch (e) { /* 忽略 */ }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
