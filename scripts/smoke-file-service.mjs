import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(process.env.SUPERCLAW_FILE_SERVICE_ROOT || '.')
const resourcesRoot = existsSync(join(root, 'resources'))
  ? join(root, 'resources')
  : join(root, 'src-tauri', 'resources')
const pythonRoot = join(resourcesRoot, 'runtime', 'uv-python')
const pythonDir = readdirSync(pythonRoot, { withFileTypes: true }).find(entry => entry.isDirectory())?.name
const python = join(pythonRoot, pythonDir || '', 'python.exe')
const site = join(resourcesRoot, 'runtime', 'hermes-agent', 'Lib', 'site-packages')
const tool = join(resourcesRoot, 'runtime', 'document-tools', 'hermes_document_tool.py')
const portableCli = join(resourcesRoot, 'runtime', 'document-tools', 'superclaw-file.cmd')
const work = mkdtempSync(join(tmpdir(), 'superclaw-file-service-'))
const env = { ...process.env, PYTHONPATH: site }

function run(args) {
  const result = spawnSync(python, [tool, ...args], { encoding: 'utf8', env })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

function runPortableCli(args) {
  const result = spawnSync('cmd.exe', ['/d', '/c', portableCli, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

try {
  const create = spawnSync(python, ['-c', [
    'from pathlib import Path',
    'from openpyxl import Workbook',
    'from docx import Document',
    'from reportlab.pdfgen.canvas import Canvas',
    'from zipfile import ZipFile, ZIP_DEFLATED',
    `root=Path(r'''${work.replaceAll('\\', '\\\\')}''')`,
    'book=Workbook(); book.active.title="Data"; book.active["A1"]="before"; book.active["B2"]=42; book.save(root/"sample.xlsx")',
    'doc=Document(); doc.add_paragraph("before document"); doc.add_table(rows=1, cols=1).cell(0,0).text="before table"; doc.save(root/"sample.docx")',
    'pdf=Canvas(str(root/"sample.pdf")); pdf.drawString(72,720,"before pdf"); pdf.save()',
    'content="""<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><p:sld xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>before presentation</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>"""',
    'archive=ZipFile(root/"sample.pptx", "w", ZIP_DEFLATED); archive.writestr("ppt/slides/slide1.xml", content); archive.close()',
  ].join(';')], { encoding: 'utf8', env })
  assert.equal(create.status, 0, create.stderr)

  const xlsx = join(work, 'sample.xlsx'); const docx = join(work, 'sample.docx'); const pdf = join(work, 'sample.pdf'); const pptx = join(work, 'sample.pptx')
  assert.equal(run(['preview', xlsx]).kind, 'excel')
  assert.equal(runPortableCli(['preview', xlsx]).kind, 'excel')
  assert.equal(run(['preview', docx]).kind, 'word')
  assert.equal(run(['preview', pdf]).kind, 'pdf')
  assert.equal(run(['preview', pptx]).kind, 'presentation')
  const changedXlsx = join(work, 'sample-superclaw.xlsx')
  const changedDocx = join(work, 'sample-superclaw.docx')
  const changedPdf = join(work, 'sample-superclaw.pdf')
  const changedPptx = join(work, 'sample-superclaw.pptx')
  const generatedPptx = join(work, 'generated-superclaw.pptx')
  assert.equal(run(['replace', xlsx, '--output', changedXlsx, '--find', 'before', '--replace', 'after']).changed, 1)
  assert.equal(run(['replace', docx, '--output', changedDocx, '--find', 'before', '--replace', 'after']).changed, 2)
  assert.equal(run(['watermark', pdf, '--output', changedPdf, '--text', 'SuperClaw']).ok, true)
  assert.equal(run(['replace', pptx, '--output', changedPptx, '--find', 'before', '--replace', 'after']).changed, 1)
  assert.equal(run(['preview', changedPptx]).slides[0].text, 'after presentation')
  assert.equal(run(['create-presentation', '--output', generatedPptx, '--text', JSON.stringify({ title: 'Generated deck', slides: [{ title: 'First slide', bullets: ['offline', 'editable'] }] })]).slideCount, 2)
  assert.equal(run(['preview', generatedPptx]).slides[1].text, 'First slide\noffline\neditable')
  for (const output of [changedXlsx, changedDocx, changedPdf, changedPptx, generatedPptx]) assert.equal(existsSync(output), true, output)
  assert.match(readFileSync(xlsx).toString('base64'), /.+/)
  console.log('FILE_SERVICE_SMOKE_OK: preview + xlsx/docx/pptx edit + pptx create + pdf watermark')
} finally {
  rmSync(work, { recursive: true, force: true })
}
