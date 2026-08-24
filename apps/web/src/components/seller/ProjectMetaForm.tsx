/**
 * ProjectMetaForm —— 上传表单元数据字段（DESIGN_SYSTEM 区域 2 要点 3）
 *
 * - 标题 / 描述 / 分类（PROJECT_CATEGORIES 单选）/ 定价（免费|定价切换）/
 *   试用范围（trialScope）；
 * - 定价时**一屏显示**平台手续费（FEE_RATE 5%，A5）与到手金额预估（PRD 4）；
 * - 纯受控组件：值由父级持有（配合草稿自动保存 hook，Q3 输入即存）。
 */
import { PROJECT_CATEGORIES, FEE_RATE, type ProjectCategory } from '@vibe/shared';
import type { Cr } from '@vibe/shared';
import { AlertCircle, Coins } from 'lucide-react';
import type { ProjectMetaDraft } from '../../types/seller';

export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  game: '游戏',
  tool: '工具',
  art: '艺术',
  animation: '动画',
  webapp: '网页应用',
  other: '其他',
};

/** 平台手续费（与后端 calcFeeCr 同规则：floor(price * 5%)） */
export function calcFeeCr(priceCr: Cr): Cr {
  return Math.floor(priceCr * FEE_RATE);
}

interface ProjectMetaFormProps {
  value: ProjectMetaDraft;
  onChange: (next: ProjectMetaDraft) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  /** 说明文案（创建 vs 编辑） */
  intro?: string;
}

export function ProjectMetaForm({
  value,
  onChange,
  errors = {},
  disabled = false,
  intro,
}: ProjectMetaFormProps) {
  const set = (patch: Partial<ProjectMetaDraft>) => onChange({ ...value, ...patch });

  const feeCr = value.priced ? calcFeeCr(value.priceCr) : 0;
  const takeHome = value.priceCr - feeCr;

  return (
    <div className="project-meta-form">
      {intro && <p className="text-body-sm text-secondary">{intro}</p>}

      <div className="form-field">
        <label className="form-label" htmlFor="project-title">
          标题 <span className="text-tertiary">（必填）</span>
        </label>
        <input
          id="project-title"
          type="text"
          className="form-input"
          value={value.title}
          maxLength={120}
          placeholder="例如：贪吃蛇 3D —— 课堂小游戏"
          onChange={(e) => set({ title: e.target.value })}
          disabled={disabled}
        />
        {errors.title && (
          <p className="form-error">
            <AlertCircle size={14} aria-hidden="true" /> {errors.title}
          </p>
        )}
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="project-desc">
          描述 <span className="text-tertiary">（必填）</span>
        </label>
        <textarea
          id="project-desc"
          className="form-input project-meta-form__textarea"
          rows={4}
          value={value.description}
          placeholder="作品能做什么、适合谁、亮点是什么…（买家下单前主要靠它了解作品）"
          onChange={(e) => set({ description: e.target.value })}
          disabled={disabled}
        />
        {errors.description && (
          <p className="form-error">
            <AlertCircle size={14} aria-hidden="true" /> {errors.description}
          </p>
        )}
      </div>

      <div className="project-meta-form__row">
        <div className="form-field">
          <label className="form-label" htmlFor="project-category">
            分类 <span className="text-tertiary">（必填）</span>
          </label>
          <select
            id="project-category"
            className="form-input"
            value={value.category}
            onChange={(e) => set({ category: e.target.value as ProjectCategory | '' })}
            disabled={disabled}
          >
            <option value="">选择分类…</option>
            {PROJECT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
          {errors.category && (
            <p className="form-error">
              <AlertCircle size={14} aria-hidden="true" /> {errors.category}
            </p>
          )}
        </div>

        <div className="form-field project-meta-form__price">
          <span className="form-label" id="project-price-label">
            定价
          </span>
          <div className="project-meta-form__price-toggle" role="group" aria-labelledby="project-price-label">
            <button
              type="button"
              className={`chip${!value.priced ? ' chip--active' : ''}`}
              aria-pressed={!value.priced}
              onClick={() => set({ priced: false, priceCr: 0 })}
              disabled={disabled}
            >
              免费
            </button>
            <button
              type="button"
              className={`chip${value.priced ? ' chip--active' : ''}`}
              aria-pressed={value.priced}
              onClick={() => set({ priced: true, priceCr: value.priceCr || 100 })}
              disabled={disabled}
            >
              定价
            </button>
          </div>
          {value.priced && (
            <div className="project-meta-form__price-input">
              <input
                type="number"
                min={1}
                step={1}
                className="form-input"
                value={value.priceCr || ''}
                placeholder="价格（CR）"
                aria-label="价格（CR，整数）"
                onChange={(e) => set({ priceCr: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                disabled={disabled}
              />
              <span className="text-caption text-tertiary">CR</span>
            </div>
          )}
          {value.priced && (
            <p className="project-meta-form__fee text-caption" role="status">
              <Coins size={13} aria-hidden="true" />
              平台手续费 {Math.round(FEE_RATE * 100)}%（{feeCr} CR）+ 预计到手{' '}
              <strong className="num">{takeHome} CR</strong>
            </p>
          )}
          {errors.priceCr && (
            <p className="form-error">
              <AlertCircle size={14} aria-hidden="true" /> {errors.priceCr}
            </p>
          )}
        </div>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="project-trial">
          试用范围 <span className="text-tertiary">（建议填写）</span>
        </label>
        <input
          id="project-trial"
          type="text"
          className="form-input"
          value={value.trialScope}
          maxLength={120}
          placeholder="例如：前 3 关可免费试玩；完整版需购买"
          onChange={(e) => set({ trialScope: e.target.value })}
          disabled={disabled}
        />
        <p className="form-help">详情页试玩区展示的边界说明，买家据此决定是否购买。</p>
      </div>
    </div>
  );
}
