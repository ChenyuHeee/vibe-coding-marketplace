/**
 * 登录页（API.md §1 `POST /api/auth/login`；四状态：表单/加载/错误/成功→跳转）。
 */
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { ApiError } from '../api/client';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; reason: string } | null>(null);

  // 已登录 → 跳转（登录页的成功态）
  if (user) {
    return <Navigate to={from ?? '/'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // 客户端校验（邮箱格式 + 必填）
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError({
        title: '邮箱格式不正确',
        reason: '请输入有效的邮箱地址，例如 a@b.c。',
      });
      return;
    }
    if (!password) {
      setError({ title: '密码不能为空', reason: '请输入你的密码。' });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : '网络连接不稳定，服务器没有响应。';
      setError({ title: '登录失败', reason: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <h1 className="text-h1 auth-page__title">登录</h1>
      <p className="text-body-sm text-secondary auth-page__sub">
        登录后可购买作品、发布需求、接单与查看 My Library。
      </p>

      {error && (
        <ErrorBanner
          title={error.title}
          reason={error.reason}
          nextStep="请检查输入后重试，或先注册一个新账号。"
        />
      )}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label className="form-label" htmlFor="login-email">
            邮箱
          </label>
          <input
            id="login-email"
            className="form-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="login-password">
            密码
          </label>
          <input
            id="login-password"
            className="form-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting && <Loader2 className="btn-icon spinner" size={16} aria-hidden="true" />}
            {submitting ? '登录中…' : '登录'}
          </button>
        </div>
      </form>

      <p className="form-switch">
        还没有账号？<Link to="/register">去注册</Link>
      </p>
    </div>
  );
}
