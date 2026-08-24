# 部署拓扑（Dev Deployment）

> 本地服务器 = 生产演示环境。域名：`vibers.hechenyu.xin`（DNS A 记录 → 服务器公网 IP，由用户管理）。
> 用户决策：开发过程中直接把站点映射到域名（端口方式）。

## 端口约定（唯一事实）

| 服务 | 绑定 | 端口 | 说明 |
|------|------|------|------|
| **Web 入口（Vite dev / 生产静态）** | `0.0.0.0` | **8090** | 对外唯一端口；`vibers.hechenyu.xin:8090` |
| **API 后端** | `127.0.0.1` | **3001** | 只对本机，不对外 |
| 数据库 | 本地文件 | — | SQLite |

- 对外暴露**只有 8090**：Vite dev server 配置 `server.proxy`：`/api → http://127.0.0.1:3001`（开发）；生产则 nginx/静态服务器 + 同构代理。
- API 一律**不绑定公网**（127.0.0.1），防绕过。
- 用户需在云安全组放行 **TCP 8090** 入站。

## 运行方式

```bash
# 开发（两个进程）
npm run dev            # 并行启动 web(:8090) + api(:3001)

# 生产演示（可选，交付阶段）
npm run build          # 构建静态产物
npm run preview        # 或静态服务器 → 8090（含 /api 代理）
```

## 访问

- `http://vibers.hechenyu.xin:8090` （其他设备直接打开；需安全组放行 8090）
- 本地：`http://127.0.0.1:8090`

## HTTPS 说明（后续可加）

当前为 HTTP + 端口方式。若要免端口 HTTPS（`https://vibers.hechenyu.xin`），需要 root 权限在系统 nginx 加 vhost（参考 `/opt/dsh/nginx/dsh.site.conf` 模式 + certbot），由服务器管理员（用户）操作；我们可提供现成 vhost 片段（见 `deploy/vibers.site.conf.example`）。
