/**
 * 合同路由（PR-B3-B）：启动（预算进托管）/ 里程碑提交（multipart，zip 安全解压）/
 * 最终验收 / 结算放款 / 列表 / 详情。状态词见 services/contracts.ts 与词汇表 §3。
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { ApiError, asyncHandler } from '../lib/errors';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  MAX_SINGLE_HTML_BYTES,
  MAX_ZIP_BYTES,
  extractZipSafe,
  findDirEntryFile,
  milestoneDir,
} from '../lib/upload';
import {
  acceptContract,
  beginMilestoneSubmission,
  createMilestone,
  getContract,
  listContracts,
  payoutContract,
  startContract,
  type MilestoneCreateInput,
} from '../services/contracts';

const router = Router();

// ---------------------------------------------------------------------------
// multipart（里程碑交付物：file = .html/.htm 单文件 或 .zip；文本字段 title/description/final）
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'file') {
      if (ext === '.html' || ext === '.htm' || ext === '.zip') {
        cb(null, true);
      } else {
        cb(ApiError.badRequest('VALIDATION', '交付物文件仅支持 .html / .htm 或 .zip'));
      }
      return;
    }
    cb(ApiError.badRequest('VALIDATION', `上传字段不合法：${file.fieldname}（仅 file）`));
  },
});

const milestoneUpload = upload.fields([{ name: 'file', maxCount: 1 }]);

type UploadedFiles = { file?: Express.Multer.File[] };

function fileOf(files: unknown): Express.Multer.File | undefined {
  return (files as UploadedFiles | undefined)?.['file']?.[0];
}

/** 存储里程碑交付物：uploads/milestones/<contractId>/<seq>/（zip 安全解压复用） */
async function storeMilestoneDeliverable(
  uploadsDir: string,
  contractId: string,
  seq: number,
  file: Express.Multer.File,
): Promise<{ deliverablePath: string; entryFile: string }> {
  const dir = milestoneDir(uploadsDir, contractId, seq);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file.originalname).toLowerCase();
  let entryFile: string;
  try {
    if (ext === '.html' || ext === '.htm') {
      if (file.size > MAX_SINGLE_HTML_BYTES) {
        throw ApiError.badRequest(
          'VALIDATION',
          `单文件 HTML 最大 ${MAX_SINGLE_HTML_BYTES / 1024 / 1024}MB`,
        );
      }
      fs.writeFileSync(path.join(dir, 'index.html'), file.buffer);
      entryFile = 'index.html';
    } else {
      await extractZipSafe(file.buffer, dir); // 白名单/路径穿越/符号链接拒绝（lib/upload.ts）
      entryFile = findDirEntryFile(dir);
    }
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true }); // 失败清理，不留半成品
    throw e;
  }
  return { deliverablePath: `milestones/${contractId}/${seq}`, entryFile };
}

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------

// GET /api/contracts —— 我的合同（?role=buyer|contractor&status=&page=）
router.get('/', requireAuth, (req, res) => {
  const result = listContracts(req.db, req.user!.id, {
    role: req.query.role,
    status: req.query.status,
    page: req.query.page !== undefined ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

// GET /api/contracts/:id —— 合同详情（买卖双方可见，同一 status 词）
router.get('/:id', requireAuth, (req, res) => {
  res.json({ contract: getContract(req.db, req.params.id, req.user!.id) });
});

// POST /api/contracts/:id/start —— buyer 启动：selected → in progress，预算进托管
router.post(
  '/:id/start',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const result = startContract(req.db, req.params.id, req.user!.id);
    res.json(result);
  }),
);

// POST /api/contracts/:id/milestones —— contractor 提交里程碑（multipart，交付物必传）
router.post(
  '/:id/milestones',
  requireAuth,
  requireRole('contractor'),
  milestoneUpload,
  asyncHandler(async (req, res) => {
    const file = fileOf(req.files);
    if (!file) {
      throw ApiError.badRequest('VALIDATION', '请上传交付物文件（.html / .htm 或 .zip）');
    }
    // 先校验合同+接单者并分配 seq（目录名），再存文件，最后落库
    const { seq } = beginMilestoneSubmission(req.db, req.params.id, req.user!.id);
    const uploadsDir = req.app.locals.uploadsDir as string;
    const { deliverablePath, entryFile } = await storeMilestoneDeliverable(
      uploadsDir,
      req.params.id,
      seq,
      file,
    );
    const milestone = createMilestone(
      req.db,
      req.params.id,
      req.user!.id,
      // multipart 字段 final → 服务入参 isFinal
      {
        ...(req.body ?? {}),
        seq,
        isFinal: (req.body as Record<string, unknown> | undefined)?.final,
      } as MilestoneCreateInput,
      deliverablePath,
      entryFile,
    );
    res.status(201).json({ milestone });
  }),
);

// POST /api/contracts/:id/accept —— buyer 最终验收：milestone submission → buyer acceptance
router.post(
  '/:id/accept',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const contract = acceptContract(req.db, req.params.id, req.user!.id);
    res.json({ contract });
  }),
);

// POST /api/contracts/:id/payout —— buyer 结算放款：buyer acceptance → payout（escrow released）
router.post(
  '/:id/payout',
  requireAuth,
  requireRole('buyer'),
  asyncHandler(async (req, res) => {
    const result = payoutContract(req.db, req.params.id, req.user!.id);
    res.json(result);
  }),
);

export default router;
