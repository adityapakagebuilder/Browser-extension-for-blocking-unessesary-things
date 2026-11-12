"""Renders the extension icons (a shield with a check mark) into icons/."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
S = 512  # draw large, then downscale for smooth edges

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
# Rounded-square background with a violet vertical gradient.
grad = Image.new("RGBA", (S, S))
for y in range(S):
    t = y / S
    r, g, b = int(124 - 40 * t), int(108 - 50 * t), int(255 - 20 * t)
    ImageDraw.Draw(grad).line([(0, y), (S, y)], fill=(r, g, b, 255))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=118, fill=255)
img.paste(grad, (0, 0), mask)
# Shield
shield = [(256, 92), (392, 140), (392, 262), (256, 420), (120, 262), (120, 140)]
d.polygon(shield, fill=(255, 255, 255, 255))
d.ellipse([120, 180, 392, 420], fill=(255, 255, 255, 255))
# Check mark
d.line([(190, 262), (240, 312), (330, 210)], fill=(98, 82, 245, 255), width=38, joint="curve")
for x, y in [(190, 262), (330, 210)]:
    d.ellipse([x - 19, y - 19, x + 19, y + 19], fill=(98, 82, 245, 255))

OUT.mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
print("icons written")
