/**
 * CommissionNewPage —— 发布需求（区域 4，buyer）
 *
 * - **Q1**：描述输入框内 3 个可点击示例 chip（点击即填入，DESIGN_SYSTEM §4.1）；
 * - 字段：标题 / 描述 / 预算区间（min ≤ max 校验）/ 时间线（天）/ **验收标准
 *   （发布时即锁定：表单内说明「发布后不可修改」，DESIGN_SYSTEM §5.2 防误触）** /
 *   参考作品（可选：搜索已上架作品 + 勾选，Q1 精神）；
 * - 提交 → POST /api/commissions → **成功页给结果一个去处**（查看需求 / 复制链接分享 / 再发一个，§3.4）；
 * - Q3：表单草稿 localStorage 自动保存（刷新不丢）；提交失败保留已填内容 + 重试。
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ClipboardPlus, Copy, Link2, Loader2, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { Skeleton } from '../components/Skeleton';
import { commissionApi } from '../api/commission';
import { projectApi } from '../api/marketplace';
import { useDraft } from '../lib/useDraft';
import { formatPriceCr } from '../lib/format';
import type { ProjectSummary } from '../types/marketplace';

const DRAFT_KEY = 'vibe.commission.draft.v1';

/** Q1：3 个可点击示例（需求场景，DESIGN_SYSTEM §4.1 规格） */
const EXAMPLE_DESCRIPTIONS = [
  '7 天内做一个课堂小游戏，要有计分，最好手机也能玩',
  '做一个 Markdown 笔记工具，支持导出 PDF',
  '3 天内做一页产品落地页，要求手机端可用',
];

interface PublishDraft {
  title: string;
  description: string;
  budgetMinCr: string;
  budgetMaxCr: string;
  timelineDays: string;
  acceptanceCriteria: string;
  referenceProjectIds: string[];
}

const EMPTY_DRAFT: PublishDraft = {
  title: '',
  description: '',
  budgetMinCr: '',
  budgetMaxCr: '',
  timelineDays: '7',
  acceptanceCriteria: '',
  referenceProjectIds: [],
};

/** 验收标准 → checklist 行（用于锁定展示与后续验收对照） */
export function criteriaLines(criteria: string): string[] {
  return criteria
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function CommissionNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [draft, setDraft, clearDraft] = useDraft<PublishDraft>(DRAFT_KEY, () => EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedTitle, setPublishedTitle] = useState('');

  // 参考作品搜索
  const [refQuery, setRefQuery] = useState('');
  const [refItems, setRefItems] = useState<ProjectSummary[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [refSearched, setRefSearched] = useState(false);

  const isBuyer = Boolean(user && user.roles.includes('buyer'));

  const set = (patch: Partial<PublishDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const fillExample = (example: string) => {
    setDraft((prev) => ({
      ...prev,
      description: example,
      title: prev.title || example.slice(0, 18),
    }));
    setErrors((prev) => ({ ...prev, description: '', title: '' }));
  };

  const searchReferences = useCallback(async (query: string) => {
    setRefLoading(true);
    setRefError(null);
    setRefSearched(true);
    try {
      const res = await projectApi.list({ q: query, page: 1, pageSize: 10 });
      setRefItems(res.items);
    } catch (err) {
      setRefError(err instanceof Error ? err.message : '搜索参考作品失败。');
      setRefItems([]);
    } finally {
      setRefLoading(false);
    }
  }, []);

  const toggleReference = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      referenceProjectIds: prev.referenceProjectIds.includes(id)
        ? prev.referenceProjectIds.filter((x) => x !== id)
        : [...prev.referenceProjectIds, id],
    }));
  };

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!draft.title.trim()) errs.title = '标题不能为空。';
    if (!draft.description.trim()) errs.description = '描述不能为空。';
    const min = Number(draft.budgetMinCr);
    const max = Number(draft.budgetMaxCr);
    if (!Number.isInteger(min) || min <= 0) errs.budgetMinCr = '预算下限必须是大于 0 的整数。';
    if (!Number.isInteger(max) || max <= 0) errs.budgetMaxCr = '预算上限必须是大于 0 的整数。';
    if (!errs.budgetMinCr && !errs.budgetMaxCr && min > max) {
      errs.budgetMaxCr = '预算上限不能低于下限。';
    }
    const days = Number(draft.timelineDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) errs.timelineDays = '时间线需为 1–90 天的整数。';
    if (!draft.acceptanceCriteria.trim()) errs.acceptanceCriteria = '验收标准不能为空（发布后不可修改）。';
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSubmitError('请先补全必填项（见字段下方提示）。');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await commissionApi.create({
        title: draft.title.trim(),
        description: draft.description.trim(),
        budgetMinCr: min,
        budgetMaxCr: max,
        timelineDays: days,
        acceptanceCriteria: draft.acceptanceCriteria.trim(),
        referenceProjectIds: draft.referenceProjectIds,
      });
      setPublishedTitle(draft.title.trim());
      clearDraft();
      setPublishedId(res.commission.id);
      showToast('需求已发布，等待接单者投标', { tone: 'success' });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '发布失败。');
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!publishedId) return;
    const url = `${window.location.origin}/commissions/${publishedId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('链接已复制，可分享给接单者', { tone: 'success' });
    } catch {
      showToast('复制失败，请手动复制地址栏链接', { tone: 'warning' });
    }
  };

  // ---------------- 角色守卫（hooks 之后，避免条件 hooks） ----------------
  if (user && !isBuyer) {
    return (
      <div className="page">
        <EmptyState
          icon={ClipboardPlus}
          tone="brand"
          title="开通 buyer 角色后可发布需求"
          description="发布需求需要买家（buyer）角色。演示账号 buyer@vibes.local / demo1234 已具备。"
          actionLabel="去个人中心查看角色"
          onAction={() => navigate('/profile')}
        />
      </div>
    );
  }

  // ---------------- 成功页（§3.4：给结果一个去处） ----------------
  if (publishedId) {
    return (
      <div className="page">
        <section className="card success-panel" role="status">
          <span className="success-panel__icon" aria-hidden="true">
            <CheckCircle2 size={28} />
          </span>
          <h3 className="text-h3">需求已发布</h3>
          <p className="text-body-sm text-secondary">
            「{publishedTitle || '你的需求'}」已开放投标。验收标准已锁定，发布后不可修改。
          </p>
          <div className="success-panel__actions">
            <button type="button" className="btn btn-primary" onClick={() => navigate(`/commissions/${publishedId}`)}>
              查看需求
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void copyLink()}>
              <Copy size={16} aria-hidden="true" /> 复制链接分享
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPublishedId(null);
                setDraft(EMPTY_DRAFT);
              }}
            >
              再发一个
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page commission-new">
      <h1 className="text-h1 page__title">发布需求</h1>
      <p className="text-body-sm text-secondary commission-new__sub">
        说清楚你要什么，接单者会来投标。**验收标准在发布时锁定**，之后不可修改。
      </p>

      {submitError && (
        <ErrorBanner
          title="发布未完成"
          reason={submitError}
          nextStep="你填写的内容已自动保存，修正后重试。"
          actions={[{ label: '修正后重试', onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) }]}
        />
      )}

      <section className="card commission-form">
        <div className="form-field">
          <label className="form-label" htmlFor="comm-title">
            标题 <span className="text-tertiary">（必填）</span>
          </label>
          <input
            id="comm-title"
            type="text"
            className="form-input"
            maxLength={80}
            value={draft.title}
            placeholder="例如：帮我做一个课堂小游戏"
            onChange={(e) => set({ title: e.target.value })}
            disabled={submitting}
          />
          {errors.title && (
            <p className="form-error">
              <AlertCircle size={14} aria-hidden="true" /> {errors.title}
            </p>
          )}
        </div>

        {/* Q1：描述 + 3 个可点击示例 chip（输入区内部，§4.1） */}
        <div className="form-field">
          <label className="form-label" htmlFor="comm-desc">
            描述你想做的事 <span className="text-tertiary">（必填）</span>
          </label>
          <div className="intent-input__box commission-form__intent">
            <textarea
              id="comm-desc"
              className="intent-input__field commission-form__desc"
              rows={3}
              value={draft.description}
              placeholder="例如：做一个可运行的小游戏，需要计分，参考作品见下方…"
              onChange={(e) => set({ description: e.target.value })}
              disabled={submitting}
            />
            <div className="intent-input__examples" role="group" aria-label="示例（点击填入）">
              {EXAMPLE_DESCRIPTIONS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="chip intent-input__example"
                  onClick={() => fillExample(ex)}
                  disabled={submitting}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {errors.description && (
            <p className="form-error">
              <AlertCircle size={14} aria-hidden="true" /> {errors.description}
            </p>
          )}
        </div>

        <div className="commission-form__row">
          <div className="form-field">
            <label className="form-label" htmlFor="comm-budget-min">
              预算区间（CR） <span className="text-tertiary">（必填）</span>
            </label>
            <div className="commission-form__budget">
              <input
                id="comm-budget-min"
                type="number"
                min={1}
                step={1}
                className="form-input"
                value={draft.budgetMinCr}
                placeholder="下限"
                aria-label="预算下限（CR）"
                onChange={(e) => set({ budgetMinCr: e.target.value })}
                disabled={submitting}
              />
              <span className="text-caption text-tertiary">–</span>
              <input
                id="comm-budget-max"
                type="number"
                min={1}
                step={1}
                className="form-input"
                value={draft.budgetMaxCr}
                placeholder="上限"
                aria-label="预算上限（CR）"
                onChange={(e) => set({ budgetMaxCr: e.target.value })}
                disabled={submitting}
              />
            </div>
            {(errors.budgetMinCr || errors.budgetMaxCr) && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" /> {errors.budgetMinCr || errors.budgetMaxCr}
              </p>
            )}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="comm-timeline">
              时间线（天） <span className="text-tertiary">（必填）</span>
            </label>
            <input
              id="comm-timeline"
              type="number"
              min={1}
              max={90}
              step={1}
              className="form-input"
              value={draft.timelineDays}
              onChange={(e) => set({ timelineDays: e.target.value })}
              disabled={submitting}
            />
            {errors.timelineDays && (
              <p className="form-error">
                <AlertCircle size={14} aria-hidden="true" /> {errors.timelineDays}
              </p>
            )}
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="comm-criteria">
            验收标准 <span className="text-tertiary">（必填 · 发布即锁定）</span>
          </label>
          <textarea
            id="comm-criteria"
            className="form-input commission-form__criteria"
            rows={4}
            value={draft.acceptanceCriteria}
            placeholder={'逐行填写，例如：\n1) 可运行\n2) 有计分\n3) 移动端可用'}
            onChange={(e) => set({ acceptanceCriteria: e.target.value })}
            disabled={submitting}
          />
          <p className="form-help commission-form__lock-note">
            <Link2 size={13} aria-hidden="true" />
            验收标准是之后验收与纠纷的源头，<strong>发布后不可修改</strong>（已写入校验哈希）。
          </p>
          {errors.acceptanceCriteria && (
            <p className="form-error">
              <AlertCircle size={14} aria-hidden="true" /> {errors.acceptanceCriteria}
            </p>
          )}
        </div>

        {/* 参考作品（可选）：搜索 + 勾选 */}
        <div className="form-field">
          <span className="form-label">
            参考作品 <span className="text-tertiary">（可选，选择已上架作品）</span>
          </span>
          <div className="commission-form__ref-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="commission-form__ref-input"
              placeholder="搜索已上架作品…（回车搜索）"
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void searchReferences(refQuery.trim());
                }
              }}
              disabled={submitting}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void searchReferences(refQuery.trim())}
              disabled={submitting}
            >
              搜索
            </button>
          </div>
          {refLoading && <Skeleton width="100%" height={48} />}
          {refError && (
            <p className="form-error">
              <AlertCircle size={14} aria-hidden="true" /> {refError}
            </p>
          )}
          {refSearched && !refLoading && refItems.length === 0 && (
            <p className="form-help" role="status">
              没有找到匹配的已上架作品（参考作品可留空）。
            </p>
          )}
          {refItems.length > 0 && (
            <ul className="commission-form__ref-list" aria-label="参考作品候选">
              {refItems.map((p) => {
                const checked = draft.referenceProjectIds.includes(p.id);
                return (
                  <li key={p.id}>
                    <label className="commission-form__ref-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleReference(p.id)}
                        disabled={submitting}
                      />
                      <span className="text-body-sm">
                        <strong>{p.title}</strong>
                        <span className="text-tertiary"> · {formatPriceCr(p.priceCr)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {draft.referenceProjectIds.length > 0 && (
            <p className="form-help" role="status">
              已选择 {draft.referenceProjectIds.length} 个参考作品（将随需求展示给接单者）。
            </p>
          )}
        </div>

        <div className="commission-form__actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="btn__spinner" size={16} aria-hidden="true" /> : <ClipboardPlus size={16} aria-hidden="true" />}
            {submitting ? '发布中…' : '发布需求'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/commissions')} disabled={submitting}>
            返回需求板
          </button>
        </div>
        <p className="form-help">
          <RefreshCw size={13} aria-hidden="true" /> 表单内容已自动保存（刷新不丢）。
        </p>
      </section>
    </div>
  );
}
