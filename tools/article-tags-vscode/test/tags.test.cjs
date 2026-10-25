const assert = require('node:assert/strict');
const { test } = require('node:test');
const { extractTags, collectTags, completionContext, suggestions } = require('../src/tags.cjs');

const article = yaml => `---\n${yaml}\n---\n正文 tags: [不应收录]\n`;
function completion(marked, tags = ['读书', '感悟', '余华', '个人网站']) {
  const offset = marked.indexOf('|');
  const text = marked.slice(0, offset) + marked.slice(offset + 1);
  const context = completionContext(text, offset);
  return { text, context, items: suggestions(tags, context) };
}

test('YAML flow whitespace, quoted tags, multiline lists and deduplication', () => {
  assert.deepEqual(extractTags(article('tags: [读书, 感悟, 余华, 读书, "  个人网站  ", ""]')), ['读书', '感悟', '余华', '个人网站']);
  assert.deepEqual(extractTags(article('tags:\n  - "读书"\n  - \'感悟\'\n  - "AI, YAML"')), ['读书', '感悟', 'AI, YAML']);
});

test('YAML comments, CRLF, BOM and aliases are parsed correctly', () => {
  assert.deepEqual(extractTags('\uFEFF---\r\nbase: &base ["true", "123"]\r\ntags: *base # 注释\r\n---\r\n'), ['true', '123']);
  assert.deepEqual(extractTags(article('tags: ["C#", "机器 学习", "a # b"] # 注释')), ['C#', '机器 学习', 'a # b']);
});

test('no frontmatter, missing tags and empty array contribute no tags', () => {
  for (const text of ['正文\ntags: [忽略]', article('title: 标题'), article('tags: []')]) {
    assert.deepEqual(extractTags(text), []);
  }
});

test('malformed YAML, duplicate keys and non-string tags stop synchronization', () => {
  for (const text of [article('tags: ["坏标签]'), article('tags: [true]'), article('tags: [123]'),
    article('tags: [null]'), article('tags: null'), article('tags: [读书]\ntags: []'), '---\ntags: [读书]']) {
    assert.throws(() => extractTags(text));
  }
  assert.equal(collectTags([{ text: article('tags: [好标签]') }, { text: article('tags: [true]') }]).errors.length, 1);
});

test('rebuilding removes replaced/deleted tags but keeps tags used by other articles', () => {
  const a = { text: article('tags: [读书, 感悟]') };
  const b = { text: article('tags: [读书, 余华]') };
  assert.deepEqual(collectTags([a, b]).tags, ['余华', '感悟', '读书'].sort());
  a.text = article('tags: [个人网站]');
  assert.deepEqual(collectTags([a, b]).tags, ['个人网站', '余华', '读书'].sort());
  assert.deepEqual(collectTags([a]).tags, ['个人网站']);
  assert.deepEqual(collectTags([]).tags, []);
});

test('unquoted flow completion replaces the whole current value and excludes other selected tags', () => {
  const { text, context, items } = completion(article('tags: [读书, 感|悟]'));
  assert.equal(text.slice(context.start, context.end), '感悟');
  assert.deepEqual(items.map(item => item.label), ['感悟']);
  assert.equal(items[0].insertText, '"感悟"');
});

test('flow completion works after commas, for empty arrays and inside incomplete quotes', () => {
  for (const yaml of ['tags: [读书, |]', 'tags: [读书, "|', "tags: [读书, '|", 'tags: [|]']) {
    const result = completion(article(yaml));
    assert.ok(result.context, yaml);
    assert.ok(result.items.some(item => item.label === '感悟'), yaml);
  }
  const result = completion(article('tags: ["读书", "感|悟"]'));
  assert.equal(result.text.slice(result.context.start, result.context.end), '"感悟"');
});

test('completion supports missing closing frontmatter delimiter while typing', () => {
  assert.ok(completion('---\ntags: [读书, "感|').items.some(item => item.label === '感悟'));
});

test('block list completion and starting a blank tags field', () => {
  const result = completion(article('tags:\n  - 读书\n  - 感|悟'));
  assert.deepEqual(result.items.map(item => item.label), ['感悟']);
  assert.equal(completion(article('tags:\n  - 读书\n  - |')).items.some(item => item.label === '读书'), false);
  const blank = completion(article('tags: |'));
  assert.equal(blank.items[0].insertText, '["读书"]');
});

test('completion is limited to top-level frontmatter tags string entries', () => {
  for (const marked of [
    article('title: 读|书\ntags: [读书]'), article('metadata:\n  tags: [读|书]'),
    article('tags: [读书]') + '正文 |', 'tags: [读|书]',
    article('tags: [读书] # |'), article('tags:\n  - 读书\ntitle: |'),
    article('tags:\n  - >|\n    多行文本'), article('tags: [读书, # |\n  感悟]'),
  ]) {
    assert.equal(completion(marked).context, null, marked);
  }
});

test('hashes inside quoted block-list tags are not treated as comments', () => {
  const result = completion(article('tags:\n  - "a # |b"'), ['a # b']);
  assert.equal(result.items[0].label, 'a # b');
  assert.equal(result.text.slice(result.context.start, result.context.end), '"a # b"');
});

test('quoted commas do not split entries and inserted special characters remain valid YAML', () => {
  const result = completion(article('tags: ["AI, YAML", |]'), ['AI, YAML', 'a "quote"', 'C:\\temp', 'true']);
  assert.equal(result.items.some(item => item.label === 'AI, YAML'), false);
  for (const item of result.items) {
    const updated = result.text.slice(0, result.context.start) + item.insertText + result.text.slice(result.context.end);
    assert.deepEqual(extractTags(updated), ['AI, YAML', item.label]);
  }
});
