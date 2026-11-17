# Build the gallery's JPEG thumbnails from the exported 2x PNGs.
# Run:  py .\exports\make-thumbs.py
# Output: exports\thumbs\*.jpg  (720px wide, matches exports\index.html)

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
    files = sorted(SRC.glob("*.png"))
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
