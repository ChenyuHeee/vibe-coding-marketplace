/**
 * 首页（PR-F2 / Epic #1，Q1/Q2/Q3 演示）
 *
 * - 产品名 + 去 Marketplace 的 CTA（低风险一步可达，§5.1）；
 * - **Q1** IntentInput：3 示例 chip → ≤2 澄清追问 → 确认卡，确认前不执行；
 * - **Q2** 确认后进入四阶段进度面板（understanding→retrieving→building→checking，
 *   Stepper + 阶段性输出区 + Cancel 常驻右上角）；
 * - **Q3** 需求类意图在「校验」阶段演示失败 → FailureRecoveryCard（哪步失败+为什么 +
 *   已保留内容 + 三出路：重试 / 换一种方式 / 手动编辑）；
 * - 当前角色上下文提示（Phase 1：切换器 + 导航高亮，D4）。
 *
 * ⚠️ 本页为 Phase 1 演示实现：阶段为前端模拟（带 1s+ 阈值指示器，§3.2），
 *   不调用真实 API；Phase 2 各区域任务接入真实流程后替换。
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ClipboardPlus, LayoutGrid, ShoppingCart, Sparkles } from 'lucide-react';
import type { ParsedIntent } from '../types';
import { IntentInput } from '../components/IntentInput';
import { Stepper } from '../components/Stepper';
import { FailureRecoveryCard } from '../components/FailureRecoveryCard';
import { StatusBadge } from '../components/StatusBadge';
import { Skeleton } from '../components/Skeleton';
import { ROLE_CTAS, ROLE_LABELS, useCurrentRole } from '../context/RoleContext';

const STAGES = [
  { id: 'understanding', label: '理解意图', description: '正在理解你的意图…', ms: 700 },
  { id: 'retrieving', label: '检索', description: '正在检索可用的作品与素材…', ms: 1000 },
  { id: 'building', label: '构建', description: '正在构建 / 组合你的作品…', ms: 1100 },
  { id: 'checking', label: '校验', description: '正在校验运行与验收标准…', ms: 900 },
];

const DEMO_CANDIDATES = [
  { id: 'p1', title: '益智方块 2048', category: 'game', price: '199 CR', status: 'approved' as const },
  { id: 'p2', title: '记忆翻牌小游戏', category: 'game', price: '免费', status: 'approved' as const },
  { id: 'p3', title: 'Markdown 便签', category: 'tool', price: '120 CR', status: 'approved' as const },
];

const CHECKLIST = ['作品可运行', '验收标准逐项通过', '无越权访问（sandbox）'];

type TaskPhase = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

export function HomePage() {
  const navigate = useNavigate();
  const currentRole = useCurrentRole();
  const roleCta = ROLE_CTAS[currentRole];

  const [phase, setPhase] = useState<TaskPhase>('idle');
  const [stageIndex, setStageIndex] = useState(0);
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [retrievingDone, setRetrievingDone] = useState(false);
  const [buildingDone, setBuildingDone] = useState(false);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [editDraft, setEditDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };
  useEffect(() => clearTimers, []);

  const startTask = (confirmed: ParsedIntent) => {
    clearTimers();
    setIntent(confirmed);
    setPhase('running');
    setStageIndex(0);
    setRetrievingDone(false);
    setBuildingDone(false);
    setChecklist([]);
    setEditing(false);
  };

  // Q2 阶段推进（演示）：每阶段计时后进入下一阶段/结果
  useEffect(() => {
    if (phase !== 'running') return;

    const stage = STAGES[stageIndex];
    if (!stage) return;

    const timer = window.setTimeout(() => {
      if (stageIndex === 1) setRetrievingDone(true); // 阶段性输出：候选列表
      if (stageIndex === 2) setBuildingDone(true); // 阶段性输出：预览
      if (stageIndex === 3) {
        setChecklist(CHECKLIST);
        // Q3 演示：需求类意图在「校验」阶段失败
        if (intent?.kind === 'commission') {
          setPhase('failed');
        } else {
          setPhase('done');
        }
        return;
      }
      setStageIndex((i) => i + 1);
    }, stage.ms);

    timersRef.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [phase, stageIndex, intent]);

  const cancelTask = () => {
    clearTimers();
    setPhase('cancelled');
  };

  const retryTask = () => {
    if (!intent) return;
    clearTimers();
    setPhase('running');
    setStageIndex(0);
    setRetrievingDone(false);
    setBuildingDone(false);
    setChecklist([]);
    setEditing(false);
  };

  const alternativeWay = () => {
    clearTimers();
    setPhase('idle');
    setIntent(null);
  };

  const openManualEdit = () => {
    if (!intent) return;
    setEditDraft(
      `【${intent.kindLabel}】\n` +
        intent.params.map((p) => `${p.key}：${p.value}`).join('\n') +
        `\n\n将执行：${intent.actionSummary}`,
    );
    setEditing(true);
  };

  const saveManualEdit = () => {
    setEditing(false);
    // 演示：手动编辑后视为回到输入（草稿已保存，Q3 保障）
    setPhase('idle');
    setIntent(null);
  };

  const isRunning = phase === 'running';

  return (
    <div className="page home-page">
      <section className="home-hero">
        <span className="home-hero__badge" aria-hidden="true">
          <Sparkles size={14} />
          <span>Vibe Coding</span>
        </span>
        <h1 className="text-display">Vibe Coding Marketplace</h1>
        <p className="text-body text-secondary home-hero__sub">
          交易「能运行的作品」—— 买作品、卖作品、接需求，一个平台三种角色。
        </p>
        <div className="home-hero__actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate('/marketplace')}>
            <LayoutGrid size={16} aria-hidden="true" />
            去逛逛 Marketplace
          </button>
        </div>
      </section>

      {/* 当前角色上下文（D4：切换器在个人中心；此处仅展示，导航按角色呈现） */}
      <section className="home-role-strip" aria-label="当前角色">
        <span className="home-role-strip__label text-caption text-tertiary">
          当前以「{ROLE_LABELS[currentRole]}」身份浏览
        </span>
        <span className="text-body-sm text-secondary">
          {roleCta.title}：{roleCta.description}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/profile')}
        >
          切换角色
        </button>
      </section>

      {/* Q1：意图输入 */}
      <section className="home-intent" aria-label="描述你想做的事">
        <h2 className="text-h2 home-intent__title">
          {isRunning
            ? '执行中…'
            : phase === 'failed'
              ? '遇到了一点问题'
              : phase === 'done'
                ? '完成'
                : '描述你想做的事'}
        </h2>
        {!isRunning && phase !== 'failed' && phase !== 'cancelled' && phase !== 'done' && (
          <IntentInput onConfirm={startTask} draftKey="vibe.home.intent" />
        )}
        {phase === 'cancelled' && (
          <div className="intent-card" role="status">
            <p className="text-body-sm">
              <strong>已取消，保留已生成内容。</strong> 你输入的内容已保存（草稿不会丢失，Q3）。
            </p>
            <div className="intent-card__actions">
              <button type="button" className="btn btn-primary" onClick={() => setPhase('idle')}>
                重新开始
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/library')}>
                查看 My Library
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Q2：进度面板（四阶段 + 阶段性输出 + Cancel 常驻） */}
      {isRunning && intent && (
        <section className="card task-panel" aria-label="任务进度">
          <div className="task-panel__header">
            <Stepper steps={STAGES} currentStep={stageIndex} />
            <button
              type="button"
              className="btn btn-danger-ghost btn-sm task-panel__cancel"
              onClick={cancelTask}
            >
              取消
            </button>
          </div>

          <div className="task-panel__output" aria-live="polite">
            {stageIndex < 1 && <Skeleton width={200} height={16} />}
            {stageIndex >= 1 && (
              <div className="task-panel__block">
                <p className="text-body-sm task-panel__block-title">已找到候选作品：</p>
                {!retrievingDone && stageIndex === 1 ? (
                  <div className="task-panel__candidates">
                    {DEMO_CANDIDATES.map((c) => (
                      <Skeleton key={c.id} width={220} height={64} />
                    ))}
                  </div>
                ) : (
                  <ul className="task-panel__candidates">
                    {DEMO_CANDIDATES.map((c) => (
                      <li key={c.id} className="task-panel__candidate">
                        <span className="text-body-sm">
                          <strong>{c.title}</strong>
                          <span className="text-tertiary"> · {c.category} · </span>
                          <span className="num">{c.price}</span>
                        </span>
                        <StatusBadge status={c.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {stageIndex >= 2 && (
              <div className="task-panel__block">
                <p className="text-body-sm task-panel__block-title">构建预览：</p>
                {!buildingDone && stageIndex === 2 ? (
                  <Skeleton width={320} height={120} />
                ) : (
                  <div className="task-panel__preview">
                    <div className="task-panel__preview-frame" aria-hidden="true">
                      <Sparkles size={32} />
                    </div>
                    <p className="text-caption text-tertiary">
                      演示预览（Phase 2 将渲染真实可运行 iframe，免登录免付款试玩）
                    </p>
                  </div>
                )}
              </div>
            )}
            {stageIndex >= 3 && (
              <div className="task-panel__block">
                <p className="text-body-sm task-panel__block-title">校验清单：</p>
                <ul className="task-panel__checklist">
                  {CHECKLIST.map((item) => (
                    <li
                      key={item}
                      className={
                        checklist.includes(item)
                          ? 'task-panel__check-item task-panel__check-item--done'
                          : 'task-panel__check-item'
                      }
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 成功态（§3.4：给结果一个去处） */}
      {phase === 'done' && intent && (
        <section className="card success-panel" role="status">
          <span className="success-panel__icon" aria-hidden="true">
            <CheckCircle2 size={28} />
          </span>
          <h3 className="text-h3">
            {intent.kind === 'purchase' ? '已找到符合条件的作品' : '需求已准备发布'}
          </h3>
          <p className="text-body-sm text-secondary">
            {intent.kind === 'purchase'
              ? '已为你匹配 3 个候选作品，下单前会展示含手续费的实付总额。'
              : '演示环境：发布需求将在 Phase 2 接入真实 API。'}
          </p>
          <div className="success-panel__actions">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/marketplace')}>
              去 Marketplace 查看
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/library')}>
              去 My Library
            </button>
          </div>
        </section>
      )}

      {/* Q3：失败恢复卡片（三出路：重试/换一种方式/手动编辑） */}
      {phase === 'failed' && intent && (
        <section aria-label="失败恢复">
          <FailureRecoveryCard
            stepLabel="第 4 步「校验」"
            reason="验收标准未填写完整（缺少「移动端可用」检查项），演示流程无法继续。"
            preserved={[
              { title: '检索到的候选作品', summary: '3 个候选已保留在下方，不会丢失' },
              { title: '你输入的需求草稿', summary: '已自动保存（localStorage），可手动编辑' },
            ]}
            onRetry={retryTask}
            onAlternative={alternativeWay}
            onManualEdit={openManualEdit}
          />
          {editing && (
            <div className="card draft-editor" aria-label="手动编辑草稿">
              <p className="text-body-sm">
                <strong>手动编辑草稿</strong>
                <span className="text-caption text-tertiary"> · 修改后重新尝试（Q3 出路三）</span>
              </p>
              <textarea
                className="draft-editor__textarea"
                rows={6}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                aria-label="草稿内容"
              />
              <div className="draft-editor__actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={saveManualEdit}>
                  保存草稿并返回
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                  取消编辑
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 首页入口提示 */}
      <section className="home-quick-links" aria-label="快捷入口">
        <button
          type="button"
          className="card card--interactive home-quick-link"
          onClick={() => navigate('/marketplace')}
        >
          <ShoppingCart size={20} aria-hidden="true" />
          <span>
            <strong className="text-body-sm">Marketplace</strong>
            <span className="text-caption text-tertiary">浏览 / 试玩 / 购买作品</span>
          </span>
        </button>
        <button
          type="button"
          className="card card--interactive home-quick-link"
          onClick={() => navigate('/commissions')}
        >
          <ClipboardPlus size={20} aria-hidden="true" />
          <span>
            <strong className="text-body-sm">需求板</strong>
            <span className="text-caption text-tertiary">发布需求 / 接单</span>
          </span>
        </button>
      </section>
    </div>
  );
}
