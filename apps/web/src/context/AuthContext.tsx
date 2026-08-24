/**
 * 认证上下文 —— 登录态全局管理（PR-F2 / Epic #1）。
 *
 * - 挂载时若有 token 则 `GET /api/auth/me` 拉取用户（roles 数组，D4）；
 * - login / register 成功后存 token 并更新 user；
 * - logout 清除 token；
 * - 监听 api/client 广播的 `vibe:unauthorized`（401）自动登出。
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, clearToken, getToken, setToken, UNAUTHORIZED_EVENT } from '../api/client';
import type { LoginInput, RegisterInput, User } from '../types';

interface AuthContextValue {
  user: User | null;
  /** /me 拉取中（首次进入页面时展示加载态） */
  initializing: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(() => Boolean(getToken()));

  const refreshUser = async () => {
    const { user: fetched } = await authApi.me();
    setUser(fetched);
  };

  // 挂载时恢复登录态
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setInitializing(false);
      return;
    }
    refreshUser()
      .catch(() => {
        // /me 失败（401 已由 client 清 token，网络错误在此兜底）→ 视为未登录
        if (!cancelled) {
          clearToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 401 全局登出
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setInitializing(false);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      login: async (input) => {
        const { user: loggedIn, token } = await authApi.login(input);
        setToken(token);
        setUser(loggedIn);
        return loggedIn;
      },
      register: async (input) => {
        const { user: created, token } = await authApi.register(input);
        setToken(token);
        setUser(created);
        return created;
      },
      logout: () => {
        clearToken();
        setUser(null);
      },
      refreshUser,
    }),
    [user, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  return ctx;
}
