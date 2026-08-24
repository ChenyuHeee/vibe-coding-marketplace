/**
 * SellPage —— 卖家工作台（区域 2 上传与上架，issue #3 前端收尾）
 *
 * - 路由 `/sell`：RequireAuth + seller 角色守卫；无 seller 角色时引导开通（→ 个人中心）；
 * - **上传表单**（Q1 精神 + 四状态）：
 *   - FileDropzone：拖入 html（≤20MB）/ zip（≤50MB），空态 / 进行中（字节+百分比，Q2，
 *     可取消）/ 错误（类型/超限原因 + 换一种方式）/ 成功（文件已就绪 + 下一步）；
 *   - 字段：标题 / 描述 / 分类（PROJECT_CATEGORIES 单选）/ 定价（免费|定价切换，
 *     显示平台手续费 5% 与到手金额预估）/ 试用范围（trialScope 文案）；
 *   - **草稿自动保存**（Q3：输入即存 localStorage，刷新不丢）；
 *   - 提交 → POST /api/projects（multipart）→ 自动进入审核进度页（/sell/:id）；
 * - **我的作品列表**（作者视角）：全部状态 + StatusBadge + 审核进度入口 + 编辑 + 下架；
 *   空态「上传你的第一个作品」引导。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ClipboardList, Loader2, Pencil, Send, Store, UploadCloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { StatusBadge } from '../components/StatusBadge';
import { Skeleton } from '../components/Skeleton';
import { Pagination } from '../components/Pagination';
import { FileDropzone } from '../components/FileDropzone';
import { ProjectMetaForm } from '../components/seller/ProjectMetaForm';
import { sellerApi } from '../api/seller';
import { useDraft } from '../lib/useDraft';
import type { SellerProjectItem, UploadProgress } from '../types/seller';
import type { ProjectMetaDraft } from '../types/seller';
import { CATEGORY_LABELS } from '../components/seller/ProjectMetaForm';
import { formatPriceCr } from '../lib/format';

const DRAFT_KEY = 'vibe.sell.draft.v1';
const PAGE_SIZE = 10;

function initialDraft(): ProjectMetaDraft {
  return { title: '', description: '', category: '', priceCr: 0, priced: false, trialScope: '' };
}

export function SellPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ---------- 上传表单 ----------
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta, clearDraft] = useDraft<ProjectMetaDraft>(DRAFT_KEY, initialDraft);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const abortRef = useRef<(() => void) | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // ---------- 我的作品列表 ----------
  const [projects, setProjects] = useState<SellerProjectItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const loadMine = useCallback(async (p: number) => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await sellerApi.mine(p, PAGE_SIZE);
      setProjects(res.items);
      setTotal(res.total);
    } catch (err) {
      setListError(err instanceof Error ? err.message : '加载我的作品失败。');
      setProjects([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMine(1);
  }, [loadMine]);

  const isSeller = Boolean(user && user.roles.includes('seller'));

  // 无 seller 角色 → 引导开通（D4：角色在注册/账号中管理）
  if (user && !isSeller) {
    return (
      <div className="page">
        <h1 className="text-h1 page__title">卖家工作台</h1>
        <EmptyState
          icon={Store}
          tone="brand"
          title="开通 seller 角色后可上架"
          description="上传与上架需要卖家（seller）角色。演示账号 seller@vibes.local / demo1234 已具备；你也可以在个人中心查看当前角色。"
          actionLabel="去个人中心查看角色"
          onAction={() => navigate('/profile')}
          helpHref="/register"
          helpLabel="注册新账号（可选 seller 角色）"
        />
      </div>
    );
  }

  const handlePickFile = (f: File | null) => {
    setFile(f);
    setFileInfo(f ? { name: f.name, size: f.size } : null);
    setSubmitError(null);
    setFieldErrors((prev) => ({ ...prev, file: '' }));
  };

  // 按钮保持可点（提交时就地校验并提示），仅上传中禁用（§7.2：禁用必须附说明）
  const canSubmit = !uploading;

  const handleSubmit = async () => {
    if (uploading) return;
    // 就地校验（图标 + 文字，§2.7）
    const errors: Record<string, string> = {};
    if (!file) errors.file = '请先选择作品文件（html ≤20MB 或 zip ≤50MB）。';
    if (!meta.title.trim()) errors.title = '标题不能为空。';
    if (!meta.description.trim()) errors.description = '描述不能为空。';
    if (!meta.category) errors.category = '请选择分类。';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSubmitError('请先选择作品文件并填写标题 / 描述 / 分类。');
      return;
    }
    const fd = new FormData();
    fd.append('title', meta.title.trim());
    fd.append('description', meta.description.trim());
    fd.append('category', meta.category);
    fd.append('priceCr', String(meta.priced ? meta.priceCr : 0));
    fd.append('trialScope', meta.trialScope.trim());
    fd.append('file', file!);

    setUploading(true);
    setSubmitError(null);
    setProgress({ loaded: 0, total: 1, percent: 0 });
    const upload = sellerApi.create(fd, (p) => setProgress(p));
    abortRef.current = upload.abort;
    try {
      const res = await upload.promise;
      showToast('作品已创建，可提交审核', { tone: 'success' });
      clearDraft();
      setFile(null);
      setFileInfo(null);
      navigate(`/sell/${res.project.id}`);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'ABORTED') {
        setSubmitError('上传已取消。你填写的内容已保存，可重新提交。');
      } else {
        setSubmitError(e.message ?? '上传失败。');
      }
    } finally {
      setUploading(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    (formRef.current?.querySelector('input,button') as HTMLElement | null)?.focus({ preventScroll: true });
  };

  return (
    <div className="page sell-page">
      <h1 className="text-h1 page__title">卖家工作台</h1>
      <p className="text-body-sm text-secondary sell-page__sub">
        拖入 HTML 或 zip 即可上架；提交后全程可见审核进度（「我的作品到哪一步了」）。
      </p>

      {/* ---------- 上传表单 ---------- */}
      <section className="card sell-form" ref={formRef} aria-label="上传新作品">
        <h2 className="text-h2 sell-form__title">
          <UploadCloud size={20} aria-hidden="true" /> 上传新作品
        </h2>

        <div className="form-field">
          <span className="form-label">
            作品文件 <span className="text-tertiary">（必填）</span>
          </span>
          <FileDropzone
            value={file}
            onChange={handlePickFile}
            progress={progress}
            error={submitError}
            disabled={uploading}
            onAlternative={() => {
              setSubmitError(null);
            }}
          />
          {fileInfo && (
            <p className="form-help" role="status">
              已选择：{fileInfo.name}（{(fileInfo.size / 1024 / 1024).toFixed(1)} MB）· 刷新页面后需重新选择文件（已填信息已自动保存）
            </p>
          )}
        </div>

        <ProjectMetaForm value={meta} onChange={setMeta} disabled={uploading} errors={fieldErrors} />

        {submitError && !file && (
          <p className="form-error">
            <AlertCircle size={14} aria-hidden="true" /> {submitError}
          </p>
        )}

        <div className="sell-form__actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            aria-disabled={uploading}
          >
            {uploading ? <Loader2 className="btn__spinner" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            {uploading ? `上传中 ${Math.round(progress?.percent ?? 0)}%` : '创建并提交审核'}
          </button>
          {uploading && (
            <button
              type="button"
              className="btn btn-danger-ghost"
              onClick={() => {
                abortRef.current?.();
              }}
            >
              取消上传
            </button>
          )}
          {!uploading && file && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                clearDraft();
                setFile(null);
                setFileInfo(null);
                showToast('草稿已清空', { tone: 'info' });
              }}
            >
              清空草稿
            </button>
          )}
        </div>
        <p className="form-help sell-form__draft-note">
          <ClipboardList size={13} aria-hidden="true" /> 标题 / 描述 / 分类 / 定价 / 试用范围已自动保存（刷新不丢）。
        </p>
      </section>

      {/* ---------- 我的作品列表 ---------- */}
      <section className="sell-mine" aria-label="我的作品">
        <h2 className="text-h2 sell-mine__title">我的作品</h2>

        {listLoading ? (
          <div className="sell-mine__list" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="sell-mine__skeleton card">
                <Skeleton width="40%" />
                <Skeleton width="20%" />
              </div>
            ))}
          </div>
        ) : listError ? (
          <ErrorBanner
            title="加载我的作品失败"
            reason={listError}
            nextStep="点击重试，或检查网络后再试。"
            actions={[{ label: '重试', onClick: () => void loadMine(page) }]}
          />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={UploadCloud}
            tone="brand"
            title="还没有作品"
            description="上传你的第一个作品，拖入 HTML 文件即可开始。"
            actionLabel="上传第一个作品"
            onAction={scrollToForm}
          />
        ) : (
          <>
            <ul className="sell-mine__list">
              {projects.map((project) => (
                <li key={project.id} className="card sell-mine__item">
                  <div className="sell-mine__main">
                    <p className="text-body sell-mine__title">{project.title}</p>
                    <p className="text-caption text-tertiary">
                      {project.category ? `${CATEGORY_LABELS[project.category] ?? project.category} · ` : ''}
                      <span className="num">{formatPriceCr(project.priceCr)}</span>
                      {project.reviewNote && (
                        <span className="text-warning"> · 驳回意见：{project.reviewNote}</span>
                      )}
                    </p>
                  </div>
                  <div className="sell-mine__badge">
                    <StatusBadge status={project.status} />
                  </div>
                  <div className="sell-mine__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/sell/${project.id}`)}
                    >
                      审核进度
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/sell/${project.id}?mode=edit`)}
                    >
                      <Pencil size={14} aria-hidden="true" /> 编辑
                    </button>
                    {project.status === 'approved' && (
                      <button
                        type="button"
                        className="btn btn-danger-ghost btn-sm"
                        onClick={() => navigate(`/sell/${project.id}?action=delist`)}
                      >
                        下架
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => { setPage(p); void loadMine(p); }} />
          </>
        )}
      </section>
    </div>
  );
}
