(() => {
  const desktopApp = window.MW;
  const obsolete = document.getElementById('ck-topmost-hint');
  const about = document.getElementById('about-p3');
  const ticker = document.getElementById('ticker');
  const startTitle = document.querySelector('.start-inner h1');
  const pause = document.querySelector('.spd[data-s="0"]');

  obsolete.closest('label').hidden = true;
  ticker.setAttribute('role', 'button');
  ticker.tabIndex = 0;
  ticker.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    ticker.click();
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  const bars = document.createElementNS(svg.namespaceURI, 'path');
  bars.setAttribute('d', 'M2.5 1.5h2.25v9H2.5zm4.75 0H9.5v9H7.25z');
  bars.setAttribute('fill', 'currentColor');
  svg.append(bars);
  pause.replaceChildren(svg);

  function applyDesktopLanguage() {
    const english = desktopApp.LANG === 'en';
    document.documentElement.lang = english ? 'en' : 'zh-CN';
    startTitle.textContent = english ? 'MicroWorld' : '微疫世界';
    about.textContent = english
      ? 'MicroWorld runs offline and collects no data. Your sessions are saved in this Windows app.'
      : '微疫世界离线运行，不收集数据。观察存档保存在本机的 Windows 应用中。';
    ticker.setAttribute('aria-label', english ? 'Open event timeline' : '打开事件时间线');
    pause.title = english ? 'Pause (Space)' : '暂停（空格）';
    pause.setAttribute('aria-label', pause.title);
  }

  const applyLang = desktopApp.applyLang;
  desktopApp.applyLang = function () {
    applyLang.call(this);
    applyDesktopLanguage();
  };
  applyDesktopLanguage();

  const ui = desktopApp.UI;
  const updateHUD = ui.updateHUD;
  const speeds = document.querySelectorAll('.spd');
  ui.updateHUD = function () {
    updateHUD.call(this);
    if (!ui.w || ui.w._tot) return;

    // A session can be paused before the first simulation totals exist.
    const speed = ui.hooks.isPaused() ? 0 : ui.w.speedIdx;
    for (const button of speeds) {
      const selected = Number(button.dataset.s) === speed;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };
})();
