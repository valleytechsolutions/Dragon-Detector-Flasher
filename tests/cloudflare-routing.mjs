import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../hosting/cloudflare/unified-flasher.js', import.meta.url), 'utf8');
const origin = 'https://valleytech-dragon-detector.pages.dev/';
const release = 'https://valleytechsolutions.github.io/Dragon-Detector-Flasher/';
function route(suffix) {
  let result;
  vm.runInNewContext(script, {URL, location: {href: origin + suffix, replace: value => result = value}});
  return result;
}
for (const suffix of ['', '#install', '#detector', '#ble-lab', '#can-commander']) assert.equal(route(suffix), release + '?ui=release-20261126');
assert.equal(route('?board=stopwatch#install'), release + '?board=stopwatch&ui=release-20261126');
assert.equal(route('index.html?board=m5dial'), release + '?board=m5dial&ui=release-20261126');
assert.equal(route('#clock-sync-panel'), release + '?ui=release-20261126#clock');
assert.equal(route('#esp32-drivers'), release + '?ui=release-20261126#connection-help');
assert.equal(route('#sd-files'), release + '?ui=release-20261126#sd-files');
for (const hash of ['studio', 'theme-studio', 'buy-hardware']) assert.equal(route('#' + hash), origin + 'companion#' + hash);
assert.equal(route('#hardware'), origin + 'companion#buy-hardware');
assert.equal(route('#hardware-features'), origin + 'companion#hardware-features');
assert.equal(route('?board=waveshare_p4_knob#install'), release + '?board=waveshare_p4_knob&ui=release-20261126');
assert.equal(route('?board=guition_185_beta'), origin + 'companion?board=guition_185_beta#install');
assert.equal(route('?redirect=https%3A%2F%2Fexample.com'), release + '?redirect=https%3A%2F%2Fexample.com&ui=release-20261126');
console.log('Cloudflare bookmarks, board selections and editor routes passed.');
