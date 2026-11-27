import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from build_site import unpack, P4, P4_TAG, P4_VERSION, P4_LAYOUTS


class PackageValidation(unittest.TestCase):
    def test_p4_application_slots_are_exact(self):
        for wrong_slot in (False, True):
            with self.subTest(wrong_slot=wrong_slot), tempfile.TemporaryDirectory() as tmp:
                buffer = io.BytesIO()
                with zipfile.ZipFile(buffer, 'w') as archive:
                    image = b'p4 fixture'
                    digest = hashlib.sha256(image).hexdigest()
                    archive.writestr('build-info.json', json.dumps({'board': P4, 'version': P4_VERSION,
                        'name': 'P4 Knob Beta', 'flash_size': 32*1024*1024, 'release_tag': P4_TAG}))
                    for mode, layout in P4_LAYOUTS.items():
                        parts = [{'path': name, 'offset': offset} for name, offset in layout]
                        if wrong_slot and mode == 'update-app1':
                            parts[0]['offset'] = 0x10000
                        archive.writestr(mode + '.json', json.dumps({'version': P4_VERSION,
                            'release_channel': 'beta', 'beta_iteration': 2, 'application_sha256': digest,
                            'builds': [{'chipFamily': 'ESP32-P4', 'parts': parts}]}))
                    for name, _ in P4_LAYOUTS['factory']:
                        archive.writestr(name, image)
                    archive.writestr('SHA256SUMS.txt', ''.join(f'{digest}  {name}\n' for name, _ in P4_LAYOUTS['factory']))
                destination = Path(tmp)/'p4'
                blob = buffer.getvalue()
                digest = hashlib.sha256(blob).hexdigest()
                if wrong_slot:
                    with self.assertRaisesRegex(ValueError, 'incorrect slot'):
                        unpack(blob, digest, P4, P4_VERSION, destination)
                    self.assertFalse(destination.exists())
                else:
                    staged = unpack(blob, digest, P4, P4_VERSION, destination)
                    self.assertEqual(staged['manifests']['update-app1']['builds'][0]['parts'],
                                     [{'path':'firmware.bin','offset':0x610000}])

    def package(self, board='example', path='firmware.bin', extra=None):
        data = b'harmless image fixture'
        manifest = {'version': '1.2.3', 'builds': [{
            'chipFamily': 'ESP32-S3', 'parts': [{'path': path, 'offset': 65536}]
        }]}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('build-info.json', json.dumps({
                'board': board, 'version': '1.2.3', 'name': 'Example', 'flash_size': 8 * 1024 * 1024
            }))
            for name in ('update.json', 'factory.json'):
                archive.writestr(name, json.dumps(manifest))
            archive.writestr(path, data)
            archive.writestr('SHA256SUMS.txt', hashlib.sha256(data).hexdigest() + '  ' + path + '\n')
            if extra:
                archive.writestr(extra, data)
        blob = buffer.getvalue()
        return blob, hashlib.sha256(blob).hexdigest()

    def test_preserves_image_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            blob, digest = self.package()
            folder = Path(tmp) / 'board'
            unpack(blob, digest, 'example', '1.2.3', folder)
            self.assertEqual((folder / 'firmware.bin').read_bytes(), b'harmless image fixture')

    def test_bad_hash_board_or_path_produces_no_installer(self):
        for params in ({'board': 'wrong'}, {'path': '../firmware.bin'}, {'extra': '../escape'}):
            with self.subTest(params=params), tempfile.TemporaryDirectory() as tmp:
                blob, digest = self.package(**params)
                folder = Path(tmp) / 'board'
                with self.assertRaises(ValueError):
                    unpack(blob, digest, 'example', '1.2.3', folder)
                self.assertFalse(folder.exists())
        with tempfile.TemporaryDirectory() as tmp:
            blob, digest = self.package()
            with self.assertRaises(ValueError):
                unpack(blob, '0' * 64, 'example', '1.2.3', Path(tmp) / 'board')


if __name__ == '__main__':
    unittest.main()
