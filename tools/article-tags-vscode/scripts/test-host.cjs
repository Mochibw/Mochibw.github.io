const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const executable = process.argv[2];
if (!executable || !fs.existsSync(executable)) {
  console.error('Usage: node scripts/test-host.cjs "absolute/path/to/Code.exe"');
  process.exit(1);
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mochibw-article-tags-test-'));
const workspace = path.join(temporary, 'workspace');
fs.mkdirSync(path.join(workspace, 'src', 'content', 'thoughts'), { recursive: true });
fs.mkdirSync(path.join(workspace, 'src', 'content', 'learning'), { recursive: true });
fs.writeFileSync(path.join(workspace, 'src', 'content', 'thoughts', 'a.md'),
  '---\ntitle: 标题\ntags: [旧标签, 共享]\n---\n正文\n');
fs.writeFileSync(path.join(workspace, 'src', 'content', 'learning', 'b.mdx'),
  '---\ntitle: 标题\ntags: [共享, 另一个标签]\n---\n正文\n');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const logPath = path.join(temporary, 'extension-host.log');
const log = fs.createWriteStream(logPath);
const child = spawn(executable, [
  workspace,
  `--extensionDevelopmentPath=${path.resolve(__dirname, '..')}`,
  `--extensionTestsPath=${path.resolve(__dirname, '../test/extension-host.cjs')}`,
  `--user-data-dir=${path.join(temporary, 'profile')}`,
  `--extensions-dir=${path.join(temporary, 'extensions')}`,
  `--crash-reporter-directory=${path.join(temporary, 'crashes')}`,
  '--disable-extensions', '--disable-workspace-trust', '--disable-gpu',
  '--skip-welcome', '--skip-release-notes', '--no-sandbox',
], { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [child.stdout, child.stderr]) {
  stream.pipe(log, { end: false });
  readline.createInterface({ input: stream }).on('line', line => {
    if (/PASS |ARTICLE_TAGS_|AssertionError|^Error:|\bat .*extension-host\.cjs/.test(line)) console.log(line);
  });
}
console.log(`Isolated extension-host test workspace: ${workspace}`);
console.log(`Full VS Code log: ${logPath}`);
const timeout = setTimeout(() => {
  console.error('Extension-host tests timed out.');
  child.kill();
  process.exitCode = 1;
}, 90000);
child.on('error', error => { clearTimeout(timeout); log.end(); console.error(error); process.exitCode = 1; });
child.on('close', code => { clearTimeout(timeout); log.end(); process.exitCode = code ?? 1; });
