const CODE_BLOCK_RE = /```[\s\S]*?```/g
const CODE_PLACEHOLDER_RE = /^__CODE_BLOCK_\d+__$/
const MARKDOWN_HEADING_RE = /^#{1,6}\s+/
const BULLET_RE = new RegExp('^\\s*[-*\\u2022]\\s+(.+)$')
const NUMBERED_RE = /^\s*\d+[.)]\s+/
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/
const TABLE_SEPARATOR_RE = /^\s*\|?[\s:-]+\|[\s|:-]*\|?\s*$/
const SENTENCE_END_RE = /[\u3002\uFF01\uFF1F!?；;,，、]$/
const TRAILING_COLON_RE = /[\uFF1A:]\s*$/g
const TRAILING_ITEM_PUNCT_RE = /[\u3002\uFF1B;]\s*$/g
const PLAIN_SECTION_HEADING_RE = /^[\u4e00-\u9fffA-Za-z0-9 +/&_-]{2,18}$/
const SENTENCE_TERMINATOR_RE = /[\u3002\uFF01\uFF1F!?,;,\uFF0C\uFF1B\u3001]$/

function isStandaloneLine(line) {
  const text = String(line || '').trim()
  return MARKDOWN_HEADING_RE.test(text)
    || BULLET_RE.test(text)
    || NUMBERED_RE.test(text)
    || CODE_PLACEHOLDER_RE.test(text)
    || TABLE_ROW_RE.test(text)
    || TABLE_SEPARATOR_RE.test(text)
}

function isCompactHeading(line) {
  const text = String(line || '').trim()
  if (!text || isStandaloneLine(text)) return false
  if (text.length > 18) return false
  return !SENTENCE_TERMINATOR_RE.test(text)
}

function isPlainSectionHeading(line) {
  const text = String(line || '').trim().replace(TRAILING_COLON_RE, '')
  return isCompactHeading(text) && PLAIN_SECTION_HEADING_RE.test(text)
}

function cleanBulletText(line) {
  const match = String(line || '').match(BULLET_RE)
  return (match?.[1] || '')
    .replace(/\s+/g, ' ')
    .replace(TRAILING_ITEM_PUNCT_RE, '')
    .trim()
}

function canCompactBulletItems(items) {
  return items.length >= 2
    && items.length <= 8
    && items.every((item) => item && item.length <= 72 && !CODE_PLACEHOLDER_RE.test(item))
}

function compactShortBulletSections(text) {
  const lines = String(text || '').split('\n')
  const output = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const nextLine = lines[index + 1] || ''
    const nextBulletIndex = BULLET_RE.test(nextLine)
      ? index + 1
      : (!nextLine.trim() && BULLET_RE.test(lines[index + 2] || '') ? index + 2 : -1)

    if (isCompactHeading(line) && nextBulletIndex > -1) {
      const bullets = []
      let cursor = nextBulletIndex
      while (cursor < lines.length && BULLET_RE.test(lines[cursor])) {
        bullets.push(cleanBulletText(lines[cursor]))
        cursor += 1
      }

      if (canCompactBulletItems(bullets)) {
        const heading = line.trim().replace(TRAILING_COLON_RE, '')
        output.push(`${heading}\uFF1A${bullets.join('\uFF1B')}\u3002`)
        index = cursor - 1
        continue
      }
    }

    const nextContentIndex = nextLine.trim() ? index + 1 : index + 2
    const nextContentLine = lines[nextContentIndex] || ''
    if (
      isPlainSectionHeading(line)
      && nextContentLine.trim()
      && !isStandaloneLine(nextContentLine)
      && nextContentLine.trim().length <= 180
    ) {
      const heading = line.trim().replace(TRAILING_COLON_RE, '')
      output.push(`${heading}\uFF1A${nextContentLine.trim()}`)
      index = nextContentIndex
      continue
    }

    if (BULLET_RE.test(line)) {
      const bullets = []
      let cursor = index
      while (cursor < lines.length && BULLET_RE.test(lines[cursor])) {
        bullets.push(cleanBulletText(lines[cursor]))
        cursor += 1
      }

      if (canCompactBulletItems(bullets)) {
        output.push(`${bullets.join('\uFF1B')}\u3002`)
        index = cursor - 1
        continue
      }
    }

    output.push(line)
  }

  return output.join('\n')
}

export function normalizeAssistantLayoutText(rawText) {
  const text = String(rawText ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return ''

  const codeBlocks = []
  const protectedText = text.replace(CODE_BLOCK_RE, (block) => {
    const key = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(block)
    return key
  })

  const normalized = protectedText
    .split('\n')
    .map((line) => line.trimEnd())
    .reduce((lines, line) => {
      const trimmed = line.trim()
      const previous = lines[lines.length - 1] || ''

      if (!trimmed) {
        if (previous !== '') lines.push('')
        return lines
      }

      if (isStandaloneLine(trimmed)) {
        lines.push(trimmed)
        return lines
      }

      if (previous && previous !== '' && !isStandaloneLine(previous)) {
        lines[lines.length - 1] = `${previous} ${trimmed}`
      } else {
        lines.push(trimmed)
      }

      return lines
    }, [])
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return compactShortBulletSections(normalized)
    .replace(/__CODE_BLOCK_(\d+)__/g, (_, index) => codeBlocks[Number(index)] || '')
}

export function compactMarkdownSpacing(rawText) {
  return normalizeAssistantLayoutText(rawText)
    .replace(
      /^([\u4e00-\u9fffA-Za-z0-9 +/&_-]{2,18})\n{1,2}([^\n`|#*-][^\n]{1,360})(?=\n{2,}|$)/gm,
      (_, heading, body) => `${heading.replace(TRAILING_COLON_RE, '')}\uFF1A${body.trim()}`,
    )
    .replace(/(\n#{1,6} .+)\n{2,}/g, '$1\n')
    .replace(/\n{2,}([-*\u2022]\s+)/g, '\n$1')
    .replace(/([-*\u2022].+)\n{2,}/g, '$1\n')
}
