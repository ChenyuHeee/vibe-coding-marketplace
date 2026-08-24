/**
 * 注册页（API.md §1 `POST /api/auth/register`；D3/D4）
 *
 * - 邮箱 + 密码（≥8 位，附说明）+ displayName；
 * - 角色选择：**主角色默认 buyer（不可取消）**，可并存勾选 seller / contractor（D4）；
 * - 成功后存 token 并跳转（注册的成功态 = 进入平台，首页按当前角色呈现）。
 * 四状态：表单（空态引导）/ 加载（按钮 spinner）/ 错误（ErrorBanner）/ 成功（跳转）。
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { ApiError } from '../api/client';
import { ROLE_LABELS } from '../context/RoleContext';

const OPTIONAL_ROLES: Role[] = ['seller', 'contractor'];

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  // D4：主角色默认 buyer，可并存勾选 seller/contractor
  const [extraRoles, setExtraRoles] = useState<Role[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; reason: string } | null>(null);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const toggleRole = (role: Role) => {
    setExtraRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) {
      setError({ title: '邮箱格式不正确', reason: '请输入有效的邮箱地址，例如 a@b.c。' });
      return;
    }
    if (password.length < 8) {
      setError({ title: '密码太短', reason: '密码至少需要 8 位，建议混合字母与数字。' });
      return;
    }
    if (!displayName.trim()) {
      setError({ title: '昵称不能为空', reason: '填一个昵称，方便其他用户认出你。' });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // D4：roles = [buyer(主角色), ...可选角色]
      const roles: Role[] = ['buyer', ...extraRoles];
      await register({ email: email.trim(), password, displayName: displayName.trim(), roles });
      navigate('/', { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : '网络连接不稳定，服务器没有响应。';
      setError({
        title: '注册失败',
        reason: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <h1 className="text-h1 auth-page__title">注册</h1>
      <p className="text-body-sm text-secondary auth-page__sub">
        一个账号可同时是买家、卖家或接单者，随时可在个人中心切换（D4）。
      </p>

      {error && (
        <ErrorBanner
          title={error.title}
          reason={error.reason}
          nextStep="请修改后重新提交。"
        />
      )}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label className="form-label" htmlFor="reg-email">
            邮箱
          </label>
          <input
            id="reg-email"
            className="form-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="reg-password">
            密码
          </label>
          <input
            id="reg-password"
            className="form-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
          />
          <p className="form-help">至少 8 位（D3：演示环境免邮箱验证）。</p>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="reg-display-name">
            昵称
          </label>
          <input
            id="reg-display-name"
            className="form-input"
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="小明"
          />
        </div>

        <fieldset className="form-field role-select">
          <legend className="form-label">我的角色（可多选并存）</legend>
          <div className="role-select__options">
            {/* 主角色：默认 buyer，固定选中 */}
            <button
              type="button"
              className="chip role-select__chip"
              aria-pressed="true"
              aria-label="主角色：买家（固定）"
              disabled
            >
              {ROLE_LABELS.buyer}
              <span className="text-caption role-select__primary">主</span>
            </button>
            {OPTIONAL_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                className="chip role-select__chip"
                aria-pressed={extraRoles.includes(role)}
                onClick={() => toggleRole(role)}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
          <p className="form-help">
            主角色为买家；勾选卖家 / 接单者可同时获得对应能力，登录后可切换。
          </p>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting && <Loader2 className="btn-icon spinner" size={16} aria-hidden="true" />}
            {submitting ? '注册中…' : '注册'}
          </button>
        </div>
      </form>

      <p className="form-switch">
        已有账号？<Link to="/login">去登录</Link>
      </p>
    </div>
  );
}
