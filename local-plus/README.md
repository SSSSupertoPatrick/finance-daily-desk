# 知金台本机 Plus 版

运行在当前 Windows 电脑，使用官方 Sign in with ChatGPT 授权的套餐额度。无需提供 OpenAI API key。公网 GitHub Pages 提供站内资料和本机入口；AI 搜索在 `http://127.0.0.1:18741/` 完成，电脑与服务需要保持运行。

## 使用

2026-10-27增加后台守护：每5秒检查本机服务，异常退出后自动恢复；明确点击停止时不自动重启。桌面“知金台”入口会先启动并检查后台，再打开网页。`开启登录自启.cmd`可以在当前Windows用户登录时启动后台，无需管理员、不会打开浏览器；安装后需实际重新登录才能验证登录触发。仍只监听本机地址，电脑关机时本机版不可访问。每日内容任务需要电脑联网、ChatGPT/Codex应用运行。

双击上一级目录中的 `启动知金台.cmd`，入口直接运行 Node.js，兼容禁止运行 PowerShell 脚本文件的默认 Windows 设置。首次启动安装并校验 npm 官方 `jose` 组件，之后后台启动服务；确认网页可访问才打开浏览器，失败时保留报错窗口。点击 **Continue with ChatGPT**，在 OpenAI 官方页面登录 Plus 账号并授权套餐使用，返回后确认欢迎提示。模型列表取自当前账号实际可用目录。额度与应用权限可在 [ChatGPT 用量设置](https://chatgpt.com/settings/usage) 管理。

## 本机安全与保存

- 仅监听 IPv4 loopback，不向局域网或公网开放；校验 Host、Origin、本机 HttpOnly 会话，静态文件不提供私有目录。
- 官方 OAuth authorization-code + PKCE，随机 state/nonce、单次回调、精确 loopback URI；使用 jose 校验 ID token 的签名、issuer、audience、有效期与 nonce。只在授权了 `chatgpt.tokens.use.direct` 后启用推理。
- 既有 `.local-state` 可读时继续使用。首次启动或旧目录权限阻止访问时，为当前 Windows 账户建立 `.user-state/<Windows SID>/`，保留原目录；新配置需要重新登录。所有凭据仍用 Windows DPAPI 加密，目录 ACL 仅允许所属 Windows 用户访问。用户配置文件未加载时使用机器范围 DPAPI，并继续强制当前用户独占文件访问。不会回退为明文保存。
- 凭据、授权码、查询和完整授权 URL 不写日志、不进入 GitHub，不读取 Codex 或浏览器现有账号凭据。刷新轮转串行执行并原子替换。退出尝试官方撤销；未确认撤销时界面说明后续操作。
- Plus 的模型/工具与套餐用量受账号政策影响。累计同一响应流的完整消息、搜索与引用事件，收到 `response.completed` 后才显示结果；兼容结束消息省略正文的情况。不会回退到付费 API key。额度不足时站内知识仍可使用。仅在建立连接前超时时重试，HTTP 错误或回答中途断开不自动重放。

## 验证

`node --test test/*.test.mjs` 的 15 项检查验证 OAuth、身份验证、续期、Windows 加密、模型目录、SSE 完整性、套餐接口格式及引用，并覆盖旧配置无权限时的恢复和不同 Windows 账户隔离。2026-10-19 已完成真实 Plus 账号连接，`gpt-6.1-sol` 联网查询返回上交所官方原文与引用。所有凭据只由本机服务内部消费，不显示于诊断输出。

参考：[注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[接口限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。
