// i18n.js — 中英双语层。
// 设计：中文内联在各处作为默认回退，英文查 MW.STR_EN / MW.DATA_EN；
// MW.T(key, fallback, params) 为唯一取词入口；语言持久化在设置里。
'use strict';
(function () {
  var MW = globalThis.MW;

  MW.LANG = 'zh';

  function fill(p, v) {
    return String(v == null ? '' : v).replace(/\{(\w+)\}/g, function (_, k) {
      return p && p[k] !== undefined ? p[k] : '{' + k + '}';
    });
  }

  MW.T = function (key, fallback, params) {
    var out = MW.LANG === 'en' ? MW.STR_EN[key] : null;
    if (out == null) out = (fallback != null ? fallback : key);
    return fill(params, out);
  };

  // 数据内容的语言感知取值助手
  MW.regionName = function (i) {
    var r = MW.REGIONS[i];
    return MW.LANG === 'en' ? (r.en || r.name) : r.name;
  };
  MW.climName = function (c) {
    return MW.LANG === 'en' ? MW.DATA_EN.climates[c] : MW.CLIMATES[c];
  };
  MW.anomName = function (id) {
    var e = MW.DATA_EN.anomalies[id];
    if (MW.LANG === 'en' && e) return e.name;
    for (var i = 0; i < MW.ANOMALIES.length; i++) if (MW.ANOMALIES[i].id === id) return MW.ANOMALIES[i].name;
    return id;
  };
  MW.anomTagline = function (id) {
    var e = MW.DATA_EN.anomalies[id];
    if (MW.LANG === 'en' && e) return e.tagline;
    for (var i = 0; i < MW.ANOMALIES.length; i++) if (MW.ANOMALIES[i].id === id) return MW.ANOMALIES[i].tagline;
    return '';
  };
  MW.traitName = function (id) {
    var e = MW.DATA_EN.traits[id];
    if (MW.LANG === 'en' && e) return e[0];
    for (var i = 0; i < MW.TRAITS.length; i++) if (MW.TRAITS[i].id === id) return MW.TRAITS[i].name;
    return id;
  };
  MW.traitDesc = function (id) {
    var e = MW.DATA_EN.traits[id];
    if (MW.LANG === 'en' && e) return e[1];
    for (var i = 0; i < MW.TRAITS.length; i++) if (MW.TRAITS[i].id === id) return MW.TRAITS[i].desc;
    return '';
  };
  MW.evName = function (id) {
    var e = MW.DATA_EN.events[id];
    if (MW.LANG === 'en' && e) return e.name;
    for (var i = 0; i < MW.EVENTS.length; i++) if (MW.EVENTS[i].id === id) return MW.EVENTS[i].name;
    return id;
  };
  MW.evNews = function (id, fallback, params, variant) {
    var e = MW.DATA_EN.events[id];
    var v = variant || 'news';
    if (MW.LANG === 'en' && e && e[v]) return fill(params, e[v]);
    return fill(params, fallback);
  };
  MW.scenName = function (id) {
    var e = MW.DATA_EN.scenarios[id];
    if (MW.LANG === 'en' && e) return e.name;
    var s = MW.scenById(id);
    return s ? s.name : id;
  };
  MW.scenDesc = function (id) {
    var e = MW.DATA_EN.scenarios[id];
    if (MW.LANG === 'en' && e) return e.desc;
    var s = MW.scenById(id);
    return s ? s.desc : '';
  };
  MW.endingDef = function (id) {
    var def = MW.ENDING_DEFS[id];
    if (MW.LANG === 'en') {
      var e = MW.DATA_EN.endings[id];
      if (e) return { name: e.name, desc: e.desc };
    }
    return def;
  };

  // —— 英文界面字符串 ——
  MW.STR_EN = {
    // 顶栏
    'phase.monitor': 'Watch', 'phase.spread': 'Spreading', 'phase.crisis': 'Crisis', 'phase.locked': 'Settled',
    'stat.inf': 'Infected', 'stat.dead': 'Deaths', 'stat.cure': 'Research', 'stat.aw': 'Alertness', 'stat.ap': 'Points',
    'cure.deployed': 'Deployed',
    // 速度/按钮
    'btn.mini': 'Mini', 'btn.standard': 'Normal', 'btn.menu': 'Menu', 'btn.details': 'Details',
    'btn.pause': 'II',
    // 菜单
    'menu.save': 'Save game', 'menu.export': 'Export save (file)', 'menu.import': 'Import save (file)',
    'menu.perf': 'Performance', 'menu.settings': 'Settings', 'menu.quit': 'End session · back to start',
    // 设置浮层
    'set.title': 'Settings',
    'set.autoevo': 'Auto-evolution (turn off to buy traits manually)',
    'set.muted': 'Muted (this game has no sound by default)',
    'set.topmost': 'Always on top: launch via the included .bat launcher (browsers cannot set it themselves)',
    'set.quality': 'Quality',
    'set.lang': 'Language / 语言',
    'q.full': 'Full effects', 'q.low': 'Reduced', 'q.min': 'Minimal',
    'set.close': 'Close',
    'perf.target': 'Target: 60 FPS · ≤1 core steady-state · process tree ≤512 MiB (see test report)',
    'resp.aidArrive': 'Aid arrives in {r}: medical capacity boosted short-term',
    'resp.cureDone': 'Response research complete! Interventions begin global deployment',
    'resp.cureHalf': 'Research halfway: key mechanisms elucidated',
    'resp.closedMany': '{n} regions tighten traffic controls (air / sea / land tiers)',
    'resp.closed': '{r} closes {w} routes', 'resp.opened': '{r} reopens {w} routes',
    'resp.wAir': 'air', 'resp.wSea': 'sea', 'resp.wLand': 'land',
    'sim.burst': 'Chorus-style cluster transmission in {r}: daily contact chains surge',
    'sim.wake': 'Waking wave in {r}: long-dormant foci active again',
    'evo.choose': 'Chose [{n}] ({c} pts): {why}', 'evo.alt': '; runner-up [{m}] had lower marginal gain',
    'evo.refine.r': 'Refinement level {n}: spread surface and {h} remain positive at the margin',
    'evo.refineNews': '{n} raised to level {l}', 'evo.evNews': 'The anomaly evolved [{n}]',
    'evo.manual': 'Observer manually guided the anomaly to evolve [{n}]',
    'evo.manualReason': 'Manual intervention by the observer',
    'end.newsline': '[{n}] — the world’s course is set; see the ending summary for the full review',
    'catchup.clipped': 'Offline time exceeded the cap ({h} h) — time beyond it is not simulated day by day.',
    'catchup.approx': 'Another ~{d} days were skipped as “fast-forward” (approximate; not equivalent to real-time play).',
    'news.fastforward': 'Part of the offline period passed as fast-forward (approximate)',
    // 抽屉
    'tab.region': 'Region', 'tab.evo': 'Evolution', 'tab.trend': 'Trends', 'tab.timeline': 'Timeline',
    'drawer.hide': '×hide', 'drawer.open': 'Details ◂',
    'drawer.clickHint': 'Click any region on the map.<br><br>Scroll to zoom, drag to pan.',
    'region.pop': 'Population', 'region.dead': 'Deaths', 'region.comp': 'Composition',
    'region.resp': 'Response state', 'region.closures': 'Closures', 'region.none': 'None',
    'region.aware': 'Alertness', 'region.aid': 'Aid bonus', 'region.camp': 'Hygiene', 'region.output': 'Economy',
    'region.neighbors': 'Connected regions',
    'tag.urban': 'Urban', 'tag.med': 'Med', 'tag.res': 'Res',
    'evo.points': 'Points', 'evo.mode': 'Mode', 'evo.auto': 'Auto (scored decisions)', 'evo.manual': 'Manual',
    'evo.tree': 'Trait tree', 'evo.owned': ' owned', 'evo.buy': 'Buy',
    'evo.refine': 'Refinement', 'evo.refineDesc': 'Each level: +6% transmission, +3% visibility',
    'trend.peak': 'Peak', 'trend.sample': 'sampled every 2 days (cap 1500)',
    'trend.overview': 'World overview', 'trend.live': 'Active infections', 'trend.crystal': 'Crystal hosts',
    'trend.ever': 'Total infections', 'trend.bursts': 'Resonance bursts', 'trend.seed': 'World seed', 'trend.scen': 'Scenario',
    'tl.none': 'No records yet.',
    // 刚才发生
    'what.title': 'What just happened', 'what.none': 'Nothing yet — the world is calm.',
    // 开始屏
    'start.sub': 'A tiny world that runs by itself on your desk. One glance tells you everything.',
    'start.big': 'One-Click Observation', 'start.cont': 'Continue last session', 'start.setup': 'Advanced setup', 'start.about': 'About',
    'start.foot': 'Fully automatic · no grinding · a round runs 45–120 min by default · pause & speed anytime · all figures are fictional gameplay data',
    'start.last': 'Last session',
    'setup.h': 'Start a new observation', 'setup.scen': 'Scenario', 'setup.anom': 'Anomaly', 'setup.seed': 'World seed',
    'setup.seedHint': '(same seed = same world)', 'setup.reroll': 'Roll', 'setup.region': 'Starting region',
    'setup.regionRand': 'Random (by population)', 'setup.speed': 'Default speed', 'setup.freq': 'Event frequency',
    'setup.freqLow': 'Sparse', 'setup.freqStd': 'Standard', 'setup.freqHigh': 'Frequent',
    'setup.style': 'Commentary style', 'setup.styleQuiet': 'Quiet (major events only)', 'setup.styleBrief': 'Brief (default)', 'setup.styleFull': 'Detailed',
    'setup.offcap': 'Offline progress cap', 'setup.h': 'h', 'setup.go': 'Start observation', 'setup.back': 'Back',
    'about.h': 'About MicroWorld',
    'about.p1': 'An original offline single-player observation game. Inspired by the core systems of classic pandemic simulations, but every mechanic, text, figure and map is original or from public-domain data — no copyrighted assets are used.',
    'about.p2': 'Population, regions, anomaly types and parameters are all <b>fictional gameplay data</b>. They represent no real statistics and correspond to no real pathogen. Map outlines come from Natural Earth (public domain), simplified and redrawn.',
    'about.p3': 'No network access, no telemetry. Saves live in your local browser.',
    // 结局
    'end.continue': 'Keep watching this world', 'end.new': 'New run',
    'end.time': 'Elapsed', 'end.dead': 'Total deaths', 'end.ever': 'Total infections', 'end.peak': 'Peak infections',
    'end.start': 'Origin region', 'end.cure': 'Cure deployed', 'end.cureNo': 'Not completed',
    'end.evo': 'Evolutions', 'end.bursts': 'Burst events', 'end.road': 'Evolution path:',
    // 补算
    'catchup.title': 'Catching up offline progress…',
    'catchup.done': 'of', 'catchup.days': ' days',
    'toast.saved': 'Saved', 'toast.saveFail': 'Save failed (storage full?)',
    'toast.exported': 'Save exported', 'toast.exportFail': 'Export failed: ',
    'toast.imported': 'Imported: resuming day {d}', 'toast.importFail': 'Import failed: ',
    'toast.catchupDone': 'Offline progress caught up',
    'toast.fastDone': 'Fast-forward finished: {n} days were skipped',
    'toast.obsStart': 'Observation started: first infection detected in {r}',
    'toast.noPoints': 'Not enough points', 'toast.noReq': 'Prerequisites not met',
    'climate.hud': 'Climate', 'unit.pop': ' pop',
    'timeline.by': 'All', 'tl.cat.blockade': 'Closures', 'tl.cat.aid': 'Aid', 'tl.cat.research': 'Research',
    'tl.cat.anomaly': 'Anomaly', 'tl.cat.evo': 'Evolution', 'tl.cat.nature': 'Nature', 'tl.cat.social': 'Society',
    'tl.cat.medical': 'Medical', 'tl.cat.system': 'System'
  };

  // —— 数据内容英文对照 ——
  MW.DATA_EN = {
    climates: ['Tropical', 'Temperate', 'Cold', 'Arid'],
    complexity: ['Low', 'Medium', 'High'],
    anomalies: {
      cry: { name: 'Crystallize', tagline: 'The infected slowly turn to crystal. Crystal dust rides the wind and air routes; crystal hosts are a long-lived environmental reservoir — and research can reverse them.', mech: 'Environmental reservoir + reversible crystallization' },
      fog: { name: 'Fog Tide', tagline: 'It rises and falls with humid monsoons. Coastal seas and shipping lanes are its veins; in the fog, surveillance always lags behind.', mech: 'Seasonal pulses + sea-route affinity' },
      res: { name: 'Resonance', tagline: 'It amplifies between dense cities. Crowds trigger “chorus” super-spreading bursts too loud to ignore.', mech: 'Super-spreading bursts + urban bonus' },
      dor: { name: 'Dormancy', tagline: 'Long latency, near-invisible. It sleeps deepest in cold places — and while you think it has left, the waking wave is building.', mech: 'Long latency + stealth + reactivation' },
      et: { name: 'Etch', tagline: 'It kills almost no one — it etches away industry and research capacity along trade routes, and the world quietly loses its ability to respond.', mech: 'Economic & research erosion + trade-route spread' },
      emb: { name: 'Ember Rush', tagline: 'Fierce and fast: it burns a city out in days. With ample fuel it becomes a wildfire; cut the corridors and it burns itself to ash.', mech: 'High lethality + fuel-depletion burnout' }
    },
    scenarios: {
      std: { name: 'First Tide', desc: 'The standard world. A calm beginning — every system runs by the default rules. Best for a first observation.' },
      frost: { name: 'Frost Age', desc: 'Cold regions are densely populated and research is strong, yet response is cautious. A low-temperature reservoir is about to wake.' },
      isles: { name: 'Thousand Isles', desc: 'A world knit by shipping. Fog rises with the tide; ports are the arteries, and cutting sea lanes costs more than imagined.' },
      steel: { name: 'Steel Tide', desc: 'A high-density urban world. Resonance thunders here — and the human response machine is razor sharp: closures come fast and hard.' },
      sleep: { name: 'Long Sleep', desc: 'By the time the world notices, latency has already awakened in fourteen regions at once. Surveillance chases something almost invisible.' },
      ash: { name: 'World of Ash', desc: 'Weak research, scarce aid. A ferocious anomaly burns deep and fast here — either wildfire, or self-extinction.' }
    },
    traits: {
      cry_t1: ['Crystal Dust', 'Crystal debris rides the wind; the environmental reservoir grows stronger.'],
      cry_t2: ['Facet Sleep', 'Metabolism nearly stops inside the crystal: far less lethal, harder for research to break.'],
      cry_t3: ['Wide Crystal Haze', 'Crystal dust spreads along overland trade routes.'],
      cry_u1: ['Low-Temp Stability', 'Crystal shells are more stable in the cold.'],
      cry_u2: ['Arid Suspension', 'Crystal dust lingers longer in dry air.'],
      cry_u3: ['Urban Clusters', 'City surfaces become crystal nurseries.'],
      cry_a1: ['Crystal Web', 'Clusters interlink; base transmission rises.'],
      cry_a2: ['Shatter Spread', 'Cracking shells eject crystal dust.'],
      cry_a3: ['Core Resistance', 'The crystal core resists cures and aid.'],
      cry_s1: ['Age of Megacrystals', 'Giant crystal forests become a visible epoch on the land.'],
      fog_t1: ['Intertidal Adaptation', 'Thrives in intertidal zones and harbors.'],
      fog_t2: ['Monsoon Cycle', 'Rises and falls with the monsoon; stronger periodicity.'],
      fog_t3: ['Fogbound Ports', 'Thick fog covers ports; spreads by air, harder to notice.'],
      fog_u1: ['Humid Affinity', 'Bonus in hot humid climates.'],
      fog_u2: ['Temperate Return', 'Bonus in temperate wet seasons.'],
      fog_u3: ['Coastal Seep', 'Coastal penetration reaches deeper into dry inland.'],
      fog_a1: ['Spore Mist', 'Aerosolized spores raise base transmission.'],
      fog_a2: ['Still-Air Linger', 'Calm weather weakens hygiene campaigns.'],
      fog_a3: ['Surge Tide', 'The tide surges: occasional explosive spread.'],
      fog_s1: ['Global Fog Age', 'A worldwide fog epoch — hidden and widespread.'],
      res_t1: ['Urban Soundbridge', 'City density is its volume.'],
      res_t2: ['Harmonic Gain', 'Base transmission and air routes improved.'],
      res_t3: ['Chorus Burst', 'More frequent, fiercer resonance bursts.'],
      res_u1: ['Density Adaptation', 'Resists control in crowded places.'],
      res_u2: ['Shipping Resonance', 'Air-route transmission improved.'],
      res_u3: ['Cold Resonance', 'Resonance carries farther in the cold.'],
      res_a1: ['Standing Wave', 'Standing waves prolong the course of disease.'],
      res_a2: ['Transoceanic Chorus', 'Resonance crosses oceans by air and sea.'],
      res_a3: ['Resist Harmonics', 'Harmonics interfere with research.'],
      res_s1: ['Global Symphony', 'A worldwide symphony: transmission, bursts, visibility all up.'],
      dor_t1: ['Long Latency', 'Longer incubation, harder to notice.'],
      dor_t2: ['Cellular Memory', 'Memory mechanisms resist research and aid.'],
      dor_t3: ['Waking Wave', 'Old dormant foci wake on a schedule.'],
      dor_u1: ['Freeze Sleep', 'Dormancy lasts longer in cold regions.'],
      dor_u2: ['Dry Spores', 'Sporulates in arid regions; spreads by land.'],
      dor_u3: ['Silent Carriers', 'Milder symptoms: stealthier, less lethal.'],
      dor_a1: ['Latent Spread', 'Spreads even while latent.'],
      dor_a2: ['Relapse Cycle', 'Relapses come more often; recovery slows.'],
      dor_a3: ['Hidden Mutation', 'Stealth rises and research is disrupted.'],
      dor_s1: ['Eternal Sleep', 'Coexists with hosts almost forever.'],
      et_t1: ['Trade Etch', 'Etches along overland trade routes.'],
      et_t2: ['Industry Erosion', 'Erodes regional output faster.'],
      et_t3: ['Deep Weathering', 'Erosion reaches research facilities.'],
      et_u1: ['Arid Etch', 'Etches faster in arid regions.'],
      et_u2: ['Port Rust', 'Rusts along sea lanes.'],
      et_u3: ['Steady Etch', 'Etches in both cold and temperate belts.'],
      et_a1: ['Fine Lines', 'Fine etch lines creep silently.'],
      et_a2: ['Brittle Facilities', 'Aid and hygiene campaigns lose effectiveness.'],
      et_a3: ['Set Grain', 'Set patterns slow recovery.'],
      et_s1: ['Silent Withering', 'Quietly withers the world\u2019s capabilities.'],
      emb_t1: ['Fierce Burn', 'Lethality and visibility rise.'],
      emb_t2: ['Wind-Fed Flames', 'Airborne embers; burns hotter.'],
      emb_t3: ['Ember Rekindle', 'Can rekindle even after fuel is spent.'],
      emb_u1: ['Hotzone Affinity', 'Bonus in tropical fire zones.'],
      emb_u2: ['Cold Embers', 'Embers never die in the cold.'],
      emb_u3: ['Urban Wildfire', 'City density feeds the flames.'],
      emb_a1: ['Fly-Ash Spread', 'Ash travels by air and land.'],
      emb_a2: ['Fighting Embers', 'Aid and hygiene struggle to douse it.'],
      emb_a3: ['Slow Flame', 'Burns slower, lasts longer, reaches farther.'],
      emb_s1: ['Era of Wildfire', 'A wildfire epoch: transmission and bursts fully boosted.']
    },
    refine: {
      cry: 'Lattice Refinement', fog: 'Mist Refinement', res: 'Harmony Refinement',
      dor: 'Deep-Sleep Refinement', et: 'Etch Refinement', emb: 'Embercore Refinement'
    },
    refineReason: 'Refinement level {n}: spread surface and global gains still positive at the margin',
    events: {
      monsoon: { name: 'Monsoon Landfall', news: 'Monsoon makes landfall: humid airflow drives cross-sea travel' },
      coldsnap: { name: 'Cold Snap', news: 'Cold front pushes south: contact patterns change in cold regions' },
      heatwave: { name: 'Heatwave', news: 'Heatwave sweeps through: fewer outdoors, alertness rises' },
      sandstorm: { name: 'Sandstorm', news: '{r} hit by a sandstorm: suspended particles spread' },
      flood: { name: 'Flood', news: 'Floods in {r}: medical capacity damaged short-term' },
      quake: { name: 'Earthquake', news: 'Earthquake in {r}: rescue and medical services under strain' },
      wildfire: { name: 'Wildfire', news: 'Wildfire in {r}: response resources diverted' },
      bountyear: { name: 'Bumper Year', news: 'Global bumper harvest: economy improves, research funding loosens' },
      leanyear: { name: 'Lean Year', news: 'Failed harvests in many regions: budgets tighten' },
      festival: { name: 'Festival Week', news: 'Festival week begins: cross-region travel peaks' },
      pilgrimage: { name: 'Pilgrimage Season', news: 'Pilgrimage season: crowds gather in {r}' },
      wedding: { name: 'Wedding Season', news: 'Wedding season: more visits along land routes' },
      strike_port: { name: 'Port Strike', news: 'Great port strike: sea shipping nearly halted' },
      strike_air: { name: 'ATC Strike', news: 'Air-traffic strike: flights cancelled en masse' },
      protest: { name: 'Control Protests', news: 'Protests against controls in many regions: hygiene campaigns hindered' },
      panic: { name: 'Panic Buying', news: 'Panic buying spreads: public alertness jumps' },
      rumor: { name: 'Online Rumor', news: '“It\u2019s just a flu” — rumor lowers public alertness' },
      census: { name: 'Census', news: 'Global census complete: statistical baseline updated' },
      election: { name: 'Election', news: 'New government takes office: public-health pledges increased', news2: 'New government takes office: research budget increased' },
      cyberattack: { name: 'Cyberattack', news: 'Research network hacked: data sync interrupted' },
      datamarket: { name: 'Data Black Market', news: 'Leaked surveillance data circulates: public and research both benefit' },
      breakthrough: { name: 'Paper Breakthrough', news: 'Key paper published: research jumps forward' },
      fraud: { name: 'Data Fraud', news: 'Core data proven fabricated: research setback' },
      vaxx: { name: 'Vaccine Hesitancy', news: 'Hesitancy spreads: intervention compliance drops' },
      medoverload: { name: 'Hospital Overload', news: 'Hospitals overloaded in {r}: critical-care capacity stretched' },
      volunteer: { name: 'Volunteer Network', news: 'Volunteer network mobilized: aid pool expanded' },
      airbridge: { name: 'Medical Airbridge', news: 'Medical airbridge established: aid capacity up' },
      screening: { name: 'Border Screening', news: 'Temperature screening deployed at all ports of entry' },
      campaign_week: { name: 'Hygiene Week', news: 'Hygiene awareness week: hands, masks, distance' },
      researchrace: { name: 'Research Race', news: 'Multinational research race: funding and talent concentrated' },
      supply: { name: 'Supply Crisis', news: 'Reagent and equipment shortages: research slows' },
      recovernote: { name: 'Signs of Recovery', news: 'Signs of recovery: the low-spread period is used to rebuild response' },
      super_spread: { name: 'Super-spreader Gathering', news: 'Super-spreader gathering in {r}' },
      crystdust: { name: 'Crystal Dust Storm', news: 'Crystal dust storm: shell debris lofts across arid regions' },
      fogsurge: { name: 'Fog Surge', news: 'Fog tide surges: coastal fog banks expand' },
      wake: { name: 'Latent Awakening', news: 'Latent focus awakens in {r}' },
      etchdeep: { name: 'Deep Etching', news: 'Etching deepens: efficiency decays at more research sites' },
      emberflash: { name: 'Ember Rekindle', news: 'Embers rekindle in {r}: unexpected rebound in a low-susceptible region' },
      grant: { name: 'Global Grant', news: 'Global joint grant passes: aid and research boosted together' },
      closure_cascade: { name: 'Border Panic', news: 'Border panic spreads: many regions tighten corridors early' },
      memorial: { name: 'Memorial Day', news: 'Global public-health memorial day: outreach events held' },
      mutation: { name: 'Random Mutation', news: 'A more transmissible variant detected (+12% transmission, 40 days)', news2: 'A less transmissible variant detected (-10% transmission, 40 days)', news3: 'A variant disrupts research models (research -8%, 40 days)' },
      treaty: { name: 'Cross-border Treaty', news: 'Cross-border cooperation treaty signed: data and aid flow freely' },
      cats: { '封锁': 'Closures', '援助': 'Aid', '研究': 'Research', '异常': 'Anomaly', '演化': 'Evolution', '自然': 'Nature', '社会': 'Society', '医疗': 'Medical', '系统': 'System', '自然 ': 'Nature' }
    },
    endings: {
      eradicated: { name: 'Era of Eradication', desc: 'Research complete, interventions deployed — the anomaly is fully suppressed by human cooperation. The world enters a long review period.' },
      collapse: { name: 'Silent Ark', desc: 'Population and order crossed an irreversible line. Survivors carry the loss forward; the old world is history.' },
      equilibrium: { name: 'Tidal Balance', desc: 'The anomaly neither vanished nor exploded — it became part of the world\u2019s ecology, coexisting with humanity, ebbing and flowing.' },
      crystal: { name: 'Age of Crystal', desc: 'Crystallization covered nearly half the world. Crystal forests glint on the plains; humanity learns to live between the crystal borders.' },
      fadeout: { name: 'Ash Ebb', desc: 'No cure ever came: the anomaly burned through its own fuel and quietly receded before the human response closed in.' },
      stalemate: { name: 'Long Stalemate', desc: 'Years pass — neither eradication nor collapse. The world learns to run with it, and history enters a long stalemate.' }
    },
    endReasonLine: 'The world’s course is set — see the ending summary for the full review',
    hintTxt: {
      spread: 'the broad spread surface is still expanding', urban: 'high-density urban population not yet reached',
      sea: 'large exposure across sea lanes', air: 'large exposure across air corridors',
      land: 'large exposure along trade routes', stealth: 'low alertness now — stealth pays off',
      resist: 'research is advancing — resistance value rises', lethal: 'the outbreak has scale — lethality now pays',
      erosion: 'target regions still productive — erosion pays', burst: 'existing networks can be amplified by bursts',
      env: 'the environmental reservoir can be pressed further',
      'clim:0': 'tropical population not yet reached', 'clim:1': 'temperate population not yet reached',
      'clim:2': 'cold-belt population not yet reached', 'clim:3': 'arid-region population not yet reached'
    }
  };

  // —— 静态 DOM 应用（启动/切换时调用） ——
  // 纯文本元素直接 textContent；含子控件（checkbox/select等）的元素只替换文本节点。
  // 回退值用显式中文（不能用当前 DOM 文本——切走一次就会漂移）。
  MW.applyLang = function () {
    if (typeof document === 'undefined') return;
    function set(id, key, zh) {
      var el = document.getElementById(id);
      if (el) el.textContent = MW.T(key, zh);
    }
    function setMixed(id, key, zh) {
      var el = document.getElementById(id);
      if (!el) return;
      var tx = MW.T(key, zh);
      var done = false, tn;
      for (var i = 0; i < el.childNodes.length; i++) {
        tn = el.childNodes[i];
        if (tn.nodeType === 3) {
          if (!done) { tn.textContent = tx; done = true; }
          else tn.textContent = '';
        }
      }
      if (!done) el.appendChild(document.createTextNode(tx));
    }
    set('btn-start', 'start.big', '一键开始观察');
    set('btn-continue', 'start.cont', '继续上次观察');
    set('btn-setup', 'start.setup', '高级设置');
    set('btn-about', 'start.about', '关于');
    set('start-foot', 'start.foot', '全自动 · 无需操作 · 默认一轮约45–120分钟 · 可随时暂停加速 · 所有数值均为玩法虚构');
    set('btn-setup-start', 'setup.go', '开始观察');
    set('btn-setup-back', 'setup.back', '返回');
    set('btn-about-back', 'setup.back', '返回');
    set('btn-end-continue', 'end.continue', '继续观察这个世界');
    set('btn-end-new', 'end.new', '新的一局');
    set('mi-save', 'menu.save', '保存存档');
    set('mi-export', 'menu.export', '导出存档（文件）');
    set('mi-import', 'menu.import', '导入存档（文件）');
    set('mi-perf', 'menu.perf', '性能统计');
    set('mi-settings', 'menu.settings', '设置');
    set('mi-quit', 'menu.quit', '结束观察 · 回到首页');
    set('btn-set-close', 'set.close', '关闭');
    set('catchup-title', 'catchup.title', '正在补算离线进度…');
    set('drawer-open', 'drawer.open', '详情 ◂');
    set('drawer-close', 'drawer.hide', '×隐藏');
    setMixed('whatnow-head', 'what.title', '刚才发生了什么');
    var tabs = document.querySelectorAll('.dtab');
    var tabKeys = ['tab.region', 'tab.evo', 'tab.trend', 'tab.timeline'];
    var tabZh = ['区域', '演化', '趋势', '时间线'];
    for (var i = 0; i < tabs.length && i < 4; i++) tabs[i].textContent = MW.T(tabKeys[i], tabZh[i]);
    var sub = document.getElementById('start-sub');
    if (sub) sub.textContent = MW.T('start.sub', '一个放在桌边、自己运行的小世界。你看一眼，就知道发生了什么。');
    var st = document.getElementById('st-inf'); if (st) { var ii = st.querySelector('i'); if (ii) ii.textContent = MW.T('stat.inf', '感染'); }
    st = document.getElementById('st-dead'); if (st) { ii = st.querySelector('i'); if (ii) ii.textContent = MW.T('stat.dead', '死亡'); }
    st = document.getElementById('st-cure'); if (st) { ii = st.querySelector('i'); if (ii) ii.textContent = MW.T('stat.cure', '研究'); }
    st = document.getElementById('st-aw'); if (st) { ii = st.querySelector('i'); if (ii) ii.textContent = MW.T('stat.aw', '警觉'); }
    st = document.getElementById('st-ap'); if (st) { ii = st.querySelector('i'); if (ii) ii.textContent = MW.T('stat.ap', '适应点'); }
    setMixed('ck-autoevo', 'set.autoevo', '自动演化（关闭后可手动购买特性）');
    setMixed('ck-muted', 'set.muted', '静音（本作默认无声音）');
    setMixed('ck-topmost-hint', 'set.topmost', '置顶：请使用目录下“启动微疫世界.bat”启动（浏览器内置窗口无法自我置顶）');
    setMixed('lbl-quality', 'set.quality', '画质');
    setMixed('lbl-lang', 'set.lang', 'Language / 语言');
    var ab = document.getElementById('about-h'); if (ab) ab.textContent = MW.T('about.h', '关于《微疫世界》');
    ['about-p1', 'about-p2', 'about-p3'].forEach(function (id, ix) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = MW.T('about.p' + (ix + 1), el.innerHTML);
    });
    var se = document.getElementById('setup-h'); if (se) se.textContent = MW.T('setup.h', '开始一次新观察');
    var pf = document.getElementById('setup-foot'); if (pf) pf.textContent = MW.T('start.foot', '全自动 · 无需操作 · 默认一轮约45–120分钟 · 可随时暂停加速 · 所有数值均为玩法虚构');
    if (typeof MW.UI !== 'undefined' && typeof MW.UI.renderTab === 'function') {
      try { MW.UI.renderTab(); } catch (e) { /* 屏幕未打开时忽略 */ }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MW;
})();
