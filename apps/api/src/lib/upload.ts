/**
 * 作品文件存储与试玩安全（docs/ARCHITECTURE.md §3.3 —— 硬性要求）。
 *
 * - 存储：uploads/projects/<projectId>/，入口 index.html（单文件上传重命名；zip 解压）
 * - zip 解压边界：总解压 ≤100MB、条目 ≤1000、路径穿越拒绝、拒绝符号链接、
 *   只保留白名单扩展名（其余丢弃）
 * - 试玩回放：MIME 白名单外一律 404；CSP sandbox + nosniff + inline 响应头
 */
import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import { ApiError } from './errors';

/** 回放/解压白名单扩展名（ARCHITECTURE §3.3；小写，含点） */
export const PLAY_EXT_WHITELIST: readonly string[] = [
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.mp3',
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
  '.txt',
  '.md',
  '.pdf',
];

/** 封面图片白名单 */
export const COVER_EXT_WHITELIST: readonly string[] = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

/** 上传大小边界（ARCHITECTURE §3.3） */
export const MAX_SINGLE_HTML_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_UNZIP_TOTAL_BYTES = 100 * 1024 * 1024; // 总解压 ≤100MB
export const MAX_ZIP_ENTRIES = 1000; // 条目 ≤1000

export function projectDir(uploadsDir: string, projectId: string): string {
  return path.join(uploadsDir, 'projects', projectId);
}

export function extWhitelisted(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return PLAY_EXT_WHITELIST.includes(ext);
}

function assertSafeRelativePath(relativePath: string): void {
  // zip 条目/entry 参数必须为相对路径：拒绝绝对路径、.. 逃逸、Windows 反斜杠
  if (relativePath.includes('\\')) {
    throw ApiError.badRequest('VALIDATION', `非法路径（不允许反斜杠）：${relativePath}`);
  }
  if (path.isAbsolute(relativePath)) {
    throw ApiError.badRequest('VALIDATION', `非法路径（不允许绝对路径）：${relativePath}`);
  }
  const normalized = path.posix.normalize(relativePath);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw ApiError.badRequest('VALIDATION', `非法路径（不允许 .. 穿越）：${relativePath}`);
  }
}

/**
 * 安全解压 zip（yauzl 流式）：
 * - 目录条目跳过；总条目 >1000 拒绝；累计解压体积 >100MB 拒绝
 * - 路径穿越拒绝（规范化后必须在前缀内）
 * - 符号链接拒绝（unix 模式 S_IFLNK = 0xA000）
 * - 只保留白名单扩展名文件，其余丢弃（目录始终保留以维持结构）
 * 返回实际解压出的文件相对路径列表（含目录）。
 */
export function extractZipSafe(zipBuffer: Buffer, destDir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true, decodeStrings: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(ApiError.badRequest('VALIDATION', '无法解析 zip 文件（文件损坏或不是合法 zip）'));
        return;
      }

      const written: string[] = [];
      let entryCount = 0;
      let totalUncompressed = 0;
      let failed = false;

      const fail = (message: string): void => {
        if (failed) return;
        failed = true;
        zipfile.close();
        reject(ApiError.badRequest('VALIDATION', message));
      };

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (failed) return;
        entryCount += 1;
        if (entryCount > MAX_ZIP_ENTRIES) {
          fail(`zip 条目数超过上限（${MAX_ZIP_ENTRIES}）`);
          return;
        }
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > MAX_UNZIP_TOTAL_BYTES) {
          fail(`zip 解压后总大小超过上限（${MAX_UNZIP_TOTAL_BYTES / 1024 / 1024}MB）`);
          return;
        }

        const rawName = entry.fileName.replace(/\\/g, '/');
        // 符号链接拒绝：unix 外部属性高 16 位 = S_IFLNK(0xA000)
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        const isSymlink = (mode & 0xf000) === 0xa000;
        if (isSymlink) {
          fail(`zip 包含符号链接，已拒绝：${rawName}`);
          return;
        }

        if (/\/$/.test(rawName)) {
          // 目录条目：校验安全后创建目录
          try {
            assertSafeRelativePath(rawName);
            const dirAbs = path.join(destDir, rawName);
            if (!dirAbs.startsWith(path.resolve(destDir) + path.sep)) {
              fail(`zip 路径越界，已拒绝：${rawName}`);
              return;
            }
            fs.mkdirSync(dirAbs, { recursive: true });
            written.push(rawName);
          } catch (e) {
            fail(e instanceof ApiError ? e.message : `zip 目录条目非法：${rawName}`);
            return;
          }
          zipfile.readEntry();
          return;
        }

        // 普通文件：白名单扩展名过滤（其余丢弃）
        if (!extWhitelisted(rawName)) {
          zipfile.readEntry();
          return;
        }
        try {
          assertSafeRelativePath(rawName);
        } catch (e) {
          fail(e instanceof ApiError ? e.message : `zip 条目路径非法：${rawName}`);
          return;
        }
        const fileAbs = path.join(destDir, rawName);
        if (!fileAbs.startsWith(path.resolve(destDir) + path.sep)) {
          fail(`zip 路径越界，已拒绝：${rawName}`);
          return;
        }
        fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (failed) return;
          if (streamErr || !readStream) {
            fail(`zip 条目读取失败：${rawName}`);
            return;
          }
          const writeStream = fs.createWriteStream(fileAbs);
          readStream.on('error', () => fail(`zip 条目写入失败：${rawName}`));
          writeStream.on('error', () => fail(`zip 条目写入失败：${rawName}`));
          writeStream.on('close', () => {
            if (failed) return;
            written.push(rawName);
            zipfile.readEntry();
          });
          readStream.pipe(writeStream);
        });
      });

      zipfile.on('end', () => {
        if (!failed) resolve(written);
      });
      zipfile.on('error', (e: Error) => {
        if (!failed) {
          // yauzl 自身也会校验条目路径（.. / 绝对路径直接报错），映射成人话
          const msg = e.message;
          if (msg.includes('relative path') || msg.includes('absolute path')) {
            fail(`zip 条目路径非法（不允许路径穿越或绝对路径）：${msg}`);
          } else {
            fail('zip 读取失败（文件损坏）');
          }
        }
      });
    });
  });
}

/** 清空并重建项目目录（PUT 替换文件 / 重新上传时用） */
export function resetProjectDir(uploadsDir: string, projectId: string): void {
  const dir = projectDir(uploadsDir, projectId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** 删除整个项目目录（失败清理用，不留空目录） */
export function removeProjectDir(uploadsDir: string, projectId: string): void {
  fs.rmSync(projectDir(uploadsDir, projectId), { recursive: true, force: true });
}

/** 单文件 HTML 上传：重命名为 index.html 写入项目目录 */
export function saveSingleHtml(uploadsDir: string, projectId: string, buffer: Buffer): void {
  resetProjectDir(uploadsDir, projectId);
  fs.writeFileSync(path.join(projectDir(uploadsDir, projectId), 'index.html'), buffer);
}

/**
 * zip 解压后确定入口文件：优先 index.html，否则取第一个白名单 .html/.htm 文件。
 * 返回相对路径（如 'index.html' 或 'src/main.html'）。
 */
export function findZipEntryFile(uploadsDir: string, projectId: string): string {
  return findDirEntryFile(projectDir(uploadsDir, projectId));
}

/** 目录内找入口 HTML：优先 index.html/index.htm，否则第一个白名单 .html/.htm 文件 */
export function findDirEntryFile(dir: string): string {
  if (!fs.existsSync(dir)) {
    throw ApiError.badRequest('VALIDATION', '目录内没有任何文件被保留');
  }
  for (const name of ['index.html', 'index.htm']) {
    if (fs.existsSync(path.join(dir, name))) return name;
  }
  const found = findFirstHtml(dir, '');
  if (found) return found;
  throw ApiError.badRequest(
    'VALIDATION',
    '交付物内没有可用的 HTML 入口文件（需包含 .html/.htm 文件）',
  );
}

function findFirstHtml(dir: string, rel: string): string | null {
  for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
    const childRel = rel === '' ? name : `${rel}/${name}`;
    const abs = path.join(dir, childRel);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const found = findFirstHtml(dir, childRel);
      if (found) return found;
    } else if (name.endsWith('.html') || name.endsWith('.htm')) {
      return childRel;
    }
  }
  return null;
}

/** 保存封面：uploads/projects/<id>/cover.<ext>，返回 /api/files/<id>/cover 公开地址 */
export function saveCover(uploadsDir: string, projectId: string, buffer: Buffer, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!COVER_EXT_WHITELIST.includes(ext)) {
    throw ApiError.badRequest('VALIDATION', '封面仅支持 png / jpg / jpeg / gif / webp 图片');
  }
  const dir = projectDir(uploadsDir, projectId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `cover${ext}`), buffer);
  return `/api/files/${projectId}/cover${ext}`;
}

export interface ResolvedPlayFile {
  absPath: string;
  relativeName: string;
}

/** 里程碑交付物目录：uploads/milestones/<contractId>/<seq>/ */
export function milestoneDir(uploadsDir: string, contractId: string, seq: number): string {
  return path.join(uploadsDir, 'milestones', contractId, String(seq));
}

/**
 * 安全解析目录内文件：规范化后必须在 rootDir 内；扩展名必须在白名单内；必须是文件。
 * 不在白名单/不存在/越界 → 抛 ApiError（404）。
 */
export function resolveDirFile(rootDir: string, entry: unknown): ResolvedPlayFile {
  const root = path.resolve(rootDir);
  const rawEntry =
    typeof entry === 'string' && entry.trim() !== '' ? entry.trim().replace(/\\/g, '/') : 'index.html';
  assertSafeRelativePath(rawEntry);
  if (!extWhitelisted(rawEntry)) {
    throw ApiError.notFound('文件类型不在回放白名单内');
  }
  const absPath = path.resolve(root, rawEntry);
  if (absPath !== root && !absPath.startsWith(root + path.sep)) {
    throw ApiError.notFound('文件不存在');
  }
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    throw ApiError.notFound('文件不存在');
  }
  return { absPath, relativeName: rawEntry };
}

/**
 * 安全解析试玩/回放文件：默认 index.html，?entry= 指定相对路径（委托 resolveDirFile）。
 */
export function resolvePlayFile(
  uploadsDir: string,
  projectId: string,
  entry: unknown,
): ResolvedPlayFile {
  return resolveDirFile(projectDir(uploadsDir, projectId), entry);
}

/** 项目目录 → zip 流（下载：GET /api/projects/:id/download） */
export function createProjectZipStream(uploadsDir: string, projectId: string): archiver.Archiver {
  const dir = projectDir(uploadsDir, projectId);
  if (!fs.existsSync(dir)) {
    throw ApiError.notFound('作品文件不存在');
  }
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.directory(dir, false); // 目录内文件打到 zip 根
  archive.finalize();
  return archive;
}
