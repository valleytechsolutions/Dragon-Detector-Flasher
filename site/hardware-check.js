export async function checkFlashCapacity(loader, expectedMB, boardName) {
  if (!Number.isInteger(expectedMB) || expectedMB <= 0) {
    throw new Error('The selected release has no valid flash capacity. Reload the page.');
  }
  const id = await loader.readFlashId();
  const detected = loader.DETECTED_FLASH_SIZES[(id >>> 16) & 255];
  if (!detected || !/^\d+MB$/.test(detected)) {
    throw new Error('Could not verify this device’s flash capacity. Nothing was erased. Reconnect and try again.');
  }
  if (detected !== expectedMB + 'MB') {
    throw new Error(`${boardName} requires ${expectedMB} MB flash, but the connected device has ${parseInt(detected)} MB. Nothing was erased. Close this dialog and choose the model printed on your device.`);
  }
}
