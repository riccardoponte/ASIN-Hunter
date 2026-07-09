from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 512  # supersample master size
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded black tile
radius = int(S * 0.22)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=(6, 12, 9, 255))

# subtle green radial glow from center-bottom
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([S * 0.12, S * 0.22, S * 0.88, S * 0.98],
           fill=(0, 230, 118, 90))
glow = glow.filter(ImageFilter.GaussianBlur(S * 0.10))
img = Image.alpha_composite(img, glow)
d = ImageDraw.Draw(img)

# thin green border
d.rounded_rectangle([3, 3, S - 4, S - 4], radius=radius - 2,
                    outline=(0, 230, 118, 150), width=int(S * 0.012))

# euro glyph
try:
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", int(S * 0.62))
except Exception:
    font = ImageFont.truetype("arialbd.ttf", int(S * 0.62))

glyph = "\u20ac"
bbox = d.textbbox((0, 0), glyph, font=font)
gw = bbox[2] - bbox[0]
gh = bbox[3] - bbox[1]
gx = (S - gw) / 2 - bbox[0]
gy = (S - gh) / 2 - bbox[1] - S * 0.01

# glow behind glyph
gl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gld = ImageDraw.Draw(gl)
gld.text((gx, gy), glyph, font=font, fill=(57, 255, 20, 255))
gl = gl.filter(ImageFilter.GaussianBlur(S * 0.03))
img = Image.alpha_composite(img, gl)
d = ImageDraw.Draw(img)

# crisp glyph on top with vertical gradient (fluo green -> lime)
tw = Image.new("RGBA", (S, S), (0, 0, 0, 0))
twd = ImageDraw.Draw(tw)
twd.text((gx, gy), glyph, font=font, fill=(0, 230, 118, 255))
grad = Image.new("L", (1, S))
for y in range(S):
    t = y / S
    grad.putpixel((0, y), int(255 * (0.65 + 0.35 * t)))
grad = grad.resize((S, S))
r, g, b, a = tw.split()
# tint: mix green (#00e676) at top to lime (#76ff03) at bottom
top = (0, 230, 118)
bot = (118, 255, 3)
tint = Image.new("RGBA", (S, S))
tp = tint.load()
for y in range(S):
    t = y / S
    col = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    for x in range(S):
        tp[x, y] = col + (255,)
tw = Image.composite(tint, Image.new("RGBA", (S, S), (0, 0, 0, 0)), a)
img = Image.alpha_composite(img, tw)

# export sizes
for sz in (16, 32, 48, 128, 256):
    out = img.resize((sz, sz), Image.LANCZOS)
    name = "icon.png" if sz == 128 else f"icon{sz}.png"
    out.save(name)
print("done")
