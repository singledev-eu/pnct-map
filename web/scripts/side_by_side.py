# Side-by-side comparison sheets. usage: uv run python web/scripts/side_by_side.py out_dir x0,y0,x1,y1 label=dir ...
import sys, os
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; crop = tuple(map(int, sys.argv[2].split(","))); cols = [a.split("=",1) for a in sys.argv[3:]]
os.makedirs(out, exist_ok=True)
names = sorted(os.listdir(cols[0][1]))
font = ImageFont.load_default(size=36)
for n in names:
    ims = [Image.open(os.path.join(d, n)).crop(crop) for _, d in cols]
    w, h = ims[0].size
    sheet = Image.new("RGB", (w * len(ims) + 20 * (len(ims) - 1), h + 60), "white")
    dr = ImageDraw.Draw(sheet)
    for i, ((label, _), im) in enumerate(zip(cols, ims)):
        sheet.paste(im, (i * (w + 20), 60)); dr.text((i * (w + 20) + 10, 10), label, fill="black", font=font)
    sheet.save(os.path.join(out, n)); print(os.path.join(out, n))
