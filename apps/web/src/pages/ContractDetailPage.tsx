/**
 * ContractDetailPage —— 接单交付详情（区域 5，buyer/contractor 同页不同视角）
 *
 * - **状态 Stepper**：bid→selected→in progress→milestone submission→buyer acceptance→payout
 *   （词汇表 §3 六词，StatusBadge 查表渲染，**双方看到同一状态词**）；
 * - **托管状态条**（EscrowStatusBar 简化版）：金额 / 当前阶段 / 钱在谁手里 / 预计到账；
 * - contractor：提交里程碑（title/描述/交付物 html|zip，FileDropzone 四状态复用，Q2 进度）
 *   + 里程碑列表（状态徽章 + 修改意见）；
 * - buyer：**先看交付物再确认** —— 验收面板（交付物 iframe 预览 + 验收标准 checklist 对照）
 *   → 确认通过（非最终）/ 最终验收 → **放款 ConfirmDialog**（「确认放款 X CR 将从托管释放给
 *   接单者，不可撤回」；**未预览交付物时按钮禁用并附说明**，§5.2）；「要求修改」必填意见；
 * - 四状态全覆盖；金额 tabular-nums。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Lock,
  PackagePlus,
  Send,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { StatusBadge } from '../components/StatusBadge';
import { Stepper } from '../components/Stepper';
import { ErrorBanner } from '../components/ErrorBanner';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FileDropzone } from '../components/FileDropzone';
import { EscrowStatusBar } from '../components/EscrowStatusBar';
import { commissionApi, contractApi } from '../api/commission';
import { criteriaLines } from '../lib/criteria';
import { CONTRACT_STEPS, contractStepIndex } from '../types/commission';
import { formatCr } from '../lib/format';
import type { CommissionDetail, ContractDetail, ContractMilestoneItem } from '../types/commission';

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [commission, setCommission] = useState<CommissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // contractor 里程碑表单
  const [mTitle, setMTitle] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mFile, setMFile] = useState<File | null>(null);
  const [mFinal, setMFinal] = useState(false);
  const [mErrors, setMErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [mProgress, setMProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null);
  const [mError, setMError] = useState<string | null>(null);
  const [abortRef, setAbortRef] = useState<{ abort: () => void } | null>(null);

  // buyer 验收
  const [previewMilestone, setPreviewMilestone] = useState<ContractMilestoneItem | null>(null);
  const [previewed, setPreviewed] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<ContractMilestoneItem | null>(null);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { contract: c } = await contractApi.detail(id);
      setContract(c);
      // 验收标准来自需求详情（合同详情只带 commission 摘要）
      const { commission: comm } = await commissionApi.detail(c.commission.id);
      setCommission(comm);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载合同失败。');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return null;

  if (loading) {
    return (
      <div className="page" aria-busy="true" role="status">
        <Skeleton width={200} height={24} />
        <Skeleton width="100%" height={120} />
        <Skeleton width="100%" height={200} />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="page">
        <ErrorBanner
          title="加载合同失败"
          reason={error ?? '合同不存在或无权访问。'}
          nextStep="返回我的合同，或点击重试。"
          actions={[
            { label: '重试', onClick: () => void load() },
            { label: '返回我的合同', variant: 'secondary', onClick: () => navigate('/contracts') },
          ]}
        />
      </div>
    );
  }

  const isBuyer = Boolean(user && contract.buyer.id === user.id);
  const isContractor = Boolean(user && contract.contractor.id === user.id);
  const viewer: 'buyer' | 'contractor' | null = isBuyer ? 'buyer' : isContractor ? 'contractor' : null;
  const stepIndex = contractStepIndex(contract.status);

  const canSubmitMilestone =
    isContractor && (contract.status === 'in progress' || contract.status === 'milestone submission');

  const handleMilestoneSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!mTitle.trim()) errs.title = '里程碑标题不能为空。';
    if (!mDesc.trim()) errs.description = '描述不能为空。';
    if (!mFile) errs.file = '请上传交付物文件（html ≤20MB 或 zip ≤50MB）。';
    setMErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const fd = new FormData();
    fd.append('title', mTitle.trim());
    fd.append('description', mDesc.trim());
    fd.append('file', mFile!);
    fd.append('final', mFinal ? 'true' : 'false');

    setSubmitting(true);
    setMError(null);
    setMProgress({ loaded: 0, total: 1, percent: 0 });
    const upload = contractApi.milestones(id, fd, (p) => setMProgress(p));
    setAbortRef(upload);
    try {
      await upload.promise;
      showToast('里程碑已提交，等待买家验收', { tone: 'success' });
      setMTitle('');
      setMDesc('');
      setMFile(null);
      setMFinal(false);
      setPreviewed(false);
      await load();
    } catch (err) {
      const e = err as { code?: string; message?: string };
      setMError(e.code === 'ABORTED' ? '上传已取消。你填写的内容已保留。' : e.message ?? '提交失败。');
    } finally {
      setSubmitting(false);
      setMProgress(null);
      setAbortRef(null);
    }
  };

  const handleApproveMilestone = async (milestone: ContractMilestoneItem) => {
    try {
      await contractApi.approveMilestone(milestone.id);
      showToast(milestone.isFinal ? '最终交付验收通过，进入买家验收' : '里程碑已通过，可继续提交', { tone: 'success' });
      setPreviewed(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', { tone: 'warning' });
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionTarget) return;
    if (!revisionFeedback.trim()) {
      setRevisionError('修改意见不能为空（打回必须说明原因）。');
      return;
    }
    try {
      await contractApi.requestRevision(revisionTarget.id, revisionFeedback.trim());
      showToast('已要求修改，接单者将按意见重新提交', { tone: 'success' });
      setRevisionTarget(null);
      setRevisionFeedback('');
      setRevisionError(null);
      setPreviewed(false);
      await load();
    } catch (err) {
      setRevisionError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handlePayout = async () => {
    setPaying(true);
    try {
      const res = await contractApi.payout(id);
      showToast(`已放款 ${formatCr(contract.agreedAmountCr)} 给接单者`, { tone: 'success' });
      setPayoutOpen(false);
      setContract(res.contract);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '放款失败', { tone: 'warning' });
    } finally {
      setPaying(false);
    }
  };

  const handleStart = async () => {
    try {
      await contractApi.start(id);
      showToast('合同已启动，预算进入托管', { tone: 'success' });
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '启动失败', { tone: 'warning' });
    }
  };

  const openPreview = (milestone: ContractMilestoneItem) => {
    setPreviewMilestone(milestone);
    setPreviewed(true); // 看过交付物 → 放款按钮可用（§5.2）
  };

  const latestApproved = [...contract.milestones]
    .filter((m) => m.status === 'approved')
    .sort((a, b) => b.seq - a.seq)[0];
  const acceptanceReady = contract.status === 'buyer acceptance' && latestApproved;

  return (
    <div className="page contract-detail">
      <Link to="/contracts" className="contract-detail__back text-body-sm">
        <ArrowLeft size={16} aria-hidden="true" /> 返回我的合同
      </Link>

      <div className="contract-detail__head">
        <h1 className="text-h1 page__title">{contract.commission.title}</h1>
        <StatusBadge status={contract.status} />
      </div>

      {/* 状态 Stepper（六词，双方同一） */}
      <section className="card contract-detail__stepper" aria-label="接单交付进度">
        <Stepper steps={CONTRACT_STEPS} currentStep={stepIndex} />
      </section>

      {/* 托管状态条 */}
      <EscrowStatusBar
        amountCr={contract.agreedAmountCr}
        contractStatus={contract.status}
        escrowStatus={contract.escrowStatus}
        viewer={viewer ?? 'buyer'}
      />

      <section className="card contract-detail__info">
        <p className="text-body-sm">
          <strong>需求：</strong>
          <Link to={`/commissions/${contract.commission.id}`}>{contract.commission.title}</Link>
        </p>
        <p className="text-body-sm">
          <strong>买家：</strong>
          {contract.buyer.displayName}
          <span className="text-tertiary"> · </span>
          <strong>接单者：</strong>
          {contract.contractor.displayName}
        </p>
        <p className="text-body-sm">
          <strong>中标金额：</strong>
          <span className="num">{formatCr(contract.agreedAmountCr)}</span>
        </p>
      </section>

      {/* selected：buyer 启动合同（兜底：select 与 start 分开时的入口） */}
      {isBuyer && contract.status === 'selected' && (
        <section className="card contract-detail__start">
          <p className="text-body-sm">
            <strong>合同待启动：</strong>启动后将从你的余额托管 {formatCr(contract.agreedAmountCr)}，接单者开始执行。
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void handleStart()}>
            启动合同（预算进托管）
          </button>
        </section>
      )}

      {/* contractor：提交里程碑 */}
      {canSubmitMilestone && (
        <section className="card contract-milestone-form" aria-label="提交里程碑">
          <h2 className="text-h2">
            <PackagePlus size={20} aria-hidden="true" /> 提交里程碑
          </h2>
          <div className="form-field">
            <label className="form-label" htmlFor="ms-title">
              标题 <span className="text-tertiary">（必填）</span>
            </label>
            <input
              id="ms-title"
              type="text"
              className="form-input"
              maxLength={120}
              value={mTitle}
              placeholder="例如：第一版可玩原型"
              onChange={(e) => setMTitle(e.target.value)}
              disabled={submitting}
            />
            {mErrors.title && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" /> {mErrors.title}
              </p>
            )}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="ms-desc">
              描述 <span className="text-tertiary">（必填）</span>
            </label>
            <textarea
              id="ms-desc"
              className="form-input contract-milestone-form__desc"
              rows={3}
              value={mDesc}
              placeholder="这一版完成了什么、对照验收标准有哪些进展…"
              onChange={(e) => setMDesc(e.target.value)}
              disabled={submitting}
            />
            {mErrors.description && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" /> {mErrors.description}
              </p>
            )}
          </div>
          <div className="form-field">
            <span className="form-label">
              交付物文件 <span className="text-tertiary">（必填）</span>
            </span>
            <FileDropzone
              value={mFile}
              onChange={(f) => {
                setMFile(f);
                setMError(null);
              }}
              progress={mProgress}
              error={mError}
              disabled={submitting}
              compact
              hint="交付物：html（≤20MB）或 zip（≤50MB），买家将按验收标准检查"
            />
            {mErrors.file && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" /> {mErrors.file}
              </p>
            )}
          </div>
          <label className="contract-milestone-form__final">
            <input type="checkbox" checked={mFinal} onChange={(e) => setMFinal(e.target.checked)} disabled={submitting} />
            <span className="text-body-sm">
              这是最终交付 —— 验收通过后直接进入「买家验收 / 结算」，<strong>不可再提交后续里程碑</strong>
            </span>
          </label>
          <div className="contract-milestone-form__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleMilestoneSubmit()}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="btn__spinner" size={16} aria-hidden="true" />
              ) : (
                <Send size={16} aria-hidden="true" />
              )}
              {submitting ? `上传中 ${Math.round(mProgress?.percent ?? 0)}%` : '提交里程碑'}
            </button>
            {submitting && (
              <button type="button" className="btn btn-danger-ghost" onClick={() => abortRef?.abort()}>
                取消上传
              </button>
            )}
          </div>
        </section>
      )}

      {/* 里程碑列表 */}
      <section className="contract-milestones" aria-label="里程碑列表">
        <h2 className="text-h2 contract-milestones__title">里程碑（{contract.milestones.length}）</h2>
        {contract.milestones.length === 0 ? (
          <EmptyState
            icon={FileText}
            tone="info"
            title="还没有里程碑"
            description={isContractor ? '合同启动后，提交你的第一个里程碑。' : '接单者提交里程碑后会显示在这里。'}
            actionLabel={isContractor && canSubmitMilestone ? '提交里程碑' : '查看需求'}
            onAction={() => (isContractor && canSubmitMilestone ? undefined : navigate(`/commissions/${contract.commission.id}`))}
          />
        ) : (
          <ul className="contract-milestones__list">
            {contract.milestones.map((m) => (
              <li key={m.id} className="card contract-milestone">
                <div className="contract-milestone__head">
                  <p className="text-body">
                    <strong>
                      #{m.seq} {m.title}
                    </strong>
                    {m.isFinal && (
                      <span className="contract-milestone__final-tag text-caption">最终交付</span>
                    )}
                  </p>
                  <StatusBadge status={m.status} />
                </div>
                <p className="contract-milestone__desc text-body-sm text-secondary">{m.description}</p>
                {m.feedback && (
                  <p className="contract-milestone__feedback text-body-sm" role="note">
                    <strong>修改意见：</strong>
                    {m.feedback}
                  </p>
                )}
                <div className="contract-milestone__actions">
                  {m.deliverableUrl && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openPreview(m)}>
                      <Eye size={14} aria-hidden="true" /> 查看交付物
                    </button>
                  )}
                  {m.deliverableUrl && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={m.deliverableUrl}
                      download
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download size={14} aria-hidden="true" /> 下载
                    </a>
                  )}
                  {isBuyer && m.status === 'submitted' && contract.status === 'milestone submission' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleApproveMilestone(m)}
                      >
                        确认通过
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setRevisionTarget(m);
                          setRevisionError(null);
                          setRevisionFeedback('');
                        }}
                      >
                        要求修改
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* buyer：交付物预览面板（先看交付物再确认，§5.2） */}
      {isBuyer && previewMilestone?.deliverableUrl && (
        <section className="card deliverable-preview" aria-label="交付物预览">
          <h2 className="text-h2 deliverable-preview__title">
            交付物预览 #{previewMilestone.seq} {previewMilestone.title}
          </h2>
          <iframe
            title={`交付物预览 ${previewMilestone.title}`}
            src={previewMilestone.deliverableUrl}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            className="deliverable-preview__frame"
            data-testid="deliverable-preview-frame"
          />
          {commission && (
            <div className="deliverable-preview__checklist">
              <p className="text-body-sm deliverable-preview__check-title">
                <Lock size={14} aria-hidden="true" /> 对照验收标准逐项检查
              </p>
              <ul className="deliverable-preview__checks">
                {criteriaLines(commission.acceptanceCriteria).map((line, i) => (
                  <li key={`${line}-${i}`} className="text-body-sm">
                    <span aria-hidden="true">☐</span> {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* buyer：最终验收与放款 */}
      {isBuyer && contract.status === 'buyer acceptance' && (
        <section className="card contract-accept" aria-label="最终验收">
          <h2 className="text-h2">
            <CheckCircle2 size={20} aria-hidden="true" /> 最终验收
          </h2>
          {acceptanceReady ? (
            <>
              <p className="text-body-sm text-secondary">
                已通过最终交付物（#{latestApproved.seq} {latestApproved.title}）。确认后放款
                {formatCr(contract.agreedAmountCr)} 给接单者。
              </p>
              <div className="contract-accept__actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openPreview(latestApproved)}
                >
                  <Eye size={16} aria-hidden="true" /> 查看最终交付物
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setPayoutOpen(true);
                  }}
                >
                  确认放款
                </button>
              </div>
            </>
          ) : (
            <p className="text-body-sm text-secondary">等待最终里程碑验收通过后进入结算。</p>
          )}
        </section>
      )}

      {/* payout 完成态（§3.4 给结果一个去处） */}
      {contract.status === 'payout' && (
        <section className="card success-panel" role="status">
          <span className="success-panel__icon" aria-hidden="true">
            <CheckCircle2 size={28} />
          </span>
          <h3 className="text-h3">结算完成</h3>
          <p className="text-body-sm text-secondary">
            {formatCr(contract.agreedAmountCr)} 已从托管释放
            {isBuyer ? '给接单者' : '到我的余额'}（escrow released）。
          </p>
          <div className="success-panel__actions">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/contracts')}>
              返回我的合同
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/wallet')}>
              去钱包查看
            </button>
          </div>
        </section>
      )}

      {/* 要求修改：反馈必填 */}
      <ConfirmDialog
        open={Boolean(revisionTarget)}
        title="要求修改"
        confirmLabel="确认要求修改"
        onConfirm={() => void handleRequestRevision()}
        onCancel={() => {
          setRevisionTarget(null);
          setRevisionError(null);
          setRevisionFeedback('');
        }}
        confirmTone="brand"
        confirmDisabled={!revisionFeedback.trim()}
        disabledReason={!revisionFeedback.trim() ? '修改意见必填（打回必须说明原因）' : undefined}
        consequences={
          <div className="revision-dialog">
            {revisionTarget && (
              <p className="text-body-sm">
                将打回「#{revisionTarget.seq} {revisionTarget.title}」，接单者按意见重新提交新版本。
              </p>
            )}
            <label className="form-field">
              <span className="form-label">
                修改意见 <span className="text-tertiary">（必填）</span>
              </span>
              <textarea
                className="form-input revision-dialog__feedback"
                rows={3}
                value={revisionFeedback}
                placeholder="说明哪里不满足验收标准，需要怎么改…"
                aria-label="修改意见（必填）"
                onChange={(e) => setRevisionFeedback(e.target.value)}
              />
            </label>
            {revisionError && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" /> {revisionError}
              </p>
            )}
          </div>
        }
      />

      {/* 放款：二次确认（不可撤回；未预览交付物时禁用，§5.2） */}
      <ConfirmDialog
        open={payoutOpen}
        title="确认放款"
        confirmLabel={paying ? '放款中…' : '确认放款'}
        onConfirm={() => void handlePayout()}
        onCancel={() => setPayoutOpen(false)}
        confirmTone="danger"
        confirmDisabled={paying || !previewed}
        disabledReason={!previewed ? '请先预览最终交付物，确认验收标准已满足（先看交付物再放款）。' : undefined}
        consequences={
          <div className="payout-dialog">
            <p className="text-body-sm">
              确认放款 <span className="num payout-dialog__amount">{formatCr(contract.agreedAmountCr)}</span>{' '}
              将从托管账户释放给接单者（{contract.contractor.displayName}），
              <strong>此操作不可撤回</strong>。
            </p>
            <p className="text-body-sm text-secondary">
              放款后 escrow 状态变为 released，接单者余额即时入账；需求标记为已完成。
            </p>
            {!previewed && (
              <p className="text-caption text-warning payout-dialog__hint">
                尚未预览交付物 —— 请先在上方「查看最终交付物」确认验收标准已满足。
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
