#!/usr/bin/env python3
"""Generate app icons (clock + check) for the PWA."""
import math
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

BG1 = (59, 130, 246)   # blue
BG2 = (37, 99, 235)    # deeper blue
WHITE = (255, 255, 255)
GREEN = (34, 197, 94)


def rounded_bg(size, radius_ratio=0.22, pad=0):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    # simple vertical gradient background
    grad = Image.new("RGBA", (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / max(1, size - 1)
        col = tuple(int(BG1[i] + (BG2[i] - BG1[i]) * t) for i in range(3)) + (255,)
        gd.line([(0, y), (size, y)], fill=col)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([pad, pad, size - 1 - pad, size - 1 - pad], radius=r, fill=255)
    img.paste(grad, (0, 0), mask)
    return img


def draw_clock(img):
    size = img.size[0]
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    R = size * 0.30
    lw = max(2, int(size * 0.045))
    # clock ring
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=WHITE, width=lw)
    # hour ticks
    for k in range(12):
        a = math.radians(k * 30 - 90)
        r1 = R * 0.82
        r2 = R * 0.95
        x1, y1 = cx + r1 * math.cos(a), cy + r1 * math.sin(a)
        x2, y2 = cx + r2 * math.cos(a), cy + r2 * math.sin(a)
        d.line([(x1, y1), (x2, y2)], fill=WHITE, width=max(1, int(size * 0.012)))
    # hands
    d.line([(cx, cy), (cx, cy - R * 0.55)], fill=WHITE, width=lw)                    # minute up
    d.line([(cx, cy), (cx + R * 0.42, cy + R * 0.05)], fill=WHITE, width=lw)         # hour right
    d.ellipse([cx - lw, cy - lw, cx + lw, cy + lw], fill=WHITE)
    # check badge bottom-right
    br = size * 0.20
    bx, by = cx + R * 0.72, cy + R * 0.72
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=GREEN, outline=WHITE, width=max(1, int(size * 0.02)))
    cw = max(2, int(size * 0.045))
    d.line([(bx - br * 0.45, by), (bx - br * 0.05, by + br * 0.4)], fill=WHITE, width=cw)
    d.line([(bx - br * 0.05, by + br * 0.4), (bx + br * 0.5, by - br * 0.4)], fill=WHITE, width=cw)


def make(size, maskable=False):
    pad = int(size * 0.09) if maskable else 0  # safe zone padding for maskable
    img = rounded_bg(size, radius_ratio=0.5 if maskable else 0.22)
    draw_clock(img)
    return img


for s in (152, 167, 180, 192, 512):
    make(s).save(os.path.join(OUT, f"icon-{s}.png"))
make(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
print("icons written to", os.path.abspath(OUT))
