import {i as installerModule} from './vendor/esp-web-tools-10.4.0/install-dialog-im156JnI.js';
import {clockInstallDialogClass} from './clock-install-dialog.js';
import {completeInstallSession, syncInstalledClock} from './install-clock.js';
import {clockResultText} from './clock-verification.js';
import {boardProfiles, validateManifest} from './board-profiles.js';
import {resourceSetup} from './sd-resources.js';

const $ = id => document.getElementById(id);
customElements.define('release-install-dialog', clockInstallDialogClass(installerModule.EwtInstallDialog));
const supported = !!navigator.serial && window.isSecureContext;
$('browser-help').hidden = supported;
let catalog;
let selection;
let ready = false;
let busy = false;
let generation = 0;
let pending;

function status(text, error = false) {
  $('status').textContent = text;
  $('status').dataset.error = String(error);
}

function controls() {
  $('board').disabled = busy || !catalog;
  $('mode').disabled = busy || !selection;
  $('confirm').disabled = busy || !ready;
  $('auto-clock').disabled = busy;
  $('install').disabled = busy || !ready || !$('confirm').checked || !supported;
  $('sync').disabled = busy || !selection || !supported || !boardProfiles[selection.id];
}

async function sha256(data) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkSelection() {
  const attempt = ++generation;
  pending?.abort();
  pending = new AbortController();
  const {signal} = pending;
  selection = catalog.boards.find(board => board.id === $('board').value);
  ready = false;
  $('confirm').checked = false;
  $('details').hidden = !selection;
  $('download').hidden = $('checksums').hidden = !selection;
  $('sd-help').hidden = true;
  controls();
  if (!selection) return status('Choose a board to check its firmware.');
  const selected = selection;
  const profile = boardProfiles[selected.id];
  $('board-name').textContent = selected.name;
  $('board-detail').textContent = [profile?.size ? profile.size + ' × ' + profile.size : '', profile?.display, selected.flash_mb + ' MB flash'].filter(Boolean).join(' · ');
  $('confirm-text').textContent = 'My device is ' + selected.name + '.';
  $('download').href = selected.archive_url;
  $('checksums').href = selected.path + '/SHA256SUMS.txt';
  $('mode-help').textContent = $('mode').value === 'factory'
    ? 'Fresh installation erases settings, artwork and saved files. Choose this to replace other firmware or a wrong board image.'
    : 'Update preserves saved settings and files. Choose Fresh installation when changing firmware or correcting a wrong board image.';
  status('Checking ' + selected.name + ' · ' + selected.version + '…');
  const timeout = setTimeout(() => pending.abort(), 60000);
  try {
    const mode = $('mode').value;
    const response = await fetch(selected.path + '/' + mode + '.json', {signal, cache: 'no-cache'});
    if (!response.ok) throw new Error('Firmware manifest unavailable. Reload and try again.');
    const manifest = await response.json();
    if (profile) validateManifest(manifest, selected.id, mode);
    if (JSON.stringify(manifest) !== JSON.stringify(selected.manifests[mode])) {
      throw new Error('Release changed during loading. Reload this page before installing.');
    }
    const sd = resourceSetup(selected.id, manifest);
    if (sd && generation === attempt) {
      const link = document.createElement('a');
      link.href = sd.path;
      link.textContent = 'Download SD resource pack';
      $('sd-help').replaceChildren(sd.title + '. ' + sd.instructions + ' ', link);
      $('sd-help').hidden = false;
    }
    await Promise.all(manifest.builds[0].parts.map(async part => {
      const file = await fetch(selected.path + '/' + part.path, {signal});
      if (!file.ok) throw new Error(part.path + ' could not be downloaded.');
      const digest = await sha256(await file.arrayBuffer());
      if (digest !== selected.files[part.path]) throw new Error(part.path + ' failed checksum verification.');
    }));
    if (generation !== attempt) return;
    ready = true;
    status(selected.version + ' verified. Confirm your hardware model, then connect.');
  } catch (error) {
    if (generation !== attempt) return;
    status(signal.aborted ? 'Firmware check timed out. Select the board again to retry.' : error.message, true);
  } finally {
    clearTimeout(timeout);
    if (generation === attempt) controls();
  }
}

$('board').addEventListener('change', checkSelection);
$('mode').addEventListener('change', checkSelection);
$('confirm').addEventListener('change', controls);
$('install').addEventListener('click', async () => {
  if (!ready || busy || !$('confirm').checked) return;
  const selected = selection;
  const mode = $('mode').value;
  const autoClock = $('auto-clock').checked;
  busy = true;
  controls();
  let port;
  try {
    port = await navigator.serial.requestPort();
    await port.open({baudRate: 115200, bufferSize: 8192});
    const dialog = document.createElement('release-install-dialog');
    dialog.port = port;
    dialog.installMode = mode;
    dialog.autoClock = autoClock;
    dialog.manifestPath = selected.path + '/' + mode + '.json';
    dialog.addEventListener('closed', async () => {
      const succeeded = dialog.installSucceeded;
      try {
        status(succeeded && autoClock ? 'Firmware written. Setting and verifying the clock…' : 'Closing USB connection…');
        const result = await completeInstallSession(port, selected.id, {succeeded, autoClock});
        if (result.cancelled) status(dialog.installError || 'Installation cancelled.', !!dialog.installError);
        else status(autoClock ? result.reason || clockResultText(result) : 'Firmware installed successfully.');
      } catch (error) {
        status('Firmware written. Clock setup needs attention: ' + error.message + ' Use Connect and sync clock once the device is running.', true);
      } finally {
        busy = false;
        controls();
      }
    }, {once: true});
    document.body.appendChild(dialog);
    status('Installing ' + selected.name + ' · ' + selected.version + '. Keep USB connected.');
  } catch (error) {
    if (port) try { await port.close(); } catch {}
    status(error.name === 'NotFoundError' ? 'USB selection cancelled.' : error.message, error.name !== 'NotFoundError');
    busy = false;
    controls();
  }
});

$('sync').addEventListener('click', async () => {
  if (busy || !selection) return;
  const board = selection.id;
  busy = true;
  controls();
  try {
    const port = await navigator.serial.requestPort();
    status('Reading device identity and setting the clock…');
    const result = await syncInstalledClock(port, board);
    status(result.reason || clockResultText(result));
  } catch (error) {
    status(error.name === 'NotFoundError' ? 'USB selection cancelled.' : error.message, error.name !== 'NotFoundError');
  } finally {
    busy = false;
    controls();
  }
});

try {
  const response = await fetch('catalog.json', {cache: 'no-cache'});
  if (!response.ok) throw new Error('Release catalog could not be loaded. Reload this page.');
  catalog = await response.json();
  if (!Array.isArray(catalog.boards) || !catalog.boards.length) throw new Error('Release has no board packages.');
  const link = document.createElement('a');
  link.href = catalog.release_url;
  link.textContent = 'Latest release ' + catalog.tag + ' ↗';
  $('release').replaceChildren(link);
  for (const board of catalog.boards) {
    const option = new Option(board.name, board.id);
    $('board').add(option);
  }
  $('updated').textContent = 'Release checked ' + new Date(catalog.checked_at).toLocaleString();
  const requested = new URLSearchParams(location.search).get('board');
  if (catalog.boards.some(b => b.id === requested)) {
    $('board').value = requested;
    await checkSelection();
  }
  controls();
} catch (error) {
  status(error.message, true);
  $('release').textContent = 'Release unavailable';
}
