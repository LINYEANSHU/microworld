// scenarios.js — 6个原创场景，3档复杂度（0低/1中/2高）。
// mods.params 乘法修正参数；其余为AI/经济/节奏修正。
'use strict';
(function () {
  var MW = globalThis.MW;

  MW.SCENARIOS = [
    {
      id: 'std', name: '初潮', complexity: 0, anomaly: 'fog',
      desc: '标准世界。一次平静的开端，适合第一次观察：所有系统按默认规则运转。',
      startRule: 'pop', startSeedE: 60,
      mods: {}
    },
    {
      id: 'frost', name: '寒境纪元', complexity: 1, anomaly: 'cry',
      desc: '严寒区域人口稠密，研究体系强大而响应谨慎。低温稳定的环境储库将在此苏醒。',
      startRule: 'cold', startSeedE: 60,
      mods: { params: { climAff2: 1.2, envRes: 1.1 }, aiAggr: 0.9, researchMult: 1.15, apMul: 0.95 }
    },
    {
      id: 'isles', name: '千岛雾国', complexity: 1, anomaly: 'fog',
      desc: '海运维系的世界群岛。雾随潮起，港口是血管，封锁海运的代价远超想象。',
      startRule: 'coast', startSeedE: 70,
      mods: { params: { seaAff: 1.35 }, aiAggr: 0.85, researchMult: 0.9, eventFreq: 1.15 }
    },
    {
      id: 'steel', name: '钢铁洪流', complexity: 2, anomaly: 'res',
      desc: '高密度都市世界。共鸣在此如雷贯耳，而人类响应机器极其敏锐——封锁来得又快又狠。',
      startRule: 'pop', startSeedE: 60,
      mods: { params: { urbSens: 1.4, burstP: 1.25 }, aiAggr: 1.5, researchMult: 1.1, eventFreq: 1.15 }
    },
    {
      id: 'sleep', name: '长眠之地', complexity: 2, anomaly: 'dor',
      desc: '当世界察觉时，潜伏早已在十四个区域同时苏醒。监测系统追逐着几乎不可见的东西。',
      startRule: 'latent', startSeedE: 30,
      mods: { params: { latent: 0.8, vis: 0.8 }, aiAggr: 0.9 }
    },
    {
      id: 'ash', name: '余烬之世', complexity: 2, anomaly: 'emb',
      desc: '研究薄弱、援助匮乏的世界。烈性异常在这里烧得又快又深——要么燎原，要么自熄。',
      startRule: 'pop', startSeedE: 80,
      mods: { params: { leth: 1.15 }, aiAggr: 0.8, researchMult: 0.7, apMul: 1.15 }
    }
  ];

  MW.scenById = function (id) {
    for (var i = 0; i < MW.SCENARIOS.length; i++) if (MW.SCENARIOS[i].id === id) return MW.SCENARIOS[i];
    return MW.SCENARIOS[0];
  };
  MW.COMPLEXITY = ['低', '中', '高'];

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
