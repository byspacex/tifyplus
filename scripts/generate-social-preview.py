"""Build the repository and social preview with Unicode-safe typography.

Run: python scripts/generate-social-preview.py tr
     python scripts/generate-social-preview.py en
Requires Pillow. The output is deliberately generated from code so Turkish
copy remains exact on every platform, including Windows PowerShell 5.
"""

from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LANG = sys.argv[1] if len(sys.argv) > 1 else "tr"
if LANG not in ("tr", "en"):
    raise SystemExit("Use tr or en")
OUT = ROOT / "public" / "brand" / f"tify-plus-social-{LANG}-1200x630.png"
COPY = {
    "tr": ["MÜZİK KÜTÜPHANEN / 2026", "KİŞİSEL MÜZİK STÜDYOSU", "Listelerini", "yeniden keşfet.", "İncele. Karşılaştır. Kontrol sende kalsın.", "Spotify arşivin için tek çalışma alanı.", "KÜTÜPHANE HARİTASI", "Çalma listesi", "Örnek görünüm", "ORTAK PARÇALARI GÖR", "BAĞIMSIZ ÜRÜN"],
    "en": ["YOUR MUSIC LIBRARY / 2026", "PERSONAL MUSIC STUDIO", "Your playlists,", "in a new light.", "Explore. Compare. Stay in control.", "One workspace for your Spotify library.", "LIBRARY MAP", "Playlist", "Preview", "FIND SHARED TRACKS", "INDEPENDENT PRODUCT"],
}[LANG]
W, H = 1200, 630
INK = (7, 12, 16)
SURFACE = (18, 28, 32)
WHITE = (240, 246, 241)
MUTED = (151, 169, 164)
LIME = (183, 255, 70)
CYAN = (103, 226, 209)


def font(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


if LANG == "en":
    # The global edition uses a lighter, editorial cover and a different
    # composition from the Turkish signal dashboard.
    image = Image.new("RGB", (W, H), (235, 240, 232))
    draw = ImageDraw.Draw(image)
    dark = (18, 37, 31)
    green = (33, 105, 71)
    subtle = (78, 101, 91)
    for x in range(52, W, 98):
        draw.line((x, 0, x, H), fill=(216, 225, 214), width=1)
    draw.line((64, 91, 1136, 91), fill=(148, 170, 152), width=2)
    draw.line((64, 555, 1136, 555), fill=(148, 170, 152), width=2)
    mark = Image.open(ROOT / "public" / "brand" / "tify-plus-mark-512.png").convert("RGBA")
    mark.thumbnail((54, 54), Image.Resampling.LANCZOS)
    image.paste(mark, (66, 24), mark)
    draw.text((132, 36), "TIFY PLUS", font=font(21, True), fill=dark)
    draw.text((939, 40), "GLOBAL EDITION", font=font(14, True), fill=green)
    draw.ellipse((33, 134, 470, 571), fill=(28, 65, 48), outline=(75, 121, 85), width=3)
    draw.ellipse((85, 186, 418, 519), outline=(72, 121, 89), width=2)
    draw.ellipse((139, 240, 364, 465), outline=(72, 121, 89), width=2)
    draw.ellipse((190, 291, 313, 414), fill=(165, 247, 90))
    draw.ellipse((231, 332, 272, 373), fill=(28, 65, 48))
    draw.rounded_rectangle((270, 162, 520, 240), radius=13, fill=(246, 250, 242), outline=(153, 181, 155), width=2)
    draw.rounded_rectangle((322, 438, 553, 516), radius=13, fill=(246, 250, 242), outline=(153, 181, 155), width=2)
    draw.text((289, 179), "PLAYLIST A", font=font(18, True), fill=dark)
    draw.text((341, 455), "PLAYLIST B", font=font(18, True), fill=dark)
    draw.text((590, 157), "YOUR PERSONAL MUSIC STUDIO", font=font(17, True), fill=green)
    draw.text((583, 218), "Rediscover", font=font(80, True), fill=dark)
    draw.text((583, 309), "your playlists.", font=font(71, True), fill=green)
    draw.text((589, 429), "Find repeats. See connections.", font=font(25), fill=dark)
    draw.text((589, 466), "Keep the final say over every change.", font=font(21), fill=subtle)
    draw.text((67, 574), "tifyplus.com", font=font(22, True), fill=green)
    draw.text((928, 577), "INDEPENDENT PRODUCT", font=font(13, True), fill=subtle)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, optimize=True)
    print(OUT)
    raise SystemExit(0)


image = Image.new("RGB", (W, H), INK)
gradient = Image.new("RGB", (W, H))
pixels = gradient.load()
for y in range(H):
    for x in range(W):
        glow = max(0, 1 - (((x - 1080) / 700) ** 2 + ((y - 60) / 640) ** 2) ** .5)
        pixels[x, y] = (7 + int(8 * glow), 12 + int(20 * glow), 16 + int(17 * glow))
image = gradient
draw = ImageDraw.Draw(image)

# An editorial grid gives the brand a repeatable visual language.
for x in range(58, W, 80):
    draw.line((x, 0, x, H), fill=(19, 34, 36), width=1)
for y in range(46, H, 80):
    draw.line((0, y, W, y), fill=(19, 34, 36), width=1)
draw.line((64, 88, 1136, 88), fill=(77, 104, 95), width=1)
draw.line((64, 554, 1136, 554), fill=(77, 104, 95), width=1)

mark = Image.open(ROOT / "public" / "brand" / "tify-plus-mark-512.png").convert("RGBA")
mark.thumbnail((54, 54), Image.Resampling.LANCZOS)
image.paste(mark, (65, 23), mark)
draw.text((132, 35), "TIFY PLUS", font=font(21, True), fill=WHITE)
draw.text((888, 38), COPY[0], font=font(14, True), fill=MUTED)

draw.text((66, 137), COPY[1], font=font(18, True), fill=CYAN)
draw.text((61, 195), COPY[2], font=font(82, True), fill=WHITE)
draw.text((61, 294), COPY[3], font=font(76 if LANG == "tr" else 72, True), fill=LIME)
draw.text((67, 421), COPY[4], font=font(26), fill=WHITE)
draw.text((67, 466), COPY[5], font=font(21), fill=MUTED)

# A compact, recognisable application preview rather than generic decoration.
panel = (807, 123, 1135, 518)
draw.rounded_rectangle(panel, radius=18, fill=SURFACE, outline=(65, 92, 85), width=2)
draw.text((829, 145), COPY[6], font=font(14, True), fill=CYAN)
draw.ellipse((1084, 148, 1096, 160), fill=LIME)
draw.line((829, 180, 1113, 180), fill=(59, 80, 75), width=1)
for i, (name, tone) in enumerate((("Çalma listesi A", LIME), ("Çalma listesi B", CYAN))):
    top = 204 + i * 110
    draw.rounded_rectangle((829, top, 1113, top + 92), radius=10, fill=(29, 43, 45))
    draw.rounded_rectangle((842, top + 13, 908, top + 79), radius=7, fill=(35, 68, 55) if i == 0 else (27, 65, 68))
    for bar, height in enumerate((14, 31, 22, 39, 19)):
        bx = 855 + bar * 9
        draw.rounded_rectangle((bx, top + 58 - height // 2, bx + 5, top + 58 + height // 2), radius=2, fill=tone)
    draw.text((922, top + 23), f"{COPY[7]} {'A' if i == 0 else 'B'}", font=font(18, True), fill=WHITE)
    draw.text((922, top + 53), COPY[8], font=font(13), fill=MUTED)
draw.rounded_rectangle((829, 444, 1113, 491), radius=8, fill=(56, 83, 51))
draw.text((844, 456), COPY[9], font=font(16, True), fill=LIME)
draw.text((67, 571), "tifyplus.com", font=font(22, True), fill=LIME)
draw.text((902, 575), COPY[10], font=font(13, True), fill=MUTED)

OUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUT, optimize=True)
image.save(ROOT / "public" / "brand" / "tify-plus-social-1200x630.png", optimize=True)
print(OUT)
