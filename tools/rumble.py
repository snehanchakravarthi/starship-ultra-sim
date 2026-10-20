#!/usr/bin/env python3
"""Synthesises an engine rumble track from the per-frame loudness log written
by tools/render.mjs: low brown-noise roar plus sparse crackle, both following
how much thrust is firing and how close it is to the camera.

    python3 tools/rumble.py media/catch-audio.json media/catch.wav
"""
import json
import sys
import wave

import numpy as np

SR = 48000


def lowpass(x, cutoff):
    """Zero-phase one-pole magnitude response, applied in the frequency domain."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec / np.sqrt(1 + (f / cutoff) ** 2), len(x))


def main(src, dst):
    log = json.load(open(src))
    fps = log["fps"]
    loud = np.array([f["loud"] for f in log["frames"]])
    n = int(len(loud) / fps * SR)
    t = np.arange(n) / SR
    env = np.interp(t, np.arange(len(loud)) / fps, loud)
    env = lowpass(env, 3.0)  # engines spool, they don't click
    env = np.sqrt(np.clip(env / max(env.max(), 1e-6), 0, 1))

    rng = np.random.default_rng(7)
    roar = lowpass(rng.standard_normal(n), 90.0)
    roar += 0.5 * lowpass(rng.standard_normal(n), 400.0)
    roar /= np.abs(roar).max()

    # supersonic crackle: random impulses, denser at high thrust
    crackle = np.zeros(n)
    hits = rng.random(n) < (env ** 2) * 0.004
    crackle[hits] = rng.choice([-1.0, 1.0], hits.sum()) * rng.uniform(0.3, 1.0, hits.sum())
    crackle = lowpass(crackle, 2500.0)
    crackle /= max(np.abs(crackle).max(), 1e-6)

    bed = 0.02 * lowpass(rng.standard_normal(n), 200.0) / 0.05  # faint wind so silence isn't dead
    out = env * (0.85 * roar + 0.35 * crackle) + bed
    fade = np.minimum(1, np.minimum(t / 0.5, (t[-1] - t) / 1.5))
    out *= fade
    out = out / np.abs(out).max() * 0.7
    pcm = (out * 32767).astype(np.int16)
    with wave.open(dst, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", dst)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
