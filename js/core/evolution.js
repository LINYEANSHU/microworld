// evolution.js — 适应点积累与自动演化决策。
// 评分器为本地规则（不调用任何LLM）：综合考虑资源、前置条件、冷却与当前世界状态，
// 并为每次购买生成"为什么选它"的解释。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  function scenApMul(w) {
    var s = MW.scenById(w.scenarioId);
    return (s.mods && s.mods.apMul) || 1;
  }

  // 传播面扫描（每次决策重算：保证"恢复后继续运行"与连续运行完全一致）
  function scan(w) {
    if (w._scan && w._scan.day === w.day) return w._scan;
    var R = w.regions, REG = MW.REGIONS;
    var climUn = [0, 0, 0, 0], urbUn = 0, modeUn = [0, 0, 0];
    var infEdge = [false, false, false];
    var i, k;
    // 先标记有感染邻接的通道类型
    var LN = w.links;
    for (i = 0; i < LN.length; i++) {
      var lk = LN[i];
      var ia = R[lk.a].I + R[lk.a].E > 0.5, ib = R[lk.b].I + R[lk.b].E > 0.5;
      if ((ia && !ib) || (ib && !ia)) infEdge[lk.type] = true;
    }
    var totPop = 0;
    for (i = 0; i < R.length; i++) {
      var rd = REG[i], r = R[i];
      var uninf = (r.I + r.E) < 1;
      var pop0 = rd.pop0;
      totPop += pop0;
      if (uninf) {
        climUn[rd.clim] += pop0;
        if (rd.urb > 0.7) urbUn += pop0;
        var hasMode = [false, false, false];
        // 该区域是否拥有该类型通道（近似可达面）
        for (k = 0; k < LN.length; k++) {
          var l2 = LN[k];
          if (l2.a === i) hasMode[l2.type] = true;
          else if (l2.b === i) hasMode[l2.type] = true;
        }
        for (k = 0; k < 3; k++) if (hasMode[k] || infEdge[k]) modeUn[k] += pop0 * (hasMode[k] ? 1 : 0.25);
      }
    }
    w._scan = {
      day: w.day,
      climUn: [climUn[0] / totPop, climUn[1] / totPop, climUn[2] / totPop, climUn[3] / totPop],
      urbUn: urbUn / totPop,
      modeUn: [modeUn[0] / totPop, modeUn[1] / totPop, modeUn[2] / totPop]
    };
    return w._scan;
  }

  function scoreHints(w, hints, scan) {
    var s = 0, i, h;
    var infShare = w._tot && w._tot.L > 0 ? (w._tot.I / w._tot.L) : 0;
    var awG = w._awG || 0;
    var cure = w.research.progress;
    for (i = 0; i < hints.length; i++) {
      h = hints[i];
      if (h === 'spread') s += (1 - Math.min(1, infShare * 6)) * 30;
      else if (h.indexOf('clim:') === 0) s += scan.climUn[+h.charAt(5)] * 26;
      else if (h === 'urban') s += scan.urbUn * 24;
      else if (h === 'sea') s += scan.modeUn[1] * 18;
      else if (h === 'air') s += scan.modeUn[2] * 18;
      else if (h === 'land') s += scan.modeUn[0] * 18;
      else if (h === 'stealth') s += (1 - awG) * 22 + cure * 10;
      else if (h === 'resist') s += cure * 36;
      else if (h === 'lethal') s += Math.min(1, infShare * 8) * 15;
      else if (h === 'erosion') s += (1 - Math.min(1, infShare * 10)) * 24;
      else if (h === 'burst') s += Math.min(1, infShare * 12) * 12;
      else if (h === 'env') s += (w._tot && w._tot.C > 0 ? Math.min(1, w._tot.C / (MW.WORLD_POP0 * 0.05)) : 0.3) * 30;
    }
    return s;
  }

  var HINT_TXT = {
    spread: '广谱传播面仍在扩大', urban: '高城市化人口尚未渗透', sea: '海运通道暴露面大',
    air: '航空通道暴露面大', land: '陆路商道暴露面大', stealth: '当前觉察度低，隐匿收益高',
    resist: '研究进度推进中，抗性收益上升', lethal: '疫情已成规模，强化烈度收益显现',
    erosion: '目标区域产能完好，侵蚀收益高', burst: '已具规模的传播网络可被爆发放大',
    env: '环境储库可进一步利用', 'clim:0': '热带人口尚未渗透', 'clim:1': '温带人口尚未渗透',
    'clim:2': '寒带人口尚未渗透', 'clim:3': '干旱区人口尚未渗透'
  };
  function hintTxt(h) {
    if (MW.LANG === 'en' && MW.DATA_EN.hintTxt[h]) return MW.DATA_EN.hintTxt[h];
    return HINT_TXT[h] || '综合收益最高';
  }
  function refineName(id) {
    return MW.LANG === 'en' ? MW.DATA_EN.refine[id] : MW.REFINE[id].name;
  }

  // 子节点表（解锁价值）：某节点被购买后立刻解锁的下游节点
  var CHILDREN = null;
  function childrenOf() {
    if (CHILDREN) return CHILDREN;
    CHILDREN = {};
    for (var i = 0; i < MW.TRAITS.length; i++) {
      var t = MW.TRAITS[i];
      for (var k = 0; k < t.req.length; k++) {
        (CHILDREN[t.req[k]] = CHILDREN[t.req[k]] || []).push(t.id);
      }
    }
    return CHILDREN;
  }

  MW.evoTick = function (w) {
    var rng = MW.rngOf(w, 2);
    var totI = w._tot ? w._tot.I : 0;
    var I_M = totI / 1e6;
    w.ap += (0.03 + Math.sqrt(I_M > 0 ? I_M : 0) * 0.045) * scenApMul(w);
    if (w.evoCd > 0) { w.evoCd--; MW.syncRng(w); return; }

    var scan_ = scan(w);
    var p = w.params;
    var cands = [];
    var i, t;
    var ownedSet = {};
    for (i = 0; i < w.owned.length; i++) ownedSet[w.owned[i]] = true;
    var chMap = childrenOf();

    for (i = 0; i < MW.TRAITS.length; i++) {
      t = MW.TRAITS[i];
      if (t.type !== w.anomalyId) continue;
      if (ownedSet[t.id]) continue;
      var ok = true;
      for (var k = 0; k < t.req.length; k++) if (!ownedSet[t.req[k]]) { ok = false; break; }
      if (!ok || t.cost > w.ap) continue;
      var sc = scoreHints(w, t.hints, scan_) / (1 + t.cost * 0.04);
      sc += (chMap[t.id] ? chMap[t.id].length * 5 : 0); // 解锁价值
      sc += rng.next() * 2; // 确定性抖动(来自已保存的evo流)
      cands.push({ node: t, sc: sc });
    }
    // 精炼节点：拥有≥6特性后可用
    var ownedCount = 0;
    for (i = 0; i < MW.TRAITS.length; i++) if (MW.TRAITS[i].type === w.anomalyId && ownedSet[MW.TRAITS[i].id]) ownedCount++;
    if (ownedCount >= 6) {
      var rc = MW.REFINE_COST(w.refineLvl);
      if (rc <= w.ap) {
        var rs = scoreHints(w, MW.REFINE[w.anomalyId].hints, scan_) / (1 + rc * 0.04) + ownedCount * 0.5;
        cands.push({ refine: true, cost: rc, sc: rs + rng.next() * 2 });
      }
    }

    if (!cands.length) { MW.syncRng(w); return; }
    cands.sort(function (a, b) { return b.sc - a.sc; });
    var best = cands[0];
    // 前期(尚无特性)必须开局；低分保留资源；但长期无购买时保底出手（防止链卡死）
    var idle = w.day - (w.stats.evoLastDay || 0);
    if (w.owned.length > 0 && best.sc < 3.5 && idle < 250) { MW.syncRng(w); return; }

    if (best.refine) {
      w.ap -= best.cost;
      w.refineLvl++;
      w.stats.evoLastDay = w.day;
      MW.applyFxPublic(w.params, { m: MW.REFINE_FX(w.refineLvl), a: {} });
      w.evoLog.push({
        day: w.day, id: 'refine', name: refineName(w.anomalyId), cost: best.cost, lvl: w.refineLvl,
        reason: MW.T('evo.refine.r', '精炼{n}级：综合传播面与{h}，边际收益仍为正',
          { n: w.refineLvl, h: hintTxt(MW.REFINE[w.anomalyId].hints[0]) })
      });
      MW.pushNews(w, '演化', MW.T('evo.refineNews', '{n}提升至{l}级', { n: refineName(w.anomalyId), l: w.refineLvl }), 1);
    } else {
      var node = best.node;
      w.ap -= node.cost;
      w.owned.push(node.id);
      w.stats.evoLastDay = w.day;
      MW.applyFxPublic(w.params, node);
      // 解释：主因 + 备选对比
      var mainHint = node.hints.length ? node.hints[0] : 'spread';
      var reason = hintTxt(mainHint);
      var second = cands[1] && cands[1].node ? MW.traitName(cands[1].node.id) : null;
      var why = MW.T('evo.choose', '选择【{n}】({c}适应点)：{why}',
        { n: MW.traitName(node.id), c: node.cost, why: reason });
      if (second) why += MW.T('evo.alt', '；备选【{m}】边际收益略低', { m: second });
      w.evoLog.push({ day: w.day, id: node.id, name: MW.traitName(node.id), cost: node.cost, reason: why });
      MW.pushNews(w, '演化', MW.T('evo.evNews', '异常演化出【{n}】', { n: MW.traitName(node.id) }), 1);
    }
    w.evoCd = 3;
    MW.syncRng(w);
  };

  // 供 world.js 调用的 fx 应用（避免循环依赖问题，直接挂在 MW 上）
  MW.applyFxPublic = function (p, node) {
    var k, v;
    for (k in node.m) {
      v = node.m[k];
      if (k.indexOf('climAff') === 0) p.climAff[+k.charAt(7)] *= v;
      else p[k] *= v;
    }
    for (k in node.a) {
      v = node.a[k];
      if (k.indexOf('climAff') === 0) p.climAff[+k.charAt(7)] += v;
      else p[k] += v;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
