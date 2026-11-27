(async function () {
  const store = chrome.storage.local;
  const { 'riseup:settings': saved } = await store.get('riseup:settings');
  const settings = Object.assign({ enabled: true, showLauncher: true }, saved || {});
  const enabled = document.getElementById('enabled');
  const launcher = document.getElementById('launcher');
  enabled.checked = settings.enabled;
  launcher.checked = settings.showLauncher;
  const save = () => store.set({ 'riseup:settings': { enabled: enabled.checked, showLauncher: launcher.checked } });
  enabled.addEventListener('change', save);
  launcher.addEventListener('change', save);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const onRise = tab && /^https:\/\/rise\.articulate\.com\//.test(tab.url || '');
  document.getElementById('where').textContent = onRise
    ? 'Open the RiseUp button at the bottom right of Rise to style this course.'
    : 'Open a course in Rise 360 (rise.articulate.com) to use RiseUp.';

  document.getElementById('tools').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/tools/tools.html') });
    window.close();
  });
})();
