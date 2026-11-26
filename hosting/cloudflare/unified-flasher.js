(() => {
  const current = new URL(location.href);
  const separate = ['waveshare_p4_knob', 'guition_185_beta', 't5-e1'].includes(current.searchParams.get('board'));
  const companions = new Map([
    ['#studio', '#studio'], ['#badge-studio', '#studio'],
    ['#theme-studio', '#theme-studio'], ['#theme-creator', '#theme-studio'],
    ['#hardware', '#buy-hardware'], ['#buy-hardware', '#buy-hardware'],
    ['#hardware-features', '#hardware-features'],
  ]);
  const companion = separate || companions.has(current.hash);
  const destination = companion
    ? new URL('companion', current)
    : new URL('https://valleytechsolutions.github.io/Dragon-Detector-Flasher/');
  destination.search = current.search;
  if (!companion) destination.searchParams.set('ui', 'release-20261126');
  destination.hash = companion ? companions.get(current.hash) || '#install'
    : current.hash === '#clock-sync-panel' ? '#clock'
    : ['#sd-files', '#resources'].includes(current.hash) ? '#sd-files'
    : ['#esp32-drivers', '#connection-help'].includes(current.hash) ? '#connection-help' : '';
  location.replace(destination.href);
})();
