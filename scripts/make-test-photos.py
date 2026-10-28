#!/usr/bin/env python3
"""توليد صور اختبار واضحة (صورة شخصية + بطاقة وش + بطاقة ظهر) لاختبار التسجيل"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/home/z/my-project/tests/fixtures"
os.makedirs(OUT, exist_ok=True)

FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
FONT_SMALL = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)

def make(path, size, bg, fg, label, sub=""):
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    # شبكة خفيفة لتقييم الوضوح
    for x in range(0, size[0], 40):
        d.line([(x, 0), (x, size[1])], fill=fg, width=1)
    for y in range(0, size[1], 40):
        d.line([(0, y), (size[0], y)], fill=fg, width=1)
    # دائرة "وجه" للصورة الشخصية
    if "personal" in path:
        cx, cy, r = size[0] // 2, size[1] // 2, 160
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fg)
    d.text((30, 30), label, font=FONT, fill=fg)
    if sub:
        d.text((30, 110), sub, font=FONT_SMALL, fill=fg)
    d.rectangle([0, 0, size[0] - 1, size[1] - 1], outline=fg, width=6)
    img.save(path, quality=95)
    print(f"OK {path} ({os.path.getsize(path) // 1024} KB)")

# ألوان محايدة أحادية (تتوافق مع هوية ImIn الأبيض/الأسود)
make(f"{OUT}/personal-photo.jpg", (900, 1100), (238, 238, 236), (55, 57, 62),
     "PERSONAL PHOTO", "AHMED SHABAN - TEST")
make(f"{OUT}/id-front.jpg", (1400, 900), (236, 236, 234), (35, 36, 40),
     "ID CARD FRONT", "EGYPT NATIONAL ID - FRONT SIDE")
make(f"{OUT}/id-back.jpg", (1400, 900), (245, 245, 243), (70, 72, 77),
     "ID CARD BACK", "EGYPT NATIONAL ID - BACK SIDE")
print("DONE")
