from pathlib import Path
import sys
import time

import win32com.client


if len(sys.argv) != 3:
    raise SystemExit("usage: render_word_com.py input.docx output.pdf")

input_path = str(Path(sys.argv[1]).resolve())
output_path = str(Path(sys.argv[2]).resolve())
Path(output_path).parent.mkdir(parents=True, exist_ok=True)

word = win32com.client.DispatchEx("Word.Application")
word.Visible = False
word.DisplayAlerts = 0
doc = None
try:
    doc = word.Documents.Open(input_path, ReadOnly=True, AddToRecentFiles=False, ConfirmConversions=False)
    doc.Fields.Update()
    for section in doc.Sections:
        for header in section.Headers:
            if header.Exists:
                header.Range.Fields.Update()
        for footer in section.Footers:
            if footer.Exists:
                footer.Range.Fields.Update()
    doc.ExportAsFixedFormat(
        OutputFileName=output_path,
        ExportFormat=17,
        OpenAfterExport=False,
        OptimizeFor=0,
        CreateBookmarks=1,
    )
finally:
    if doc is not None:
        doc.Close(SaveChanges=False)
    word.Quit()

for _ in range(50):
    if Path(output_path).exists() and Path(output_path).stat().st_size > 0:
        print(output_path)
        break
    time.sleep(0.2)
else:
    raise RuntimeError(f"Word did not create {output_path}")
