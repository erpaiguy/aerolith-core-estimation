from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "apps" / "desktop" / "src-tauri" / "icons"
NAVY = (27, 36, 44, 255)
GOLD = (232, 196, 104, 255)


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int) -> bytes:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            t = (x - size / 2) / max(size * 0.32, 1)
            h = 1 - (y / size)
            on_left = abs(t + 0.55 * (1 - h)) < 0.12 and h > 0.18
            on_right = abs(t - 0.55 * (1 - h)) < 0.12 and h > 0.18
            on_bar = abs(h - 0.42) < 0.07 and abs(t) < 0.28
            letter = on_left or on_right or on_bar
            r, g, b, a = GOLD if letter else NAVY
            raw.extend((r, g, b, a))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + png_chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    return png


def write_ico(path: Path, png: bytes, size: int) -> None:
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(png), 6 + 16)
    path.write_bytes(header + entry + png)


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    png32 = write_png(ROOT / "32x32.png", 32)
    write_png(ROOT / "128x128.png", 128)
    write_png(ROOT / "128x128@2x.png", 256)
    write_ico(ROOT / "icon.ico", png32, 32)


if __name__ == "__main__":
    main()
