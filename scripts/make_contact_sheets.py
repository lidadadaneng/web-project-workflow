from pathlib import Path
import math
import sys

from PIL import Image, ImageDraw


if len(sys.argv) != 4:
    raise SystemExit("usage: make_contact_sheets.py pages_dir output_dir columns")

pages_dir = Path(sys.argv[1]).resolve()
out_dir = Path(sys.argv[2]).resolve()
columns = int(sys.argv[3])
files = sorted(pages_dir.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
out_dir.mkdir(parents=True, exist_ok=True)
thumb_w = 290
thumb_h = 410
label_h = 24
rows = 4
per_sheet = columns * rows
for sheet_index in range(math.ceil(len(files) / per_sheet)):
    group = files[sheet_index * per_sheet : (sheet_index + 1) * per_sheet]
    canvas = Image.new("RGB", (columns * thumb_w, rows * (thumb_h + label_h)), "white")
    draw = ImageDraw.Draw(canvas)
    for slot, file in enumerate(group):
        image = Image.open(file).convert("RGB")
        image.thumbnail((thumb_w - 8, thumb_h - 8))
        left = (slot % columns) * thumb_w + (thumb_w - image.width) // 2
        top = (slot // columns) * (thumb_h + label_h) + 4
        canvas.paste(image, (left, top))
        draw.text(
            ((slot % columns) * thumb_w + 8, (slot // columns) * (thumb_h + label_h) + thumb_h),
            file.stem,
            fill="black",
        )
    output = out_dir / f"sheet-{sheet_index + 1}.png"
    canvas.save(output)
    print(output)
