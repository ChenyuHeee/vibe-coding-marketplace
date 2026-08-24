/**
 * Stepper —— 步骤条（DESIGN_SYSTEM §3.2 / §4.2 / §8 #3）
 *
 * 规则：当前步 spinner + 说明；完成步对勾（Check）；未到步置灰；
 * 支持「第 x / y 步」；横向（桌面）/ 纵向（移动，CSS 断点自动切换）。
 * 同时服务：上传审核、接单交付、Q2 四阶段（understanding→retrieving→building→checking）。
 * 完成/未到不只靠颜色（对勾/数字/文字区分，§2.7）。
 */
import { Check, Loader2 } from 'lucide-react';

export interface StepperStep {
  id: string;
  label: string;
  /** 当前正在发生什么（一步说明） */
  description: string;
}

interface StepperProps {
  steps: StepperStep[];
  /** 当前步下标（0-based；等于 steps.length 表示全部完成） */
  currentStep: number;
  /** 显式方向；缺省 auto（桌面横向 / 移动纵向） */
  orientation?: 'horizontal' | 'vertical' | 'auto';
  className?: string;
}

export function Stepper({
  steps,
  currentStep,
  orientation = 'auto',
  className,
}: StepperProps) {
  const total = steps.length;
  const showCount = currentStep < total;

  return (
    <div
      className={[
        'stepper',
        orientation !== 'auto' ? `stepper--${orientation}` : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`进度：第 ${Math.min(currentStep + 1, total)} / ${total} 步`}
    >
      {showCount && (
        <p className="stepper__count text-caption text-tertiary">
          第 {currentStep + 1} / {total} 步
        </p>
      )}
      <ol className="stepper__list">
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isCurrent = i === currentStep;

          return (
            <li
              key={step.id}
              className={[
                'stepper__item',
                isDone ? 'stepper__item--done' : '',
                isCurrent ? 'stepper__item--current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="stepper__marker" aria-hidden="true">
                {isDone ? (
                  <Check size={16} />
                ) : isCurrent ? (
                  <Loader2 className="stepper__spinner" size={16} />
                ) : (
                  <span className="stepper__index">{i + 1}</span>
                )}
              </span>
              <span className="stepper__content">
                <span className="stepper__label text-body-sm">
                  {step.label}
                  {isCurrent && (
                    <span className="stepper__desc text-caption text-tertiary">
                      {step.description}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
