# 知金台 GPT 搜索后端

前端继续部署到 GitHub Pages；本目录独立部署为 Node.js 服务。无第三方依赖，不需要构建。

## 状态

已部署于 Vercel，GitHub Pages 前端连接 `/api/search`。凭据仅配置在托管平台。前端 endpoint 为空时只执行站内搜索，并明确标识未接通。

## 部署到 Vercel

1. 导入 `SSSSupertoPatrick/finance-daily-desk`，Root Directory 选择 `backend`，框架选择 Other，不设置构建命令。使用 Node.js 24。
2. 在托管平台的服务端环境变量中设置 `OPENAI_API_KEY`，不要填写到网页、聊天或 GitHub 文件里。
3. 设置 `SEARCH_ACCESS_CODE` 为至少 16 字符的随机访问码，建议 32 字符，只与实际使用者分享。这是本站访问码，不是 OpenAI 密钥。前端只在当前页面内存中使用访问码，不写 localStorage。
4. 可设置 `OPENAI_MODEL`（默认 `gpt-4.1-mini`），必须支持 Responses API 和 web_search。可设置 `ALLOWED_ORIGIN`，默认 `https://ssssupertopatrick.github.io`。
5. 部署后用真实访问码验证 `POST /api/search`，请求 JSON 为 `{ "query": "降息为什么影响债券" }`，请求头 `X-Search-Code`。成功应返回带引用的 `parts`。验证预检 OPTIONS 和站点浏览器的跨域请求。
6. 将根目录 `site/search-config.json` 的 `endpoint` 改为已验证的 `https://你的后端域名/api/search` 并提交到 main；前端才会启用 GPT 选项。不要把任何密钥或访问码写入此配置。

## 行为与边界

- 两阶段处理：先在监管机构、交易所、官方统计及投资者教育域名内联网检索，再按严格 JSON 格式整理答案和 2–3 个知识卡。每张卡含生活类比、原理、现实意义和边界。明确区分 ETF/指数基金、跟踪误差/单期收益差、债券票息/收益率/久期。
- 引用只采纳搜索工具的 annotations 或实际 consulted sources 元数据；第二阶段仅能使用这些来源 ID，未知 ID、空来源或缺少知识卡字段会被拒绝。来源清单不等同于逐句事实证明，模型仍可能误读资料，应核对原文。没有可靠资料时保留站内结果并明确报错。
- 最多 300 字符输入、4 KiB 请求体；检索最多 1800 输出 tokens，整理最多 2600，两阶段共用 48 秒期限，仅在模型明确拒绝域名过滤参数（400）时去除该参数重试一次，仍执行服务端来源域名校验；其他失败不自动重试。每次成功搜索通常包含两次模型调用和一次联网工具使用。前端以安全文本与可点击引用渲染，失败不返回上游原始错误。
- 必须有访问码才能调用付费 API。CORS 不是身份验证。实例内每小时 30 次及最多 2 个并发仅减少误点，并非跨实例或持久化账单硬上限。开放给大量用户前应增加独立用户登录、持久化配额和平台限流。
- OpenAI API 调用和联网工具可能产生费用；上线前在 API 项目与托管平台配置预算及用量提醒，并检查账户是否有可用 API 额度。ChatGPT 登录并不会自动为此后端提供密钥。
- `store:false` 不等于全部供应商日志零保留。本应用不记录查询、访问码或密钥；托管平台和 API 的数据政策仍适用。

## 验证

在本目录运行 `npm test`。13 项测试使用模拟响应，不产生 API 费用；覆盖认证、来源补救、伪造 ID、冒牌域名、引用位置、卡片字段、共享超时与失败处理。真实答案质量需在部署后以 ETF、跟踪误差、降息/债券等问题单独验证。

官方文档：https://developers.openai.com/api/docs/guides/tools-web-search
部署文档：https://vercel.com/docs/functions/runtimes/node-js
