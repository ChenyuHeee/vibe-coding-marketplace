/**
 * 下载辅助 —— GET /api/projects/:id/download（zip 流，需登录）
 *
 * fetch 无法让 <a> 带 Authorization 头，故用 fetch(blob) → 触发浏览器下载。
 * 错误统一抛 ApiError（{error:{code,message}} 已解析）。
 */
import { getToken } from './client';

const BASE_URL = '/api';

export async function downloadProjectZip(projectId: string, fileName?: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`${BASE_URL}/projects/${projectId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = `下载失败（HTTP ${response.status}）`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      // 非 JSON 错误体，用默认文案
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName ?? `${projectId}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
