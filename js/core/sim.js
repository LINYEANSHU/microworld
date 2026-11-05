// sim.js — 聚合仿真引擎。1 tick = 1 游戏日。
// 守恒保证：所有状态转移为"有界流"（flow = min(rate×src, src×上限)），
// 减去多少就加到哪，不存在凭空增减；交通为出行暴露耦合项，不迁移人口。
// 全程仅用 + - × ÷ 与 min/max/clamp，不用超越函数，保证跨引擎确定性。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  var WET = [1.3, 1.0, 0.7, 0.4];   // 气候湿度权重（季节脉冲用）
  var CURE_TOTAL = 30000;            // 解药研究总量（调参用）
  MW.CURE_TOTAL = CURE_TOTAL;

  // 事件修正聚合（每 tick 重建，开销极小）
  MW.computeMods = function (w) {
    var m = { gBeta: 1, gResearch: 1, gAw: 0, trav: [1, 1, 1], rg: null, campMul: 1 };
    var rg = null, i, e;
    for (i = 0; i < w.mods.length; i++) {
      e = w.mods[i];
      if (e.until < w.day) continue;
      if (e.g) {
        if (e.g.beta) m.gBeta *= e.g.beta;
        if (e.g.research) m.gResearch *= e.g.research;
        if (e.g.aw) m.gAw += e.g.aw;
        if (e.g.camp) m.campMul *= e.g.camp;
      }
      if (e.trav) { m.trav[0] *= e.trav[0]; m.trav[1] *= e.trav[1]; m.trav[2] *= e.trav[2]; }
      if (e.rg) {
        for (var k in e.rg) {
          var idx = +k;
          if (!rg) rg = [];
          if (!rg[idx]) rg[idx] = { beta: 1, aw: 0, med: 0, camp: 0 };
          var t = e.rg[k];
          if (t.beta) rg[idx].beta *= t.beta;
          if (t.aw) rg[idx].aw += t.aw;
          if (t.med) rg[idx].med += t.med;
          if (t.camp) rg[idx].camp += t.camp;
        }
      }
    }
    m.rg = rg;
    return m;
  };

  MW.simTick = function (w) {
    if (w.flags.ended && w.flags.ended !== 'sandbox') { /* 结局后仍继续观察 */ }
    var day = ++w.day;
    var rng = MW.rngOf(w, 0);
    var p = w.params;
    var R = w.regions, LN = w.links, REG = MW.REGIONS;
    var mods = MW.computeMods(w);
    w._mods = mods;

    // —— 季节相位（无超越函数） ——
    var phase = ((day % 365) + 30) / 365;
    var wave = U.seasonWave(phase);

    var worldPop0 = MW.WORLD_POP0;

    // —— 第一遍：出口暴露压 + 缓存 ——
    // 暴露/传播压缓冲按世界复用（不进存档；fill(0) 与新建零填充语义一致，确定性不变）
    var i, r, rd, L, prev;
    var buf = w._fb;
    if (!buf || buf.n < R.length) {
      buf = w._fb = { n: R.length, expI: new Float64Array(R.length), expC: new Float64Array(R.length), pIn: new Float64Array(R.length) };
    }
    var expI = buf.expI, expC = buf.expC;
    for (i = 0; i < R.length; i++) {
      r = R[i];
      L = r.S + r.E + r.I + r.R + r.C;
      r._L = L;
      prev = L > 0 ? (r.I + 0.35 * r.E) / L : 0;
      expI[i] = prev;
      expC[i] = p.envRes > 0 && L > 0 ? (r.C / L) * p.envRes * 0.6 : 0;
    }

    // —— 第二遍：连接传播压 ——
    var pIn = buf.pIn;
    for (i = 0; i < R.length; i++) pIn[i] = 0;
    for (i = 0; i < LN.length; i++) {
      var lk = LN[i];
      var t = lk.type;
      var cls = lk.cls[t];
      if (cls <= 0) continue;
      var trav = mods.trav[t];
      var aff = t === 0 ? p.lnAff : (t === 1 ? p.seaAff : p.airAff);
      var ph = lk.phi * cls * trav * aff;
      if (ph <= 0) continue;
      var ea = expI[lk.a], eb = expI[lk.b];
      pIn[lk.b] += ph * ea;
      pIn[lk.a] += ph * eb;
      // 晶化：晶尘经航空/陆路扩散
      if (expC[lk.a] > 0 && t !== 1) pIn[lk.b] += ph * expC[lk.a] * (t === 2 ? 1 : 0.3);
      if (expC[lk.b] > 0 && t !== 1) pIn[lk.a] += ph * expC[lk.b] * (t === 2 ? 1 : 0.3);
    }

    // —— 第三遍：区域状态更新（固定索引序，保证确定性） ——
    var totI = 0, totD = 0, totE = 0, totC = 0, totL = 0;
    var shield = w.research.deployed ? 0.35 : 1;
    for (i = 0; i < R.length; i++) {
      r = R[i]; rd = REG[i];
      L = r._L;
      var rgMod = mods.rg ? mods.rg[i] : null;
      var pop0 = rd.pop0;
      var sShare = pop0 > 0 ? r.S / pop0 : 0;

      // 有效参数
      var beta = p.beta * p.climAff[rd.clim];
      beta *= 1 + p.seasonAmp * (wave - 0.5) * WET[rd.clim] * 2;
      beta *= 1 + p.urbSens * rd.urb;
      if (p.burn > 0 && sShare < 0.5) beta *= 1 - p.burn * U.clamp(1 - sShare / 0.5, 0, 1) * 1.2;
      var camp = U.clamp(r.camp / (p.campR || 1), 0, 0.7);
      if (rgMod && rgMod.camp) camp = U.clamp(camp + rgMod.camp, 0, 0.75);
      beta *= 1 - camp;
      if (rgMod && rgMod.beta !== 1) beta *= rgMod.beta;
      beta *= mods.gBeta * shield;
      var burstFired = false;
      if (p.burstP > 0 && L > 0 && r.I / L > 0.015) {
        if (rng.chance(p.burstP * (0.5 + rd.urb))) { beta *= p.burstAmp; burstFired = true; }
      }
      var betaEff = beta * (r.betaR || 1); // 短时区域加成(事件)
      r.betaR = 1;
      if (betaEff < 0) betaEff = 0;

      // 医疗/援助
      var medF = rd.med * 0.12 + r.medBoost + (rgMod ? rgMod.med : 0) + r.aid * 0.5 / (p.aidR || 1) + (w.research.deployed ? 0.35 : 0);
      var mu = p.leth * (1 - U.clamp(medF, 0, 0.85));
      mu = U.clamp(mu, 0, 0.5);
      var gam = p.recover * (1 + rd.med * 0.1 + r.aid * 0.6 / (p.aidR || 1) + (w.research.deployed ? 0.75 : 0));
      gam = U.clamp(gam, 0, 0.9);
      var sig = U.clamp(p.latent, 0, 0.9);
      if (p.reappear > 0 && rng.chance(p.reappear)) sig = U.clamp(sig * 2.2, 0, 0.9);

      // 流量计算（全部有界）
      var S = r.S, E = r.E, I = r.I, Rc = r.R, D = r.D, C = r.C;
      var envTerm = p.envRes > 0 ? (p.envRes * C * S) / (L > 0 ? L : 1) : 0;
      var impTerm = S * pIn[i] * (w.research.deployed ? 0.35 : 1);
      var newE = betaEff * I * S / (L > 0 ? L : 1) + envTerm + impTerm;
      if (newE > S * 0.5) newE = S * 0.5;
      if (newE < 0) newE = 0;
      if (newE > 0 && !isFinite(newE)) newE = 0;

      var toI = E * sig; if (toI > E) toI = E;
      E -= toI; I += toI;
      var toR = I * gam; if (toR > I) toR = I;
      var toD = I * mu; if (toD > I - toR) toD = I - toR;
      var toC = 0;
      if (p.crystal > 0) { toC = I * p.crystal; if (toC > I - toR - toD) toC = Math.max(0, I - toR - toD); }
      I -= toR + toD + toC; Rc += toR; D += toD; C += toC;
      // 免疫消退（支持"反复"与长期共存）
      var toS = Rc * (p.wane || 0); if (toS > Rc) toS = Rc;
      Rc -= toS; S += toS;
      if (w.research.deployed && C > 0) { // 晶化逆转
        var rev = C * 0.05; if (rev > C) rev = C;
        C -= rev; Rc += rev;
      }
      S -= newE; E += newE;
      r.S = S; r.E = E; r.I = I; r.R = Rc; r.D = D; r.C = C;

      // 觉察度
      var vis = L > 0 ? ((I + 0.3 * E) / L) * p.vis * 12 : 0;
      if (vis > 1) vis = 1;
      var awTar = vis + (rgMod ? rgMod.aw : 0) + mods.gAw;
      r.aw = U.clamp(r.aw * 0.9 + 0.1 * awTar, 0, 1);

      // 严重度缓存（封锁/援助评分用）
      r.sev = L > 0 ? (I / L) * (1 + 18 * p.leth) : 0;

      // 统计
      totI += I + E; totD += D; totE += E; totC += C; totL += L;
      w.stats.infEver += newE;
      if (I + E > w.stats.maxI) { w.stats.maxI = I + E; w.stats.maxIday = day; }
      if (toD > 0) w.stats.deadTotal += toD;
      if (burstFired) {
        w.stats.bursts++;
        r._burstDay = day;
        if (w.stats.bursts % 6 === 1 && rd.urb > 0.6) {
          MW.pushNews(w, '异常', MW.T('sim.burst', '{r}出现齐鸣式集群传播，单日接触链激增', { r: MW.regionName(i) }), 2);
        }
      }
      if (p.reappear > 0 && sig > p.latent && E > 20000 && rng.chance(0.08)) {
        MW.pushNews(w, '异常', MW.T('sim.wake', '{r}出现唤醒波：沉寂感染灶再度活跃', { r: MW.regionName(i) }), 2);
      }
    }

    w._tot = { I: totI, E: totE, D: totD, C: totC, L: totL };
    MW.syncRng(w);

    // —— 人类响应 / 事件 / 演化 ——
    MW.responseTick(w, mods);
    MW.eventTick(w);
    MW.evoTick(w);

    // —— 历史（环形，2日采样，上限1500） ——
    if (day % 2 === 0) {
      var h = w.hist;
      h.t.push(day);
      h.inf.push(totI); h.dead.push(totD);
      h.cure.push(w.research.progress);
      h.aw.push(MW.globalAwareness(w));
      h.pop.push(totL);
      if (h.t.length > 1500) { h.t.shift(); h.inf.shift(); h.dead.shift(); h.cure.shift(); h.aw.shift(); h.pop.shift(); }
    }
    if (w.news.length > 400) w.news.splice(0, w.news.length - 400);
    if (w.evoLog.length > 200) w.evoLog.splice(0, w.evoLog.length - 200);

    // —— 修正到期清理（原地压实：保持顺序，避免每 tick 重建数组） ——
    if (w.mods.length) {
      var k2 = 0;
      for (i = 0; i < w.mods.length; i++) {
        if (w.mods[i].until >= day) w.mods[k2++] = w.mods[i];
      }
      w.mods.length = k2;
    }

    MW.endingCheck(w);
    return w;
  };

  MW.globalAwareness = function (w) {
    // 双权重：全球人口加权（未受影响的大国也在"看新闻"） + 感染区加权 + 通报下限
    var s1 = 0, n1 = 0, s2 = 0, n2 = 0, maxAw = 0;
    for (var i = 0; i < w.regions.length; i++) {
      var pop0 = MW.REGIONS[i].pop0, r = w.regions[i];
      s1 += r.aw * pop0; n1 += pop0;
      if (r.I + r.E > 1) { s2 += r.aw * pop0; n2 += pop0; }
      if (r.aw > maxAw) maxAw = r.aw;
    }
    var g = 0.55 * (n1 > 0 ? s1 / n1 : 0) + (n2 > 0 ? 0.45 * s2 / n2 : 0);
    var f = maxAw * 0.45;
    return g > f ? g : f;
  };

  MW.pushNews = function (w, cat, text, sev) {
    w.news.push({ day: w.day, cat: cat, text: text, sev: sev || 1 });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
