import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkFlashCapacity} from '../site/hardware-check.js';
import {clockInstallDialogClass} from '../site/clock-install-dialog.js';
import {validateManifest} from '../site/board-profiles.js';
import {p4UpdateSlot} from '../site/p4-install.js';

const p4 = 'waveshare_p4_knob';
const layout = (revision, running, boot = running) => `P4_LAYOUT layout=1 revision=${revision} running=${running} boot=${boot}`;
assert.equal(p4UpdateSlot(layout(302, 0x10000)), 0);
assert.equal(p4UpdateSlot(layout(302, 0x610000)), 1);
for (const value of [layout(102, 0x10000), layout(302, 0x10000, 0x610000), layout(302, 0x2000), 'UNKNOWN'])
  assert.throws(() => p4UpdateSlot(value));
const p4Update = {name:'Dragon Detector — Waveshare ESP32-P4-Knob-Touch-AMOLED-1.75 (update)',
  version:'0.14.12', release_channel:'beta', beta_iteration:2, new_install_prompt_erase:false,
  new_install_improv_wait_time:0, builds:[{chipFamily:'ESP32-P4', parts:[{path:'firmware.bin', offset:0x610000}]}]};
assert.equal(validateManifest(p4Update,p4,'update',1), p4Update);
assert.throws(() => validateManifest(p4Update,p4,'update',0));
assert.throws(() => validateManifest(p4Update,'waveshare_185b','update'));

const source = readFileSync(new URL('../site/vendor/esp-web-tools-10.4.0/install-dialog-im156JnI.js', import.meta.url), 'utf8');
const start = source.indexOf('(async(e,t,i,r,s)=>');
const end = source.indexOf('})((e=>{this._installState', start);
assert(start > 0 && end > start, 'Pinned installer integration changed');
let calls, capacity;
class qr { async disconnect() { calls.push('disconnect'); } }
class Es {
  chip = {CHIP_NAME: 'ESP32-S3'};
  DETECTED_FLASH_SIZES = {23: '8MB', 24: '16MB', 25: '32MB'};
  async main() {}
  async flashId() {}
  async readFlashId() { calls.push('read-id'); return capacity << 16; }
  async eraseFlash() { calls.push('erase'); }
  async writeFlash(options) {
    calls.push('write');
    assert.equal(options.flashSize, 'keep');
    assert.equal(options.flashMode, 'keep');
    assert.deepEqual([...options.fileArray[0].data], [1, 2, 3]);
  }
}
const wa = async () => calls.push('reset');
const window = {};
const location = {toString: () => 'https://example.test/Dragon-Detector-Flasher/'};
const fetch = async url => {
  calls.push(url);
  assert.equal(url, 'https://example.test/Dragon-Detector-Flasher/firmware/v0.14.9/stopwatch/firmware.bin');
  return {ok: true, blob: async () => new Uint8Array([1, 2, 3]).buffer};
};
class FileReader {
  addEventListener(type, callback) { this.callback = callback; }
  readAsArrayBuffer(buffer) { this.result = buffer; this.callback(); }
}
// Exercise the actual vendored installer, replacing only its USB dependencies.
const install = eval(source.slice(start, end + 2));
const port = {getInfo: () => ({usbVendorId: 0x303a, usbProductId: 0x1001})};
for (const [expected, detected, allowed] of [[8,24,false],[16,24,true],[16,23,false],[32,25,true],[16,0,false]]) {
  for (const erase of [false,true]) {
    calls=[];capacity=detected;
    const states=[];
    await install(state=>states.push(state),port,'firmware/v0.14.9/stopwatch/update.json',{
      builds:[{chipFamily:'ESP32-S3',parts:[{path:'firmware.bin',offset:65536}]}],
      beforeFlash:loader=>checkFlashCapacity(loader,expected,'Selected board')
    },erase);
    assert.equal(calls.includes('write'),allowed);
    assert.equal(calls.includes('erase'),allowed&&erase);
    assert.equal(states.at(-1).state,allowed?'finished':'error');
    assert(calls.includes('disconnect'));
    if (!allowed) assert.equal(calls.some(x=>x.startsWith('https:')),false);
  }
}
class Base {
  async _initialize() { this._manifest = structuredClone(this.downloaded); }
  _startInstall(erase) { this.erased=erase; }
  _closeDialog() {}
}
const Dialog=clockInstallDialogClass(Base);
const dialog=new Dialog();
dialog.expectedManifest={name:'C152',new_install_prompt_erase:true};
dialog.downloaded=dialog.expectedManifest;
dialog.expectedFlashMB=16;
dialog.boardName='StopWatch C152';
await dialog._initialize();
assert.equal(typeof dialog._manifest.beforeFlash,'function');
dialog.expectedP4Revision=3;
dialog.expectedFlashMB=32;
capacity=25;
calls=[];
const p4Loader=new Es();
p4Loader.chip={CHIP_NAME:'ESP32-P4', getChipRevision:async()=>102};
await assert.rejects(dialog._manifest.beforeFlash(p4Loader), /revision 3/);
assert.deepEqual(calls,[]);
p4Loader.chip.getChipRevision=async()=>302;
await dialog._manifest.beforeFlash(p4Loader);
assert.deepEqual(calls,['read-id']);
dialog.downloaded={name:'Dial'};
await dialog._initialize();
assert.equal(dialog._state,'ERROR');
assert.match(dialog._error,/manifest changed/);
const incomplete=new Dialog();
incomplete.downloaded={name:'C152'};
await incomplete._initialize();
assert.equal(incomplete._state,'ERROR');
console.log('PASS: wrong/unknown flash capacities stop before download, erase and write; matching capacities preserve payloads; changed manifests are blocked.');
