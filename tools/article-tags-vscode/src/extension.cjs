const vscode = require('vscode');
const fs = require('node:fs/promises');
const { collectTags, completionContext, suggestions } = require('./tags.cjs');

const ARTICLE_GLOB = 'src/content/**/*.{md,mdx}';
const INDEX_PATH = ['.vscode', 'article-tags.json'];

function articleInFolder(uri, folder) {
  const prefix = vscode.Uri.joinPath(folder.uri, 'src', 'content').path + '/';
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  return uri.scheme === folder.uri.scheme && uri.authority === folder.uri.authority
    && normalize(uri.path).startsWith(normalize(prefix)) && /\.(md|mdx)$/i.test(uri.path);
}

function positionAt(text, offset) {
  const lines = text.slice(0, Math.min(offset, text.length)).split('\n');
  return new vscode.Position(lines.length - 1, lines.at(-1).replace(/\r$/, '').length);
}

class ProjectIndex {
  constructor(folder, diagnostics, output, changed) {
    this.folder = folder;
    this.indexUri = vscode.Uri.joinPath(folder.uri, ...INDEX_PATH);
    this.diagnostics = diagnostics;
    this.output = output;
    this.changed = changed;
    this.tags = [];
    this.generation = 0;
    this.queue = Promise.resolve();
    this.diagnosticUris = [];
    this.lastError = '';
    this.disposed = false;
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, 'src/content{,/**}'));
    this.listeners = [
      this.watcher.onDidCreate(() => this.schedule()),
      this.watcher.onDidChange(() => this.schedule()),
      this.watcher.onDidDelete(() => this.schedule()),
    ];
  }

  async initialize() {
    try {
      const content = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(this.indexUri)).toString('utf8'));
      if (Array.isArray(content.tags) && content.tags.every(tag => typeof tag === 'string')) {
        this.tags = [...new Set(content.tags)].sort();
      }
    } catch { /* A cache is optional; articles remain the source of truth. */ }
    return this.rebuild();
  }

  schedule() {
    if (this.disposed) return;
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.enqueue(generation), 180);
  }

  rebuild() {
    clearTimeout(this.timer);
    return this.enqueue(++this.generation);
  }

  enqueue(generation) {
    this.queue = this.queue.then(() => this.scan(generation)).catch(error => {
      this.reportError(`标签索引更新失败：${error.message}`);
      return false;
    });
    return this.queue;
  }

  reportError(message) {
    this.output.appendLine(`[${this.folder.name}] ${message}`);
    if (message !== this.lastError) {
      this.lastError = message;
      void vscode.window.showWarningMessage(`文章标签：${message}。保留上一次有效索引，修复后保存将自动重试。`);
    }
  }

  async scan(generation) {
    if (this.disposed || generation !== this.generation) return false;
    const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(this.folder, ARTICLE_GLOB), null);
    const records = await Promise.all(uris.map(async uri => ({
      uri, text: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'),
    })));
    const result = collectTags(records);
    if (this.disposed || generation !== this.generation) return false;
    for (const uri of this.diagnosticUris) this.diagnostics.delete(uri);
    this.diagnosticUris = [];
    for (const error of result.errors) {
      const position = positionAt(error.article.text, error.offset);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(position, position), error.message, vscode.DiagnosticSeverity.Error);
      diagnostic.source = '文章标签';
      this.diagnostics.set(error.article.uri, [diagnostic]);
      this.diagnosticUris.push(error.article.uri);
    }
    if (result.errors.length) {
      const names = result.errors.map(error => vscode.workspace.asRelativePath(error.article.uri)).join('、');
      this.reportError(`以下文章的 frontmatter 或 tags 无效：${names}（详见“问题”面板）`);
      return false;
    }

    const content = JSON.stringify({ tags: result.tags }, null, 2) + '\n';
    let existing;
    try { existing = Buffer.from(await vscode.workspace.fs.readFile(this.indexUri)).toString('utf8'); }
    catch (error) { if (error.code !== 'FileNotFound' && error.code !== 'ENOENT') throw error; }
    // Do not replace an unsaved manual edit in the generated index.
    if (vscode.workspace.textDocuments.some(doc => doc.uri.toString() === this.indexUri.toString() && doc.isDirty)) {
      this.reportError('索引文件有未保存的手动修改，请撤销或保存这些修改后重建索引');
      return false;
    }
    if (this.disposed || generation !== this.generation) return false;
    if (existing !== content) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.folder.uri, '.vscode'));
      const temporary = this.indexUri.with({ path: this.indexUri.path + '.tmp' });
      try {
        await vscode.workspace.fs.writeFile(temporary, Buffer.from(content, 'utf8'));
        // workspace.fs.rename(overwrite) can delete the destination first on Windows.
        // Native rename replaces it without exposing a temporarily missing index.
        await fs.rename(temporary.fsPath, this.indexUri.fsPath);
      } finally {
        try { await vscode.workspace.fs.delete(temporary); }
        catch (error) { if (error.code !== 'FileNotFound' && error.code !== 'ENOENT') this.output.appendLine(error.message); }
      }
    }
    if (this.disposed || generation !== this.generation) return false;
    this.tags = result.tags;
    this.lastError = '';
    this.output.appendLine(`[${this.folder.name}] 已同步 ${uris.length} 篇文章，${result.tags.length} 个标签。`);
    this.changed();
    return true;
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    clearTimeout(this.timer);
    for (const listener of this.listeners) listener.dispose();
    this.watcher.dispose();
    for (const uri of this.diagnosticUris) this.diagnostics.delete(uri);
  }
}

function activate(context) {
  const output = vscode.window.createOutputChannel('文章标签');
  const diagnostics = vscode.languages.createDiagnosticCollection('articleTags');
  const projects = new Map();
  let suggestionTimer;
  let stopped = false;

  function stateFor(uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const state = folder && projects.get(folder.uri.toString());
    return state && articleInFolder(uri, folder) ? state : undefined;
  }

  function triggerSuggestions() {
    clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.selection.isEmpty || !stateFor(editor.document.uri)) return;
      const context = completionContext(editor.document.getText(), editor.document.offsetAt(editor.selection.active));
      if (context && !context.closed) {
        void vscode.commands.executeCommand('editor.action.triggerSuggest');
      }
    }, 90);
  }

  async function addFolder(folder) {
    try {
      const info = await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, 'src', 'content'));
      if (!(info.type & vscode.FileType.Directory) || stopped || projects.has(folder.uri.toString())) return;
      const state = new ProjectIndex(folder, diagnostics, output, triggerSuggestions);
      projects.set(folder.uri.toString(), state);
      await state.initialize();
    } catch (error) {
      if (error.code !== 'FileNotFound' && error.code !== 'ENOENT') output.appendLine(error.message);
    }
  }

  function commandProject() {
    const active = vscode.window.activeTextEditor;
    const folder = active && vscode.workspace.getWorkspaceFolder(active.document.uri);
    return (folder && projects.get(folder.uri.toString())) || projects.values().next().value;
  }

  const ready = Promise.all((vscode.workspace.workspaceFolders || []).map(addFolder));
  context.subscriptions.push(output, diagnostics,
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
      for (const folder of event.removed) {
        projects.get(folder.uri.toString())?.dispose();
        projects.delete(folder.uri.toString());
      }
      for (const folder of event.added) void addFolder(folder);
    }),
    vscode.workspace.onDidSaveTextDocument(document => {
      const state = stateFor(document.uri);
      if (state) state.schedule();
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.contentChanges.length && stateFor(event.document.uri)
        && event.document === vscode.window.activeTextEditor?.document) triggerSuggestions();
    }),
    vscode.languages.registerCompletionItemProvider(
      [{ scheme: 'file', pattern: '**/src/content/**/*.{md,mdx}' }],
      {
        async provideCompletionItems(document, position) {
          await ready;
          const state = stateFor(document.uri);
          if (!state) return undefined;
          const context = completionContext(document.getText(), document.offsetAt(position));
          if (!context) return undefined;
          const range = new vscode.Range(document.positionAt(context.start), document.positionAt(context.end));
          const items = suggestions(state.tags, context).map(suggestion => {
            const item = new vscode.CompletionItem(suggestion.label, vscode.CompletionItemKind.Value);
            item.insertText = suggestion.insertText;
            item.filterText = suggestion.filterText;
            item.range = range;
            item.detail = '当前已保存文章中的标签';
            item.documentation = '标签索引在文章保存后更新；可直接输入未列出的新标签。';
            item.sortText = suggestion.label;
            item.commitCharacters = [];
            return item;
          });
          // Recompute filtering when typing further into a tag.
          return new vscode.CompletionList(items, true);
        },
      }, '[', ',', '"', "'", ' ', '-', ':'),
    vscode.commands.registerCommand('articleTags.rebuild', async () => {
      await ready;
      const state = commandProject();
      if (!state) return vscode.window.showInformationMessage('当前工作区没有 src/content 文章目录。');
      const success = await state.rebuild();
      if (success) void vscode.window.showInformationMessage(`文章标签：已重建索引，共 ${state.tags.length} 个标签。`);
    }),
    vscode.commands.registerCommand('articleTags.openIndex', async () => {
      await ready;
      const state = commandProject();
      if (!state) return vscode.window.showInformationMessage('当前工作区没有 src/content 文章目录。');
      try {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(state.indexUri));
      } catch {
        void vscode.window.showWarningMessage('尚无有效标签索引，请修复“问题”面板中的错误后重建索引。');
      }
    }),
    { dispose() {
      stopped = true;
      clearTimeout(suggestionTimer);
      for (const state of projects.values()) state.dispose();
    } },
  );
  // Exposed only to extension-host tests; no website dependency on the extension.
  return { ready, projects, stateFor };
}

module.exports = { activate };
