import { useEffect, useState } from 'react';
import type { HealthResponse } from '@vibe/shared';

type HealthState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: HealthResponse }
  | { phase: 'error'; message: string };

/**
 * 脚手架首页：标题 + 调用后端健康检查展示状态。
 * 四种状态（PRD 5.1）：loading / ok / error 三态先落地，空态留给后续页面。
 */
export default function App() {
  const [health, setHealth] = useState<HealthState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then((data) => {
        if (!cancelled) setHealth({ phase: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHealth({ phase: 'error', message: err instanceof Error ? err.message : '未知错误' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app">
      <h1>Vibe Coding Marketplace</h1>
      <section aria-label="后端健康状态" className="health-card">
        {health.phase === 'loading' && (
          <p role="status">
            <span className="dot dot-loading" aria-hidden="true" /> 正在连接 API…
          </p>
        )}
        {health.phase === 'ok' && (
          <p role="status">
            <span className="dot dot-ok" aria-hidden="true" /> API 状态：正常（{health.data.service} v
            {health.data.version}）
          </p>
        )}
        {health.phase === 'error' && (
          <p role="alert">
            <span className="dot dot-error" aria-hidden="true" /> API 状态：不可用（{health.message}）
          </p>
        )}
      </section>
    </main>
  );
}
