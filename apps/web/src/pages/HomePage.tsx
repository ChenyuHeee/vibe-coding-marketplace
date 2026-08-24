/**
 * 首页占位（Phase 1）—— 产品名 + 入口。
 * Phase 2（PR-F2）替换为 IntentInput（Q1）演示首页。
 */
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Sparkles } from 'lucide-react';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="page home-page">
      <section className="home-hero">
        <span className="home-hero__badge" aria-hidden="true">
          <Sparkles size={14} />
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
    </div>
  );
}
