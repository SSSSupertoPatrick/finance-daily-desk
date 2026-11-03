# 备用在线入口（部署配置已准备，尚未发布）

在同一 GitHub 仓库新增独立的 Vercel 前端项目，建议名称 `finance-daily-desk-web`。使用仓库根目录，不使用 `backend/`。跟踪 main 分支。

根目录 `vercel.json` 会选择 Other 框架，跳过依赖安装，运行 `node scripts/build-standby.mjs`，只公开 `site/`。构建同步知识卡、股市与一级市场生成页面。无需设置 API 密钥或访问码。原有 backend 搜索项目单独保留。

部署发布成功后，核对根目录首页、primary.html、stocks.html、当期简报和搜索文件，再让用户确认实际访问。尚未核验的域名不写入邮件或定时任务。GitHub Pages 与现有每天09:00任务继续使用同一份公开内容；备用前端项目连接 main 后，后续公开更新会触发托管部署。

收藏与偏好按浏览器域名保存，换域名不会自动带入原域名收藏。用户当前选择暂不连接 GPT，保持现有站内搜索配置。

配置依据：[Vercel 官方文档](https://vercel.com/docs/project-configuration/vercel-json)。
