/**
 * PlayFrame —— 试玩区 iframe（DESIGN_SYSTEM 区域 1 要点 2/3 + ARCHITECTURE §3.3）
 *
 * 安全（硬性，ARCHITECTURE §3.3）：
 * - sandbox 只给 allow-scripts allow-forms allow-popups allow-pointer-lock
 *   allow-modals allow-downloads —— **不给 allow-same-origin / allow-top-navigation**；
 * - referrerPolicy="no-referrer"（不把主站 URL 泄露给作品）；
 * - 免登录、免付款、点开即玩（低风险一步可达，§5.1）。
 *
 * 四状态：
 * - 加载中：骨架屏 + 「正在加载试玩…」；
 * - 成功：iframe 可交互；
 * - 错误：ErrorBanner（作品加载失败）+ [重试]（重新挂载 iframe）；
 * - 空：作品无 playUrl（如已下架/审核中）→ 空态说明。
 *
 * 事件：load/error 用原生 addEventListener 挂载（React 合成事件对 iframe 的
 * error 不保证挂载；原生监听在 jsdom 与浏览器行为一致，重试换 key 后重挂）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { ErrorBanner } from './ErrorBanner';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

export const PLAY_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-pointer-lock allow-modals allow-downloads';

interface PlayFrameProps {
  /** 试玩地址（/play/:projectId）；null = 该作品当前不可试玩 */
  playUrl: string | null;
  /** 作品标题（空态文案用） */
  title?: string;
}

type PlayStatus = 'loading' | 'ready' | 'error';

export function PlayFrame({ playUrl, title = '作品' }: PlayFrameProps) {
  const [status, setStatus] = useState<PlayStatus>(playUrl ? 'loading' : 'error');
  const [attempt, setAttempt] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const retry = useCallback(() => {
    setStatus(playUrl ? 'loading' : 'error');
    setAttempt((n) => n + 1); // 换 key 重新挂载 iframe
  }, [playUrl]);

  // 原生监听 iframe 加载/失败（依赖 attempt：重试换 key 后重新挂监听）
  useEffect(() => {
    const el = iframeRef.current;
    if (!el || !playUrl) return;
    const onLoad = () => setStatus('ready');
    const onError = () => setStatus('error');
    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
    };
  }, [attempt, playUrl]);

  if (!playUrl) {
    return (
      <div className="playframe" data-testid="playframe-empty">
        <EmptyState
          icon={Gamepad2}
          tone="info"
          title="暂不可试玩"
          description="该作品当前没有可用的试玩版本。"
          actionLabel="返回列表看看"
          onAction={() => window.history.back()}
        />
      </div>
    );
  }

  return (
    <div className="playframe" data-testid="playframe">
      {status === 'loading' && (
        <div className="playframe__loading" role="status" aria-busy="true">
          <Skeleton variant="card" height={360} />
          <p className="text-caption text-tertiary">正在加载试玩《{title}》…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="playframe__error">
          <ErrorBanner
            title="作品加载失败"
            reason="试玩内容暂时无法加载，可能是网络不稳定或作品文件异常。"
            nextStep="点击重试重新加载。"
            actions={[{ label: '重试', onClick: retry }]}
          />
        </div>
      )}

      {/* 始终渲染 iframe：加载中与错误态之上覆盖提示层，就绪后露出 */}
      <iframe
        key={attempt}
        ref={iframeRef}
        src={playUrl}
        title={`《${title}》试玩`}
        className="playframe__iframe"
        sandbox={PLAY_SANDBOX}
        referrerPolicy="no-referrer"
        data-testid="playframe-iframe"
      />
    </div>
  );
}
