/**
 * Pagination —— 分页（API.md 统一分页约定 `{ items, page, pageSize, total }`）
 *
 * - 上一页 / 下一页 + 页码（1..总页数，最多 7 个页码，首尾常驻）；
 * - 当前页 aria-current="page"；键盘可聚焦（原生 button）；
 * - 单页或空列表不渲染（避免多余 UI）。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function pageList(current: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="分页">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        上一页
      </button>
      <ul className="pagination__list">
        {pageList(page, totalPages).map((p, i) =>
          p === '…' ? (
            <li key={`gap-${i}`} className="pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                className={`pagination__btn${p === page ? ' pagination__btn--current' : ''}`}
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`第 ${p} 页`}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        下一页
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
