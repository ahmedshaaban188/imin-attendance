# فحص البكسلات البنفسجية في اللقطات — الفيصل النهائي
# البنفسجي الحقيقي: أحمر وأزرق مرتفعان، أخضر منخفض نسبيًا
from PIL import Image
import sys, os

def scan(path):
    img = Image.open(path).convert("RGB")
    img.thumbnail((900, 900))  # تسريع
    w, h = img.size
    px = img.load()
    purple = []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            # بنفسجي/فوشيا: أحمر وأزرق أعلى بوضوح من الأخضر
            if r > 90 and b > 90 and g < min(r, b) - 35:
                saturation_gap = min(r, b) - g
                if saturation_gap > 45:  # مطفي جدًا لا يُحتسب
                    purple.append((x, y, (r, g, b)))
    return purple, img.size

for path in sys.argv[1:]:
    if not os.path.exists(path):
        continue
    hits, size = scan(path)
    name = os.path.basename(path)
    if not hits:
        print(f"[CLEAN] {name}: 0 purple pixels")
    else:
        print(f"[FOUND {len(hits)}] {name} — عينات:")
        for h in hits[:8]:
            print(f"   at({h[0]},{h[1]}) rgb={h[2]}")
