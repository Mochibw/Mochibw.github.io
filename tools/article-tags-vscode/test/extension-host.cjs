const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

const article = tags => `---\ntitle: 标题\ntags: ${tags}\n---\n正文\n`;

async function waitFor(check, message) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error(message);
}

async function run() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const indexPath = path.join(folder, '.vscode', 'article-tags.json');
  const content = path.join(folder, 'src', 'content');
  const a = path.join(content, 'thoughts', 'a.md');
  const b = path.join(content, 'learning', 'b.mdx');
  const extension = vscode.extensions.getExtension('mochibw-local.article-tags');
  assert.ok(extension, 'development extension is loaded');
  await waitFor(async () => extension.isActive, 'extension should automatically activate for src/content');
  const api = extension.exports;
  await api.ready;
  const readTags = async () => JSON.parse(await fs.readFile(indexPath, 'utf8')).tags;
  const expectTags = async tags => {
    await waitFor(async () => JSON.stringify(await readTags()) === JSON.stringify([...tags].sort()),
      `Expected tags ${JSON.stringify(tags)}, got ${JSON.stringify(await readTags())}`);
  };
  await expectTags(['旧标签', '共享', '另一个标签']);
  console.log('PASS startup full scan');

  const document = await vscode.workspace.openTextDocument(a);
  const editor = await vscode.window.showTextDocument(document);
  async function replace(text, save = true) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
    assert.equal(await vscode.workspace.applyEdit(edit), true);
    if (save) assert.equal(await document.save(), true);
  }
  const completions = async offset => {
    const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, document.positionAt(offset));
    return result.items.filter(item => item.detail === '当前已保存文章中的标签');
  };

  await replace(article('[共享, ]'), false);
  const cursor = document.getText().indexOf(', ]') + 2;
  editor.selection = new vscode.Selection(document.positionAt(cursor), document.positionAt(cursor));
  const items = await completions(cursor);
  assert.ok(api.stateFor(document.uri), `article belongs to project: ${document.uri}`);
  console.log('Completion items:', JSON.stringify(items.map(item => ({ label: item.label, detail: item.detail }))));
  assert.ok(items.some(item => item.label === '旧标签'));
  assert.equal(items.some(item => item.label === '共享'), false);
  assert.equal((await completions(document.getText().indexOf('标题'))).length, 0);
  assert.equal((await completions(document.getText().indexOf('正文'))).length, 0);
  await expectTags(['旧标签', '共享', '另一个标签']);
  console.log('PASS scoped completion and unsaved edits do not change index');

  await replace(article('[替换标签, 共享]'));
  await expectTags(['替换标签', '共享', '另一个标签']);
  console.log('PASS save adds replacements and removes unused tags');

  const lastValid = await fs.readFile(indexPath, 'utf8');
  await replace(article('["未闭合]'));
  await waitFor(async () => vscode.languages.getDiagnostics(document.uri).some(d => d.source === '文章标签'),
    'invalid saved YAML should produce a diagnostic');
  assert.equal(await fs.readFile(indexPath, 'utf8'), lastValid);
  console.log('PASS invalid YAML retains the last valid index');

  await replace(article('[修复标签]'));
  await expectTags(['修复标签', '共享', '另一个标签']);
  assert.equal(vscode.languages.getDiagnostics(document.uri).filter(d => d.source === '文章标签').length, 0);
  console.log('PASS fixing and saving refreshes index and clears diagnostics');

  const before = (await fs.stat(indexPath)).mtimeMs;
  await replace(article('[修复标签]') + '更多正文\n');
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal((await fs.stat(indexPath)).mtimeMs, before);
  console.log('PASS body-only changes do not rewrite the index');

  await fs.unlink(b);
  await expectTags(['修复标签']);
  console.log('PASS deletion removes tags no longer used by other articles');

  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  await fs.rename(a, path.join(folder, 'outside.md'));
  await expectTags([]);
  console.log('PASS moving an article out of content clears its tags');

  const external = path.join(content, 'new-folder', 'nested', 'external.mdx');
  await fs.mkdir(path.dirname(external), { recursive: true });
  await fs.writeFile(external, article('[外部标签]'));
  await expectTags(['外部标签']);
  await fs.writeFile(external, article('[]'));
  await expectTags([]);
  console.log('PASS external creation and updates in nested MDX folders');

  await vscode.commands.executeCommand('articleTags.rebuild');
  await expectTags([]);
  console.log('PASS manual rebuild');
  console.log('ARTICLE_TAGS_EXTENSION_HOST_TESTS_PASSED');
}

module.exports = { run };
