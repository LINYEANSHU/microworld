// traits.js — 6种原创虚构异常类型与特性树。
// 全部为游戏抽象机制，不对应任何现实病原改造方法。
// fx: m=乘法项, a=加法项。hints 供自动演化评分器使用。
'use strict';
(function () {
  var MW = globalThis.MW;

  // 异常参数（基础值，会被场景与特性修改）
  // beta 传播 | latent E→I日率 | recover I→R日率 | leth I→D日率 | vis 可见度
  // envRes 晶储库暴露 | crystal I→晶化日率 | burstP 爆发概率/日 | burstAmp 爆发β乘数
  // seasonAmp 季节敏感 | urbSens 城市化加成 | reappear 休眠复燃 | erosion 产出侵蚀
  // burn 易感耗竭反噬 | climAff[热,温,寒,旱] | lnAff/seaAff/airAff 通道亲和
  // cureR/aidR/campR 抗性乘数
  function P(o) {
    var p = {
      beta: .13, latent: .14, recover: .055, leth: .006, vis: 1, wane: .0004,
      envRes: 0, crystal: 0, burstP: 0, burstAmp: 2.2, seasonAmp: .12,
      urbSens: 0, reappear: 0, erosion: 0, burn: 0,
      climAff: [1, 1, 1, 1], lnAff: 1, seaAff: 1, airAff: 1,
      cureR: 1, aidR: 1, campR: 1
    };
    if (o) for (var k in o) p[k] = o[k];
    return p;
  }

  MW.ANOMALIES = [
    {
      id: 'cry', name: '晶化', en: 'Crystallize', color: '#9adcf0',
      tagline: '感染者渐化为晶壳，晶尘随风与航线远播；晶壳是长寿命环境储库，亦可被研究逆转。',
      mech: '环境储库 + 可逆晶化',
      base: P({ beta: .13, latent: .12, recover: .05, leth: .004, vis: .95, wane: .0002, envRes: .16, crystal: .018, airAff: 1.35, lnAff: 1.1 })
    },
    {
      id: 'fog', name: '雾潮', en: 'Fog Tide', color: '#4fd8b0',
      tagline: '随湿热季风涨落，沿海与海运通道是它的血管；雾中难辨，监测常常滞后。',
      mech: '季节脉冲 + 海运亲和',
      base: P({ beta: .15, latent: .13, recover: .06, leth: .006, vis: .8, seasonAmp: .55, seaAff: 1.6, climAff: [1.25, 1.0, .7, .6] })
    },
    {
      id: 'res', name: '共鸣', en: 'Resonance', color: '#b48cff',
      tagline: '在高密度城市间共鸣放大，人群聚集处骤发"齐鸣"式超级传播，声响浩大难以忽视。',
      mech: '超级传播爆发 + 城市加成',
      base: P({ beta: .13, latent: .11, recover: .055, leth: .008, vis: 1.2, burstP: .004, burstAmp: 2.6, urbSens: .9, airAff: 1.3 })
    },
    {
      id: 'dor', name: '休眠', en: 'Dormancy', color: '#5a6cff',
      tagline: '长潜隐、难察觉，寒凉处沉睡尤久；你以为它已离开时，唤醒波正在积聚。',
      mech: '长潜伏 + 隐匿 + 复燃',
      base: P({ beta: .11, latent: .045, recover: .05, leth: .012, vis: .45, wane: .0006, reappear: .006, cureR: 1.25, climAff: [.9, 1.0, 1.3, 1.05] })
    },
    {
      id: 'et', name: '蚀纹', en: 'Etch', color: '#d8a24a',
      tagline: '杀者寥寥，却沿商路刻蚀产业与科研能力，让世界在无声中失去应变之力。',
      mech: '经济科研侵蚀 + 商路传播',
      base: P({ beta: .13, latent: .13, recover: .06, leth: .003, vis: .6, erosion: .02, lnAff: 1.35, campR: 1.3 })
    },
    {
      id: 'emb', name: '焰袭', en: 'Ember Rush', color: '#ff7a45',
      tagline: '烈而速，焚一城即熄；若燃料(易感者)充沛则燎原，若通道断绝则自行烧尽。',
      mech: '高致死 + 易感耗竭反噬（燃尽）',
      base: P({ beta: .20, latent: .12, recover: .10, leth: .028, vis: 1.35, wane: .00005, burn: .5, seaAff: .85 })
    }
  ];

  // 特性树。t=主线链 u=环境适应 a=强化 s=顶级 r=可重复精炼
  function N(id, type, name, desc, cost, req, hints, m, a) {
    return { id: id, type: type, name: name, desc: desc, cost: cost, req: req, hints: hints, m: m || {}, a: a || {} };
  }
  MW.TRAITS = [
    // —— 晶化 ——
    N('cry_t1', 'cry', '晶尘扬播', '晶壳碎屑随气流远播，环境储库更强。', 9, [], ['env', 'air'], { envRes: 1.5, airAff: 1.2 }),
    N('cry_t2', 'cry', '棱面休眠', '晶壳内代谢近乎停滞，致死大减、更难被研究瓦解。', 12, ['cry_t1'], ['stealth', 'resist'], { leth: .55, cureR: 1.2 }),
    N('cry_t3', 'cry', '广域晶雾', '晶尘沿陆路商道广布。', 15, ['cry_t2'], ['env', 'land'], { lnAff: 1.3, envRes: 1.3 }),
    N('cry_u1', 'cry', '低温稳定', '低温令晶壳更稳定。', 8, [], ['clim:2'], { climAff2: 1.6 }),
    N('cry_u2', 'cry', '干旱滞留', '干空气中的晶尘悬浮更久。', 8, [], ['clim:3'], { climAff3: 1.5 }),
    N('cry_u3', 'cry', '都市簇晶', '城市表面成为晶簇温床。', 10, [], ['urban'], { urbSens: .4 }),
    N('cry_a1', 'cry', '晶网共生', '晶簇彼此联结，基础传播增强。', 16, ['cry_t1', 'cry_u1'], ['spread'], { beta: 1.25 }),
    N('cry_a2', 'cry', '脆裂扩散', '晶壳脆裂时喷出晶尘。', 14, ['cry_t3'], ['env', 'burst'], { burstAmp: 1.2 }, { burstP: .005 }),
    N('cry_a3', 'cry', '晶核抗性', '晶核对抗解药与援助。', 13, ['cry_t2'], ['resist'], { cureR: 1.4, aidR: 1.3 }),
    N('cry_s1', 'cry', '巨晶纪元', '巨型晶林成为大地上可见的纪元。', 22, ['cry_a1', 'cry_a3'], ['env', 'stealth'], { envRes: 1.8, leth: .7, vis: 1.3 }),
    // —— 雾潮 ——
    N('fog_t1', 'fog', '潮间带适应', '在潮间带与港湾繁盛。', 9, [], ['sea'], { seaAff: 1.5 }),
    N('fog_t2', 'fog', '季风循环', '随季风涨落，周期更强。', 12, ['fog_t1'], ['spread'], { seasonAmp: 1.5, beta: 1.1 }),
    N('fog_t3', 'fog', '浓雾锁港', '浓雾笼罩港口，空路传播并更难察觉。', 15, ['fog_t2'], ['air', 'stealth'], { airAff: 1.2, vis: .8 }),
    N('fog_u1', 'fog', '湿热亲和', '湿热气候增益。', 8, [], ['clim:0'], { climAff0: 1.6 }),
    N('fog_u2', 'fog', '温带回潮', '温带回潮季增益。', 8, [], ['clim:1'], { climAff1: 1.5 }),
    N('fog_u3', 'fog', '海岸渗透', '海岸渗透更深入内陆旱区。', 10, [], ['sea', 'clim:3'], { seaAff: 1.3, climAff3: 1.4 }),
    N('fog_a1', 'fog', '孢子薄雾', '雾化孢子提升基础传播。', 16, ['fog_t1'], ['spread'], { beta: 1.3 }),
    N('fog_a2', 'fog', '静风滞留', '静稳天气削弱卫生运动效果。', 13, ['fog_u2'], ['resist'], { campR: 1.35 }),
    N('fog_a3', 'fog', '雾潮暴涨', '潮位猛涨，偶发暴涨式传播。', 15, ['fog_t3'], ['burst', 'spread'], { seasonAmp: 1.4, burstAmp: 1.3 }, { burstP: .004 }),
    N('fog_s1', 'fog', '环球雾纪', '全球雾纪，隐匿而广布。', 22, ['fog_a1', 'fog_a3'], ['spread', 'stealth', 'sea'], { beta: 1.35, vis: .85, seaAff: 1.3 }),
    // —— 共鸣 ——
    N('res_t1', 'res', '城市声桥', '城市密度即是它的音量。', 9, [], ['urban'], { urbSens: .45 }),
    N('res_t2', 'res', '谐波增幅', '基础传播与空路增益。', 12, ['res_t1'], ['spread', 'air'], { beta: 1.25, airAff: 1.2 }),
    N('res_t3', 'res', '齐鸣爆发', '更频繁、更猛烈的齐鸣爆发。', 15, ['res_t2'], ['burst'], { burstAmp: 1.4 }, { burstP: .008 }),
    N('res_u1', 'res', '密集适应', '高密度环境抗性增强。', 8, [], ['urban', 'resist'], { urbSens: .35, campR: 1.2 }),
    N('res_u2', 'res', '航运共鸣', '空路传播增强。', 8, [], ['air'], { airAff: 1.35 }),
    N('res_u3', 'res', '低温共振', '低温下共振更清晰。', 10, [], ['clim:2'], { climAff2: 1.5 }),
    N('res_a1', 'res', '驻波持久', '驻波使病程更持久。', 13, ['res_u1'], ['spread'], { recover: .8, leth: .85 }),
    N('res_a2', 'res', '跨洋和声', '空路与海路共鸣跨洋传播。', 16, ['res_u2', 'res_t1'], ['air', 'sea'], { airAff: 1.3, seaAff: 1.2 }),
    N('res_a3', 'res', '抗性谐波', '谐波干扰研究进程。', 14, ['res_t2'], ['resist'], { cureR: 1.35 }),
    N('res_s1', 'res', '全球交响', '全球交响：传播、爆发、可见度全面提升。', 22, ['res_a2', 'res_a3', 'res_t3'], ['spread', 'burst'], { beta: 1.3, vis: 1.25 }, { burstP: .006 }),
    // —— 休眠 ——
    N('dor_t1', 'dor', '长潜隐', '潜伏期更长，更难察觉。', 9, [], ['stealth'], { latent: .75, vis: .85 }),
    N('dor_t2', 'dor', '细胞记忆', '记忆机制对抗研究与援助。', 12, ['dor_t1'], ['resist'], { cureR: 1.35, aidR: 1.2 }),
    N('dor_t3', 'dor', '唤醒波', '沉眠旧灶定期被唤醒。', 15, ['dor_t2'], ['spread'], {}, { reappear: .010 }),
    N('dor_u1', 'dor', '耐冻休眠', '寒带休眠更持久。', 8, [], ['clim:2'], { climAff2: 1.7 }),
    N('dor_u2', 'dor', '干燥孢子', '干旱区孢子化传播。', 8, [], ['clim:3', 'land'], { climAff3: 1.5, lnAff: 1.2 }),
    N('dor_u3', 'dor', '无症状携带', '症状更轻，更隐匿、致死更低。', 10, [], ['stealth'], { vis: .75, leth: .85 }),
    N('dor_a1', 'dor', '潜伏扩散', '潜伏期间仍可传播。', 16, ['dor_t1', 'dor_u3'], ['spread', 'stealth'], { beta: 1.2, latent: .85 }),
    N('dor_a2', 'dor', '复发周期', '复发更频繁，恢复更慢。', 14, ['dor_t3'], ['spread'], { recover: .85 }, { reappear: .008 }),
    N('dor_a3', 'dor', '隐匿突变', '隐匿性增强并干扰研究。', 13, ['dor_t2'], ['stealth', 'resist'], { vis: .8, cureR: 1.25 }),
    N('dor_s1', 'dor', '永恒沉眠', '与宿主近乎永续地共存。', 22, ['dor_a1', 'dor_a2'], ['stealth', 'resist', 'clim:2'], { latent: .7, cureR: 1.4, climAff2: 1.3 }),
    // —— 蚀纹 ——
    N('et_t1', 'et', '商路刻痕', '沿陆路商道刻蚀传播。', 9, [], ['land'], { lnAff: 1.5 }),
    N('et_t2', 'et', '产业侵蚀', '对区域产出的侵蚀更强。', 12, ['et_t1'], ['erosion'], { erosion: 1.6 }),
    N('et_t3', 'et', '深度风化', '侵蚀深入科研设施。', 15, ['et_t2'], ['erosion', 'resist'], { erosion: 1.5, cureR: 1.2 }),
    N('et_u1', 'et', '旱地刻蚀', '干旱区刻蚀更快。', 8, [], ['clim:3'], { climAff3: 1.6 }),
    N('et_u2', 'et', '港口锈斑', '海路锈蚀传播。', 8, [], ['sea'], { seaAff: 1.4 }),
    N('et_u3', 'et', '恒温蚀刻', '温寒两带皆可蚀刻。', 10, [], ['clim:2', 'clim:1'], { climAff2: 1.4, climAff1: 1.25 }),
    N('et_a1', 'et', '细纹蔓延', '细纹悄然蔓延。', 16, ['et_t1'], ['spread', 'stealth'], { beta: 1.25, vis: .9 }),
    N('et_a2', 'et', '设施脆化', '援助与卫生运动效果受损。', 13, ['et_t2'], ['resist'], { aidR: 1.3, campR: 1.2 }),
    N('et_a3', 'et', '纹路固化', '固化纹路令恢复更慢。', 14, ['et_u3'], ['spread'], { recover: .85, leth: .9 }),
    N('et_s1', 'et', '静默枯萎', '无声地枯萎世界的能力。', 22, ['et_a1', 'et_a3'], ['erosion', 'spread'], { erosion: 1.7, beta: 1.2 }),
    // —— 焰袭 ——
    N('emb_t1', 'emb', '烈性烧灼', '烈度与可见度提升。', 9, [], ['lethal'], { leth: 1.5, vis: 1.2 }),
    N('emb_t2', 'emb', '风助火势', '空路飞灰传播，火势更旺。', 12, ['emb_t1'], ['air', 'spread'], { airAff: 1.3, beta: 1.1 }),
    N('emb_t3', 'emb', '余烬逆燃', '易感耗竭后仍能逆燃复起。', 15, ['emb_t2'], ['spread'], { burn: .4 }, { burstP: .004 }),
    N('emb_u1', 'emb', '热区亲和', '热带火区增益。', 8, [], ['clim:0'], { climAff0: 1.6 }),
    N('emb_u2', 'emb', '寒夜余温', '寒带余烬不灭。', 10, [], ['clim:2'], { climAff2: 1.5 }),
    N('emb_u3', 'emb', '都市燎原', '城市密度助燃。', 8, [], ['urban'], { urbSens: .4 }),
    N('emb_a1', 'emb', '飞灰传播', '飞灰沿空路与陆路传播。', 16, ['emb_t1', 'emb_u3'], ['air', 'land'], { airAff: 1.25, lnAff: 1.2 }),
    N('emb_a2', 'emb', '抗击燃点', '援助与卫生运动难以扑灭。', 13, ['emb_t2'], ['resist'], { aidR: 1.35, campR: 1.2 }),
    N('emb_a3', 'emb', '慢焰', '燃烧放缓，烧得更久更远。', 14, ['emb_t1'], ['spread'], { leth: .8, recover: .8 }),
    N('emb_s1', 'emb', '燎原纪元', '燎原之势：传播与爆发全面增强。', 22, ['emb_a1', 'emb_a2'], ['spread', 'burst', 'lethal'], { beta: 1.35, vis: 1.15, burstAmp: 1.3 }, { burstP: .005 })
  ];

  // 可重复"精炼"节点（吸收后期适应点，保持演化决策持续存在）
  MW.REFINE = {
    cry: { name: '晶格精炼', hints: ['env', 'spread'] },
    fog: { name: '雾脉精炼', hints: ['spread', 'sea'] },
    res: { name: '和声精炼', hints: ['urban', 'burst'] },
    dor: { name: '深眠精炼', hints: ['stealth', 'clim:2'] },
    et: { name: '蚀刻精炼', hints: ['erosion', 'land'] },
    emb: { name: '焰心精炼', hints: ['lethal', 'spread'] }
  };
  MW.REFINE_COST = function (lvl) { return 12 + lvl * 6; };
  MW.REFINE_FX = function (lvl) { return { beta: 1.06, vis: 1.03 }; }; // 每级 +6% 传播 +3% 可见度

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
