# 知金台本机 Plus 版

运行在当前 Windows 电脑，使用官方 Sign in with ChatGPT 授权的套餐额度。无需提供 OpenAI API key。公网 GitHub Pages 提供站内资料和本机入口；AI 搜索在 `http://127.0.0.1:18741/` 完成，电脑与服务需要保持运行。

## 使用

双击上一级目录中的 `启动知金台.cmd`。首次启动安装并校验 npm 官方 `jose` 组件，之后后台启动服务并打开浏览器。点击 **Continue with ChatGPT**，在 OpenAI 官方页面登录 Plus 账号并授权套餐使用，返回后确认欢迎提示。模型列表取自当前账号实际可用目录。额度与应用权限可在 [ChatGPT 用量设置](https://chatgpt.com/settings/usage) 管理。

## 本机安全与保存

- 仅监听 IPv4 loopback，不向局域网或公网开放；校验 Host、Origin、本机 HttpOnly 会话，静态文件不提供私有目录。
- 官方 OAuth authorization-code + PKCE，随机 state/nonce、单次回调、精确 loopback URI；使用 jose 校验 ID token 的签名、issuer、audience、有效期与 nonce。只在授权了 `chatgpt.tokens.use.direct` 后启用推理。
- 凭据只留在 `.local-state/account.dpapi`，使用 Windows DPAPI 加密；目录 ACL 仅允许当前 Windows 用户访问。用户配置文件未加载时使用机器范围 DPAPI，并继续强制当前用户独占文件访问。不会回退为明文保存。
- 凭据、授权码、查询和完整授权 URL 不写日志、不进入 GitHub，不读取 Codex 或浏览器现有账号凭据。刷新轮转串行执行并原子替换。退出尝试官方撤销；未确认撤销时界面说明后续操作。
- Plus 的模型/工具与套餐用量受账号政策影响。收到流结束事件 `response.completed` 才显示结果。不会回退到付费 API key。额度不足时站内知识仍可使用。

## 验证

`node --test test/local.test.mjs` 验证 OAuth、身份验证、续期、Windows 加密、模型目录、SSE 完整性、套餐接口格式及引用。实际回答需要用户完成官方授权后单独联调。

参考：[注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[接口限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。
