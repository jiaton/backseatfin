"""Packages the Jellyfin plugin for a release and writes the plugin repository manifest.

    python3 package.py <version, e.g. 0.1.0> <dll> <out dir> <download base URL>

Writes <out>/backseatfin-jellyfin-<version>.zip (the plugin DLL) and <out>/manifest.json,
the file Jellyfin reads when a user adds the repository URL
(https://<owner>.github.io/backseatfin/jellyfin/manifest.json).
"""

import datetime
import hashlib
import json
import pathlib
import sys
import zipfile

GUID = "1f31e26e-b3ee-4e18-b404-f4a0800fbd9f"
# Built against Jellyfin.Controller 12.0.0: loads on Jellyfin 12.0 and later.
TARGET_ABI = "12.0.0.0"


def main() -> None:
    version, dll, out, base_url = sys.argv[1:5]
    out_dir = pathlib.Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    full_version = f"{version}.0" if version.count(".") == 2 else version
    zip_path = out_dir / f"backseatfin-jellyfin-{version}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(dll, pathlib.Path(dll).name)
    manifest = [
        {
            "guid": GUID,
            "name": "BackseatFin",
            "description": (
                "Watch Jellyfin in the car's browser, even while the car is moving: pressing Play "
                "opens a player that draws Jellyfin's own transcode on a canvas, which car browsers "
                "such as Tesla's don't block while driving. For passengers."
            ),
            "overview": "Canvas player for car browsers",
            "owner": "jiaton",
            "category": "General",
            "imageUrl": "",
            "versions": [
                {
                    "version": full_version,
                    "changelog": f"https://github.com/jiaton/backseatfin/releases/tag/v{version}",
                    "targetAbi": TARGET_ABI,
                    "sourceUrl": f"{base_url}/{zip_path.name}",
                    "checksum": hashlib.md5(zip_path.read_bytes()).hexdigest(),
                    "timestamp": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            ],
        }
    ]
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(zip_path)


if __name__ == "__main__":
    main()
