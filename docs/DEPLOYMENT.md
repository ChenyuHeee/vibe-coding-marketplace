# 部署拓扑（Dev Deployment）

> 本地服务器 = 生产演示环境。域名：`vibers.hechenyu.xin`（DNS A 记录 → 服务器公网 IP，由用户管理）。
> 访问方式：**直接 `https://vibers.hechenyu.xin`（免端口）**，由系统 nginx（80/443，root 管理）反代到本应用。

## 端口约定（唯一事实）

| 服务 | 绑定 | 端口 | 说明 |
|------|------|------|------|
| **Web 入口（Vite dev / 静态产物）** | `127.0.0.1` | **8090** | 只被 nginx 反代访问；本地调试可直接访问 |
| **API 后端** | `127.0.0.1` | **3001** | 只对本机，不对外；nginx 将 `/api` 与 `/play` 转发至此 |
| 数据库 | 本地文件 | — | SQLite |

- 对外暴露：**只有 nginx 80/443**（由服务器管理员 root 管理，见下）。
- Web/API 一律绑定 127.0.0.1（不再需要 0.0.0.0），安全组无需放行额外端口。

## nginx vhost（root 操作，一次完成）

配置文件已备好（两份，均已同步到 `/opt/dsh/nginx/`）：

- `deploy/vibers.site.http-only.conf` —— HTTP 引导版（证书前临时用）
- `deploy/vibers.site.conf` —— HTTPS 完整版（反代 `/` → 8090，`/api`、`/play` → 3001）

以 root 依次执行：

```bash
# 1) HTTP 引导版上线（vibers.hechenyu.xin 立即可用，HTTP）
cp /opt/dsh/DSH/Vibers-Land/deploy/vibers.site.http-only.conf /etc/nginx/sites-available/vibers.http
ln -sf /etc/nginx/sites-available/vibers.http /etc/nginx/sites-enabled/vibers.http
nginx -t && systemctl reload nginx

# 2) 签发 Let's Encrypt 证书（HTTP-01 验证）
certbot certonly --webroot -w /var/www/letsencrypt -d vibers.hechenyu.xin --register-unsafely-without-email --agree-tos

# 3) 切换为 HTTPS 完整版
cp /opt/dsh/DSH/Vibers-Land/deploy/vibers.site.conf /etc/nginx/sites-available/vibers
ln -sf /etc/nginx/sites-available/vibers /etc/nginx/sites-enabled/vibers
rm -f /etc/nginx/sites-enabled/vibers.http
nginx -t && systemctl reload nginx
```

> 若 `deploy-nginx.sh` 会自动安装 `/opt/dsh/nginx/` 下全部 conf，也可直接运行它（视其实现而定）。
> 完成后访问：`https://vibers.hechenyu.xin`（HTTPS） / `http://vibers.hechenyu.xin`（会 301 到 HTTPS）。

## 运行方式

```bash
# 开发（两个进程，均在 127.0.0.1）
npm run dev            # web(:8090) + api(:3001)

# 生产演示（交付阶段）
npm run build && npm run preview   # 或静态服务器 → 8090（含 /api 代理）
```

## 本地验证

- `curl http://127.0.0.1:8090/`（占位页/应用）
- `curl http://127.0.0.1:3001/api/health`（API）
- nginx 链路：`curl -H 'Host: vibers.hechenyu.xin' http://127.0.0.1/ -L`
