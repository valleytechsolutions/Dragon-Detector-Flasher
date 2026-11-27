# Dragon Detector release flasher

The Dragon Detector USB installer, hosted on GitHub Pages. The existing [Cloudflare address](https://valleytech-dragon-detector.pages.dev/) opens this same installer so older links follow the current release automatically.

[Open the flasher](https://valleytechsolutions.github.io/Dragon-Detector-Flasher/) · [Firmware releases](https://github.com/valleytechsolutions/Dragon-Detector/releases)

Choose the exact board printed on your device, select Update or Fresh installation, and connect using desktop Chrome or Edge. Fresh installation erases the device's saved data. Automatic clock sync checks the running board identity before setting its time.

[Install on StopWatch C152](https://valleytechsolutions.github.io/Dragon-Detector-Flasher/?board=stopwatch). This is the AMOLED model with yellow and blue buttons; M5Stack Dial is a different device with a rotary ring. The installer checks physical flash capacity before erasing or writing. A capacity match does not identify the board: models with equal flash sizes still need the correct hardware selection.

The Pages workflow checks the latest official Dragon Detector release every 30 minutes, and can also be run from Actions. GitHub may delay scheduled runs. It validates each release ZIP against the release checksum list, then checks the board, version, flash layout and individual binary checksums. The browser verifies the selected installation files again before enabling installation. Failed builds leave the previously published site available.

Firmware comes from the published release files. The [Waveshare P4 Knob](https://valleytechsolutions.github.io/Dragon-Detector-Flasher/?board=waveshare_p4_knob) uses its own 0.14.12 Beta 2 GitHub prerelease. Portal and Room Motion are pending. Models without packages here remain available through the [separate beta installers](https://valleytech-dragon-detector.pages.dev/companion#install).

[Badge Studio](https://valleytech-dragon-detector.pages.dev/companion#studio), [Theme Creator](https://valleytech-dragon-detector.pages.dev/companion#theme-studio) and [hardware details and purchase links](https://valleytech-dragon-detector.pages.dev/companion#buy-hardware) remain on Cloudflare. Artwork uploads are a separate step after firmware installation and clock setup; close the installer's USB connection before connecting an editor.

The flasher uses ESP Web Tools 10.4.0 and the existing Dragon Detector USB clock protocol. The installer and protocol modules retain their upstream notices. Release packages include their own license files.

[Download SD card files](https://valleytechsolutions.github.io/Dragon-Detector-Flasher/#sd-files). The page groups resource packs by the board manifests in the current release, and links the separate P4 starter pack. Extract the matching ZIP to a FAT32 card with its folder structure intact.

To check the packager locally, use Python 3.12 or later.

```sh
python -m unittest discover -s tests -v
python tools/build_site.py
python -m http.server 8000 --directory dist
```

Open http://localhost:8000 in desktop Chrome or Edge. Localhost supports Web Serial.
