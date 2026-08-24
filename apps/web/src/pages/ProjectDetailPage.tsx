/**
 * ProjectDetailPage —— 作品详情页（DESIGN_SYSTEM 区域 1 · PRD 区域 1/3）
 *
 * - 信息区：标题 / 作者 / 评分 / 价格 / **试用范围**（trialScope 文案清晰）；
 * - **试玩区（核心）**：内嵌 iframe（PlayFrame），免登录免付款点开即玩，
 *   sandbox/referrerPolicy 安全参数见 ARCHITECTURE §3.3；
 * - 操作行**常驻** `[联系卖家] [举报] [···]`（§5.1：不藏菜单）：
 *   - 联系卖家 = mailto:seller.email（课程演示简化；Phase 3 可升级站内消息）；
 *   - 举报 = 弹窗表单 → POST /api/projects/:id/report（成功 Toast + 关闭，错误在表单内）；
 *   - [···] = 复制作品链接（次级操作）；
 * - 购买区（PurchasePanel）：价格 + 手续费 + 实付总价一屏可见；已购提示；
 *   未登录购买引导登录（RequireAuth 同款回跳）；
 * - 评论区（ReviewSection）；404 → NotFound 风格错误页（§3.1 空态 + 出路）。
 *
 * 四状态：详情加载骨架 / 错误横幅 + 重试 / 404 空态 / 成功渲染；
 * 试玩区自身四状态见 PlayFrame。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Compass, Copy, Ellipsis, Mail, UserRound } from 'lucide-react';
import { ApiError } from '../api/client';
import { projectApi } from '../api/marketplace';
import type { ProjectDetail } from '../types/marketplace';
import { useAuth } from '../context/AuthContext';
import { PlayFrame } from '../components/PlayFrame';
import { PurchasePanel } from '../components/PurchasePanel';
import { ReviewSection } from '../components/ReviewSection';
import { ReportDialog } from '../components/ReportDialog';
import { Rating } from '../components/Rating';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorBanner } from '../components/ErrorBanner';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { formatPriceCr } from '../lib/format';

type DetailState = 'loading' | 'error' | 'notfound' | 'ready';

export function ProjectDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [state, setState] = useState<DetailState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setErrorMessage('');
    try {
      const detail = await projectApi.detail(id);
      setProject(detail);
      setState('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState('notfound');
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : '加载作品详情失败。');
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast('作品链接已复制。', { tone: 'success' });
    } catch {
      showToast('复制失败，请手动复制地址栏链接。', { tone: 'warning' });
    } finally {
      setMenuOpen(false);
    }
  };

  // ---- 加载 ----
  if (state === 'loading') {
    return (
      <div className="page project-detail" aria-busy="true" data-testid="detail-loading">
        <Skeleton width={320} height={28} />
        <Skeleton width={180} height={18} />
        <Skeleton variant="card" height={360} />
        <Skeleton width="100%" height={120} />
      </div>
    );
  }

  // ---- 404（NotFound 风格，§3.1 空态 + 明确出路）----
  if (state === 'notfound') {
    return (
      <div className="page">
        <EmptyState
          icon={Compass}
          tone="warning"
          title="作品不存在"
          description="这个作品不存在、已下架或未通过审核。"
          actionLabel="去 Marketplace"
          onAction={() => navigate('/marketplace')}
        />
      </div>
    );
  }

  // ---- 其他错误 ----
  if (state === 'error' || !project) {
    return (
      <div className="page">
        <ErrorBanner
          title="加载作品详情失败"
          reason={errorMessage || '网络连接不稳定，服务器没有响应。'}
          nextStep="点击重试，或返回列表页。"
          actions={[
            { label: '重试', onClick: () => void load() },
            { label: '返回列表', variant: 'secondary', onClick: () => navigate('/marketplace') },
          ]}
        />
      </div>
    );
  }

  const sellerEmail = project.seller.email;

  return (
    <div className="page project-detail" data-testid="project-detail">
      {/* 面包屑：← 返回 Marketplace（次级页面回退路径） */}
      <nav className="project-detail__breadcrumb" aria-label="面包屑">
        <Link to="/marketplace" className="btn btn-ghost btn-sm">
          ← 返回 Marketplace
        </Link>
      </nav>

      <header className="project-detail__head">
        <div className="project-detail__title-row">
          <h1 className="text-h1">{project.title}</h1>
          {project.status !== 'approved' && <StatusBadge status={project.status} />}
        </div>
        <div className="project-detail__meta">
          <span className="project-detail__meta-item">
            <UserRound size={14} aria-hidden="true" />
            {project.seller.displayName}
          </span>
          <Rating avgRating={project.avgRating} ratingCount={project.ratingCount} size="md" />
          <span className={`project-detail__price num ${project.priceCr === 0 ? 'project-detail__price--free' : ''}`}>
            {formatPriceCr(project.priceCr)}
          </span>
        </div>
      </header>

      {/* 试玩区（核心）：免登录免付款，点开即玩 */}
      <section className="project-detail__play" aria-label="试玩区">
        <h2 className="text-h2 project-detail__section-title">
          在线试玩
          <span className="badge badge--success project-detail__play-badge">免登录 · 免费试玩</span>
        </h2>
        {project.trialScope ? (
          <p className="project-detail__trial text-body-sm text-secondary">
            试用范围：<strong>{project.trialScope}</strong>
          </p>
        ) : (
          <p className="project-detail__trial text-body-sm text-secondary">该作品未声明试用范围。</p>
        )}
        <PlayFrame playUrl={project.playUrl} title={project.title} />
      </section>

      {/* 操作行常驻（§5.1）：联系卖家 / 举报 / ··· 不藏菜单 */}
      <section className="project-detail__actions" aria-label="操作">
        {sellerEmail ? (
          <a
            className="btn btn-secondary btn-sm"
            href={`mailto:${sellerEmail}?subject=${encodeURIComponent(`关于作品《${project.title}》的咨询`)}`}
          >
            <Mail size={16} aria-hidden="true" />
            联系卖家
          </a>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => showToast('卖家邮箱暂未公开，稍后可尝试评论区联系。', { tone: 'info' })}
          >
            <Mail size={16} aria-hidden="true" />
            联系卖家
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setReportOpen(true)}
        >
          <AlertCircle size={16} aria-hidden="true" />
          举报
        </button>
        <div className="project-detail__more">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="更多操作"
          >
            <Ellipsis size={16} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="project-detail__more-menu" role="menu">
              <button type="button" role="menuitem" className="project-detail__more-item" onClick={() => void copyLink()}>
                <Copy size={14} aria-hidden="true" />
                复制作品链接
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 购买区 */}
      <PurchasePanel project={project} user={user} />

      {/* 描述 */}
      <section className="project-detail__desc" aria-label="作品描述">
        <h2 className="text-h2 project-detail__section-title">作品介绍</h2>
        <p className="project-detail__desc-text text-body">{project.description || '作者还没有写介绍。'}</p>
      </section>

      {/* 评论区 */}
      <ReviewSection
        reviews={project.reviews}
        avgRating={project.avgRating}
        ratingCount={project.ratingCount}
        isPurchased={project.isPurchased}
      />

      <ReportDialog
        open={reportOpen}
        projectId={project.id}
        projectTitle={project.title}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
