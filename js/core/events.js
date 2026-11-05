// events.js — 事件引擎与43条事件（全部有触发条件、后果、冷却）。
// 事件通过 mods 修正世界参数、直接修改区域/援助池，并推送新闻；均与实际状态一致。
// 新闻文案经 MW.evNews 双语化；事件 apply 只允许使用传入的 rng（保证可单测、可复现）。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;

  function mod(w, days, obj) { obj.until = w.day + days; w.mods.push(obj); }
  function wet(w) { return ((w.day % 365) + 30) / 365 < 0.5; }
  function anyRegion(w, f) {
    for (var i = 0; i < w.regions.length; i++) if (f(w.regions[i], i)) return i;
    return -1;
  }
  function topRegion(w, f) {
    var best = -1, bv = -1;
    for (var i = 0; i < w.regions.length; i++) {
      var v = f(w.regions[i], i);
      if (v > bv) { bv = v; best = i; }
    }
    return bv > 0 ? best : -1;
  }
  function R(w, i) { return MW.regionName(i); }
  function rg1(i, o) { var m = {}; m[i] = o; return m; }
  function N(id, fb, p, v) { return MW.evNews(id, fb, p, v); }

  // 冷/热/旱区域索引（惰性）
  var CLIM_IDX = null;
  function climIdx() {
    if (CLIM_IDX) return CLIM_IDX;
    CLIM_IDX = [[], [], [], []];
    for (var i = 0; i < MW.REGIONS.length; i++) CLIM_IDX[MW.REGIONS[i].clim].push(i);
    return CLIM_IDX;
  }
  function rgArr(w, idxs, o) {
    var m = {};
    for (var k = 0; k < idxs.length; k++) m[idxs[k]] = o;
    return m;
  }

  // p: 每日基础概率；cd: 冷却天数
  MW.EVENTS = [
    // —— 自然 ——
    { id: 'monsoon', name: '季风登陆', cat: '自然', p: 0.010, cd: 60,
      when: function (w) { return wet(w); },
      apply: function (w) { mod(w, 12, { g: { beta: 1.06 }, trav: [1.05, 1.25, 1.0] }); MW.pushNews(w, '自然', N('monsoon', '季风登陆：湿热气流推动跨海往来')); } },
    { id: 'coldsnap', name: '寒潮南下', cat: '自然', p: 0.008, cd: 45,
      when: function (w) { var ph = (w.day % 365) / 365; return ph > 0.5 && ph < 0.95; },
      apply: function (w) { mod(w, 10, { rg: rgArr(w, climIdx()[2], { beta: 1.3 }) }); MW.pushNews(w, '自然', N('coldsnap', '寒潮南下：低温区域的接触模式改变')); } },
    { id: 'heatwave', name: '热浪', cat: '自然', p: 0.008, cd: 45,
      when: function (w) { var ph = (w.day % 365) / 365; return ph > 0.15 && ph < 0.5; },
      apply: function (w) { mod(w, 8, { rg: rgArr(w, climIdx()[3].concat(climIdx()[0]), { beta: 0.85, aw: 0.06 }) }); MW.pushNews(w, '自然', N('heatwave', '热浪席卷：户外活动减少，觉察上升')); } },
    { id: 'sandstorm', name: '沙尘暴', cat: '自然', p: 0.006, cd: 40,
      when: function (w) { return anyRegion(w, function (r, i) { return MW.REGIONS[i].clim === 3 && r.I > 5000; }) >= 0; },
      apply: function (w) { var i = topRegion(w, function (r, k) { return MW.REGIONS[k].clim === 3 ? r.I : -1; }); mod(w, 6, { rg: rg1(i, { beta: 1.35 }) }); MW.pushNews(w, '自然', N('sandstorm', '{r}遭遇沙尘暴：悬浮颗粒物扩散', { r: R(w, i) })); } },
    { id: 'flood', name: '洪水', cat: '自然', p: 0.005, cd: 70,
      apply: function (w) { var i = topRegion(w, function (r, k) { return MW.REGIONS[k].coast ? r.I * (1 + MW.REGIONS[k].hub) : -1; }); mod(w, 25, { rg: rg1(i, { med: -0.3 }) }); MW.pushNews(w, '自然', N('flood', '{r}发生洪水：医疗承载短期受损', { r: R(w, i) }), 2); } },
    { id: 'quake', name: '地震', cat: '自然', p: 0.004, cd: 90,
      apply: function (w) { var i = topRegion(w, function (r, k) { return r._L; }); mod(w, 30, { rg: rg1(i, { med: -0.6 }) }); MW.pushNews(w, '自然', N('quake', '{r}发生地震：救援与医疗承压', { r: R(w, i) }), 2); } },
    { id: 'wildfire', name: '野火', cat: '自然', p: 0.005, cd: 70,
      apply: function (w) { var i = topRegion(w, function (r, k) { return MW.REGIONS[k].clim === 3 ? r._L : -1; }); mod(w, 15, { rg: rg1(i, { camp: -0.15 }) }); MW.pushNews(w, '自然', N('wildfire', '{r}爆发野火：响应资源被抽调', { r: R(w, i) })); } },
    { id: 'bountyear', name: '丰收年', cat: '自然', p: 0.006, cd: 80,
      apply: function (w) { mod(w, 20, { g: { research: 1.15 } }); MW.pushNews(w, '自然', N('bountyear', '全球丰收：经济向好，研究经费宽裕')); } },
    { id: 'leanyear', name: '歉收之年', cat: '自然', p: 0.006, cd: 80,
      apply: function (w) { mod(w, 25, { g: { research: 0.88 } }); MW.pushNews(w, '自然', N('leanyear', '多地歉收：财政收紧')); } },
    // —— 社会 ——
    { id: 'festival', name: '节庆周', cat: '社会', p: 0.009, cd: 50,
      apply: function (w) { mod(w, 10, { trav: [1.3, 1.1, 1.5] }); MW.pushNews(w, '社会', N('festival', '节庆周开始：跨区人流达到峰值')); } },
    { id: 'pilgrimage', name: '朝圣季', cat: '社会', p: 0.006, cd: 90,
      apply: function (w, rng) { var hubs = []; for (var i = 0; i < MW.REGIONS.length; i++) if (MW.REGIONS[i].hub === 2) hubs.push(i); var k = hubs[rng.int(hubs.length)]; mod(w, 12, { rg: rg1(k, { beta: 1.25 }), trav: [1.1, 1.0, 1.2] }); MW.pushNews(w, '社会', N('pilgrimage', '朝圣季：{r}人流聚集', { r: R(w, k) })); } },
    { id: 'wedding', name: '婚庆旺季', cat: '社会', p: 0.007, cd: 45,
      apply: function (w) { mod(w, 7, { trav: [1.35, 1.0, 1.0] }); MW.pushNews(w, '社会', N('wedding', '婚庆旺季：陆路探亲访友增多')); } },
    { id: 'strike_port', name: '港口罢工', cat: '社会', p: 0.006, cd: 80,
      apply: function (w) { mod(w, 18, { trav: [1.0, 0.3, 1.0] }); MW.pushNews(w, '社会', N('strike_port', '港口大罢工：海运几近停摆')); } },
    { id: 'strike_air', name: '空管罢工', cat: '社会', p: 0.005, cd: 80,
      apply: function (w) { mod(w, 12, { trav: [1.0, 1.0, 0.4] }); MW.pushNews(w, '社会', N('strike_air', '空管人员罢工：航班大面积取消')); } },
    { id: 'protest', name: '管控抗议', cat: '社会', p: 0.005, cd: 60,
      when: function (w) { return w._awG > 0.5; },
      apply: function (w) { mod(w, 20, { g: { camp: 0.7 } }); MW.pushNews(w, '社会', N('protest', '多地出现管控抗议：卫生运动受阻')); } },
    { id: 'panic', name: '抢购潮', cat: '社会', p: 0.006, cd: 50,
      when: function (w) { return w._awG > 0.3; },
      apply: function (w) { mod(w, 6, { g: { aw: 0.10 } }); MW.pushNews(w, '社会', N('panic', '物资抢购潮蔓延：公众警觉骤升')); } },
    { id: 'rumor', name: '网络谣言', cat: '社会', p: 0.007, cd: 50,
      apply: function (w) { mod(w, 10, { g: { aw: -0.08 } }); MW.pushNews(w, '社会', N('rumor', '"这只是普通流感"——谣言拉低公众警觉')); } },
    { id: 'census', name: '人口普查', cat: '社会', p: 0.004, cd: 200,
      apply: function (w) { mod(w, 10, { g: { research: 1.08 } }); MW.pushNews(w, '社会', N('census', '全球人口普查完成：统计基线更新')); } },
    { id: 'election', name: '换届选举', cat: '社会', p: 0.005, cd: 120,
      apply: function (w, rng) { if (rng.chance(0.5)) { mod(w, 25, { g: { camp: 1.2 } }); MW.pushNews(w, '社会', N('election', '新政府上台：公共卫生承诺加码')); } else { mod(w, 25, { g: { research: 1.10 } }); MW.pushNews(w, '社会', N('election', '新政府上台：科研预算追加', null, 'news2')); } } },
    { id: 'cyberattack', name: '黑客攻击', cat: '社会', p: 0.005, cd: 70,
      when: function (w) { return w.research.progress > 0.1; },
      apply: function (w) { mod(w, 15, { g: { research: 0.8 } }); MW.pushNews(w, '社会', N('cyberattack', '研究网络遭黑客攻击：数据同步中断')); } },
    { id: 'datamarket', name: '数据黑市', cat: '社会', p: 0.005, cd: 60,
      apply: function (w) { mod(w, 12, { g: { aw: 0.12, research: 1.05 } }); MW.pushNews(w, '社会', N('datamarket', '泄露的监测数据流通：公众与研究双双受益')); } },
    // —— 医疗 ——
    { id: 'breakthrough', name: '论文突破', cat: '医疗', p: 0.006, cd: 70,
      when: function (w) { return w.research.progress > 0.05 && !w.research.deployed; },
      apply: function (w) { w.research.progress = Math.min(0.99, w.research.progress + 0.02); MW.pushNews(w, '研究', N('breakthrough', '关键论文发表：研究进度跳升')); } },
    { id: 'fraud', name: '数据造假', cat: '医疗', p: 0.005, cd: 90,
      when: function (w) { return w.research.progress > 0.15 && !w.research.deployed; },
      apply: function (w) { w.research.progress = Math.max(0, w.research.progress - 0.015); mod(w, 15, { g: { research: 0.9 } }); MW.pushNews(w, '研究', N('fraud', '核心数据被证实造假：研究倒退')); } },
    { id: 'vaxx', name: '疫苗犹豫', cat: '医疗', p: 0.006, cd: 80,
      when: function (w) { return w.research.progress > 0.3; },
      apply: function (w) { mod(w, 30, { g: { camp: 0.75 } }); MW.pushNews(w, '医疗', N('vaxx', '犹豫情绪蔓延：干预依从性下降')); } },
    { id: 'medoverload', name: '医院过载', cat: '医疗', p: 0.007, cd: 40,
      when: function (w) { return topRegion(w, function (r) { return r.sev; }) >= 0; },
      apply: function (w) { var i = topRegion(w, function (r) { return r.sev; }); mod(w, 25, { rg: rg1(i, { med: -0.4 }) }); MW.pushNews(w, '医疗', N('medoverload', '{r}医院过载：重症收治能力告急', { r: R(w, i) })); } },
    { id: 'volunteer', name: '志愿网络', cat: '医疗', p: 0.007, cd: 50,
      apply: function (w) { w.aidPool += 40; MW.pushNews(w, '援助', N('volunteer', '志愿网络动员：援助池扩充')); } },
    { id: 'airbridge', name: '医疗空桥', cat: '医疗', p: 0.005, cd: 60,
      apply: function (w) { w.aidPool += 60; MW.pushNews(w, '援助', N('airbridge', '医疗空桥建立：援助运力提升')); } },
    { id: 'screening', name: '口岸筛查', cat: '医疗', p: 0.006, cd: 60,
      when: function (w) { return w._awG > 0.35; },
      apply: function (w) { mod(w, 25, { g: { aw: 0.15 }, trav: [1.0, 1.0, 0.8] }); MW.pushNews(w, '医疗', N('screening', '口岸体温筛查全面铺开')); } },
    { id: 'campaign_week', name: '卫生宣传周', cat: '医疗', p: 0.007, cd: 45,
      apply: function (w) { mod(w, 15, { g: { camp: 1.3, beta: 0.95 } }); MW.pushNews(w, '医疗', N('campaign_week', '卫生宣传周：洗手、口罩与保持距离')); } },
    { id: 'researchrace', name: '科研竞赛', cat: '医疗', p: 0.006, cd: 70,
      when: function (w) { return w._awG > 0.4 && !w.research.deployed; },
      apply: function (w) { mod(w, 20, { g: { research: 1.25 } }); MW.pushNews(w, '研究', N('researchrace', '多国研究竞赛：经费与人力集中投入')); } },
    { id: 'supply', name: '供应链危机', cat: '医疗', p: 0.005, cd: 80,
      when: function (w) { return w._awG > 0.3; },
      apply: function (w) { mod(w, 20, { g: { research: 0.85 } }); MW.pushNews(w, '医疗', N('supply', '试剂与设备断供：研究放缓')); } },
    { id: 'recovernote', name: '复苏迹象', cat: '医疗', p: 0.006, cd: 90,
      when: function (w) { return w._tot && w._tot.L > 0 && (w._tot.I / w._tot.L) < 0.01 && w.stats.infEver > 1e6; },
      apply: function (w) { mod(w, 30, { g: { research: 1.12, camp: 1.1 } }); MW.pushNews(w, '医疗', N('recovernote', '复苏迹象：低传播期被用于重建响应体系')); } },
    // —— 异常互动（条件取决于异常状态） ——
    { id: 'super_spread', name: '超级传播集会', cat: '异常', p: 0.007, cd: 35,
      when: function (w) { return topRegion(w, function (r, i) { return MW.REGIONS[i].urb > 0.65 ? r.I : -1; }) >= 0; },
      apply: function (w) { var i = topRegion(w, function (r, k) { return MW.REGIONS[k].urb > 0.65 ? r.I : -1; }); mod(w, 4, { rg: rg1(i, { beta: 1.6 }) }); MW.pushNews(w, '异常', N('super_spread', '{r}出现超级传播集会', { r: R(w, i) })); } },
    { id: 'crystdust', name: '晶尘风暴', cat: '异常', p: 0.008, cd: 45,
      when: function (w) { return w._tot && w._tot.C > 5e5; },
      apply: function (w) { var idx = climIdx()[3]; mod(w, 10, { rg: rgArr(w, idx, { beta: 1.3 }) }); MW.pushNews(w, '异常', N('crystdust', '晶尘风暴：干旱区晶壳碎屑大规模悬浮')); } },
    { id: 'fogsurge', name: '雾潮涌动', cat: '异常', p: 0.008, cd: 45,
      when: function (w) { return topRegion(w, function (r, i) { return MW.REGIONS[i].coast ? r.I : -1; }) >= 0; },
      apply: function (w) { mod(w, 10, { trav: [1.0, 1.15, 1.0], rg: rgArr(w, climIdx()[0], { beta: 1.2 }) }); MW.pushNews(w, '异常', N('fogsurge', '雾潮涌动：沿海雾带扩张')); } },
    { id: 'wake', name: '潜伏唤醒', cat: '异常', p: 0.006, cd: 40,
      when: function (w) { return w._tot && w._tot.E > w._tot.I * 2 && w._tot.E > 1e5; },
      apply: function (w) { var i = topRegion(w, function (r) { return r.E; }); mod(w, 5, { rg: rg1(i, { beta: 1.4 }) }); MW.pushNews(w, '异常', N('wake', '{r}潜伏感染灶被唤醒', { r: R(w, i) })); } },
    { id: 'etchdeep', name: '蚀纹深化', cat: '异常', p: 0.007, cd: 50,
      when: function (w) { return w.params.erosion > 0.005 && w._awG > 0.3; },
      apply: function (w) { mod(w, 30, { g: { research: 0.88 } }); MW.pushNews(w, '异常', N('etchdeep', '蚀纹深化：更多研究设施出现效率衰减')); } },
    { id: 'emberflash', name: '余烬复燃', cat: '异常', p: 0.007, cd: 35,
      when: function (w) { return topRegion(w, function (r, i) { var p0 = MW.REGIONS[i].pop0; return (r.S / p0 < 0.3 && r.I > 500); }) >= 0; },
      apply: function (w) { var i = topRegion(w, function (r, k) { var p0 = MW.REGIONS[k].pop0; return (r.S / p0 < 0.3 && r.I > 500) ? r.I : -1; }); mod(w, 4, { rg: rg1(i, { beta: 1.8 }) }); MW.pushNews(w, '异常', N('emberflash', '{r}余烬复燃：低易感区意外回升', { r: R(w, i) })); } },
    // —— 系统 ——
    { id: 'grant', name: '全球拨款', cat: '系统', p: 0.005, cd: 70,
      when: function (w) { return w._awG > 0.25; },
      apply: function (w) { w.aidPool += 80; mod(w, 15, { g: { research: 1.15 } }); MW.pushNews(w, '系统', N('grant', '全球联合拨款通过：援助与研究同步加码')); } },
    { id: 'closure_cascade', name: '边境恐慌', cat: '系统', p: 0.005, cd: 60,
      when: function (w) { return w._awG > 0.55; },
      apply: function (w) { mod(w, 5, { g: { aw: 0.2 } }); MW.pushNews(w, '系统', N('closure_cascade', '边境恐慌情绪蔓延：多地提前收紧通道')); } },
    { id: 'memorial', name: '纪念日活动', cat: '系统', p: 0.004, cd: 120,
      apply: function (w) { mod(w, 8, { g: { aw: 0.04, camp: 1.1 } }); MW.pushNews(w, '系统', N('memorial', '全球公共卫生纪念日：各地举办科普活动')); } },
    { id: 'mutation', name: '随机变异', cat: '异常', p: 0.005, cd: 100,
      when: function (w) { return w._tot && w._tot.I > 1e6; },
      apply: function (w, rng) {
        var r = Math.floor(rng.next() * 3);
        if (r === 0) { mod(w, 40, { g: { beta: 1.12 } }); MW.pushNews(w, '异常', N('mutation', '检出传播力更强的变异株（+12% 传播，40天）')); }
        else if (r === 1) { mod(w, 40, { g: { beta: 0.9 } }); MW.pushNews(w, '异常', N('mutation', '检出传播力较弱的变异株（-10% 传播，40天）', null, 'news2')); }
        else { mod(w, 40, { g: { research: 0.92 } }); MW.pushNews(w, '异常', N('mutation', '变异株干扰研究模型（研究 -8%，40天）', null, 'news3')); }
      } },
    { id: 'treaty', name: '跨境协作条约', cat: '系统', p: 0.004, cd: 150,
      when: function (w) { return w._awG > 0.6; },
      apply: function (w) { w.aidPool += 50; mod(w, 30, { g: { research: 1.1 } }); MW.pushNews(w, '系统', N('treaty', '跨境协作条约签署：数据与援助互通')); } },
    // —— 精进阶段新增（6条，2026-11） ——
    { id: 'quarantine_lift', name: '解封浪潮', cat: '系统', p: 0.004, cd: 120,
      when: function (w) { return w._awG < 0.25 && anyRegion(w, function (r) { return r.cA || r.cS || r.cL; }) >= 0; },
      apply: function (w) {
        var n = 0;
        for (var i = 0; i < w.regions.length; i++) {
          if (w.regions[i].cA) { w.regions[i].cA = false; n++; }
          if (w.regions[i].cS) { w.regions[i].cS = false; n++; }
          if (w.regions[i].cL) { w.regions[i].cL = false; n++; }
        }
        MW.pushNews(w, '封锁', N('quarantine_lift', '疲态显现：{n}处交通管制在同一天全部解除', { n: n }), 2);
      } },
    { id: 'aid_convoy', name: '国际援助车队', cat: '援助', p: 0.005, cd: 60,
      when: function (w) { return w._awG > 0.4 && w.aidPool < 40; },
      apply: function (w) { w.aidPool += 45; MW.pushNews(w, '援助', N('aid_convoy', '跨国援助车队抵达集结点：援助池一次性扩充')); } },
    { id: 'sabbatical', name: '学术休假', cat: '医疗', p: 0.004, cd: 80,
      when: function (w) { return w.research.progress > 0.2 && !w.research.deployed; },
      apply: function (w) { mod(w, 15, { g: { research: 0.95 } }); MW.pushNews(w, '研究', N('sabbatical', '核心团队轮休两周：研究节奏放缓')); } },
    { id: 'blackout', name: '都市灯火管制', cat: '社会', p: 0.005, cd: 70,
      when: function (w) { return topRegion(w, function (r, i) { return MW.REGIONS[i].urb > 0.7 ? r.I : -1; }) >= 0; },
      apply: function (w) {
        var i = topRegion(w, function (r, k) { return MW.REGIONS[k].urb > 0.7 ? r.I : -1; });
        mod(w, 8, { rg: rg1(i, { beta: 0.85 }), trav: [0.85, 1.0, 1.0] });
        MW.pushNews(w, '社会', N('blackout', '{r}实施灯火管制：夜间人流与夜间经济同步收缩', { r: R(w, i) }));
      } },
    { id: 'crystal_thaw', name: '晶壳融解', cat: '异常', p: 0.005, cd: 120,
      when: function (w) { return w.params.crystal > 0 && w.research.deployed && w._tot && w._tot.C > 5e5; },
      apply: function (w) {
        var moved = 0;
        for (var i = 0; i < w.regions.length; i++) {
          var r = w.regions[i];
          var x = r.C * 0.02; if (x > r.C) x = r.C;
          if (x > 0) { r.C -= x; r.R += x; moved += x; }
        }
        MW.pushNews(w, '异常', N('crystal_thaw', '干预方案起效：大片晶壳开始融解回康复群体', null), 1);
        return moved; // 可观测：晶化载体下降
      } },
    { id: 'harvest_festival', name: '丰收祭', cat: '自然', p: 0.006, cd: 70,
      when: function (w) { return wet(w); },
      apply: function (w) { mod(w, 7, { trav: [1.25, 1.1, 1.3], g: { aw: -0.05 } }); MW.pushNews(w, '自然', N('harvest_festival', '丰收祭开幕：集市与庆典暂掩了警觉')); } }
  ];

  // 事件引擎：每 tick 依次判定。事件 apply 只允许使用传入的 rng（保证可单测、可复现）。
  MW.eventTick = function (w) {
    var rng = MW.rngOf(w, 1);
    var scen = MW.scenById(w.scenarioId);
    var freq = (scen.mods && scen.mods.eventFreq || 1) * (w._eventFreqSetting || 1);
    for (var i = 0; i < MW.EVENTS.length; i++) {
      var ev = MW.EVENTS[i];
      var cdUntil = w.eventCd[ev.id] || 0;
      if (w.day < cdUntil) continue;
      if (ev.when && !ev.when(w)) continue;
      var pr = ev.p * freq * (ev.cat === '异常' ? freq : 1);
      if (!rng.chance(pr)) continue;
      ev.apply(w, rng);
      w.eventCd[ev.id] = w.day + ev.cd + Math.floor(rng.next() * ev.cd * 0.5);
      if (w.news.length) {
        var last = w.news[w.news.length - 1];
        if (last.day === w.day && ev.name) last.by = ev.name;
      }
    }
    MW.syncRng(w);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
