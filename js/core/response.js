// response.js — 人类一侧的自动响应：监测(在sim内)、研究、援助、交通封锁、区域卫生运动。
// 全部由世界状态驱动（觉察度/严重度/医疗缺口），不按固定时间播放脚本。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  MW.responseTick = function (w, mods) {
    var p = w.params, R = w.regions, REG = MW.REGIONS;
    var awG = MW.globalAwareness(w);
    w._awG = awG;
    var scen = MW.scenById(w.scenarioId);
    var sm = scen.mods || {};
    var aiAggr = sm.aiAggr || 1;

    // —— 产出侵蚀（蚀纹类） ——
    var i, r, rd;
    var rp = 0;
    for (i = 0; i < R.length; i++) {
      r = R[i]; rd = REG[i];
      var prev = r._L > 0 ? r.I / r._L : 0;
      var ero = p.erosion > 0 ? Math.min(0.75, p.erosion * prev * 40) : 0;
      r.outMul = 1 - ero;
      var health = U.clamp((r._L / rd.pop0) * 1.2 - Math.min(1, r.sev * 8) * 0.3, 0.05, 1);
      var rgMod = mods.rg ? mods.rg[i] : null;
      var out = (rd.res + rd.wealth * 0.8 + rd.urb * 1.2) * health * r.outMul;
      if (rgMod && rgMod.out) out *= rgMod.out;
      rp += out;
    }
    var funding = 0.4 + 2.6 * awG * (2 - awG);
    // 研究动能：进度过半的体系不会因疫情退潮而一夜解散
    funding += 1.2 * w.research.progress;
    rp *= funding * 0.055 * (sm.researchMult || 1) * mods.gResearch;

    // —— 研究（解药） ——
    if (!w.research.deployed) {
      w.research.progress += rp * 0.62 / (MW.CURE_TOTAL * (p.cureR || 1));
      if (w.research.progress >= 1) {
        w.research.progress = 1;
        w.research.deployed = true;
        w.research.deployedDay = w.day;
        MW.pushNews(w, '研究', MW.T('resp.cureDone', '防控研究完成！干预方案开始全球部署'), 3);
      } else if (w.research.progress > 0.5 && !w.stats.halvedNoted) {
        w.stats.halvedNoted = true;
        MW.pushNews(w, '研究', MW.T('resp.cureHalf', '研究过半：关键机制已被阐明'), 2);
      }
    }
    w.aidPool += rp * 0.26;

    // —— 区域卫生运动（强度与研究进度挂钩：早期只有基本防护） ——
    var campPow = 0.18 + 0.5 * Math.min(1, w.research.progress * 1.5);
    for (i = 0; i < R.length; i++) {
      r = R[i]; rd = REG[i];
      var target = r.aw * campPow * (0.7 + 0.15 * rd.wealth) * mods.campMul;
      r.camp += (target - r.camp) * 0.08;
      if (r.camp < 0) r.camp = 0;
    }

    // —— 援助分配（每3天；观察者优先指示对评分 ×2.5，不突破容量上限） ——
    if (w.day % 3 === 0 && w.aidPool > 8) {
      var cand = [];
      for (i = 0; i < R.length; i++) {
        r = R[i]; rd = REG[i];
        var score = r.sev * ((6 - rd.med) / 5) * Math.max(0.05, 1 - r.aid / 1.2) * (r._L > 1e5 ? 1 : 0);
        if (w.aidPriority === i) score *= 2.5;
        if (score > 0.0005) cand.push([score, i]);
      }
      cand.sort(function (a, b) { return b[0] - a[0]; });
      var nGive = Math.min(cand.length, 6);
      for (i = 0; i < nGive; i++) {
        var idx = cand[i][1];
        var room = 1.2 - R[idx].aid;
        if (room <= 0) continue;
        var grant = Math.min(0.22, w.aidPool * 0.4 / nGive, room);
        R[idx].aid += grant;
        w.aidPool -= grant * 10;
        if (grant > 0.15 && w.day - (R[idx].lastAidNews || -99) > 30) {
          R[idx].lastAidNews = w.day;
          MW.pushNews(w, '援助', MW.T('resp.aidArrive', '援助物资抵达{r}：医疗承载短期提升', { r: MW.regionName(idx) }), 1);
        }
      }
      if (w.aidPool < 0) w.aidPool = 0;
    }
    // 援助自然衰减
    for (i = 0; i < R.length; i++) R[i].aid *= 0.985;

    // —— 交通封锁（迟滞；觉察不足时不触发——无人相信需要封锁） ——
    var scale = (0.55 + 0.9 * awG) * aiAggr;
    var canClose = awG > 0.08;
    var T_air = 0.016 / scale, T_sea = 0.016 * 1.7 / scale, T_land = 0.016 * 2.6 / scale;
    var closedNow = [], openedNow = [];
    for (i = 0; i < R.length; i++) {
      r = R[i]; rd = REG[i];
      if (r._L < 1e4 || !canClose) continue; // 极小区域/觉察不足不触发封锁
      if (!r.cA && r.sev > T_air) { r.cA = true; closedNow.push([i, '空']); }
      else if (r.cA && r.sev < T_air * 0.5) { r.cA = false; openedNow.push([i, '空']); }
      if (!r.cS && r.sev > T_sea) { r.cS = true; closedNow.push([i, '海']); }
      else if (r.cS && r.sev < T_sea * 0.5) { r.cS = false; openedNow.push([i, '海']); }
      if (!r.cL && r.sev > T_land) { r.cL = true; closedNow.push([i, '陆']); }
      else if (r.cL && r.sev < T_land * 0.5) { r.cL = false; openedNow.push([i, '陆']); }
    }
    if (closedNow.length) {
      if (closedNow.length > 4) {
        MW.pushNews(w, '封锁', MW.T('resp.closedMany', '{n}个区域升级交通管制（航空/海运/陆路分级）', { n: closedNow.length }), 2);
      } else {
        for (i = 0; i < closedNow.length; i++) {
          MW.pushNews(w, '封锁', MW.T('resp.closed', '{r}关闭{w}路通道',
            { r: MW.regionName(closedNow[i][0]), w: MW.T('resp.w' + { '空': 'Air', '海': 'Sea', '陆': 'Land' }[closedNow[i][1]], closedNow[i][1]) }), 2);
        }
      }
    }
    if (openedNow.length && openedNow.length <= 4) {
      for (i = 0; i < openedNow.length; i++) {
        MW.pushNews(w, '封锁', MW.T('resp.opened', '{r}恢复{w}路通行',
          { r: MW.regionName(openedNow[i][0]), w: MW.T('resp.w' + { '空': 'Air', '海': 'Sea', '陆': 'Land' }[openedNow[i][1]], openedNow[i][1]) }), 1);
      }
    }
    // 封锁写入连接（新闻与模型一致的唯一写入点）
    var LN = w.links;
    for (i = 0; i < LN.length; i++) {
      var lk = LN[i];
      var ra = R[lk.a], rb = R[lk.b];
      lk.cls[0] = (ra.cL || rb.cL) ? 0 : 1;
      lk.cls[1] = (ra.cS || rb.cS) ? 0 : 1;
      lk.cls[2] = (ra.cA || rb.cA) ? 0 : 1;
    }

    // —— 阶段标签（UI 用） ——
    w.aiPhase = w.research.deployed ? '恢复期'
      : (awG < 0.25 ? '监测期' : (w.research.progress > 0.6 ? '冲刺期' : '遏制期'));
  };
  MW.CURE_TOTAL = MW.CURE_TOTAL; // 保持引用

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
