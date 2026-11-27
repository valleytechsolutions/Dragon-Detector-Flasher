import {BadgeSerial} from './serial.js';
import {deviceQuery} from './device-query.js';
import {parseBadgeInfo} from './firmware-compat.js';
import {connectedProfile} from './board-profiles.js';

export function p4UpdateSlot(line) {
  const match = /^P4_LAYOUT layout=1 revision=(\d+) running=(\d+) boot=(\d+)$/.exec(line);
  if (!match) throw new Error('The installed P4 partition layout could not be verified.');
  const [revision, running, boot] = match.slice(1).map(Number);
  if (revision < 300 || revision > 399) throw new Error('This beta requires an ESP32-P4 revision 3 device.');
  if (running !== boot) throw new Error('Restart the knob to finish the pending boot change, then try again.');
  if (running === 0x10000) return 0;
  if (running === 0x610000) return 1;
  throw new Error('The running application is outside the supported P4 slots.');
}

export async function readP4UpdateSlot(port) {
  const link = new BadgeSerial(port);
  try {
    await link.open();
    const identity = parseBadgeInfo(await deviceQuery(link, 'badge info', line => line.startsWith('BADGE_INFO ')));
    if (connectedProfile(identity) !== 'waveshare_p4_knob') throw new Error('Connect the running Waveshare P4 Knob to update it.');
    return p4UpdateSlot(await deviceQuery(link, 'install layout', line => line.startsWith('P4_LAYOUT ')));
  } finally {
    await link.close();
  }
}
