const assert = require('node:assert/strict');

module.exports = async ({ evaluate, wait, waitUntil }) => {
  await wait("document.querySelector('#btn-start')");
  await evaluate("document.querySelector('#btn-start').click()");
  await wait("document.querySelector('#screen-game:not(.hidden)')");
  await evaluate("document.querySelector('.spd[data-s=\"0\"]').click()");
  await wait("document.querySelector('.spd[data-s=\"0\"].on')");
  await evaluate("document.querySelector('#mi-save').click()");
  assert.deepEqual(await evaluate(`(() => {
    MW.saveWorld = () => null;
    window.quitPrompts = 0;
    window.confirm = () => { window.quitPrompts++; return false; };
    document.querySelector('#mi-quit').click();
    return [window.quitPrompts, !document.querySelector('#screen-game').classList.contains('hidden')];
  })()`), [1, true], 'Cancel keeps the observation open when saving fails');
  await evaluate(`(() => {
    window.confirm = () => true;
    document.querySelector('#mi-quit').click();
  })()`);
  await waitUntil(() => evaluate("!window.quitPrompts && document.querySelector('#btn-continue:not(.hidden)') !== null")
    .catch(() => false), 'the start screen and last valid checkpoint return after skipping a failed save');
  await evaluate("document.querySelector('#btn-continue').click()");
  await wait("document.querySelector('#screen-game:not(.hidden)') && document.querySelector('.spd[data-s=\"0\"].on')");
  return { checkpointRestored: true, quitOnStorageFailure: true };
};
