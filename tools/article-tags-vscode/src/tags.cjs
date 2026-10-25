const YAML = require('yaml');

class TagError extends Error {
  constructor(message, offset = 0) {
    super(message);
    this.offset = offset;
  }
}

function frontmatter(text, allowUnclosed = false) {
  const opening = /^(?:\uFEFF)?---[^\S\r\n]*\r?\n/.exec(text);
  if (!opening) return null;
  const start = opening[0].length;
  const closing = /^(?:---|\.\.\.)[^\S\r\n]*\r?$/gm;
  closing.lastIndex = start;
  const match = closing.exec(text);
  if (!match && !allowUnclosed) throw new TagError('frontmatter 缺少结束分隔线 ---', start);
  const end = match ? match.index : text.length;
  return { start, end, source: text.slice(start, end) };
}

function parse(source) {
  return YAML.parseDocument(source, { prettyErrors: false, uniqueKeys: true, version: '1.2' });
}

function tagPair(doc) {
  return YAML.isMap(doc.contents)
    ? doc.contents.items.find(pair => YAML.isScalar(pair.key) && pair.key.value === 'tags')
    : undefined;
}

function extractTags(text) {
  const fm = frontmatter(text);
  if (!fm) return [];
  const doc = parse(fm.source);
  if (doc.errors.length) {
    const error = doc.errors[0];
    throw new TagError(error.message, fm.start + (error.pos?.[0] || 0));
  }
  if (doc.contents && !YAML.isMap(doc.contents)) {
    throw new TagError('frontmatter 必须是 YAML 对象', fm.start);
  }
  const pair = tagPair(doc);
  if (!pair) return [];
  // Resolve aliases too, then validate their resolved values like ordinary entries.
  let values;
  try {
    values = doc.toJS({ maxAliasCount: 100 })?.tags;
  } catch (error) {
    throw new TagError(error.message, fm.start + (pair.key.range?.[0] || 0));
  }
  if (!Array.isArray(values)) {
    throw new TagError('tags 必须是字符串数组；清空时请写 tags: []', fm.start + pair.key.range[0]);
  }
  for (let i = 0; i < values.length; i++) {
    if (typeof values[i] !== 'string') {
      const offset = pair.value?.items?.[i]?.range?.[0] ?? pair.key.range[0];
      throw new TagError('每个标签必须是字符串；数字、true、null 等标签请加引号', fm.start + offset);
    }
  }
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function sortedTags(values) {
  // Code point order is stable across machines and locale settings.
  return [...new Set(values)].sort();
}

function collectTags(articles) {
  const tags = [];
  const errors = [];
  for (const article of articles) {
    try {
      tags.push(...extractTags(article.text));
    } catch (error) {
      errors.push({ article, message: error.message, offset: error.offset || 0 });
    }
  }
  return { tags: sortedTags(tags), errors };
}

// Split flow entries without treating quoted commas or comments as delimiters.
function flowSegments(source, start, end) {
  const segments = [];
  const comments = [];
  let from = start + 1;
  let quote = null;
  let depth = 0;
  let comment = -1;
  for (let i = from; i < end; i++) {
    const ch = source[i];
    if (comment >= 0) {
      if (ch === '\n') { comments.push([comment, i]); comment = -1; }
      continue;
    }
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (ch === quote) {
        if (quote === "'" && source[i + 1] === "'") { i++; continue; }
        quote = null;
      }
      continue;
    }
    if (ch === '#' && /\s/.test(source[i - 1] || ' ')) { comment = i; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[' || ch === '{') { depth++; continue; }
    if ((ch === ']' || ch === '}') && depth > 0) { depth--; continue; }
    if (ch === ']' && depth === 0) {
      segments.push([from, i]);
      return { segments, comments };
    }
    if (ch === ',' && depth === 0) { segments.push([from, i]); from = i + 1; }
  }
  if (comment >= 0) comments.push([comment, end]);
  segments.push([from, end]);
  return { segments, comments };
}

function scalarEdit(source, from, to, cursor, comments = []) {
  if (comments.some(([a, b]) => cursor >= a && cursor <= b)) return null;
  // Completion edits must stay on the cursor's line, including for multiline arrays.
  const lineStart = source.lastIndexOf('\n', cursor - 1) + 1;
  const nextLine = source.indexOf('\n', cursor);
  from = Math.max(from, lineStart);
  to = Math.min(to, nextLine < 0 ? source.length : nextLine);
  for (const [a, b] of comments) {
    if (a >= from && a < to) to = a;
    if (b >= from && b < to) from = b + 1;
  }
  const raw = source.slice(from, to);
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  const tokenStart = Math.min(from + leading, cursor);
  const tokenEnd = Math.max(from + leading, to - trailing, cursor);
  const token = source.slice(tokenStart, tokenEnd);
  // Block scalars, nested collections, and mapping entries are not tag strings.
  if (/^[|>\[{]/.test(token) || /[\r\n]/.test(token)) return null;
  const before = source.slice(tokenStart, cursor);
  let prefix = before;
  const quote = /^["']/.test(before) ? before[0] : '';
  if (quote) {
    try { prefix = YAML.parse(before.endsWith(quote) && before.length > 1 ? before : before + quote); }
    catch { prefix = before.slice(1); }
  }
  return {
    start: tokenStart, end: tokenEnd,
    prefix: typeof prefix === 'string' ? (quote ? prefix : prefix.trim()) : before,
    quote,
    closed: Boolean(quote && before.length > 1 && before.endsWith(quote)),
  };
}

function lineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (ch === quote) {
        if (quote === "'" && line[i + 1] === "'") { i++; continue; }
        quote = null;
      }
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && /\s/.test(line[i - 1] || ' ')) return i;
  }
  return -1;
}

function completionContext(text, offset) {
  const fm = frontmatter(text, true);
  if (!fm || offset < fm.start || offset > fm.end) return null;
  const cursor = offset - fm.start;
  // A closing delimiter starts at fm.end and is outside frontmatter.
  if (offset === fm.end && fm.end < text.length) return null;
  let doc;
  try { doc = parse(fm.source); } catch { return null; }
  const pair = tagPair(doc);
  if (!pair) return null;
  const node = pair.value;
  let edit;
  let current = -1;
  let wrapArray = false;
  if (YAML.isSeq(node)) {
    if (node.flow) {
      const { segments, comments } = flowSegments(fm.source, node.range[0], node.range[1]);
      current = segments.findIndex(([a, b]) => cursor >= a && cursor <= b);
      if (current < 0) return null;
      edit = scalarEdit(fm.source, ...segments[current], cursor, comments);
    } else {
      if (cursor < node.range[0] || cursor > node.range[2]) return null;
      const lineStart = fm.source.lastIndexOf('\n', cursor - 1) + 1;
      const nextLine = fm.source.indexOf('\n', lineStart);
      const lineEnd = nextLine < 0 ? fm.source.length : nextLine;
      const line = fm.source.slice(lineStart, lineEnd);
      const dash = /^[ \t]*-[ \t]+/.exec(line);
      if (!dash || cursor < lineStart + dash[0].length) return null;
      current = node.items.findIndex(item => item?.range && item.range[0] >= lineStart && item.range[0] <= lineEnd);
      const item = node.items[current];
      if (item && !YAML.isScalar(item)) return null;
      if (item?.type?.startsWith('BLOCK_')) return null;
      const comment = lineComment(line);
      edit = scalarEdit(fm.source, lineStart + dash[0].length, lineEnd, cursor,
        comment < 0 ? [] : [[lineStart + comment, lineEnd]]);
    }
  } else {
    // Starting a field with `tags: ` should insert a complete flow array.
    const keyEnd = pair.key.range?.[1];
    if (keyEnd == null) return null;
    const nextLine = fm.source.indexOf('\n', keyEnd);
    const lineEnd = nextLine < 0 ? fm.source.length : nextLine;
    const rest = fm.source.slice(keyEnd, lineEnd);
    if (!/^:[ \t]*\r?$/.test(rest) || cursor < keyEnd + 1 || cursor > lineEnd) return null;
    edit = { start: cursor, end: cursor, prefix: '', quote: '', closed: false };
    wrapArray = true;
  }
  if (!edit) return null;
  const used = YAML.isSeq(node)
    ? node.items.filter((_, i) => i !== current)
      .filter(item => YAML.isScalar(item) && typeof item.value === 'string')
      .map(item => item.value.trim())
    : [];
  return { ...edit, start: fm.start + edit.start, end: fm.start + edit.end, used, wrapArray };
}

function suggestions(tags, context) {
  if (!context) return [];
  const used = new Set(context.used);
  const prefix = context.prefix.toLocaleLowerCase();
  return tags.filter(tag => !used.has(tag) && tag.toLocaleLowerCase().includes(prefix))
    .map(tag => ({
      label: tag,
      insertText: context.wrapArray ? `[${JSON.stringify(tag)}]` : JSON.stringify(tag),
      filterText: context.quote ? context.quote + tag + context.quote : tag,
    }));
}

module.exports = { TagError, frontmatter, extractTags, collectTags, completionContext, suggestions };
