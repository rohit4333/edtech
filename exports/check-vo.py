"""Check the seven new narration blocks fit inside their script windows.

The visual cuts stay at T = [0, 6, 13, 20, 29, 39, 48, 54, 60], but the new
documentary script has seven VO blocks that do not map 1:1 to the eight scenes.
Each clip must finish inside its script window and before the next block starts.

reel_audio_engine.trim_vo() adds 0.02 s of lead-in when placing a clip, so the
placed speech ends slightly later than the raw speech span measured here.

Run: py .\\exports\\check-vo.py
"""

import wave
from pathlib import Path

import numpy as np

VO = Path(__file__).resolve().parent.parent / "exports" / "vo"

# Visual cuts are unchanged; they are kept here for reference only.
T = [0, 6, 13, 20, 29, 39, 48, 54, 60]

# Script cue-sheet windows (start, end) and the exact placement used by the mix.
VO_START = [0.10, 7.70, 17.90, 23.80, 30.90, 42.20, 49.40]
VO_END = [8.0, 18.0, 24.0, 31.0, 43.0, 50.0, 60.0]
ENGINE_LEAD = 0.02
THRESH = 0.008


def speech_span(path):
    with wave.open(str(path)) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(1)
    idx = np.where(np.abs(a) > THRESH)[0]
    if not len(idx):
        return sr, 0.0, 0.0
    return sr, idx[0] / sr, idx[-1] / sr


def main():
    rows = []
    for n in range(1, 8):
        p = VO / f"vo-s{n}.wav"
        sr, t0, t1 = speech_span(p)
        start = VO_START[n - 1]
        speech = t1 - t0
        ends = start + ENGINE_LEAD + speech
        window_end = VO_END[n - 1]
        next_vo = VO_START[n] if n < 7 else 60.0
        rows.append((n, speech, start, ends, window_end, next_vo))

    print(f"{'clip':5} {'speech':>7} {'placed':>13} {'window end':>11} {'next VO':>8}  fit")
    ok = True
    for n, speech, start, ends, window_end, next_vo in rows:
        limit = min(window_end, next_vo)
        fit = "ok" if ends <= limit else "OVER by %.2fs" % (ends - limit)
        ok = ok and ends <= limit
        print(f"s{n:<4} {speech:6.2f}s {start:6.2f}–{ends:6.2f} {window_end:10.1f} {next_vo:8.2f}  {fit}")

    assert ok, "a narration clip runs past its script window or into the next block"
    print("\nOK — all seven clips sit inside their script windows.")


if __name__ == "__main__":
    main()
