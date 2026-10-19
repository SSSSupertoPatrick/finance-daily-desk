# 知金台 · 每日金融工作台

静态站点，包含金融基础知识卡、搜索、本机收藏和金融简报。

## 搜索与知识补充
首页新增问题搜索，匹配现有概念及本期简报，同时补充相关生活类比、原理与误区。
GPT 后端代码位于 `backend/`，使用 OpenAI Responses API 和联网搜索，详见该目录 README。
目前尚未配置 API 密钥或部署后端，线上只启用站内搜索，不会伪装成 GPT 回答。完成后端联调后再设置 `site/search-config.json` 的 endpoint。密钥和访问码不得提交到仓库。

## 发布
网站：https://ssssupertopatrick.github.io/finance-daily-desk/
仓库：https://github.com/SSSSupertoPatrick/finance-daily-desk
main 分支通过 GitHub Actions 自动发布，Pages 发布来源已配置为 GitHub Actions。
工作流只发布 site/，不发布仓库说明或其他文件。

## 每日更新
在 site/briefs/YYYY-MM-DD.html 保存已核验的简报，并更新 site/index.html 的 latest-brief 区域及内容日期；一次提交两个文件。提交会部署网站，但不会自动生成新闻，也不会发送邮件。
每日内容生成与邮件发送由原定时任务承担，已切换到本仓库和新网址，按北京时间每天 09:00 开始处理。网站本身不保存收件人或邮件凭据。

## 隐私
页面发布后公开可访问。此迁移包不含邮件地址、发送记录、凭据、原站项目配置或 Git 历史。
收藏和表单偏好仅保存在访客自己的浏览器。换域名后原站收藏不会自动转移。

## 当前状态
2026-10-19 已部署成功，并验证首页、知识卡搜索与大白话解读；每日更新任务已切换。公开仓库只存储公开页面和发布配置。
