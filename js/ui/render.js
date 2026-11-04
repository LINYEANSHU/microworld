// render.js — 地图渲染器：静态陆地离屏层 + 每帧动态层。
// 仿真数据仅在 simTick 时更新为"目标值"，每帧只做插值与绘制——绝不每帧重算世界。
'use strict';
(function () {
  var MW = globalThis.MW;
  var U = MW.U;
  var VR = MW.visualRng; // 视觉随机（不进存档、不影响模拟）

  // 经纬度 → 画布坐标（等距圆柱，纬度裁剪 [-58, 85]）
  var LON_MIN = -180, LON_MAX = 180, LAT_MAX = 85, LAT_MIN = -58;

  var R = {
    canvas: null, ctx: null, static_: null, sctx: null,
    W: 0, H: 0, dpr: 1,
    view: { x: 0, y: 0, s: 1 },      // 视图：平移+缩放（世界坐标系：x[0,1],y[0,1]）
    world: null,
    quality: 2,
    // 区域视觉缓存
    rc: [],        // {cx,cy,r, col:{r,g,b}, tcol, prev, alphaC}
    fx: [],        // 涟漪池
    trav: [],      // 航线图标池
    labels: [],
    hover: -1, sel: -1,
    needStatic: true,
    fps: 0, _fc: 0, _ft: 0
  };
  MW.Renderer = R;

  R.init = function (canvas) {
    R.canvas = canvas;
    // willReadFrequently: 强制 Chromium 使用 CPU 软件画布——本作不占用 GPU（训练机器友好）
    R.ctx = canvas.getContext('2d', { willReadFrequently: true });
    R.resize();
  };

  R.resize = function () {
    var c = R.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    R.W = w; R.H = h; R.dpr = dpr;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    R.static_ = document.createElement('canvas');
    R.static_.width = c.width; R.static_.height = c.height;
    R.sctx = R.static_.getContext('2d', { willReadFrequently: true });
    R.needStatic = true;
    R.fitView();
    R.reproject();
  };

  // 视图变化后按新投影重算区域屏幕坐标（修复 resize 后圆点错位）
  R.reproject = function () {
    for (var i = 0; i < R.rc.length; i++) {
      var rd = MW.REGIONS[i], rc = R.rc[i];
      if (!rc) continue;
      var p = px(rd.lon, rd.lat);
      rc.cx = p[0]; rc.cy = p[1];
    }
  };

  function worldSize() { return { w: R.W, h: R.W * (LAT_MAX - LAT_MIN) / (LON_MAX - LON_MIN) }; }
  R.fitView = function () {
    var sz = worldSize();
    var s = R.H > 0 ? Math.min(R.W / sz.w, (R.H - 40) / sz.h) : 1;
    R.view.s = s * 1.06;
    R.view.x = (R.W - sz.w * R.view.s) / 2;
    R.view.y = (R.H - sz.h * R.view.s) / 2 + 14;
    R.needStatic = true;
  };
  function px(lon, lat) {
    var x = (lon - LON_MIN) / (LON_MAX - LON_MIN);
    var y = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN);
    return [R.view.x + x * worldSize().w * R.view.s, R.view.y + y * worldSize().h * R.view.s];
  }

  R.bindInput = function (canvas, ui) {
    var drag = null;
    canvas.addEventListener('mousedown', function (e) {
      drag = { x: e.clientX, y: e.clientY, vx: R.view.x, vy: R.view.y, moved: false };
      canvas.classList.add('grabbing');
    });
    window.addEventListener('mousemove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        R.view.x = drag.vx + dx; R.view.y = drag.vy + dy;
        R.needStatic = true;
      } else if (R.world) {
        R.hover = R.pick(e.clientX, e.clientY);
        if (ui) ui.hover(R.hover, e.clientX, e.clientY);
      }
    });
    window.addEventListener('mouseup', function (e) {
      if (drag && !drag.moved) {
        var id = R.pick(e.clientX, e.clientY);
        if (ui) ui.select(id);
      }
      drag = null;
      canvas.classList.remove('grabbing');
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      var ns = U.clamp(R.view.s * f, 0.4, 8);
      var mx = e.clientX, my = e.clientY;
      R.view.x = mx - (mx - R.view.x) * (ns / R.view.s);
      R.view.y = my - (my - R.view.y) * (ns / R.view.s);
      R.view.s = ns;
      R.needStatic = true;
    }, { passive: false });
  };

  R.pick = function (sx, sy) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < R.rc.length; i++) {
      var rc = R.rc[i]; if (!rc) continue;
      var dx = sx - rc.sx, dy = sy - rc.sy;
      var d = dx * dx + dy * dy;
      var rr = Math.max(9, rc.sr + 4);
      if (d < rr * rr && d < bd) { bd = d; best = i; }
    }
    return best;
  };

  // —— 静态层：海洋 + 陆地轮廓 ——
  R.drawStatic = function () {
    var ctx = R.sctx, W = R.static_.width, H = R.static_.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(R.dpr, R.dpr);
    // 海洋
    var g = ctx.createLinearGradient(0, 0, 0, R.H);
    g.addColorStop(0, '#0c1a21'); g.addColorStop(1, '#0a141a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
    // 经纬网格（淡）
    ctx.strokeStyle = 'rgba(120,200,220,0.045)';
    ctx.lineWidth = 1;
    for (var lon = -180; lon <= 180; lon += 30) {
      var p0 = px(lon, LAT_MAX), p1 = px(lon, LAT_MIN);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    for (var lat = -60; lat <= 80; lat += 20) {
      var q0 = px(LON_MIN, lat), q1 = px(LON_MAX, lat);
      ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    }
    // 陆地（跨±180°的环在绘制时断开，避免环绕伪影）
    var polys = MW.LAND.polys;
    ctx.fillStyle = '#182e36';
    ctx.strokeStyle = 'rgba(110,190,200,0.22)';
    ctx.lineWidth = 1;
    for (var i = 0; i < polys.length; i++) {
      var f = polys[i];
      ctx.beginPath();
      var started = false, lastLon = 0;
      for (var j = 0; j < f.length; j += 2) {
        var lon = f[j];
        var pt = px(lon, f[j + 1]);
        if (!started || Math.abs(lon - lastLon) > 90) { ctx.moveTo(pt[0], pt[1]); started = true; }
        else ctx.lineTo(pt[0], pt[1]);
        lastLon = lon;
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    R.needStatic = false;
  };

  // —— 绑定世界：建立区域视觉缓存 ——
  R.bindWorld = function (w) {
    R.world = w;
    R.rc = [];
    var ac = hexRgb(anomColor(w));
    for (var i = 0; i < w.regions.length; i++) {
      var rd = MW.REGIONS[i], p = px(rd.lon, rd.lat);
      R.rc.push({
        cx: p[0], cy: p[1], r: baseR(rd),
        sx: p[0], sy: p[1], sr: baseR(rd) * R.view.s,
        cr: 38, cg: 86, cb: 92, tr: 38, tg: 86, tb: 92, // 当前色与目标色
        ac: ac, pulse: 0, crystal: 0
      });
    }
    R.fx = []; R.trav = [];
  };
  function anomColor(w) {
    for (var i = 0; i < MW.ANOMALIES.length; i++) if (MW.ANOMALIES[i].id === w.anomalyId) return MW.ANOMALIES[i].color;
    return '#4fd8b0';
  }
  function hexRgb(h) {
    return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
  }
  function baseR(rd) {
    return 3.2 + Math.sqrt(rd.pop0 / 1e6) * 0.62; // 4~13px
  }

  // —— 每个 simTick 调一次：更新目标值与视觉事件 ——
  R.onSimTick = function (w) {
    for (var i = 0; i < w.regions.length; i++) {
      var r = w.regions[i], rc = R.rc[i], rd = MW.REGIONS[i];
      if (!r || !rc) continue;
      var L = r.S + r.E + r.I + r.R + r.C;
      var prev = L > 0 ? (r.I + r.E * 0.5) / L : 0;
      var inten = Math.min(1, Math.sqrt(prev * 14));
      var dead = Math.min(1, r.D / rd.pop0 / 0.25);
      // 目标色：基色 → 异常色（按强度），死亡压暗，晶化漂白
      var t = rc.ac;
      rc.tr = 38 + (t.r - 38) * inten;
      rc.tg = 86 + (t.g - 86) * inten;
      rc.tb = 92 + (t.b - 92) * inten;
      var dk = 1 - dead * 0.45;
      rc.tr *= dk; rc.tg *= dk; rc.tb *= dk;
      var cShare = L > 0 ? r.C / L : 0;
      rc.crystal = Math.min(1, cShare * 3);
      rc.tr = rc.tr * (1 - rc.crystal * 0.6) + 165 * rc.crystal * 0.6;
      rc.tg = rc.tg * (1 - rc.crystal * 0.6) + 215 * rc.crystal * 0.6;
      rc.tb = rc.tb * (1 - rc.crystal * 0.6) + 235 * rc.crystal * 0.6;
      // 脉冲强度：本地感染增长（与上一tick自身缓存比较）
      var cur = r.I + r.E;
      var growth = cur - (rc._prevI || 0);
      if (growth > 0) rc.pulse = Math.min(1, rc.pulse + growth / (rd.pop0 * 0.01 + 1e3));
      if (r._burstDay === w.day) {
        rc.pulse = 1;
        if (R.quality > 0) addFx(rc.cx, rc.cy, 1.2, rc.ac, 'burst');
      }
      rc._prevI = cur;
    }
    // 航线图标：视觉层基于实际压力挑几条"活跃通道"
    if (R.quality > 0 && R.trav.length < (R.quality === 2 ? 80 : 30)) {
      var links = w.links;
      for (var k = 0; k < 3; k++) {
        var lk = links[VR.int(links.length)];
        if (!lk || lk.cls[lk.type] === 0) continue;
        var a = MW.REGIONS[lk.a], b = MW.REGIONS[lk.b];
        var src = w.regions[lk.a], dst = w.regions[lk.b];
        var dirAtoB = (src.I + src.E) > (dst.I + dst.E);
        var pa = px(dirAtoB ? a.lon : b.lon, dirAtoB ? a.lat : b.lat);
        var pb = px(dirAtoB ? b.lon : a.lon, dirAtoB ? a.lat : a.lat);
        R.trav.push({
          x0: pa[0], y0: pa[1], x1: pb[0], y1: pb[1],
          t: 0, dur: lk.type === 2 ? 2.2 : (lk.type === 1 ? 3.4 : 2.8),
          arc: lk.type !== 0, col: lk.type === 2 ? '#9fc9de' : (lk.type === 1 ? '#7fb9a8' : '#b3a98f')
        });
      }
    }
  };
  function addFx(x, y, scale, col, kind) {
    if (R.fx.length >= 64) R.fx.shift();
    R.fx.push({ x: x, y: y, t: 0, dur: kind === 'burst' ? 1.6 : 2.4, sc: scale || 1, col: col });
  }
  MW.addNewsFx = function (w, item) {
    // 新闻对应的地图涟漪：找相关区域（简化：sev≥2 时在最严重区域）
    if (R.quality === 0 || !w.regions) return;
    var idx = -1, bv = -1;
    for (var i = 0; i < w.regions.length; i++) {
      var v = w.regions[i].sev || 0;
      if (v > bv) { bv = v; idx = i; }
    }
    if (idx >= 0 && bv > 0.001) {
      var rc = R.rc[idx];
      var col = item.sev >= 3 ? '#ff6b6b' : '#e8b45a';
      addFx(rc.cx, rc.cy, 1.5, col, 'news');
    }
  };

  // —— 每帧 ——
  R.draw = function (now) {
    if (R.needStatic) R.drawStatic();
    var ctx = R.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(R.static_, 0, 0);
    ctx.scale(R.dpr, R.dpr);
    var t = now / 1000;

    // 连接
    if (R.world && R.view.s > 0.75) {
      var links = R.world.links;
      ctx.lineWidth = 0.6;
      for (var i = 0; i < links.length; i++) {
        var lk = links[i];
        var blocked = lk.cls[lk.type] === 0;
        var a = MW.REGIONS[lk.a], b = MW.REGIONS[lk.b];
        var pa = px(a.lon, a.lat), pb = px(b.lon, b.lat);
        ctx.strokeStyle = blocked ? 'rgba(150,120,120,0.10)' :
          (lk.type === 2 ? 'rgba(140,200,225,0.13)' : (lk.type === 1 ? 'rgba(110,190,170,0.12)' : 'rgba(180,170,140,0.10)'));
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      }
    }

    // 区域
    var w = R.world;
    if (!w) return;
    var K = 0.1; // 颜色插值速度（每帧）
    for (i = 0; i < R.rc.length; i++) {
      var rc = R.rc[i], rd = MW.REGIONS[i];
      rc.cr += (rc.tr - rc.cr) * K; rc.cg += (rc.tg - rc.cg) * K; rc.cb += (rc.tb - rc.cb) * K;
      rc.pulse *= 0.965;
      var breathe = 1 + Math.sin(t * 1.7 + i * 1.31) * 0.05 * (0.3 + rc.pulse * 2);
      var rr = Math.max(2.4, rc.r * R.view.s) * breathe;
      rc.sx = rc.cx; rc.sy = rc.cy; rc.sr = rr;
      ctx.beginPath();
      ctx.arc(rc.cx, rc.cy, rr, 0, 6.2832);
      ctx.fillStyle = 'rgb(' + (rc.cr | 0) + ',' + (rc.cg | 0) + ',' + (rc.cb | 0) + ')';
      ctx.fill();
      if (rc.pulse > 0.03) {
        ctx.strokeStyle = 'rgba(' + (rc.ac.r) + ',' + (rc.ac.g) + ',' + (rc.ac.b) + ',' + (rc.pulse * 0.5).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(rc.cx, rc.cy, rr + 2 + rc.pulse * 7, 0, 6.2832); ctx.stroke();
      }
      if (R.hover === i || R.sel === i) {
        ctx.strokeStyle = R.sel === i ? 'rgba(234,255,248,0.9)' : 'rgba(234,255,248,0.45)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(rc.cx, rc.cy, rr + 3.5, 0, 6.2832); ctx.stroke();
      }
    }

    // 涟漪
    for (i = R.fx.length - 1; i >= 0; i--) {
      var f = R.fx[i];
      f.t += 1 / 60;
      var ph = f.t / f.dur;
      if (ph >= 1) { R.fx.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6 + ph * 42 * f.sc, 0, 6.2832);
      ctx.strokeStyle = f.col;
      ctx.globalAlpha = (1 - ph) * 0.35;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 航线图标
    var dt = 1 / 60;
    for (i = R.trav.length - 1; i >= 0; i--) {
      var tv = R.trav[i];
      tv.t += dt;
      var q = tv.t / tv.dur;
      if (q >= 1) { R.trav.splice(i, 1); continue; }
      var xe, ye;
      if (tv.arc) {
        var mx = (tv.x0 + tv.x1) / 2, my = (tv.y0 + tv.y1) / 2;
        var ddx = tv.x1 - tv.x0, ddy = tv.y1 - tv.y0;
        var dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        var bulge = dl * 0.18;
        var q1 = 1 - q;
        xe = q1 * q1 * tv.x0 + 2 * q1 * q * (mx + (-ddy / dl) * bulge) + q * q * tv.x1;
        ye = q1 * q1 * tv.y0 + 2 * q1 * q * (my + (ddx / dl) * bulge) + q * q * tv.y1;
      } else {
        xe = tv.x0 + (tv.x1 - tv.x0) * q;
        ye = tv.y0 + (tv.y1 - tv.y0) * q;
      }
      ctx.beginPath();
      ctx.arc(xe, ye, 1.6, 0, 6.2832);
      ctx.fillStyle = tv.col;
      ctx.globalAlpha = 0.8 * Math.min(1, (1 - q) * 4) * Math.min(1, q * 6 + 0.3);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 标签：感染 Top-N
    drawLabels(ctx, t);
  };

  function drawLabels(ctx, t) {
    var w = R.world; if (!w) return;
    var mini = document.body.classList.contains('mini');
    var N = R.quality === 0 ? 3 : (mini ? 3 : 8);
    var arr = [];
    for (var i = 0; i < w.regions.length; i++) {
      var v = w.regions[i].I + w.regions[i].E;
      if (v > 100) arr.push([v, i]);
    }
    arr.sort(function (a, b) { return b[0] - a[0]; });
    ctx.font = '11px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    for (i = 0; i < Math.min(N, arr.length); i++) {
      var rc = R.rc[arr[i][1]];
      var name = MW.regionName(arr[i][1]);
      ctx.fillStyle = 'rgba(210,236,240,0.82)';
      ctx.fillText(name, rc.cx, rc.cy - rc.sr - 5);
    }
    if (R.hover >= 0) {
      var rh = R.rc[R.hover];
      if (rh) {
        ctx.fillStyle = 'rgba(234,255,248,0.95)';
        ctx.fillText(MW.regionName(R.hover), rh.cx, rh.cy - rh.sr - 5);
      }
    }
  }

  R.setQuality = function (q) { R.quality = q | 0; };
})();
