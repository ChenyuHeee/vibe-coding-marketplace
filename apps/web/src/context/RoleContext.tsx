/**
 * 角色上下文 —— 当前角色（buyer / seller / contractor）切换器（D4）。
 *
 * - 一个账号可并存三种角色（roles 数组）；「当前角色」决定导航与页面内容呈现
 *   （PRD §1：同一页面三角色不同内容；Phase 1 先做切换器与导航高亮）；
 * - 当前角色持久化到 localStorage；若账号角色不再包含当前角色，自动回退到第一个；
 * - 未登录用户按 buyer 上下文浏览（低风险动作免登录，PRD §4）。
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Role } from '../types';
import { useAuth } from './AuthContext';

const CURRENT_ROLE_KEY = 'vibe.currentRole';

interface RoleContextValue {
  /** 当前生效角色 */
  currentRole: Role;
  /** 当前账号可切换的角色（未登录时视为仅 buyer） */
  availableRoles: Role[];
  setCurrentRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export const ROLE_FALLBACK: Role = 'buyer';

export const ROLE_LABELS: Record<Role, string> = {
  buyer: '买家',
  seller: '卖家',
  contractor: '接单者',
};

/** 各角色的平台入口提示（PRD §1：同一页面三角色不同内容） */
export const ROLE_CTAS: Record<Role, { title: string; description: string }> = {
  buyer: { title: '逛 Marketplace', description: '浏览作品、试玩、购买，或发布需求。' },
  seller: { title: '上传你的作品', description: '拖入 HTML 即可上架出售，全程可见审核进度。' },
  contractor: { title: '去需求板接单', description: '浏览需求、投标，按里程碑交付并结算。' },
};

function readStoredRole(): Role {
  try {
    const stored = localStorage.getItem(CURRENT_ROLE_KEY);
    if (stored === 'buyer' || stored === 'seller' || stored === 'contractor') return stored;
  } catch {
    // 忽略
  }
  return ROLE_FALLBACK;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentRole, setCurrentRoleState] = useState<Role>(readStoredRole);

  const availableRoles: Role[] = useMemo(() => {
    if (user && user.roles.length > 0) return user.roles;
    return [ROLE_FALLBACK];
  }, [user]);

  // 当前角色不在可用列表时回退（如登出或角色被移除）
  useEffect(() => {
    if (!availableRoles.includes(currentRole)) {
      setCurrentRoleState(availableRoles[0]);
    }
  }, [availableRoles, currentRole]);

  const setCurrentRole = (role: Role) => {
    setCurrentRoleState(role);
    try {
      localStorage.setItem(CURRENT_ROLE_KEY, role);
    } catch {
      // 忽略
    }
  };

  const value = useMemo<RoleContextValue>(
    () => ({ currentRole, availableRoles, setCurrentRole }),
    [currentRole, availableRoles],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole 必须在 <RoleProvider> 内使用');
  return ctx;
}

export function useCurrentRole(): Role {
  return useRole().currentRole;
}
