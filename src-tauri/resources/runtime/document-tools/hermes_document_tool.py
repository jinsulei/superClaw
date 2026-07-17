#!/usr/bin/env python3
"""Offline document operations used by the portable Hermes runtime."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def ensure_bundled_packages() -> None:
    """Allow the portable base interpreter to use Hermes' bundled packages."""
    runtime_dir = Path(__file__).resolve().parent.parent
    package_dir = runtime_dir / "hermes-agent" / "Lib" / "site-packages"
    if package_dir.is_dir() and str(package_dir) not in sys.path:
        sys.path.insert(0, str(package_dir))


ensure_bundled_packages()


def document_kind(path: Path) -> str:
    ext = path.suffix.lower()
    return {".xlsx": "excel", ".xls": "excel", ".docx": "word", ".pdf": "pdf"}.get(ext, "unknown")


def preview_excel(path: Path) -> dict:
    from openpyxl import load_workbook

    workbook = load_workbook(path, read_only=True, data_only=False)
    sheets = []
    for sheet in workbook.worksheets[:12]:
        rows = []
        for row in sheet.iter_rows(max_row=80, max_col=24, values_only=True):
            values = ["" if value is None else str(value) for value in row]
            if any(values):
                rows.append(values)
        sheets.append({"name": sheet.title, "rows": rows, "maxRow": sheet.max_row, "maxColumn": sheet.max_column})
    return {"kind": "excel", "sheets": sheets}


def preview_word(path: Path) -> dict:
    from docx import Document

    document = Document(path)
    paragraphs = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
    tables = []
    for table in document.tables[:20]:
        rows = [[cell.text for cell in row.cells] for row in table.rows[:80]]
        tables.append(rows)
    return {"kind": "word", "paragraphs": paragraphs[:500], "tables": tables}


def preview_pdf(path: Path) -> dict:
    from pypdf import PdfReader

    reader = PdfReader(path)
    pages = []
    for index, page in enumerate(reader.pages[:80]):
        pages.append({"page": index + 1, "text": (page.extract_text() or "")[:12000]})
    metadata = {str(key): str(value) for key, value in (reader.metadata or {}).items()}
    return {"kind": "pdf", "pages": pages, "pageCount": len(reader.pages), "metadata": metadata}


def preview(path: Path) -> dict:
    kind = document_kind(path)
    if kind == "excel":
        data = preview_excel(path)
    elif kind == "word":
        data = preview_word(path)
    elif kind == "pdf":
        data = preview_pdf(path)
    else:
        raise ValueError(f"Unsupported document type: {path.suffix}")
    data.update({"ok": True, "path": str(path), "fileName": path.name})
    return data


def replace_excel(source: Path, output: Path, find: str, replace: str) -> dict:
    from openpyxl import load_workbook

    workbook = load_workbook(source)
    changed = 0
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and find in cell.value:
                    cell.value = cell.value.replace(find, replace)
                    changed += 1
    workbook.save(output)
    return {"ok": True, "kind": "excel", "output": str(output), "changed": changed}


def replace_word(source: Path, output: Path, find: str, replace: str) -> dict:
    from docx import Document

    document = Document(source)
    changed = 0

    def replace_paragraph(paragraph):
        nonlocal changed
        if find in paragraph.text:
            for run in paragraph.runs:
                if find in run.text:
                    run.text = run.text.replace(find, replace)
                    changed += 1

    for paragraph in document.paragraphs:
        replace_paragraph(paragraph)
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    replace_paragraph(paragraph)
    document.save(output)
    return {"ok": True, "kind": "word", "output": str(output), "changed": changed}


def watermark_pdf(source: Path, output: Path, text: str) -> dict:
    from io import BytesIO
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas

    reader = PdfReader(source)
    writer = PdfWriter()
    for page in reader.pages:
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay_buffer = BytesIO()
        overlay = canvas.Canvas(overlay_buffer, pagesize=(width, height))
        overlay.setFont("Helvetica", 10)
        overlay.drawString(36, 24, text)
        overlay.save()
        overlay_buffer.seek(0)
        page.merge_page(PdfReader(overlay_buffer).pages[0])
        writer.add_page(page)
    writer.add_metadata(reader.metadata or {})
    with output.open("wb") as handle:
        writer.write(handle)
    return {"ok": True, "kind": "pdf", "output": str(output), "pageCount": len(reader.pages), "watermark": text}


def main() -> int:
    parser = argparse.ArgumentParser(description="SuperClaw Hermes offline document tool")
    parser.add_argument("command", choices=["preview", "replace", "watermark"])
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--find", default="")
    parser.add_argument("--replace", default="")
    parser.add_argument("--text", default="")
    args = parser.parse_args()

    try:
        source = args.input.resolve(strict=True)
        if args.command == "preview":
            result = preview(source)
        else:
            if not args.output:
                raise ValueError("--output is required for edits")
            output = args.output.resolve()
            output.parent.mkdir(parents=True, exist_ok=True)
            kind = document_kind(source)
            if args.command == "replace" and kind == "excel":
                result = replace_excel(source, output, args.find, args.replace)
            elif args.command == "replace" and kind == "word":
                result = replace_word(source, output, args.find, args.replace)
            elif args.command == "watermark" and kind == "pdf":
                result = watermark_pdf(source, output, args.text)
            else:
                raise ValueError("This command is not supported for the document type")
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
