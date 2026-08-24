/**
 * SellerProjectPage —— 单个作品的卖家工作台视图（区域 2 核心：审核进度）
 *
 * - **审核进度 Stepper**：draft → submitted/under review → approved（词汇表 §1 词 +
 *   StatusBadge 查表渲染）；「我的作品到哪一步了」一屏可见；
 * - **rejected**：FailureRecoveryCard 三出路 —— 重试（修改后重新提交）/
 *   换一种方式（上传新作品）/ 手动编辑（进入编辑态）；
 * - **approved**：作品信息 + 去详情页 + 编辑 + 下架；
 * - **编辑**：PUT /api/projects/:id（元数据；status 只读徽章展示）；
 * - **下架**（高风险，不可逆）：DelistDialog —— 理由必填 + 后果说明 → POST delist。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Pencil, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { StatusBadge } from '../components/StatusBadge';
import { Stepper } from '../components/Stepper';
import { ErrorBanner } from '../components/ErrorBanner';
import { FailureRecoveryCard } from '../components/FailureRecoveryCard';
import { Skeleton } from '../components/Skeleton';
import { FileDropzone } from '../components/FileDropzone';
import { ProjectMetaForm } from '../components/seller/ProjectMetaForm';
import { DelistDialog } from '../components/seller/DelistDialog';
import { sellerApi } from '../api/seller';
import type { ProjectDetail } from '../types/marketplace';
import type { ProjectMetaDraft, ReviewProgress } from '../types/seller';
import { REVIEW_STEPS, reviewStepIndex } from '../types/seller';
import { CATEGORY_LABELS } from '../components/seller/ProjectMetaForm';
import { formatPriceCr } from '../lib/format';

function detailToDraft(detail: ProjectDetail): ProjectMetaDraft {
  return {
    title: detail.title,
    description: detail.description,
    category: detail.category,
    priceCr: detail.priceCr,
    priced: detail.priceCr > 0,
    trialScope: detail.trialScope ?? '',
  };
}

export function SellerProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [review, setReview] = useState<ReviewProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editDraft, setEditDraft] = useState<ProjectMetaDraft | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [editProgress, setEditProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [abortRef] = useState<{ abort: (() => void) | null }>({ abort: null });

  const [delistOpen, setDelistOpen] = useState(false);
  const [delisting, setDelisting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [detailRes, reviewRes] = await Promise.all([sellerApi.detail(id), sellerApi.review(id)]);
      setDetail(detailRes);
      setReview(reviewRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载作品信息失败。');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 从列表页跳转的快捷动作：?mode=edit 直接进入编辑；?action=delist 直接弹下架确认
  useEffect(() => {
    if (loading || !detail) return;
    if (searchParams.get('mode') === 'edit') {
      setEditDraft(detailToDraft(detail));
      setEditFile(null);
      setEditError(null);
      setEditProgress(null);
      setMode('edit');
    } else if (searchParams.get('action') === 'delist' && detail.status === 'approved') {
      setDelistOpen(true);
    }
  }, [loading, detail, searchParams]);

  if (!id) return null;

  const startEdit = () => {
    if (!detail) return;
    setEditDraft(detailToDraft(detail));
    setEditFile(null);
    setEditError(null);
    setEditProgress(null);
    setMode('edit');
  };

  const handleSaveEdit = async () => {
    if (!id || !editDraft) return;
    const fd = new FormData();
    fd.append('title', editDraft.title);
    fd.append('description', editDraft.description);
    fd.append('category', editDraft.category || '');
    fd.append('priceCr', String(editDraft.priced ? editDraft.priceCr : 0));
    fd.append('trialScope', editDraft.trialScope);
    if (editFile) fd.append('file', editFile);

    setSaving(true);
    setEditError(null);
    setEditProgress({ loaded: 0, total: 1, percent: 0 });
    const upload = sellerApi.update(id, fd, (p) => setEditProgress(p));
    abortRef.abort = upload.abort;
    try {
      await upload.promise;
      showToast('作品信息已更新', { tone: 'success' });
      setMode('view');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败。';
      if ((err as { code?: string }).code !== 'ABORTED') {
        setEditError(msg);
      }
    } finally {
      setSaving(false);
      setEditProgress(null);
      abortRef.abort = null;
    }
  };

  const handleSubmit = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await sellerApi.submit(id);
      showToast('已提交审核，等待平台检查', { tone: 'success' });
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '提交失败', { tone: 'warning' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelist = async (reason: string) => {
    if (!id) return;
    setDelisting(true);
    try {
      await sellerApi.delist(id, reason);
      showToast('作品已下架；已购买家保留访问权', { tone: 'success' });
      setDelistOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '下架失败', { tone: 'warning' });
    } finally {
      setDelisting(false);
    }
  };

  // ---- 四状态：加载 / 错误 / 内容 ----
  if (loading) {
    return (
      <div className="page" aria-busy="true" role="status">
        <Skeleton width={200} height={24} />
        <Skeleton width="100%" height={180} />
        <Skeleton width="100%" height={120} />
      </div>
    );
  }

  if (error || !detail || !review) {
    return (
      <div className="page">
        <ErrorBanner
          title="加载作品信息失败"
          reason={error ?? '作品不存在或无权访问。'}
          nextStep="返回卖家工作台，或点击重试。"
          actions={[
            { label: '重试', onClick: () => void load() },
            { label: '返回工作台', variant: 'secondary', onClick: () => navigate('/sell') },
          ]}
        />
      </div>
    );
  }

  const status = detail.status;
  const stepIndex = reviewStepIndex(status);
  const isAuthor = user?.id === detail.seller?.id;

  return (
    <div className="page seller-project">
      <Link to="/sell" className="seller-project__back text-body-sm">
        <ArrowLeft size={16} aria-hidden="true" /> 返回卖家工作台
      </Link>

      {mode === 'edit' && editDraft ? (
        // ---------------- 编辑态 ----------------
        <section className="card seller-project__edit" aria-label="编辑作品">
          <div className="seller-project__title-row">
            <h1 className="text-h1 page__title">编辑作品</h1>
            <StatusBadge status={status} />
            <span className="text-caption text-tertiary">状态只读，审核流程不受编辑影响</span>
          </div>

          <ProjectMetaForm
            value={editDraft}
            onChange={setEditDraft}
            disabled={saving}
            intro="修改作品信息（标题 / 描述 / 分类 / 定价 / 试用范围）；如文件有更新可重新上传。"
          />

          <div className="seller-project__edit-file">
            <p className="form-label">作品文件 <span className="text-tertiary">（可选重传）</span></p>
            <FileDropzone
              value={editFile}
              onChange={setEditFile}
              progress={editProgress}
              error={editError}
              disabled={saving}
              compact
              hint="当前文件保留；拖入新文件可替换（html ≤20MB / zip ≤50MB）"
            />
          </div>

          <div className="seller-project__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSaveEdit()}
              disabled={saving || !editDraft.title.trim() || !editDraft.description.trim() || !editDraft.category}
            >
              {saving ? <Loader2 className="btn__spinner" size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
              保存修改
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (saving) return;
                abortRef.abort?.();
                setMode('view');
              }}
            >
              取消
            </button>
          </div>
        </section>
      ) : (
        // ---------------- 查看态（审核进度） ----------------
        <>
          <div className="seller-project__title-row">
            <h1 className="text-h1 page__title">{detail.title}</h1>
            <StatusBadge status={status} />
            <span className="text-caption text-tertiary num">{formatPriceCr(detail.priceCr)}</span>
          </div>

          <section className="card seller-project__progress" aria-label="审核进度">
            <Stepper steps={REVIEW_STEPS} currentStep={stepIndex} />
            <div className="seller-project__status-note">
              {status === 'approved' && (
                <p className="text-body-sm">
                  <CheckCircle2 size={16} className="seller-project__status-icon seller-project__status-icon--ok" aria-hidden="true" />
                  审核通过，作品已公开上架，买家可以试玩与购买。
                </p>
              )}
              {status === 'under review' && (
                <p className="text-body-sm">
                  <Loader2 size={16} className="seller-project__status-icon seller-project__status-icon--spin" aria-hidden="true" />
                  正在审核中：平台会检查作品能否正常运行、是否含违规内容。通过后自动上架。
                </p>
              )}
              {status === 'submitted' && (
                <p className="text-body-sm">
                  <Loader2 size={16} className="seller-project__status-icon seller-project__status-icon--spin" aria-hidden="true" />
                  已提交，等待进入审核队列（提交后自动进入审核中）。
                </p>
              )}
              {status === 'draft' && (
                <p className="text-body-sm">作品还在草稿状态：完善信息后提交审核即可进入审核流程。</p>
              )}
              {status === 'delisted' && (
                <p className="text-body-sm">
                  作品已下架：新买家不可再购买，已购买家保留访问权。如需重新上架，请提交审核。
                </p>
              )}
            </div>

            {review.history.length > 0 && (
              <ol className="seller-project__history" aria-label="审核历史">
                {review.history.map((h, i) => (
                  <li key={`${h.event}-${i}`} className="seller-project__history-item text-body-sm">
                    <StatusBadge status={h.event} />
                    <span className="text-secondary">{h.note ?? ''}</span>
                    <time className="text-caption text-tertiary" dateTime={h.createdAt}>
                      {new Date(h.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* rejected：Q3 失败恢复卡片，三出路 */}
          {status === 'rejected' && (
            <section aria-label="驳回恢复" className="seller-project__recovery">
              <FailureRecoveryCard
                stepLabel="审核"
                reason={review.reviewNote ?? '平台未说明具体原因，可联系管理员了解详情。'}
                preserved={[
                  { title: '作品文件', summary: detail.title ? `「${detail.title}」文件已上传，无需重新上传` : '已上传' },
                  { title: '作品信息草稿', summary: '标题 / 描述 / 分类 / 定价 / 试用范围已保留' },
                ]}
                onRetry={() => void handleSubmit()}
                onAlternative={() => navigate('/sell')}
                onManualEdit={startEdit}
                retryDisabled={saving}
              />
            </section>
          )}

          {/* 作品信息卡 */}
          <section className="card seller-project__info" aria-label="作品信息">
            <p className="text-body-sm">
              <strong>分类：</strong>
              {detail.category ? CATEGORY_LABELS[detail.category] ?? detail.category : '未设置'}
            </p>
            <p className="text-body-sm">
              <strong>试用范围：</strong>
              {detail.trialScope || '未填写'}
            </p>
            <p className="text-body-sm seller-project__desc">{detail.description}</p>
          </section>

          <div className="seller-project__actions">
            {status === 'draft' && (
              <button type="button" className="btn btn-primary" onClick={() => void handleSubmit()} disabled={saving}>
                <Send size={16} aria-hidden="true" /> 提交审核
              </button>
            )}
            {status === 'rejected' && (
              <button type="button" className="btn btn-primary" onClick={() => void handleSubmit()} disabled={saving}>
                <Send size={16} aria-hidden="true" /> 修改后重新提交
              </button>
            )}
            {status === 'delisted' && (
              <button type="button" className="btn btn-primary" onClick={() => void handleSubmit()} disabled={saving}>
                <Send size={16} aria-hidden="true" /> 重新提交审核
              </button>
            )}
            {status === 'approved' && (
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/project/${id}`)}>
                去详情页
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={startEdit}>
              <Pencil size={16} aria-hidden="true" /> 编辑
            </button>
            {status === 'approved' && isAuthor && (
              <button type="button" className="btn btn-danger-ghost" onClick={() => setDelistOpen(true)}>
                下架
              </button>
            )}
          </div>
        </>
      )}

      <DelistDialog
        open={delistOpen}
        projectTitle={detail.title}
        submitting={delisting}
        onCancel={() => setDelistOpen(false)}
        onConfirm={(reason) => void handleDelist(reason)}
      />
    </div>
  );
}
