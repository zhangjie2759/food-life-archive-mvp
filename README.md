# 私人美食评审局 · 试行版

PRJ-009 V2 的移动优先 PWA。它不是大众点评或社交平台，而是一套只服务于用户本人的个人美食权威排行榜系统。

## 当前闭环

`拍照/相册上传 → WebP 压缩 → Gemini 客观识别 → 人工核准 → 红榜/黑榜裁定 → 排名变化 → Top 10 赐名`

- 冷启动、PWA 图标和无 Hash 基础链接会直接通过 `getUserMedia` 打开后置摄像头；明确的榜单深链接保持原页面，相册仅为失败备用。
- 未完成的裁剪、AI 核准或复判草稿会优先恢复；保存后短暂提示并回到摄像头，适合一桌多菜连续记录。
- 红榜和黑榜拥有完全独立的顺位，均提供人生、年度和月度榜；榜单是底部默认主入口。
- 月榜、年度总榜和人生榜是同一核心榜单的时间切片；菜系、类型、食物类别和荤素仅用于筛选。
- 拍照与相册历史图片都可进入同一识别流程；AI 只生成标准名称与客观分类，不参与价值判断。
- 排名显示 `NEW`、`↑`、`↓`，并在 Top 10、Top 3、榜首易主和黑榜最差纪录时提供分级反馈。
- Top 10 获得“赐名”资格；系统同时保留 AI 标准名与用户正式名称。
- 点击照片可在黑底查看器中缩放、拖动与复位；食物档案可完整编辑或替换照片，替换不会重跑 AI 或改变顺位。
- 红榜/黑榜的月榜、年度榜和人生榜可在本机生成含现有 Top 10 照片的 1080×1440 排行榜 PNG，前三大图、后七紧凑列表。
- 品牌视觉为黑白编辑排版、红色重点和“黑色剪影小人族厨师”IP；红榜榜首使用抽象红冠，黑榜第一使用黑色裁定印。
- 生产构建默认使用明确标识的 `MockAiSuggestionProvider`；本地开发可通过安全代理启用真实 Gemini。
- 照片、菜名、地点、标签、排名和草稿只保存在浏览器 IndexedDB。
- 复判采用 2–4 次两两比较；“稍后再比”回到待复判区，“难分”进入同一排名组。
- 匿名导出只包含事件类型、时间、耗时和比较次数，不含个人内容或稳定设备身份。

## 本地运行

需要 Node.js 22+。

```bash
npm ci
npm run dev
```

### 启用真实 Gemini 图片识别

密钥只能放在 `server/.env.local`，不能使用 `VITE_` 变量传给浏览器。分别启动两个终端：

```bash
npm run dev:api
npm run dev
```

本地 Vite 通过 `/api/analyze` 代理到 `127.0.0.1:8787`。服务端限制请求来源、请求体大小和每分钟频率，并使用结构化 JSON 返回：标准名称、菜系、类型、食物类别和荤素。

完整验证：

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npx playwright install chromium webkit
npm run e2e
```

生产预览：

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

访问 `http://127.0.0.1:4173/food-life-archive-mvp/`。

## 数据与隐私

- 应用没有账号、云同步或在线分析。
- 用户照片先在浏览器内缩放并编码为 WebP，随后写入 IndexedDB。
- 启用真实 AI 时，当前压缩图片会经服务端代理发送给 Gemini 做一次识别；API Key 永不进入前端包。
- 演示图片为 PRJ-009 自有生成素材，随静态站点提供。
- 清空数据会删除当前浏览器内该应用的全部记录，无法恢复。
- 导出的验证 JSON 使用字段白名单；不要把它当作真实用户研究结论。

## GitHub Pages

Vite 基础路径固定为 `/food-life-archive-mvp/`，页面使用 Hash 导航，刷新不会产生静态路由 404。`.github/workflows/deploy.yml` 在 `main` 分支执行 lint、类型检查、单元测试、构建、Chromium/WebKit E2E，然后通过 GitHub Pages 官方 Actions 发布 `dist/`。

GitHub Pages 只能托管静态前端，不能安全运行 Gemini 代理。公开版要启用真实 AI，需要另行部署 `server/` 到 Cloudflare Workers、Vercel Functions 或等价后端，并把 `VITE_AI_API_URL` 指向该地址。

线上地址：<https://zhangjie2759.github.io/food-life-archive-mvp/>

## 已知限制

- Pages 线上版本在安全后端部署前仍使用确定性模拟识别；本机真实 Gemini 已验证通过。
- 浏览器清站点数据、隐私模式限制或设备空间不足会造成数据丢失/保存失败。
- Safari 对摄像头权限、WebP、IndexedDB 与 PWA 的行为受系统版本影响，需要真机验收。
- 红榜和黑榜都是私人裁定，不提供公开商家评分、社区曝光或商家搜索。
- 目前只验证新增记录，不支持历史相册批量导入、账号、社交或跨设备同步。
- 自动测试通过只说明工程闭环可复现，不代表验证指标已经达成。

## 回退与验收

- 代码回退：在 Git 中回退到上一已知通过的提交并重新部署；数据模型为 Dexie schema v3，包含旧赐名语义迁移，无远端数据迁移。
- 用户验收：完成打开即拍、裁剪、AI 核准、连续记录、红/黑榜独立复判、完整编辑、图片缩放、替换照片、Top 10 分享、刷新恢复与离线重载。
- Phase 1.2 reviewer 与正式 Pages 发布状态见项目 `ACCEPTANCE.md`；自动测试不能替代真机验收。
- Safari / iPhone 的真实摄像头权限、安装和离线重载仍需 Jay 真机验收。
