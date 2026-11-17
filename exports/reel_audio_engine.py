# Cinematic score + SFX + narration mixing engine for the 60s reel.
#
# Design notes
#  - 120 BPM grid (0.5 s beat) so every cut lands on a musical pulse.
#  - Section-aware arrangement: sparse tension -> empathy -> build -> lift ->
#    warm flow -> confidence -> resolve -> trusted close.
#  - Felt-piano, bowed-string pads, sub bass and soft organic percussion instead
#    of EDM drums. Reverb send on the music only; narration stays dry and close.
#  - Look-ahead sidechain: music dips smoothly under every spoken phrase and
#    recovers without pumping.
#
# Only audio is produced here. Video files are never touched.

from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, lfilter, resample_poly, sosfilt
from scipy.ndimage import minimum_filter1d, uniform_filter1d

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
TOTAL = 60.0
T = [0, 6, 13, 20, 29, 39, 48, 54, 60]

# ---------------------------------------------------------------- utilities

def to_stereo(x):
    if x.ndim == 1:
        return np.stack([x, x], axis=1)
    if x.shape[1] == 1:
        return np.repeat(x, 2, axis=1)
    return x[:, :2]


def read_wav(path):
    sr, d = wavfile.read(str(path))
    if d.dtype == np.int16:
        d = d.astype(np.float32) / 32768.0
    elif d.dtype == np.int32:
        d = d.astype(np.float32) / 2147483648.0
    elif d.dtype == np.uint8:
        d = (d.astype(np.float32) - 128) / 128.0
    else:
        d = d.astype(np.float32)
    d = to_stereo(d)
    if sr != SR:
        g = np.gcd(sr, SR)
        d = np.stack([resample_poly(d[:, c], SR // g, sr // g) for c in range(2)], axis=1)
    return d


def lpf(x, hz, order=4):
    sos = butter(order, min(hz, SR / 2 - 200), btype="low", fs=SR, output="sos")
    return np.stack([sosfilt(sos, x[:, c]) for c in range(2)], axis=1)


def hpf(x, hz, order=2):
    sos = butter(order, max(20, min(hz, SR / 2 - 200)), btype="high", fs=SR, output="sos")
    return np.stack([sosfilt(sos, x[:, c]) for c in range(2)], axis=1)


def bpf(x, lo, hi, order=2):
    lo = max(20, lo)
    hi = min(SR / 2 - 200, hi)
    if hi <= lo + 40:
        return x
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return np.stack([sosfilt(sos, x[:, c]) for c in range(2)], axis=1)


def norm(x, peak=0.9):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 1e-8 else x


def db(x):
    return 20 * np.log10(max(float(np.sqrt(np.mean(x ** 2))), 1e-9))


def env_fade(n, fin=0.02, fout=0.05):
    e = np.ones(n)
    fi, fo = min(n, int(fin * SR)), min(n, int(fout * SR))
    if fi:
        e[:fi] = np.linspace(0, 1, fi) ** 1.5
    if fo:
        e[-fo:] *= np.linspace(1, 0, fo) ** 1.8
    return e


def place(seg, start_s, length_s=TOTAL):
    n = int(length_s * SR)
    out = np.zeros((n, 2), dtype=np.float32)
    i0 = int(start_s * SR)
    if i0 >= n:
        return out
    if i0 < 0:
        seg, i0 = seg[-i0:], 0
    l = min(len(seg), n - i0)
    if l > 0:
        out[i0:i0 + l] += seg[:l]
    return out


def trim_vo(seg, thresh=0.006, pre=0.02, post=0.10):
    idx = np.where(np.max(np.abs(seg), axis=1) > thresh)[0]
    if not len(idx):
        return seg
    return seg[max(0, idx[0] - int(pre * SR)): idx[-1] + int(post * SR)]


# ---------------------------------------------------------------- instruments

def pad(freqs, start, dur, amp=0.10, attack=1.4, release=2.0, bright=2600, seed=0):
    """Bowed-string style pad: harmonic-rich, slow vibrato, wide stereo."""
    n = int(TOTAL * SR)
    i0 = int(start * SR)
    l = min(int(dur * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    rng = np.random.default_rng(1000 + seed)
    sig = np.zeros((l, 2), dtype=np.float32)
    for j, f in enumerate(sorted(freqs)):
        vib = 1 + 0.0016 * np.sin(2 * np.pi * (0.13 + 0.02 * j) * t + rng.uniform(0, 6.28))
        det = 1 + (j - len(freqs) / 2) * 0.0016
        for ch, d in ((0, 1.0), (1, 1.0019)):
            w = np.zeros(l)
            for h in range(1, 7):
                w += (1.0 / h ** 1.45) * np.sin(2 * np.pi * f * det * d * vib * h * t + rng.uniform(0, 6.28))
            sig[:, ch] += w.astype(np.float32)
    sig /= max(1, len(freqs))
    sig = lpf(sig, bright, 2)
    e = np.ones(l)
    a, r = min(l, int(attack * SR)), min(l, int(release * SR))
    if a:
        e[:a] = np.linspace(0, 1, a) ** 1.5
    if r:
        e[-r:] *= np.linspace(1, 0, r) ** 1.8
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l] = sig * (amp * e)[:, None]
    return out


def piano(freq, at, amp=0.05, dur=2.4, pan=0.0, seed=0):
    """Felt piano: soft hammer, quick attack, warm decay."""
    n = int(TOTAL * SR)
    i0 = int(at * SR)
    l = min(int(dur * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    rng = np.random.default_rng(2000 + seed)
    sig = np.zeros(l)
    for h in range(1, 7):
        d = 1.9 + h * 0.55
        sig += (1.0 / h ** 1.55) * np.sin(2 * np.pi * freq * h * (1 + 0.0007 * h) * t + rng.uniform(0, 6.28)) * np.exp(-t * d)
    atk = max(1, int(0.006 * SR))
    sig[:atk] *= np.linspace(0, 1, atk) ** 1.3
    sig = lpf(np.stack([sig, sig], axis=1), 4200, 2)[:, 0]
    left, right = 1 - max(0.0, pan) * 0.55, 1 + min(0.0, pan) * 0.55
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l, 0] = amp * sig * left
    out[i0:i0 + l, 1] = amp * sig * right
    return out


def sub(freq, start, dur, amp=0.05, attack=0.5, release=1.2):
    n = int(TOTAL * SR)
    i0 = int(start * SR)
    l = min(int(dur * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(2 * np.pi * freq * 2 * t)
    e = np.ones(l)
    a, r = min(l, int(attack * SR)), min(l, int(release * SR))
    if a:
        e[:a] = np.linspace(0, 1, a) ** 1.4
    if r:
        e[-r:] *= np.linspace(1, 0, r) ** 1.6
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l] = (amp * sig * e)[:, None]
    return out


def kick(at, amp=0.20, seed=0):
    n = int(TOTAL * SR)
    i0 = int(at * SR)
    l = min(int(0.75 * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    f = 46 + 74 * np.exp(-t * 24)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8.0)
    click = np.random.default_rng(3000 + seed).standard_normal(l) * np.exp(-t * 220) * 0.18
    sig = np.tanh((body + click) * 1.6)
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l] = (amp * sig)[:, None]
    return out


def rim(at, amp=0.055, seed=0):
    n = int(TOTAL * SR)
    i0 = int(at * SR)
    l = min(int(0.22 * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    rng = np.random.default_rng(4000 + seed)
    body = np.sin(2 * np.pi * 310 * t) * np.exp(-t * 34) * 0.5
    noise = sosfilt(butter(2, 1800, btype="high", fs=SR, output="sos"), rng.standard_normal(l)) * np.exp(-t * 55)
    sig = np.tanh(body + 0.5 * noise)
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l] = (amp * sig)[:, None]
    return out


def shaker(at, amp=0.028, seed=0):
    n = int(TOTAL * SR)
    i0 = int(at * SR)
    l = min(int(0.11 * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    rng = np.random.default_rng(5000 + seed)
    noise = bpf(np.stack([rng.standard_normal(l)] * 2, axis=1), 3800, 10500)[:, 0]
    sig = noise * (1 - np.exp(-t * 900)) * np.exp(-t * 42)
    out = np.zeros((n, 2), dtype=np.float32)
    pan = 0.16 * np.sin(seed * 1.7)
    out[i0:i0 + l, 0] = amp * sig * (1 - pan)
    out[i0:i0 + l, 1] = amp * sig * (1 + pan)
    return out


def whoosh(at, dur=0.62, amp=0.034, up=True):
    n = int(TOTAL * SR)
    i0 = int(max(0, at - dur * 0.5) * SR)
    l = min(int(dur * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    rng = np.random.default_rng(6000 + int(at * 41))
    x = rng.standard_normal((l, 2)).astype(np.float32)
    chunks, cs = 24, max(1, l // 24)
    y = np.zeros_like(x)
    for i in range(chunks):
        a, b = i * cs, (l if i == chunks - 1 else (i + 1) * cs)
        p = i / max(1, chunks - 1)
        c = (420 + 3000 * p) if up else (3400 - 2900 * p)
        y[a:b] = bpf(x[a:b], max(60, c - 600), min(SR / 2 - 300, c + 1400))
    t = np.linspace(0, 1, l)
    e = np.sin(np.pi * t) ** 1.7
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l] = lpf(y, 7200, 2) * (amp * e)[:, None]
    return out


def tick(at, amp=0.020, freq=2100):
    n = int(TOTAL * SR)
    i0 = int(at * SR)
    l = min(int(0.09 * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    sig = np.sin(2 * np.pi * freq * t) * np.exp(-t * 70) + 0.35 * np.sin(2 * np.pi * freq * 2.6 * t) * np.exp(-t * 95)
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l] = (amp * sig)[:, None]
    return out


def chime(at, amp=0.030, base=784.0):
    n = int(TOTAL * SR)
    i0 = int(at * SR)
    l = min(int(2.6 * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    sig = (np.sin(2 * np.pi * base * t) + 0.5 * np.sin(2 * np.pi * base * 1.5 * t)
           + 0.22 * np.sin(2 * np.pi * base * 2 * t)) * np.exp(-t * 2.4)
    atk = max(1, int(0.008 * SR))
    sig[:atk] *= np.linspace(0, 1, atk)
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l, 0] = amp * sig
    out[i0:i0 + l, 1] = amp * np.roll(sig, int(0.011 * SR))
    return out


def impact(at, amp=0.07):
    n = int(TOTAL * SR)
    i0 = int(at * SR)
    l = min(int(1.4 * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    t = np.arange(l) / SR
    hit = np.sin(2 * np.pi * 52 * t * np.exp(-t * 0.5)) * np.exp(-t * 6.0)
    rng = np.random.default_rng(7000 + int(at * 17))
    click = rng.standard_normal(l) * np.exp(-t * 60) * 0.12
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l] = (amp * np.tanh(hit + click))[:, None]
    return out


def riser(end_at, dur=1.3, amp=0.045):
    n = int(TOTAL * SR)
    i0 = int(max(0, end_at - dur) * SR)
    l = min(int(dur * SR), n - i0)
    if l <= 0:
        return np.zeros((n, 2), dtype=np.float32)
    rng = np.random.default_rng(8000 + int(end_at * 13))
    x = rng.standard_normal((l, 2)).astype(np.float32)
    chunks, cs = 26, max(1, l // 26)
    y = np.zeros_like(x)
    for i in range(chunks):
        a, b = i * cs, (l if i == chunks - 1 else (i + 1) * cs)
        p = i / max(1, chunks - 1)
        lo = 300 + 2800 * p
        y[a:b] = bpf(x[a:b], lo, lo + 900)
    t = np.linspace(0, 1, l)
    y *= (amp * (t ** 2.1))[:, None]
    out = np.zeros((n, 2), dtype=np.float32)
    out[i0:i0 + l] = y
    return out


# ---------------------------------------------------------------- reverb / dynamics

def make_ir(dur=1.35, seed=11, damp=5200):
    l = int(dur * SR)
    t = np.arange(l) / SR
    rng = np.random.default_rng(seed)
    ir = rng.standard_normal((l, 2)) * np.exp(-t * 3.1)[:, None]
    for d, g in ((0.021, 0.5), (0.037, 0.35), (0.055, 0.22)):
        i = int(d * SR)
        if i < l:
            ir[i:i + 200] += g * rng.standard_normal((min(200, l - i), 2)) * np.exp(-np.arange(min(200, l - i)) / 60)[:, None]
    ir = lpf(ir.astype(np.float32), damp, 2)
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True)) + 1e-9
    return ir


def convolve_reverb(x, ir, wet=0.12, predelay_ms=18):
    pre = np.zeros((int(predelay_ms * SR / 1000), 2), dtype=np.float32)
    dry = np.concatenate([pre, x], axis=0)
    wet_sig = np.stack([fftconvolve(dry[:, c], ir[:, c])[:len(dry)] for c in range(2)], axis=1)
    wet_sig = hpf(wet_sig.astype(np.float32), 180)
    return wet_sig[:len(x)] * wet


def bus_compress(x, thresh_db=-20.0, ratio=2.2, makeup_db=3.5, win_ms=40):
    env = uniform_filter1d(np.max(np.abs(x), axis=1), size=max(1, int(SR * win_ms / 1000)), mode="nearest")
    th = 10 ** (thresh_db / 20.0)
    over = np.maximum(env / th, 1e-6)
    gain = np.ones_like(env)
    m = over > 1.0
    gain[m] = np.power(over[m], 1.0 / ratio - 1.0)
    return (x * (gain * 10 ** (makeup_db / 20.0))[:, None]).astype(np.float32)


def lufs(x):
    """Integrated loudness per ITU-R BS.1770-4 (K-weighting, 400 ms blocks,
    absolute -70 LUFS gate + relative -10 dB gate)."""
    x = to_stereo(x) if x.ndim == 1 else x
    b1, a1 = ([1.53512485958697, -2.69169618940638, 1.19839281085285],
              [1.0, -1.69065929318241, 0.73248077421585])
    b2, a2 = ([1.0, -2.0, 1.0],
              [1.0, -1.99004745483398, 0.99007225036621])
    y = np.stack([lfilter(b2, a2, lfilter(b1, a1, x[:, c])) for c in range(2)], axis=1)

    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if len(y) < blk:
        z = np.array([np.mean(y ** 2, axis=0).sum()])
    else:
        z = np.array([np.mean(y[i:i + blk] ** 2, axis=0).sum()
                      for i in range(0, len(y) - blk + 1, hop)])
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-12))
    keep = l > -70.0
    if not np.any(keep):
        return -99.0
    rel = -0.691 + 10 * np.log10(np.mean(z[keep])) - 10.0
    keep &= l > rel
    return float(-0.691 + 10 * np.log10(np.mean(z[keep])))


# ---------------------------------------------------------------- sidechain

def duck_gain(voice, depth_db=9.5):
    """Smooth look-ahead ducking envelope from the narration stem."""
    v = np.max(np.abs(voice), axis=1)
    env = uniform_filter1d(v, size=int(0.05 * SR), mode="nearest")
    env = uniform_filter1d(env, size=int(0.18 * SR), mode="nearest")
    ref = np.percentile(env[env > 1e-4], 90) if np.any(env > 1e-4) else 1.0
    amt = np.clip(env / (ref * 0.75 + 1e-9), 0.0, 1.0) ** 0.85
    amt = uniform_filter1d(amt, size=int(0.26 * SR), mode="nearest")
    return (10 ** (-depth_db * amt / 20.0)).astype(np.float32)[:, None]


def soft_limit(x, ceiling_db=-2.0, look_ms=6.0):
    """Look-ahead peak limiter: transparent, no clipped transients."""
    ceiling = 10 ** (ceiling_db / 20.0)
    env = np.max(np.abs(x), axis=1)
    g = np.minimum(1.0, ceiling / np.maximum(env, 1e-9))
    look = max(1, int(SR * look_ms / 1000))
    g = minimum_filter1d(g, size=2 * look + 1, mode="nearest")   # look ahead
    g = uniform_filter1d(g, size=look + 1, mode="nearest")       # soft attack
    g = np.minimum(g, 1.0)
    return (x * g[:, None]).astype(np.float32)


def master(x, target_lufs=-14.0, ceiling_db=-2.0):
    """Loudness-match to a social-safe target, then hold the peak ceiling."""
    x = x.astype(np.float32)
    for _ in range(4):
        delta = target_lufs - lufs(x)
        if abs(delta) < 0.15:
            break
        x = x * (10 ** (delta / 20.0))
        x = soft_limit(x, ceiling_db)
    return soft_limit(x, ceiling_db)


# ---------------------------------------------------------------- score

A1, B1, D2, E2, F2, G2, A2, Bb2, C3, D3, E3, F3, G3, A3, Bb3, C4, D4, E4, F4, G4, A4, C5, E5 = (
    55.00, 61.74, 73.42, 82.41, 87.31, 98.00, 110.00, 116.54, 130.81, 146.83, 164.81,
    174.61, 196.00, 220.00, 233.08, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00,
    523.25, 659.25)


def build_score():
    n = int(TOTAL * SR)
    bed = np.zeros((n, 2), dtype=np.float32)
    perc = np.zeros((n, 2), dtype=np.float32)
    sfx = np.zeros((n, 2), dtype=np.float32)

    def add_bus(bus, seg, g=1.0):
        bus += seg * g

    # ---- S1 (0-6) : attention, restrained tension
    add_bus(bed, pad([D2, A2, D3, F3], 0.0, 6.6, amp=0.11, attack=0.9, release=1.2, bright=1900, seed=1))
    add_bus(bed, pad([E4], 0.6, 5.4, amp=0.020, attack=2.2, release=1.6, bright=3200, seed=2))
    add_bus(bed, sub(D2 / 2, 0.0, 6.4, amp=0.045, attack=0.8, release=1.0))
    add_bus(bed, piano(A4, 0.30, amp=0.032, dur=3.2, pan=-0.18, seed=3))
    add_bus(bed, piano(F4, 2.55, amp=0.026, dur=3.0, pan=0.15, seed=4))
    for k, at in enumerate([0.0, 1.0, 2.0, 3.0, 4.0, 5.0]):
        add_bus(perc, kick(at, 0.17 if k else 0.20, seed=k))
    add_bus(perc, rim(2.5, 0.028, 1))
    add_bus(sfx, impact(0.0, 0.055))
    add_bus(sfx, riser(6.0, 1.2, 0.045))

    # ---- S2 (6-13) : empathy, no drums, warm and slow
    add_bus(bed, pad([Bb2 / 2, F2, Bb2, D3, A3], 5.9, 7.8, amp=0.105, attack=1.8, release=1.8, bright=2100, seed=5))
    add_bus(bed, sub(Bb2 / 2, 6.0, 7.4, amp=0.038, attack=1.2, release=1.4))
    for at, f, p, s in [(6.55, F4, -0.14, 6), (8.05, D4, 0.10, 7), (9.55, Bb3, -0.06, 8),
                        (11.05, A3, 0.14, 9), (12.35, F4, -0.10, 10)]:
        add_bus(bed, piano(f, at, amp=0.040, dur=3.4, pan=p, seed=s))
    # no drums here — the empathy beat stays breathing, the voice carries it
    add_bus(sfx, whoosh(6.0, 0.7, 0.028, True))

    # ---- S3 (13-20) : the weight, slow build
    add_bus(bed, pad([F2, C3, F3, A3, E4], 12.8, 7.6, amp=0.115, attack=1.4, release=1.5, bright=2300, seed=11))
    add_bus(bed, sub(F2 / 2, 13.0, 7.0, amp=0.042, attack=0.9, release=1.2))
    for at, f, p, s in [(13.4, C4, -0.12, 12), (14.9, A3, 0.08, 13), (16.4, F4, -0.04, 14),
                        (17.9, E4, 0.12, 15), (19.2, D4, -0.08, 16)]:
        add_bus(bed, piano(f, at, amp=0.042, dur=2.8, pan=p, seed=s))
    for k, at in enumerate([13.5, 15.5, 17.5, 19.5]):
        add_bus(perc, kick(at, 0.14, seed=k + 20))
    for k, at in enumerate([14.5, 16.5, 18.5]):
        add_bus(perc, rim(at, 0.045, seed=k + 30))
    for k in range(int(6.5 * 2)):
        add_bus(perc, shaker(13.5 + k * 0.5, 0.016, seed=k + 40))
    add_bus(sfx, whoosh(13.0, 0.6, 0.027, True))
    add_bus(sfx, riser(20.0, 1.4, 0.05))

    # ---- S4 (20-29) : lift — the turn
    add_bus(bed, pad([Bb2, F3, Bb3, D4, A3], 19.6, 9.8, amp=0.12, attack=1.1, release=2.0, bright=2900, seed=21))
    add_bus(bed, pad([D4, F4, A4], 20.2, 8.8, amp=0.035, attack=1.8, release=2.0, bright=3600, seed=22))
    add_bus(bed, sub(Bb2 / 2, 20.0, 9.2, amp=0.05, attack=0.6, release=1.4))
    for at, f, p, s in [(20.6, F4, -0.16, 23), (21.9, A4, 0.12, 24), (23.2, Bb3, -0.08, 25),
                        (24.5, D4, 0.16, 26), (25.8, F4, -0.12, 27), (27.1, A4, 0.10, 28), (28.2, G4, -0.06, 29)]:
        add_bus(bed, piano(f, at, amp=0.040, dur=2.8, pan=p, seed=s))
    # gentle arpeggio sparkle
    for k, at in enumerate(np.arange(20.5, 28.9, 0.5)):
        f = [Bb3, D4, F4, A4][k % 4]
        add_bus(bed, piano(f * 2, at, amp=0.011, dur=1.2, pan=0.28 * (-1 if k % 2 else 1), seed=60 + k))
    for k, at in enumerate(np.arange(20.0, 29.0, 1.0)):
        add_bus(perc, kick(at, 0.17, seed=70 + k))
    for k, at in enumerate([20.5, 22.5, 24.5, 26.5, 28.5]):
        add_bus(perc, rim(at, 0.055, seed=80 + k))
    for k in range(int(9 * 4)):
        add_bus(perc, shaker(20.25 + k * 0.25, 0.013, seed=90 + k))
    add_bus(sfx, impact(20.0, 0.062))
    add_bus(sfx, whoosh(20.0, 0.8, 0.034, True))

    # ---- S5 (29-39) : warm flow, half-time
    add_bus(bed, pad([G2, D3, Bb3, F4, A3], 28.7, 10.6, amp=0.115, attack=1.3, release=1.8, bright=2500, seed=31))
    add_bus(bed, sub(G2 / 2, 29.0, 9.8, amp=0.044, attack=0.7, release=1.6))
    for at, f, p, s in [(29.5, D4, -0.12, 32), (31.0, F4, 0.10, 33), (32.5, A4, -0.06, 34),
                        (34.0, Bb3, 0.12, 35), (35.5, D4, -0.10, 36), (37.0, F4, 0.08, 37), (38.2, A3, -0.04, 38)]:
        add_bus(bed, piano(f, at, amp=0.038, dur=3.0, pan=p, seed=s))
    for k, at in enumerate([29.5, 31.5, 33.5, 35.5, 37.5]):
        add_bus(perc, kick(at, 0.13, seed=100 + k))
    for k, at in enumerate([30.5, 32.5, 34.5, 36.5]):
        add_bus(perc, rim(at, 0.040, seed=110 + k))
    for k in range(int(10 * 2)):
        add_bus(perc, shaker(29.25 + k * 0.5, 0.014, seed=120 + k))
    add_bus(sfx, whoosh(29.0, 0.6, 0.026, True))

    # ---- S6 (39-48) : confident, clear — the tutor
    add_bus(bed, pad([F2, C3, F3, A3, G4], 38.6, 10.2, amp=0.125, attack=0.9, release=2.0, bright=2800, seed=41))
    add_bus(bed, pad([C4, F4, A4], 39.4, 9.0, amp=0.032, attack=1.4, release=2.2, bright=3800, seed=42))
    add_bus(bed, sub(F2 / 2, 39.0, 9.2, amp=0.05, attack=0.5, release=1.6))
    for at, f, p, s in [(39.9, A3, -0.14, 43), (41.3, C4, 0.12, 44), (42.7, F4, -0.08, 45),
                        (44.1, A4, 0.10, 46), (45.5, G4, -0.12, 47), (46.9, F4, 0.06, 48)]:
        add_bus(bed, piano(f, at, amp=0.040, dur=2.8, pan=p, seed=s))
    for k, at in enumerate(np.arange(39.0, 48.0, 1.0)):
        add_bus(perc, kick(at, 0.075, seed=130 + k))
    for k, at in enumerate([39.5, 41.5, 43.5, 45.5, 47.5]):
        add_bus(perc, rim(at, 0.030, seed=140 + k))
    for k in range(int(9 * 2)):
        add_bus(perc, shaker(39.25 + k * 0.5, 0.013, seed=150 + k))
    add_bus(sfx, whoosh(39.0, 0.7, 0.028, True))
    add_bus(sfx, impact(39.0, 0.042))
    add_bus(sfx, tick(40.58, 0.018, 2100))
    add_bus(sfx, tick(41.20, 0.016, 2500))

    # ---- S7 (48-54) : bright resolve
    add_bus(bed, pad([C3, G3, C4, E4, G4], 47.7, 6.8, amp=0.115, attack=0.7, release=1.6, bright=3200, seed=51))
    add_bus(bed, sub(C3 / 2, 48.0, 6.0, amp=0.042, attack=0.5, release=1.4))
    for at, f, p, s in [(48.3, E4, -0.10, 52), (49.5, G4, 0.12, 53), (50.7, C5, -0.06, 54), (52.1, E5, 0.08, 55)]:
        add_bus(bed, piano(f, at, amp=0.034, dur=2.4, pan=p, seed=s))
    for k, at in enumerate(np.arange(48.0, 54.0, 1.0)):
        add_bus(perc, kick(at, 0.13, seed=160 + k))
    for k, at in enumerate([49.0, 51.0, 53.0]):
        add_bus(perc, rim(at, 0.042, seed=170 + k))
    add_bus(sfx, whoosh(48.0, 0.65, 0.027, True))
    add_bus(sfx, chime(48.15, 0.020, 1046.5))

    # ---- S8 (54-60) : trusted close
    add_bus(bed, pad([F2, C3, F3, A3, C4, F4], 53.6, 7.4, amp=0.125, attack=0.5, release=3.4, bright=3000, seed=61))
    add_bus(bed, sub(F2 / 2, 54.0, 6.6, amp=0.05, attack=0.4, release=2.0))
    for at, f, p, s in [(54.6, A4, -0.10, 62), (55.8, C5, 0.10, 63), (57.0, F4, -0.06, 64)]:
        add_bus(bed, piano(f, at, amp=0.036, dur=3.4, pan=p, seed=s))
    for k, at in enumerate([54.0, 56.0, 58.0]):
        add_bus(perc, kick(at, 0.14, seed=180 + k))
    for k, at in enumerate([55.0, 57.0, 59.0]):
        add_bus(perc, rim(at, 0.040, seed=190 + k))
    add_bus(sfx, whoosh(54.0, 0.7, 0.026, True))
    add_bus(sfx, impact(54.0, 0.040))
    add_bus(sfx, chime(55.6, 0.028, 784.0))
    add_bus(sfx, tick(56.35, 0.012, 2600))

    return bed, perc, sfx


# ---------------------------------------------------------------- narration

def process_vo(seg):
    """Close, warm, de-essed narration with gentle glue compression."""
    x = hpf(seg, 80)
    x = lpf(x, 15000)
    warm = bpf(x, 110, 240) * 0.12
    mud = bpf(x, 300, 480) * 0.14
    pres = bpf(x, 2200, 4600) * 0.15
    air = bpf(x, 6800, 11500) * 0.05
    x = x + warm - mud + pres + air
    x = x - 0.10 * bpf(x, 6200, 9200)          # tame sibilance
    # program-dependent compression (slow, musical)
    env = uniform_filter1d(np.max(np.abs(x), axis=1), size=int(0.012 * SR), mode="nearest")
    th = 10 ** (-24 / 20)
    over = np.maximum(env / th, 1e-6)
    gain = np.ones_like(env)
    m = over > 1.0
    gain[m] = np.power(over[m], 1 / 2.6 - 1.0)
    g = uniform_filter1d(gain, size=int(0.09 * SR), mode="nearest")
    x = (x * g[:, None]).astype(np.float32)
    x = np.tanh(x * 1.25) / np.tanh(1.25)
    return norm(x, 0.84).astype(np.float32)


VO_MAP = [(1, 0.25), (2, 6.35), (3, 13.35), (4, 21.0),
          (5, 29.6), (6, 39.5), (7, 48.5), (8, 53.9)]


def build_mix():
    n = int(TOTAL * SR)
    bed, perc, sfx = build_score()

    music = bed + perc * 0.60 + sfx * 2.7
    music = hpf(music, 32)
    music *= 1.80                                        # present bed, not wallpaper
    music = music - 0.10 * bpf(music, 180, 430)          # clear low-mid buildup
    music = music + 0.045 * bpf(music, 7500, 14000)      # air
    music = music + convolve_reverb(music, make_ir(), wet=0.10)
    music = bus_compress(music, -21.0, 2.0, 3.0, 45)

    voice = np.zeros((n, 2), dtype=np.float32)
    for idx, start in VO_MAP:
        vp = ROOT / "exports" / "vo" / f"vo-s{idx}.wav"
        if not vp.exists():
            continue
        seg = process_vo(trim_vo(read_wav(vp)))
        voice += place(seg * 1.18, start)

    # narrated bed: ducks smoothly under every spoken phrase, with a little
    # extra low-end dip so kicks/sub never mask speech intelligibility
    duck = duck_gain(voice, depth_db=7.5)
    low = lpf(music, 170, 4)
    high = (music - low).astype(np.float32)
    bed_out = (low * duck_gain(voice, depth_db=13.0) + high * duck).astype(np.float32)

    # music-only deliverable: same score, no ducking (nothing to duck around)
    music_out = music.copy()

    # bed tail fade only — narration stays clean to the last word
    head, tail = int(0.15 * SR), int(3.0 * SR)
    for m in (bed_out, music_out):
        m[:head] *= np.linspace(0, 1, head)[:, None]
        m[-tail:] *= (np.linspace(1, 0, tail) ** 1.7)[:, None]

    mix = bed_out + voice
    vf = int(0.10 * SR)
    mix[-vf:] *= np.linspace(1, 0.985, vf)[:, None]

    # master: glue, transparent limiting, -14 LUFS / -2 dBFS sample peak
    mix = np.tanh(mix * 1.05) / np.tanh(1.05)
    mix = master(mix, target_lufs=-14.0, ceiling_db=-2.0)
    music_out = norm(music_out, 0.89)
    narration = norm(voice, 0.90)
    return mix.astype(np.float32), music_out.astype(np.float32), narration.astype(np.float32)
