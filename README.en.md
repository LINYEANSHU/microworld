<h1 align="center">MICROWORLD</h1>

<p align="center">
  <a href="README.md">中文</a> · <b>English</b>
</p>

<p align="center">
  <a href="#-tests--performance"><img src="https://img.shields.io/badge/tests-26%2B10%20all%20green-4fd8b0" alt="tests"></a>
  <a href="#-tests--performance"><img src="https://img.shields.io/badge/rendering-CPU%20only·zero%20GPU-9adcf0" alt="CPU only"></a>
  <img src="https://img.shields.io/badge/network-fully%20offline-e8b45a" alt="offline">
  <img src="https://img.shields.io/badge/language-中%20%2F%20EN-b48cff" alt="i18n">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-7fa8ad" alt="license"></a>
</p>

<p align="center">
  <img src="./assets/readme/hero-en.svg" width="100%" alt="MicroWorld: a tiny world that runs by itself on your desk. Zero-grind automation, 45–120 minute rounds, CPU only, fully offline.">
</p>

<p align="center">
  <img src="./assets/readme/shot-game.png" width="100%" alt="Real gameplay: 80 regions pulsing on a world map; the top bar shows 5.64M infected, 210M deaths, research 41%; the ‘What just happened’ panel lists aid arrivals, pilgrimage season and super-spreading events">
</p>

**A tiny world that runs by itself on your desk.** Inspired by the core systems of classic pandemic-simulation games — with every bit of grinding handed back to the world itself: press "One-Click Observation" once, then go do something else. One glance tells you everything.

| | |
|---|---|
| <img src="./assets/readme/shot-mini.png" width="100%" alt="Mini mode (480×320): the small window keeps running normally"> | <img src="./assets/readme/shot-ending.png" width="100%" alt="Ending review: Era of Eradication, grade A, year 6 day 171, with the evolution path"> |
| **Mini mode** · keeps running at 480×320 | **Ending review** · grade, stats and the evolution path |

## Why it is different

Games in this genre are **operation-heavy strategy**: click bubbles for resources, pick every evolution by hand, dismiss popups. This game flips the loop — you are the **observer**, not the operator:

| | Traditional | MicroWorld |
|---|---|---|
| Resources | Click bubbles constantly | Accrue automatically with infection scale |
| Evolution | Manual every time | Auto-scored allocation — **every purchase explains why** |
| Popups & waits | Frequent interruptions | Zero blocking; key events go to a reviewable timeline |
| Idling | Not supported | The core feature (offline progress capped at 8 h by default) |
| Round length | Unpredictable | 45–120 min by default, pause / speed 1×–8× anytime |

The human side is automatic too: surveillance, cure research, aid allocation, traffic closures, regional hygiene — all driven by world state. When the news says a region closed its airports, the connectivity model really closes them.

## Six original anomalies (distinct mechanics, not reskins)

| Anomaly | Core mechanic | | Anomaly | Core mechanic |
|---|---|---|---|---|
| 🔷 **Crystallize** | The infected turn to crystal; dust rides wind and air routes; reversible by research | | 🟣 **Dormancy** | Very long latency, nearly invisible; dormant foci wake in waves |
| 🟢 **Fog Tide** | Seasonal pulses with humid monsoons; sea lanes are its veins | | 🟠 **Etch** | Kills almost no one, silently erodes economy and research |
| 🟪 **Resonance** | Amplifies between dense cities; random "chorus" super-spreading | | 🔴 **Ember Rush** | Fierce and fast; self-snuffing once fuel runs out |

6 original scenarios (3 complexity tiers) · 43 events (all with triggers, consequences, cooldowns) · 6 ending paths (spread / contained / eradication / collapse / crystal age / self-extinction…) — reproducible under the same seed, different across seeds.

## Getting started

<p align="center">
  <img src="./assets/readme/workflow-en.svg" width="100%" alt="Four steps: open the page → one-click observation → the world runs → ending review">
</p>

- **Recommended**: double-click **`启动微疫世界.bat`** — a dedicated desktop window with always-on-top (its name is Chinese; it is the first .bat in the folder)
- **Training rigs**: double-click **`启动微疫世界_无GPU.bat`** — forces pure CPU rendering (still measured at 176 FPS)
- **Universal**: double-click `index.html` (needs Windows 10/11 + Edge or Chrome, usually preinstalled)

Optional setup: world seed, starting region, anomaly type, speed, event frequency, commentary style — or just start immediately.

**Bilingual**: switch the entire game (UI, anomalies, traits, event news, endings) between Chinese and English with one click on the start screen or in Settings; the choice persists.

## Offline progress

When the window is hidden or minimized the game stops drawing and records time; on return it catches up in batches (default cap 8 h, adjustable 4/12). Time beyond the cap is skipped weekly and clearly marked as "fast-forward (approximate)". Paused sessions accrue nothing. Clock rollbacks, repeated resumes, sleep, corrupt saves — all handled; saves contain sim time, three RNG streams, events and full history, in two rotating slots with checksums.

## Tests & performance

Headless + real-browser verification, zero GPU dependency:

| Metric | Measured |
|---|---|
| Regular regression | 26/26 (conservation, same-seed reproducibility, frame-rate independence, evolution legality, save/restore, no double catch-up…) |
| Headless stress | 10/10: 20k-day soak, 72-run full matrix, a 33M-day catch-up storm with exact accounting, 100-world interleaving |
| Real browser | 176 FPS without GPU (0.55 ms/frame), save round-trips 200/200, zero JS-heap growth |
| Round length | mean 2739 days ≈ **46 min at 1×**, four-plus endings emerge naturally |

> Honest note: the browser runtime's process tree uses ≈740–780 MiB private commit (Chromium baseline), above the 512 MiB budget; the game itself is <40 MiB. See the [TODO list](docs/未完成清单.md) (Chinese).

## Docs (Chinese)

[Feature matrix](docs/feature-matrix.md) · [Model notes](docs/模型说明.md) · [Test results](docs/测试结果.md) · [Stress report](docs/压力测试报告.md) · [Asset sources](docs/资源来源.md) · [TODO list](docs/未完成清单.md)

## Design boundaries

- ❌ No network, no IAP, no telemetry of any kind
- ❌ No fake realism: population, regions and anomalies are fictional gameplay data, mapped to no real pathogen
- ❌ Not a screensaver: a real, pausable, reviewable simulation — and not an operation-heavy strategy game either

## License

[MIT](LICENSE) · Map outlines from [Natural Earth](https://www.naturalearthdata.com/) (public domain), simplified and redrawn.

<p align="center">
  <a href="README.md">中文</a> · <b>English</b>
</p>
