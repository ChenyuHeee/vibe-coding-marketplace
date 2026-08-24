/**
 * 作品线路由（PR-B2-A）：
 * - 上传（seller，multipart：file html/zip + cover 可选）→ draft
 * - 审核流：submit / review 进度 / delist（reason 必填）
 * - 市场：列表（approved）/ 分类 / 详情（含 reviews、isPurchased、canDownload）
 * - 举报：POST /:id/report（登录）
 * - 下载：GET /:id/download（已购/作者，zip 流）；报价预览 GET /:id/quote
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  PROJECT_CATEGORIES,
  type ProjectCategory,
} from '@vibe/shared';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAuth, requireOptionalAuth, requireRole } from '../middleware/auth';
import {
  COVER_EXT_WHITELIST,
  MAX_SINGLE_HTML_BYTES,
  MAX_ZIP_BYTES,
  createProjectZipStream,
  extractZipSafe,
  findZipEntryFile,
  projectDir,
  removeProjectDir,
  saveCover,
  saveSingleHtml,
} from '../lib/upload';
import { calcFeeCr, isNonNegativeInt } from '../lib/money';
import {
  canDownloadProject,
  canViewProject,
  createProject,
  delistProject,
  getProjectDetail,
  getProjectRow,
  getReviewProgress,
  listProjects,
  reportProject,
  submitProject,
  updateProject,
} from '../services/projects';

const router = Router();

// ---------------------------------------------------------------------------
// multipart 上传（内存存储；file: html(≤20MB) 或 zip(≤50MB)；cover: 图片可选）
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_BYTES, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'file') {
      if (ext === '.html' || ext === '.htm' || ext === '.zip') {
        cb(null, true);
      } else {
        cb(ApiError.badRequest('VALIDATION', '作品文件仅支持 .html / .htm 或 .zip'));
      }
      return;
    }
    if (file.fieldname === 'cover') {
      if (COVER_EXT_WHITELIST.includes(ext)) {
        cb(null, true);
      } else {
        cb(ApiError.badRequest('VALIDATION', '封面仅支持 png / jpg / jpeg / gif / webp 图片'));
      }
      return;
    }
    cb(ApiError.badRequest('VALIDATION', `上传字段不合法：${file.fieldname}（仅 file / cover）`));
  },
});

const projectUpload = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

type UploadedFiles = { file?: Express.Multer.File[]; cover?: Express.Multer.File[] };

function fileOf(files: unknown, name: keyof UploadedFiles): Express.Multer.File | undefined {
  return (files as UploadedFiles | undefined)?.[name]?.[0];
}

/**
 * 校验 multipart 文本字段。
 * - POST：priceCr 缺省 = 0（免费）
 * - PUT：priceCr 缺省 = 不更新（undefined）
 */
function validateMeta(body: Record<string, unknown>, mode: 'create' | 'update') {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (title === '') throw ApiError.badRequest('VALIDATION', '标题不能为空');
  if (title.length > 120) throw ApiError.badRequest('VALIDATION', '标题最长 120 字');
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description === '') throw ApiError.badRequest('VALIDATION', '描述不能为空');
  const category = body.category as ProjectCategory;
  if (!PROJECT_CATEGORIES.includes(category)) {
    throw ApiError.badRequest('VALIDATION', `category 只能是：${PROJECT_CATEGORIES.join(' / ')}`);
  }
  const priceRaw = body.priceCr === undefined || body.priceCr === '' ? undefined : Number(body.priceCr);
  if (priceRaw !== undefined && !isNonNegativeInt(priceRaw)) {
    throw ApiError.badRequest('VALIDATION', 'priceCr 必须是非负整数（0 = 免费）');
  }
  const priceCr = priceRaw ?? (mode === 'create' ? 0 : undefined);
  const trialScope = typeof body.trialScope === 'string' ? body.trialScope.trim() : '';
  return { title, description, category, priceCr, trialScope };
}

/** 处理上传的作品文件（file 字段）：返回入口文件名；zip 失败时清理目录 */
async function storeProjectFiles(
  uploadsDir: string,
  projectId: string,
  file: Express.Multer.File,
): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.html' || ext === '.htm') {
    if (file.size > MAX_SINGLE_HTML_BYTES) {
      throw ApiError.badRequest('VALIDATION', `单文件 HTML 最大 ${MAX_SINGLE_HTML_BYTES / 1024 / 1024}MB`);
    }
    saveSingleHtml(uploadsDir, projectId, file.buffer);
    return 'index.html';
  }
  try {
    await extractZipSafe(file.buffer, projectDir(uploadsDir, projectId));
    return findZipEntryFile(uploadsDir, projectId);
  } catch (e) {
    removeProjectDir(uploadsDir, projectId);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 市场（区域 1）
// ---------------------------------------------------------------------------

// GET /api/projects —— 公开，只列 approved
router.get('/', (req, res) => {
  const result = listProjects(req.db, {
    category: req.query.category,
    q: req.query.q,
    minRating: req.query.minRating,
    sort: req.query.sort,
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

// GET /api/projects/:id —— 公开（delisted 仅作者/已购可见）
router.get('/:id', requireOptionalAuth, (req, res) => {
  res.json(getProjectDetail(req.db, req.params.id, req.user ?? null));
});

// GET /api/projects/:id/quote —— 下单前总价预览（PRD 4：一屏显示含手续费总价）
router.get('/:id/quote', requireOptionalAuth, (req, res) => {
  const project = getProjectRow(req.db, req.params.id);
  if (!canViewProject(req.db, project, req.user ?? null)) {
    throw ApiError.notFound('作品不存在');
  }
  const feeCr = calcFeeCr(project.price_cr);
  res.json({
    orderId: null,
    projectId: project.id,
    projectTitle: project.title,
    priceCr: project.price_cr,
    feeCr,
    totalCr: project.price_cr + feeCr,
  });
});

// ---------------------------------------------------------------------------
// 上传与审核（区域 2）
// ---------------------------------------------------------------------------

// POST /api/projects —— seller，multipart/form-data；创建后 status=draft
router.post(
  '/',
  requireAuth,
  requireRole('seller'),
  projectUpload,
  asyncHandler(async (req, res) => {
    const file = fileOf(req.files, 'file');
    if (!file) {
      throw ApiError.badRequest('VALIDATION', '请上传作品文件（.html / .htm 或 .zip）');
    }
    const meta = validateMeta((req.body ?? {}) as Record<string, unknown>, 'create');
    const uploadsDir = req.app.locals.uploadsDir as string;
    const projectId = randomUUID();
    const entryFile = await storeProjectFiles(uploadsDir, projectId, file);

    const cover = fileOf(req.files, 'cover');
    const coverUrl = cover
      ? saveCover(uploadsDir, projectId, cover.buffer, cover.originalname)
      : null;

    const project = createProject(req.db, req.user!.id, {
      id: projectId,
      title: meta.title,
      description: meta.description,
      category: meta.category,
      priceCr: meta.priceCr as number,
      trialScope: meta.trialScope,
      coverUrl,
      entryFile,
    });
    res.status(201).json({ project });
  }),
);

// PUT /api/projects/:id —— 作者改元数据（status 不可改；可选重传 file/cover）
router.put(
  '/:id',
  requireAuth,
  requireRole('seller'),
  projectUpload,
  asyncHandler(async (req, res) => {
    const existing = getProjectRow(req.db, req.params.id);
    if (existing.seller_id !== req.user!.id) {
      throw ApiError.forbidden('只有作者本人可以编辑作品');
    }
    const meta = validateMeta((req.body ?? {}) as Record<string, unknown>, 'update');
    const uploadsDir = req.app.locals.uploadsDir as string;

    let entryFile: string | undefined;
    const file = fileOf(req.files, 'file');
    if (file) {
      entryFile = await storeProjectFiles(uploadsDir, existing.id, file);
    }
    const cover = fileOf(req.files, 'cover');
    const coverUrl = cover
      ? saveCover(uploadsDir, existing.id, cover.buffer, cover.originalname)
      : undefined;

    updateProject(req.db, existing.id, req.user!.id, {
      title: meta.title,
      description: meta.description,
      category: meta.category,
      priceCr: meta.priceCr,
      trialScope: meta.trialScope || undefined,
      coverUrl,
      entryFile,
    });
    res.json({ project: getProjectDetail(req.db, existing.id, req.user ?? null) });
  }),
);

// POST /api/projects/:id/submit —— 作者提交审核（词汇表：提交后自动进入 under review）
router.post('/:id/submit', requireAuth, requireRole('seller'), (req, res) => {
  const project = submitProject(req.db, req.params.id, req.user!.id);
  res.json({
    project: { id: project.id, title: project.title, status: project.status, submittedAt: project.submitted_at },
  });
});

// GET /api/projects/:id/review —— 作者查看审核进度（核心：我的作品到哪一步了）
router.get('/:id/review', requireAuth, requireRole('seller'), (req, res) => {
  res.json(getReviewProgress(req.db, req.params.id, req.user!.id));
});

// POST /api/projects/:id/delist —— 作者下架（reason 必填；已购买家保留访问权）
router.post('/:id/delist', requireAuth, requireRole('seller'), (req, res) => {
  const body = (req.body ?? {}) as { reason?: unknown };
  const project = delistProject(req.db, req.params.id, req.user!.id, String(body.reason ?? ''));
  res.json({
    project: { id: project.id, title: project.title, status: project.status, delistedAt: project.delisted_at },
  });
});

// POST /api/projects/:id/report —— 登录用户举报（reason 必填）
router.post('/:id/report', requireAuth, (req, res) => {
  const body = (req.body ?? {}) as { reason?: unknown };
  const report = reportProject(req.db, req.params.id, req.user!.id, String(body.reason ?? ''));
  res.status(201).json({ report });
});

// GET /api/projects/:id/download —— 已购 / 作者本人（zip 打包）
router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = getProjectRow(req.db, req.params.id);
    if (!canDownloadProject(req.db, project, req.user ?? null)) {
      throw ApiError.forbidden('只有已购买家或作者本人可以下载');
    }
    const uploadsDir = req.app.locals.uploadsDir as string;
    const archive = createProjectZipStream(uploadsDir, project.id);
    req.db.prepare('UPDATE projects SET download_count = download_count + 1 WHERE id = ?').run(project.id);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="project-${project.id}.zip"`,
      'Cache-Control': 'no-store',
    });
    archive.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'INTERNAL', message: '打包下载失败' } });
      } else {
        res.destroy();
      }
    });
    archive.pipe(res);
  }),
);

export default router;
