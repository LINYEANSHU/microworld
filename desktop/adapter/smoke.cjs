module.exports = async ({ evaluate, wait }) => {
  await wait("document.querySelector('#btn-start')");
  await evaluate("document.querySelector('#btn-start').click()");
  await wait("document.querySelector('#screen-game:not(.hidden)')");
  await evaluate("document.querySelector('.spd[data-s=\"0\"]').click()");
  await wait("document.querySelector('.spd[data-s=\"0\"].on')");
};
