/**
 * 卖家工作台 API（docs/API.md §3 上传与审核）—— 挂在统一 client 之上。
 *
 * - multipart 上传（POST /api/projects / PUT /api/projects/:id）用 XHR 实现，
 *   因为 fetch 不暴露上传进度（Q2：能算百分比给百分比，字节 + 百分比）；
 * - 其余端点复用 client 的 fetch 封装（统一错误/401 处理）。
 *
 * ⚠️ 契约扩展（PR-F3-A）：`GET /api/projects/mine` 不在 API.md 草案中，
 * 由本 PR 在后端补充实现（作者本人全部状态作品列表）。
 */
import {
  ApiError,
  api,
  clearToken,
  getToken,
  UNAUTHORIZED_EVENT,
} from './client';
import type { Cr } from '@vibe/shared';
import type { ProjectDetail } from '../types/marketplace';
import type {
  ReviewProgress,
  SellerProjectListResponse,
  UploadProgress,
} from '../types/seller';

export const MAX_HTML_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB（单文件 html/htm）
export const MAX_ZIP_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB（zip）

/** 前端预校验结果（拖放区四状态中的「错误」态数据源） */
export type FilePickError = 'unsupported' | 'too-large' | 'empty';

export interface PickResult {
  file: File | null;
  error: FilePickError | null;
  /** 人话错误说明（ErrorBanner 三件事之一：为什么） */
  reason: string | null;
}

/** 校验拖入/选中的作品文件：html ≤20MB、zip ≤50MB（与后端 ARCHITECTURE §3.3 对齐） */
export function validateProjectFile(file: File | null): PickResult {
  if (!file) return { file: null, error: 'empty', reason: '没有选择文件。' };
  const ext = file.name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';
  if (ext !== 'html' && ext !== 'htm' && ext !== 'zip') {
    return {
      file: null,
      error: 'unsupported',
      reason: '仅支持 .html / .htm 单文件（≤20MB）或 .zip 压缩包（≤50MB），当前文件不是这两种类型。',
    };
  }
  const limit = ext === 'zip' ? MAX_ZIP_UPLOAD_BYTES : MAX_HTML_UPLOAD_BYTES;
  const limitMb = limit / 1024 / 1024;
  if (file.size > limit) {
    return {
      file: null,
      error: 'too-large',
      reason: `文件超过 ${limitMb}MB 上限（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）。请压缩后重试，或改用 zip 打包（≤50MB）。`,
    };
  }
  return { file, error: null, reason: null };
}

/**
 * multipart 上传（XHR）：真实字节进度回调；错误解析与 client 一致
 * （`{ error: { code, message } }`；401 清除凭证并广播登出）。
 * 返回 { promise, abort } —— Q2「随时可取消」：取消后 promise 以 ABORTED 拒绝。
 */
function startUpload<T>(
  path: string,
  formData: FormData,
  onProgress?: (p: UploadProgress) => void,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${'/api'}${path}`);
  const token = getToken();
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.setRequestHeader('Accept', 'application/json');

  xhr.upload.onprogress = (e) => {
    if (onProgress && e.lengthComputable && e.total > 0) {
      onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: Math.min(100, Math.round((e.loaded / e.total) * 100)),
      });
    }
  };
  const promise = new Promise<T>((resolve, reject) => {
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // 非 JSON 响应按文本错误处理
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
        return;
      }
      if (xhr.status === 401 && token) {
        clearToken();
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
      const errBody = (body as { error?: { code?: string; message?: string } } | null)?.error;
      reject(
        new ApiError(
          xhr.status,
          errBody?.code ?? 'UNKNOWN',
          errBody?.message ?? `请求失败（HTTP ${xhr.status}）。`,
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', '网络连接不稳定，服务器没有响应。'));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', '上传已取消。'));
    xhr.send(formData);
  });
  return { promise, abort: () => xhr.abort() };
}

export interface CreateProjectResult {
  project: { id: string; status: string; title: string };
}

export interface UpdateProjectResult {
  project: ProjectDetail;
}

export interface SubmitProjectResult {
  project: { id: string; title: string; status: string; submittedAt: string | null };
}

export interface DelistProjectResult {
  project: { id: string; title: string; status: string; delistedAt: string | null };
}

/** 上传表单元数据 → FormData（POST 创建 / PUT 编辑共用） */
export function projectMetaToFormData(
  meta: { title: string; description: string; category: string; priceCr: Cr; trialScope: string },
  file?: File | null,
): FormData {
  const fd = new FormData();
  fd.append('title', meta.title);
  fd.append('description', meta.description);
  fd.append('category', meta.category);
  fd.append('priceCr', String(meta.priceCr));
  fd.append('trialScope', meta.trialScope);
  if (file) fd.append('file', file);
  return fd;
}

export const sellerApi = {
  /**
   * GET /api/seller/projects —— 我的作品（全部状态 + 审核进度字段）。
   * ⚠️ 后端实现中（Issue #30）：契约 `{items:[{id,title,status,coverUrl,priceCr,
   * trialScope,createdAt,reviewNote}],page,pageSize,total}`；BE 合入后对齐 shared 类型。
   */
  mine: (page = 1, pageSize = 20) =>
    api.get<SellerProjectListResponse>(`/seller/projects?page=${page}&pageSize=${pageSize}`),

  /** GET /api/projects/:id —— 作者详情（编辑表单回填 description） */
  detail: (id: string) => api.get<ProjectDetail>(`/projects/${id}`),

  /** POST /api/projects —— 创建（multipart，带上传进度）→ draft */
  create: (formData: FormData, onProgress?: (p: UploadProgress) => void) =>
    startUpload<CreateProjectResult>('/projects', formData, onProgress),

  /** PUT /api/projects/:id —— 编辑元数据（status 只读展示，不可在此修改） */
  update: (id: string, formData: FormData, onProgress?: (p: UploadProgress) => void) =>
    startUpload<UpdateProjectResult>(`/projects/${id}`, formData, onProgress),

  /** POST /api/projects/:id/submit —— 提交审核（→ under review） */
  submit: (id: string) => api.post<SubmitProjectResult>(`/projects/${id}/submit`),

  /** GET /api/projects/:id/review —— 审核进度（我的作品到哪一步了） */
  review: (id: string) => api.get<ReviewProgress>(`/projects/${id}/review`),

  /** POST /api/projects/:id/delist —— 下架（reason 必填；已购买家保留访问权） */
  delist: (id: string, reason: string) =>
    api.post<DelistProjectResult>(`/projects/${id}/delist`, { reason }),
};
