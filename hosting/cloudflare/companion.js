(() => {
  const release = 'https://valleytechsolutions.github.io/Dragon-Detector-Flasher/';
  function view() {
    document.documentElement.dataset.companionView = location.hash === '#install' ? 'beta' : 'editor';
  }
  view();
  addEventListener('hashchange', view);
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (link?.getAttribute('href') === '#install') {
      event.preventDefault();
      location.assign(release);
    }
  });
  addEventListener('DOMContentLoaded', () => {
    const tab = document.getElementById('firmware-tab');
    tab.textContent = 'Hardware & Badge Studio';
    document.querySelector('header .brand').href = release;
    for (const link of document.querySelectorAll('header nav a')) {
      if (link.hash === '#install') link.href = release;
      if (link.hash === '#clock-sync-panel') link.href = release + '#clock';
      if (link.hash === '#esp32-drivers') link.href = release + '#connection-help';
    }
  });
})();
