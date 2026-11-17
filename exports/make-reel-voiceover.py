# Narration for the 60s reel — calm, documentary delivery in one continuous
# voice (en-US-GuyNeural), phrased per scene with its own rate and pitch.
#
# Run: py .\exports\make-reel-voiceover.py
#       py .\exports\make-reel-voiceover.py --only 6    # re-record one block only
# Output: exports\vo\vo-s1.wav ... vo-s7.wav  (48 kHz mono)
#
# Spoken form (screen keeps the abbreviations exactly as designed):
#   Engineer  -> spoken in full, never "Er."
#   B.Tech    -> "B Tech"        (not "B dot tech")
#   M.Tech    -> "M Tech"        (not "M dot tech")
#   IIIT      -> "Eye Eye Eye Tee"
#   Allahabad -> "Ah lah hah baad"
#   EX-SDE    -> "ex software developer from Samsung" (spoken in full)
#   Bhanzu    -> "Bhaan-zoo"     (soft 'ah', crisp 'z')
#
# Needs: pip install edge-tts imageio-ffmpeg numpy

import asyncio
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import edge_tts
import numpy as np
from imageio_ffmpeg import get_ffmpeg_exe

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "exports" / "vo"
OUT.mkdir(parents=True, exist_ok=True)

VOICE = "en-US-GuyNeural"
SR = 48000
PRE, POST = 0.03, 0.05

# (start_s, end_s) — one block per script cue sheet.
SLOTS = [(0.10, 8.0), (7.70, 18.0), (17.90, 24.0), (23.80, 31.0),
         (30.90, 43.0), (42.20, 50.0), (49.40, 60.0)]

# phrase, rate, pitch, gain(dB), pause after (s)
LINES = [
    [   # 00:00 — hook
        ("Your child isn't failing math. They are just disappearing in it. "
         "In a crowded room, some questions are never asked.", "+5%", "-2Hz", 0.0, 0.0),
    ],
    [   # 00:08 — the quiet gap
        ("The gaps build quietly. You pay for a great school, so why are they "
         "still falling behind? It isn't a lack of intelligence. "
         "It's a lack of individual attention.", "+12%", "-2Hz", 0.0, 0.0),
    ],
    [   # 00:16 — the turn
        ("Until one moment changes everything... when they look up and say, "
         "Wait... I actually get this.", "+0%", "-2Hz", 0.0, 0.0),
    ],
    [   # 00:24 — the conversation
        ("It starts with one conversation. We meet your child exactly where "
         "they are stuck. We start wherever it broke.", "+8%", "-2Hz", 0.0, 0.0),
    ],
    [   # 00:32 — the tutor, credentials spoken in full
        ("I am Engineer Rohit Vishwakarma. B Tech and M Tech from Eye Eye Eye "
         "Tee Ah lah hah baad, ex software developer from Samsung and Math "
         "Expert at Bhaan-zoo. And I will be the same tutor, every single session.",
         "+12%", "-2Hz", 0.5, 0.0),
    ],
    [   # 00:44 — the result
        ("Confidence comes back, one concept at a time. Until they look at the "
         "next problem and say, I'll do the next one by myself.", "+5%", "-2Hz", 0.0, 0.0),
    ],
    [   # 00:52 — the close
        ("Try a free, 35-minute 1-on-1 demo. One student. One dedicated tutor. "
         "No contracts. Just WhatsApp us to secure your spot.", "+14%", "-2Hz", 0.0, 0.0),
    ],
]


async def synth(text, rate, pitch, mp3_path):
    tts = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch)
    buf = bytearray()
    async for chunk in tts.stream():
        if chunk["type"] == "audio":
            buf.extend(chunk["data"])
    if not buf:
        raise SystemExit("edge-tts returned no audio for: " + text)
    Path(mp3_path).write_bytes(bytes(buf))


def to_wav(mp3_path, wav_path):
    subprocess.run(
        [get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error",
         "-i", str(mp3_path), "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(wav_path)],
        check=True,
    )


def load(path):
    with wave.open(str(path), "rb") as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    return a


def trim(x, thresh=0.006):
    idx = np.where(np.abs(x) > thresh)[0]
    if not len(idx):
        return x
    return x[max(0, idx[0] - int(PRE * SR)): idx[-1] + int(POST * SR)]


def rms_db(x):
    return 20 * np.log10(max(np.sqrt(np.mean(x ** 2)), 1e-9))


def speak_line(phrases, tag):
    parts = []
    for k, (text, rate, pitch, gain_db, gap) in enumerate(phrases):
        mp3 = Path(tempfile.gettempdir()) / f"vo-{tag}-{k}.mp3"
        wav = Path(tempfile.gettempdir()) / f"vo-{tag}-{k}.wav"
        asyncio.run(synth(text, rate, pitch, mp3))
        to_wav(mp3, wav)
        seg = trim(load(wav))
        seg *= 10 ** ((gain_db - (rms_db(seg) + 20.0)) / 20.0)   # matched, then intent
        parts.append(seg)
        if gap > 0:
            parts.append(np.zeros(int(gap * SR), dtype=np.float32))
    out = np.concatenate(parts)
    peak = np.max(np.abs(out))
    if peak > 0.94:
        out *= 0.94 / peak
    return out


def main():
    only = set()
    for i, arg in enumerate(sys.argv):
        if arg == "--only" and i + 1 < len(sys.argv):
            only.update(x.strip().lower().removeprefix("s")
                        for x in sys.argv[i + 1].split(",") if x.strip())
    for i, phrases in enumerate(LINES):
        if only and str(i + 1) not in only:
            continue
        seg = speak_line(phrases, f"s{i + 1}")
        path = OUT / f"vo-s{i + 1}.wav"
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(np.clip(seg * 32767, -32768, 32767).astype(np.int16).tobytes())
        start, end = SLOTS[i]
        dur = len(seg) / SR
        fit = "ok" if dur <= (end - start) - 0.05 else "OVER"
        print(f"[ok] vo-s{i + 1}.wav  {dur:5.2f}s  slot {end - start:4.1f}s  {fit}")
    print(f"Done -> {OUT}")


if __name__ == "__main__":
    main()
