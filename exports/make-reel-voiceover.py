# Narration for the 60s reel — human-paced, phrase-by-phrase neural TTS.
#
# Each line is spoken as separate phrases with its own rate, pitch and emphasis,
# then joined with hand-set pauses (comma breath vs. full stop). This removes the
# flat, one-shot "AI read" feel of a single synthesize call.
#
# Run: py .\exports\make-reel-voiceover.py
#       py .\exports\make-reel-voiceover.py --only 6    # re-record one scene only
# Output: exports\vo\vo-s1.wav ... vo-s8.wav  (48 kHz mono)
#
# Written form vs. spoken form (abbreviations stay as they are on screen):
#   Engineer  -> spoken in full, never "Er."
#   B.Tech    -> "B Tech"        (not "B dot tech")
#   M.Tech    -> "M Tech"        (not "M dot tech")
#   IIIT      -> "triple I T"    (letters, not a word)
#   Allahabad -> "Elaahaabaad"   (Ilaa-haa-baad, not "Allah-bad")
#   Bhanzu    -> "Bhaanzu"       (bhaan-zoo)
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

VOICE = "en-IN-NeerjaExpressiveNeural"
SR = 48000
PRE, POST = 0.03, 0.05

# (start_s, scene_end_s) — a line must finish inside its scene.
SLOTS = [(0.25, 6.0), (6.35, 13.0), (13.35, 20.0), (21.0, 29.0),
         (29.6, 39.0), (39.25, 48.0), (48.5, 54.0), (53.9, 60.0)]

# phrase, rate, pitch, gain(dB), pause after (s)
LINES = [
    [   # S1 — grab attention, but not shouted
        ("Your child is not slow.", "+2%", "-2Hz", 0.5, 0.26),
        ("They are just invisible,", "+0%", "-1Hz", 0.0, 0.16),
        ("in a crowded classroom.", "-3%", "-2Hz", -0.5, 0.0),
    ],
    [   # S2 — empathetic, slower
        ("In a room full of students,", "+0%", "-1Hz", 0.0, 0.16),
        ("some questions never get asked.", "-2%", "-2Hz", -0.5, 0.24),
        ("And doubt quietly grows.", "-4%", "-3Hz", -1.0, 0.0),
    ],
    [   # S3 — the quiet worry
        ("You chose a good school.", "-1%", "-1Hz", 0.0, 0.24),
        ("But something still is not clicking,", "+1%", "+0Hz", 0.5, 0.14),
        ("and you can feel it.", "-3%", "-3Hz", -0.5, 0.0),
    ],
    [   # S4 — the turn
        ("Then one moment changes everything.", "+2%", "+2Hz", 1.0, 0.22),
        ("They finally get it.", "-4%", "-1Hz", -0.5, 0.0),
    ],
    [   # S5 — warm, reassuring
        ("It starts with one conversation.", "+0%", "+0Hz", 0.0, 0.24),
        ("We meet your child exactly where they are stuck.", "-2%", "-1Hz", -0.5, 0.0),
    ],
    [   # S6 — credentials: name, ex-SDE at Samsung, IIIT, Bhanzu
        ("Engineer Rohit Vishwakarma, ex S D E at Samsung.", "+8%", "+0Hz", 0.5, 0.15),
        ("B Tech and M Tech, triple I T Elaahaabaad.", "+6%", "-1Hz", 0.0, 0.12),
        ("Maths expert at Bhaanzu.", "+3%", "-2Hz", -0.5, 0.0),
    ],
    [   # S7 — relief
        ("And confidence comes back,", "+0%", "+1Hz", 0.5, 0.16),
        ("one concept at a time.", "-3%", "-2Hz", -0.5, 0.0),
    ],
    [   # S8 — clean, trusted close
        ("Book a free demo.", "+1%", "+1Hz", 0.5, 0.20),
        ("One student. One tutor.", "+0%", "+0Hz", 0.0, 0.18),
        ("WhatsApp me.", "-2%", "+1Hz", 0.5, 0.0),
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
