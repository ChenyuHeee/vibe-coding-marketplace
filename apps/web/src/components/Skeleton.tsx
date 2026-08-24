/**
 * Skeleton —— 加载占位（DESIGN_SYSTEM §3.2 规则 4）
 *
 * 内容区加载（检索、列表刷新）用骨架屏而非全屏 spinner；
 * 灰色占位块，形状近似真实内容。配合 aria-busy 语义。
 */
interface SkeletonProps {
  /** 占位形状 */
  variant?: 'text' | 'card' | 'avatar' | 'line';
  /** 自定义宽度（px 或 css 值） */
  width?: number | string;
  /** 自定义高度（px 或 css 值） */
  height?: number | string;
  className?: string;
  /** 行数（text/line 变体） */
  lines?: number;
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  className,
  lines = 1,
}: SkeletonProps) {
  const style: React.CSSProperties | undefined =
    width !== undefined || height !== undefined
      ? { width: width !== undefined ? width : undefined, height: height !== undefined ? height : undefined }
      : undefined;

  if (variant === 'text' || variant === 'line') {
    return (
      <span className={`skeleton ${className ?? ''}`} style={style} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className="skeleton__line"
            style={
              i === lines - 1 && lines > 1
                ? { width: '60%' }
                : undefined
            }
          />
        ))}
      </span>
    );
  }

  return (
    <span
      className={`skeleton skeleton--${variant} ${className ?? ''}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/** 骨架卡片（Marketplace 卡占位，§8 #1 加载态） */
export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-busy="true">
      <Skeleton variant="card" height={160} />
      <Skeleton width="70%" />
      <Skeleton width="40%" />
    </div>
  );
}
