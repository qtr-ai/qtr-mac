import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
src, out = sys.argv[1], sys.argv[2]
S = 4
base = Image.open(src).convert("RGBA")
W = 1024 * S
# pill geometry in 1024 space
cx, cy, pw, ph = 734, 850, 392, 188
x0, y0, x1, y1 = cx - pw/2, cy - ph/2, cx + pw/2, cy + ph/2
r = ph / 2
layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
ring = 14
shadow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([(x0-ring)*S, (y0-ring+14)*S, (x1+ring)*S, (y1+ring+14)*S], radius=(r+ring)*S, fill=(0, 0, 0, 110))
shadow = shadow.filter(ImageFilter.GaussianBlur(18 * S))
d.rounded_rectangle([(x0-ring)*S, (y0-ring)*S, (x1+ring)*S, (y1+ring)*S], radius=(r+ring)*S, fill=(34, 35, 27, 255))
d.rounded_rectangle([x0*S, y0*S, x1*S, y1*S], radius=r*S, fill=(239, 230, 210, 255))
font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 134 * S)
try:
    font.set_variation_by_name("Heavy")
except Exception:
    try: font.set_variation_by_name("Bold")
    except Exception: pass
text = "DEV"
bbox = d.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text((cx*S - tw/2 - bbox[0], cy*S - th/2 - bbox[1]), text, font=font, fill=(43, 44, 34, 255))
big = base.resize((W, W), Image.LANCZOS)
big = Image.alpha_composite(big, shadow)
big = Image.alpha_composite(big, layer)
big.resize((1024, 1024), Image.LANCZOS).save(out)
