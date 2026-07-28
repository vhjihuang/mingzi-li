# 名字里

中文起名决策辅助 MVP。前端使用 React，API 使用 Express，并通过兼容 OpenAI
协议的智谱 GLM 服务生成候选名字。

## 本地运行

需要 Node.js 20 或更高版本。

1. 执行 `npm install`
2. 将 `.env.example` 复制为 `.env.local`，配置 `GLM_API_KEY`
3. 执行 `npm run dev`

未配置 `GLM_API_KEY` 时，接口会返回内置演示数据，不会调用外部模型。
API 响应中的 `source` 和 `degraded` 字段会明确标识结果来自 AI、混合补足或
内置候选，前端也会显示相应说明。

## 检查与构建

- `npm run lint`：TypeScript 类型检查
- `npm test`：接口回归测试
- `npm run build`：生成 `dist/public` 前端文件和 `dist/server` 服务端文件
- `npm start`：启动生产服务器

起名接口默认对每个客户端限制为 15 分钟 30 次请求，可通过
`NAMING_RATE_LIMIT_MAX` 和 `NAMING_RATE_LIMIT_WINDOW_MS` 调整。

## 部署配置

应用默认不信任 `X-Forwarded-For`，以防直连客户端伪造该请求头绕过限流。
仅当应用位于**一层受信任反向代理**之后时，设置 `TRUST_PROXY=true`；Zeabur 等
托管反向代理部署需要显式设置。Vercel 环境会通过 `VERCEL=1` 自动启用该配置。
若应用可被直接访问，请保持 `TRUST_PROXY=false`。
