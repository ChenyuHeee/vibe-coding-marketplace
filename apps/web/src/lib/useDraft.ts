/**
 * useDraft —— 草稿自动保存 hook（DESIGN_SYSTEM §4.3 ② Q3 保障）
 *
 * - 输入即存 localStorage（key 隔离），刷新不丢；
 * - 返回 [draft, setDraft, clearDraft]；setDraft 接受更新函数；
 * - localStorage 不可用/损坏时静默降级（不打断填写）。
 */
import { useEffect, useRef, useState } from 'react';

export function useDraft<T>(key: string, initial: () => T): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [draft, setDraftState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // 忽略损坏草稿
    }
    return initial();
  });
  const skipNextSave = useRef(false);

  // 初始化时若读到草稿则覆盖 initial（useState 已处理），无需额外保存
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // 静默降级
    }
  }, [key, draft]);

  const setDraft = (next: T | ((prev: T) => T)) => {
    setDraftState((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next));
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // 忽略
    }
    setDraftState(initial());
    skipNextSave.current = true;
  };

  return [draft, setDraft, clearDraft];
}
