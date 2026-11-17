# Build the gallery's JPEG thumbnails from the exported 2x PNGs.
# Run:  py .\exports\make-thumbs.py                     # all assets
#       py .\exports\make-thumbs.py --only deck-04-the-tutor
# Output: exports\thumbs\*.jpg  (720px wide, matches exports\index.html)

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "exports" / "png"
OUT = ROOT / "exports" / "thumbs"
OUT.mkdir(parents=True, exist_ok=True)

WIDTH = 720
QUALITY = 82


def main() -> None:
    total = 0
    only = set()
    for i, arg in enumerate(sys.argv):
        if arg == "--only" and i + 1 < len(sys.argv):
            only.update(x.strip() for x in sys.argv[i + 1].split(",") if x.strip())
    files = sorted(SRC.glob("*.png"))
    if only:
        files = [f for f in files
                 if any(f.stem == o or f.stem.startswith(o) for o in only)]
        if not files:
            raise SystemExit(f"no PNGs matched --only {sorted(only)}")
    for src in files:
        im = Image.open(src).convert("RGB")
        height = round(im.height * WIDTH / im.width)
        im = im.resize((WIDTH, height), Image.LANCZOS)
        dest = OUT / (src.stem + ".jpg")
        im.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        total += dest.stat().st_size
        print(f"[ok] {dest.name:<28} {im.width}x{im.height}  {dest.stat().st_size / 1024:6,.0f} KB")
    print(f"\n{len(files)} thumbs  {total / 1024:,.0f} KB total  -> {OUT}")


if __name__ == "__main__":
    main()
