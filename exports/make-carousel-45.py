# Build 4:5 portrait (1080 x 1350) copies of both carousels.
# The square source designs are flex-column with a margin-top:auto footer, so
# the extra 270px becomes breathing room rather than broken artwork. S1's
# absolute bottom-anchored copy and S4's photo card are retuned explicitly.
#
# Run: py .\exports\make-carousel-45.py
# Out: nextgen-creative-kit-45.html
#      nextgen-creative-kit-riyadh-45.html

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CSS = """
  /* ---------- 4:5 portrait carousel · 1080x1350 ---------- */
  .sq{width:1080px;height:1350px;padding:104px 88px}
  .kicker{margin-bottom:38px}
  .foot{padding-top:26px}

  /* S1 — bottom-anchored copy follows the taller canvas */
  .s1{padding:104px 70px 104px 232px}
  .s1 .accent{left:232px;bottom:372px}
  .s1 .body{left:232px;bottom:236px;font-size:30px;max-width:520px}
  .s1-art{right:52px;bottom:424px;width:380px;height:301px}

  /* S2 */
  .s2 ol{margin-top:46px}
  .s2 li{padding:28px 0;font-size:31px}
  .chart{height:206px;margin-top:32px}
  .s2 .body{margin-top:28px;font-size:28px}

  /* S3 */
  .s3-diagram{margin-top:42px}
  .s3 .body{margin-top:28px;font-size:26px}
  .s3 .chips{margin-top:20px}

  /* S4 — let the photo card grow into the extra height */
  .s4-card{height:842px;margin-top:42px}
  .s4-info{padding:50px 40px 96px 52px}
  .s4-body{margin-top:26px;font-size:22px}

  /* S5 */
  .s5 ol{margin-top:38px;gap:24px}
  .s5 li{font-size:27px}
  .ticket{margin-top:38px;padding:24px 28px}
  .s5-after{margin-top:32px}

  /* S6 — keep each deck's own type tuning; only rebalance the artwork */
  .s6 .ghost{top:380px}
"""


def build(source_name: str, out_name: str) -> None:
    src = (ROOT / source_name).read_text(encoding="utf-8")
    at = src.rfind("</style>")
    assert at != -1, f"no </style> in {source_name}"
    out = src[:at] + CSS + src[at:]
    target = ROOT / out_name
    target.write_text(out, encoding="utf-8")
    print(f"wrote {target.name}  {len(out):,} chars")


if __name__ == "__main__":
    build("nextgen-creative-kit.html", "nextgen-creative-kit-45.html")
    build("nextgen-creative-kit-riyadh.html", "nextgen-creative-kit-riyadh-45.html")
