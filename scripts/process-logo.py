# ImIn | معالجة اللوجو المرفوع (مونوجرام IMN معدني على خلفية سودا)
# - قص ذكي حول المونوجرام (threshold على السطوع) مع padding متساوي
# - حفظ: public/logo.jpg (كبير) + src/app/icon.png (favicon) + src/app/apple-icon.png
import os
from PIL import Image, ImageEnhance

SRC = "/home/z/my-project/upload/Gemini_Generated_Image_hypsa4hypsa4hyps.jpg"

img = Image.open(SRC).convert("RGB")
W, H = img.size
print(f"Original: {W}x{H}")

# ---- 1) إيجاد حدود المونوجرام الفضي (البكسلات الفاتحة) ----
gray = img.convert("L")
# المونوجرام معدني فاتح، الخلفية داكنة -> threshold 110
bw = gray.point(lambda p: 255 if p > 110 else 0)
bbox = bw.getbbox()
print(f"Monogram bbox: {bbox}")

if bbox:
    l, t, r, b = bbox
    bw_w, bw_h = r - l, b - t
else:
    l, t, r, b = 0, 0, W, H
    bw_w, bw_h = W, H

# ---- 2) قص مربع حول المونوجرام مع padding = 12% من أكبر بُعد ----
pad = int(max(bw_w, bw_h) * 0.12)
cx, cy = (l + r) // 2, (t + b) // 2
side = max(bw_w, bw_h) + pad * 2

# حدود القص مع التثبيت داخل الصورة
left = max(0, min(cx - side // 2, W - side))
top = max(0, min(cy - side // 2, H - side))
# لو side أكبر من الصورة، نستخدم أصغر بُعد
side = min(side, W, H)
left = max(0, min(left, W - side))
top = max(0, min(top, H - side))

cropped = img.crop((left, top, left + side, top + side))
print(f"Cropped square: {cropped.size[0]}x{cropped.size[1]}")

# ---- 3) توحيد الخلفية الداكنة (تنظيف حواف القص) ----
# نرفع التباين قليلاً ونثبت مشبع اللون قليلاً علشان الفضي يبان معدني أكثر
cropped = ImageEnhance.Contrast(cropped).enhance(1.04)
cropped = ImageEnhance.Color(cropped).enhance(0.55)  # تقليل الإشباع -> أكثر أحادي اللون
cropped = ImageEnhance.Sharpness(cropped).enhance(1.15)

# ---- 4) الحفظ ----
import pathlib

pub = pathlib.Path("/home/z/my-project/public")
app = pathlib.Path("/home/z/my-project/src/app")
pub.mkdir(exist_ok=True, parents=True)
app.mkdir(exist_ok=True, parents=True)

big = cropped.resize((640, 640), Image.LANCZOS)
big.save(pub / "logo.jpg", quality=92)
print("Saved public/logo.jpg 640x640")

icon = cropped.resize((512, 512), Image.LANCZOS)
icon.save(app / "icon.png")
print("Saved src/app/icon.png 512x512")

apple = cropped.resize((180, 180), Image.LANCZOS)
apple.save(app / "apple-icon.png")
print("Saved src/app/apple-icon.png 180x180")

# نسخة رمادية كاملة للأماكن اللي تحتاج توحيد تام (اختيارية)
gray_version = cropped.convert("L").convert("RGB")
gray_version.resize((640, 640), Image.LANCZOS).save(pub / "logo-gray.jpg", quality=92)
print("Saved public/logo-gray.jpg 640x640")

print("DONE")
