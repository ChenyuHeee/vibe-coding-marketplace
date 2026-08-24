/**
 * zip 解压安全单测（docs/ARCHITECTURE.md §3.3 —— 硬性要求）：
 * 总解压 ≤100MB、条目 ≤1000、路径穿越拒绝、符号链接拒绝、扩展名白名单。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_UNZIP_TOTAL_BYTES,
  extractZipSafe,
  findZipEntryFile,
  resolvePlayFile,
  saveSingleHtml,
} from './upload';
import { ApiError } from './errors';
import { buildZip } from '../test/zip-builder';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-upload-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function extract(entries: Parameters<typeof buildZip>[0]) {
  const dir = tmpDir();
  const files = await extractZipSafe(buildZip(entries), path.join(dir, 'out'));
  return { dir, files, outDir: path.join(dir, 'out') };
}

describe('extractZipSafe', () => {
  it('合法 zip：白名单文件解压到目标目录，返回文件相对路径', async () => {
    const { files, outDir } = await extract([
      { name: 'index.html', data: '<h1>hi</h1>' },
      { name: 'assets/app.js', data: 'console.log(1)' },
      { name: 'assets/style.css', data: 'body{}' },
    ]);
    expect(files).toContain('index.html');
    expect(files).toContain('assets/app.js');
    expect(files).toContain('assets/style.css');
    expect(fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')).toBe('<h1>hi</h1>');
    expect(fs.readFileSync(path.join(outDir, 'assets/app.js'), 'utf8')).toBe('console.log(1)');
  });

  it('路径穿越：../ 条目拒绝', async () => {
    await expect(extract([{ name: '../evil.html', data: 'x' }])).rejects.toThrow(ApiError);
  });

  it('路径穿越：深层 a/../../evil.html 拒绝', async () => {
    await expect(extract([{ name: 'a/../../evil.html', data: 'x' }])).rejects.toThrow(ApiError);
  });

  it('路径穿越：绝对路径条目拒绝', async () => {
    await expect(extract([{ name: '/etc/passwd', data: 'x' }])).rejects.toThrow(ApiError);
  });

  it('符号链接条目拒绝（unix 模式 S_IFLNK）', async () => {
    await expect(extract([{ name: 'link.html', data: 'index.html', mode: 0xa1ff }])).rejects.toThrow(
      /符号链接/,
    );
  });

  it('非白名单扩展名丢弃（不报错，不落盘）', async () => {
    const { files, outDir } = await extract([
      { name: 'index.html', data: '<h1>hi</h1>' },
      { name: 'evil.php', data: '<?php echo 1;' },
      { name: 'secret.sh', data: 'rm -rf /' },
    ]);
    expect(files).toEqual(['index.html']);
    expect(fs.existsSync(path.join(outDir, 'evil.php'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'secret.sh'))).toBe(false);
  });

  it('条目数超过 1000 拒绝', async () => {
    const entries = Array.from({ length: 1001 }, (_, i) => ({
      name: `f${i}.txt`,
      data: 'x',
    }));
    await expect(extract(entries)).rejects.toThrow(/条目数超过上限/);
  });

  it('总解压体积超过 100MB 拒绝（声明大小校验）', async () => {
    const big = MAX_UNZIP_TOTAL_BYTES + 1;
    await expect(extract([{ name: 'big.bin', data: 'x', declaredSize: big }])).rejects.toThrow(
      /总大小超过上限/,
    );
  });

  it('坏 zip（非 zip 字节）拒绝', async () => {
    const dir = tmpDir();
    await expect(extractZipSafe(Buffer.from('not a zip'), path.join(dir, 'out'))).rejects.toThrow(
      ApiError,
    );
  });

  it('目录条目创建子目录', async () => {
    const { outDir } = await extract([
      { name: 'assets/', data: '' },
      { name: 'assets/index.html', data: '<h1>d</h1>' },
    ]);
    expect(fs.statSync(path.join(outDir, 'assets')).isDirectory()).toBe(true);
  });
});

describe('findZipEntryFile', () => {
  it('有 index.html 时优先；没有时取第一个 html', async () => {
    const dir = tmpDir();
    await extractZipSafe(
      buildZip([{ name: 'sub/start.html', data: '<h1>s</h1>' }]),
      path.join(dir, 'projects', 'p'),
    );
    expect(findZipEntryFile(dir, 'p')).toBe('sub/start.html');

    const dir2 = tmpDir();
    await extractZipSafe(
      buildZip([
        { name: 'index.html', data: '<h1>i</h1>' },
        { name: 'other.html', data: '<h1>o</h1>' },
      ]),
      path.join(dir2, 'projects', 'p'),
    );
    expect(findZipEntryFile(dir2, 'p')).toBe('index.html');
  });

  it('zip 内没有 html → 报错', async () => {
    const dir = tmpDir();
    await extractZipSafe(
      buildZip([{ name: 'a.css', data: 'body{}' }]),
      path.join(dir, 'projects', 'p'),
    );
    expect(() => findZipEntryFile(dir, 'p')).toThrow(/没有可用的 HTML 入口文件/);
  });
});

describe('resolvePlayFile', () => {
  it('默认 index.html；entry 可指定白名单文件', () => {
    const dir = tmpDir();
    saveSingleHtml(dir, 'p1', Buffer.from('<h1>hello</h1>'));
    fs.writeFileSync(path.join(dir, 'projects/p1/main.js'), 'console.log(1)');
    expect(resolvePlayFile(dir, 'p1', undefined).relativeName).toBe('index.html');
    expect(resolvePlayFile(dir, 'p1', 'main.js').relativeName).toBe('main.js');
  });

  it('非白名单扩展名 → 404（NOT_FOUND）', () => {
    const dir = tmpDir();
    saveSingleHtml(dir, 'p1', Buffer.from('<h1>x</h1>'));
    expect(() => resolvePlayFile(dir, 'p1', 'evil.php')).toThrow(ApiError);
  });

  it('路径穿越 entry → 拒绝', () => {
    const dir = tmpDir();
    saveSingleHtml(dir, 'p1', Buffer.from('<h1>x</h1>'));
    expect(() => resolvePlayFile(dir, 'p1', '../secret.html')).toThrow(ApiError);
    expect(() => resolvePlayFile(dir, 'p1', '/etc/passwd')).toThrow(ApiError);
  });

  it('白名单但文件不存在 → 404', () => {
    const dir = tmpDir();
    saveSingleHtml(dir, 'p1', Buffer.from('<h1>x</h1>'));
    expect(() => resolvePlayFile(dir, 'p1', 'missing.js')).toThrow(ApiError);
  });
});
