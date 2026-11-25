"""Publish the latest official release as a verified static USB installer."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASES = "https://github.com/valleytechsolutions/Dragon-Detector/releases"
MIB = 1024 * 1024
EXCLUDED = {"waveshare_p4_knob"}


def download(url, limit=64 * MIB):
    request = urllib.request.Request(url, headers={"User-Agent": "Dragon-Detector-release-flasher"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"File exceeds limit: {url}")
    return data


def sums(data):
    records = {}
    for line in data.decode("ascii").splitlines():
        match = re.fullmatch(r"([a-fA-F0-9]{64})\s+\*?([A-Za-z0-9_.-]+)", line)
        if not match or match[2] in records:
            raise ValueError("Invalid or duplicate checksum record")
        records[match[2]] = match[1].lower()
    if not records:
        raise ValueError("Empty checksums")
    return records


def unpack(blob, digest, board, version, destination):
    if hashlib.sha256(blob).hexdigest() != digest:
        raise ValueError(f"{board}: archive checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        entries = archive.infolist()
        if len(entries) > 128 or sum(e.file_size for e in entries) > 128 * MIB:
            raise ValueError(f"{board}: oversized archive")
        if len({e.filename.casefold() for e in entries}) != len(entries):
            raise ValueError(f"{board}: duplicate archive member")
        for entry in entries:
            if (not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", entry.orig_filename)
                    or entry.file_size > 32 * MIB or entry.flag_bits & 1
                    or entry.compress_type not in (zipfile.ZIP_DEFLATED, zipfile.ZIP_STORED)):
                raise ValueError(f"{board}: unsafe archive member")
        info = json.loads(archive.read("build-info.json"))
        if info["board"] != board or info["version"] != version:
            raise ValueError(f"{board}: package identity mismatch")
        checksums = sums(archive.read("SHA256SUMS.txt"))
        payloads = {}
        manifests = {}
        for mode in ("update", "factory"):
            manifest = json.loads(archive.read(mode + ".json"))
            if manifest["version"] != version or len(manifest["builds"]) != 1:
                raise ValueError(f"{board}: manifest version mismatch")
            build = manifest["builds"][0]
            if build["chipFamily"] != "ESP32-S3":
                raise ValueError(f"{board}: unsupported processor")
            if manifest.get("sdResources", {}).get("required"):
                raise ValueError(f"{board}: required external SD pack needs packaging")
            occupied = []
            names = set()
            for part in build["parts"]:
                name, offset = part["path"], part["offset"]
                if not re.fullmatch(r"[a-z0-9_.-]+\.bin", name) or name in names:
                    raise ValueError(f"{board}: invalid manifest path")
                names.add(name)
                data = archive.read(name)
                if not data or hashlib.sha256(data).hexdigest() != checksums.get(name):
                    raise ValueError(f"{board}/{name}: part checksum mismatch")
                if type(offset) is not int or offset < 0 or offset + len(data) > info["flash_size"]:
                    raise ValueError(f"{board}/{name}: invalid flash range")
                if any(offset < end and offset + len(data) > start for start, end in occupied):
                    raise ValueError(f"{board}: overlapping flash regions")
                occupied.append((offset, offset + len(data)))
                payloads[name] = data
            if "firmware.bin" not in names:
                raise ValueError(f"{board}: missing application")
            if mode == "update" and any(p["path"] == "littlefs.bin" for p in build["parts"]):
                raise ValueError(f"{board}: update overwrites user filesystem")
            manifests[mode] = manifest
        destination.mkdir(parents=True)
        for name, data in payloads.items():
            (destination / name).write_bytes(data)
        for entry in entries:
            name = entry.filename
            if name.endswith((".txt", ".json")):
                (destination / name).write_bytes(archive.read(name))
        return {
            "id": board, "name": info["name"], "version": version,
            "flash_mb": info["flash_size"] // MIB,
            "application_sha256": checksums["firmware.bin"],
            "files": {name: hashlib.sha256(data).hexdigest() for name, data in payloads.items()},
            "manifests": manifests,
        }


def build(output, published=None):
    with urllib.request.urlopen(urllib.request.Request(RELEASES + "/latest",
            headers={"User-Agent": "Dragon-Detector-release-flasher"}), timeout=30) as response:
        match = re.fullmatch(re.escape(RELEASES) + r"/tag/(v\d+\.\d+\.\d+)", response.url)
    if not match:
        raise ValueError("Latest release did not resolve to an official version")
    tag = match[1]
    base = f"{RELEASES}/download/{tag}/"
    checksum_data = download(base + "SHA256SUMS.txt", MIB)
    index = sums(checksum_data)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    identity = {"tag": tag, "checksum_sha256": hashlib.sha256(checksum_data).hexdigest(), "site_revision": revision}
    if published:
        try:
            previous = json.loads(download(published.rstrip("/") + "/catalog.json", MIB))
            if all(previous.get(k) == v for k, v in identity.items()):
                print("The published flasher already matches this release.")
                return False
        except (urllib.error.URLError, ValueError):
            pass
    if output.exists():
        raise ValueError("Choose a new build directory")
    packages = []
    for asset, digest in index.items():
        found = re.fullmatch(r"dragon-detector-([a-z0-9_]+)-" + re.escape(tag[1:]) + r"\.zip", asset)
        if found and found[1] not in EXCLUDED:
            packages.append((found[1], asset, digest))
    if not packages:
        raise ValueError("Release contains no supported board packages")
    shutil.copytree(ROOT / "site", output)
    (output / ".nojekyll").touch()

    def prepare(package):
        board, asset, digest = package
        relative = f"firmware/{tag}/{board}"
        record = unpack(download(base + asset), digest, board, tag[1:], output / relative)
        record.update(path=relative, archive_url=base + asset, archive_sha256=digest)
        print(f"{board}: verified {tag}", flush=True)
        return record

    with ThreadPoolExecutor(max_workers=3) as pool:
        boards = list(pool.map(prepare, sorted(packages)))
    catalog = dict(identity, release_url=f"{RELEASES}/tag/{tag}", boards=boards,
                   checked_at=datetime.now(timezone.utc).isoformat())
    (output / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(boards)} board packages from {tag}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--published")
    args = parser.parse_args()
    changed = build(args.output.resolve(), args.published)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as handle:
            handle.write(f"changed={str(changed).lower()}\n")
