/**
 * DesignSystemDemoPage —— 设计系统组件演示页（供 Reviewer/QA 对照 DESIGN_SYSTEM.md 验收）。
 * 不在主导航中；从首页「设计系统演示」链接进入。
 */
import { useState } from 'react';
import { AlertCircle, ClipboardPlus, Info, ShoppingCart } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { STATUS_WORDS } from '../components/statusVocabulary';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import { Stepper } from '../components/Stepper';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IntentInput } from '../components/IntentInput';
import { FailureRecoveryCard } from '../components/FailureRecoveryCard';

const Q2_STEPS = [
  { id: 'understanding', label: '理解意图', description: '正在理解你的意图…' },
  { id: 'retrieving', label: '检索', description: '正在检索可用的作品与素材…' },
  { id: 'building', label: '构建', description: '正在构建 / 组合你的作品…' },
  { id: 'checking', label: '校验', description: '正在校验运行与验收标准…' },
];

export function DesignSystemDemoPage() {
  const [step, setStep] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmedIntent, setConfirmedIntent] = useState<string | null>(null);

  return (
    <div className="page ds-demo">
      <h1 className="text-h1">设计系统演示</h1>
      <p className="text-body-sm text-secondary">
        对照 docs/DESIGN_SYSTEM.md 逐项验收组件（token / 四状态 / Q1Q2Q3 / 无障碍）。
      </p>

      <section className="ds-demo__section" aria-label="StatusBadge 词汇表驱动">
        <h2 className="text-h2">StatusBadge · 词汇表驱动（仅渲染 STATUS_VOCABULARY.md 的词）</h2>
        <div className="ds-demo__badges">
          {STATUS_WORDS.map((word) => (
            <StatusBadge key={word} status={word} />
          ))}
        </div>
      </section>

      <section className="ds-demo__section" aria-label="Stepper 步骤条">
        <h2 className="text-h2">Stepper · Q2 四阶段（当前第 {step + 1} 步）</h2>
        <Stepper steps={Q2_STEPS} currentStep={step} />
        <div className="ds-demo__actions-row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
            上一步
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep((s) => Math.min(4, s + 1))}>
            下一步
          </button>
        </div>
      </section>

      <section className="ds-demo__section" aria-label="四状态组件">
        <h2 className="text-h2">四状态组件</h2>
        <div className="ds-demo__grid">
          <EmptyState
            icon={ShoppingCart}
            tone="info"
            title="购物车还是空的"
            description="把喜欢的作品加进来，下单后可在 My Library 在线运行或下载。"
            actionLabel="去逛逛 Marketplace"
            onAction={() => undefined}
          />
          <EmptyState
            icon={ClipboardPlus}
            tone="brand"
            title="还没有需求"
            description="发布你的第一个需求，接单者会来投标。"
            actionLabel="发布需求"
            onAction={() => undefined}
          />
          <ErrorBanner
            title="加载作品列表失败"
            reason="网络连接不稳定，服务器没有响应。"
            nextStep="点击重试，或检查网络后再试。"
            actions={[{ label: '重试', onClick: () => undefined }]}
          />
          <ErrorBanner
            tone="warning"
            title="支付未完成"
            reason="你的支付方式拒绝了这笔扣款。"
            nextStep="换一种支付方式，或联系客服。你的订单与购物车内容已保留。"
            actions={[
              { label: '换卡支付', onClick: () => undefined },
              { label: '查看订单', variant: 'secondary', onClick: () => undefined },
            ]}
          />
          <div className="ds-demo__skeleton">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </section>

      <section className="ds-demo__section" aria-label="ConfirmDialog 二次确认">
        <h2 className="text-h2">ConfirmDialog · 二次确认（§5.2）</h2>
        <button type="button" className="btn btn-primary" onClick={() => setDialogOpen(true)}>
          打开「确认充值」弹窗
        </button>
        <ConfirmDialog
          open={dialogOpen}
          title="确认充值"
          consequences={
            <div className="confirm-dialog__money">
              <p className="text-body-sm">当前余额 <strong className="num">1,200 CR</strong></p>
              <p className="text-body-sm">充值金额 <strong className="num">500 CR</strong></p>
              <p className="text-body">充值后余额 <strong className="num text-success">1,700 CR</strong></p>
              <p className="text-caption text-tertiary">模拟支付，确认后即时入账到 balance。</p>
            </div>
          }
          confirmLabel="确认充值 500 CR"
          confirmTone="brand"
          onConfirm={() => {
            setDialogOpen(false);
          }}
          onCancel={() => setDialogOpen(false)}
        />
      </section>

      <section className="ds-demo__section" aria-label="IntentInput Q1">
        <h2 className="text-h2">IntentInput · Q1 意图表达</h2>
        <IntentInput onConfirm={(intent) => setConfirmedIntent(JSON.stringify(intent))} />
        {confirmedIntent && (
          <p className="ds-demo__confirmed text-caption text-tertiary">
            已确认意图（Phase 2 将在此进入 Q2 执行）：{confirmedIntent}
          </p>
        )}
      </section>

      <section className="ds-demo__section" aria-label="FailureRecoveryCard Q3">
        <h2 className="text-h2">FailureRecoveryCard · Q3 失败恢复</h2>
        <FailureRecoveryCard
          stepLabel="第 3 步「构建」"
          reason="运行环境缺少 node-canvas 依赖（版本不兼容），构建无法完成。"
          preserved={[
            { title: '检索到的 3 个候选作品', summary: '已列在下方，可直接选用' },
            { title: '你输入的需求草稿', summary: '已自动保存，不会丢失' },
          ]}
          onRetry={() => undefined}
          onAlternative={() => undefined}
          onManualEdit={() => undefined}
        />
      </section>

      <section className="ds-demo__section" aria-label="其他组件">
        <h2 className="text-h2">其他组件</h2>
        <div className="ds-demo__row">
          <Skeleton width={120} height={16} />
          <Skeleton variant="avatar" width={44} height={44} />
          <Skeleton variant="card" width={160} height={90} />
        </div>
        <p className="ds-demo__note text-caption text-tertiary">
          <Info size={12} aria-hidden="true" /> 演示页仅供验收；正式页面在 Phase 2 各区域任务中落地。
        </p>
        <p className="ds-demo__note text-caption text-tertiary">
          <AlertCircle size={12} aria-hidden="true" /> 占位按钮仅为演示，不执行真实动作。
        </p>
      </section>
    </div>
  );
}
