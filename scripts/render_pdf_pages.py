from pathlib import Path
import sys

import fitz


if len(sys.argv) != 3:
    raise SystemExit("usage: render_pdf_pages.py input.pdf output_dir")

pdf_path = Path(sys.argv[1]).resolve()
out_dir = Path(sys.argv[2]).resolve()
out_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(str(pdf_path))
for index, page in enumerate(doc, start=1):
    pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
    pix.save(str(out_dir / f"page-{index}.png"))
print(f"rendered {len(doc)} pages to {out_dir}")
