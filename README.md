# 我的味觉档案 · 验证版

PRJ-009 Phase 1 的移动优先 PWA。它验证的不是“哪家餐厅最好”，而是用户能否通过一次拍照、轻量确认和少量比较，建立自己的味觉人生榜。

## 当前闭环

`实时摄像头取景/快门 → 设备内 WebP 压缩 → 验证版模拟建议 → 编辑确认 → 2–4 次两两比较 → 人生榜/档案/味觉 DNA`

- 首次可载入 6 条明确标记的演示档案，或空白开始。
- 主入口通过 `getUserMedia` 调用实时摄像头，支持前后镜头切换和应用内快门；相册导入仅为摄像头不可用时的备用。
- `MockAiSuggestionProvider` 不调用网络；界面始终标记“验证版模拟识别”。
- 照片、菜名、地点、标签、排名和草稿只保存在浏览器 IndexedDB。
- “稍后再比”进入待比较区；“难分”进入同一排名组。
- 匿名导出只包含事件类型、时间、耗时和比较次数，不含个人内容或稳定设备身份。

## 本地运行

需要 Node.js 22+。

```bash
npm ci
npm run dev
```

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

- 应用没有账号、后端、云同步、在线分析和真实 AI。
- 用户照片在浏览器内缩放并编码为 WebP，随后写入 IndexedDB，不上传。
- 演示图片为 PRJ-009 自有生成素材，随静态站点提供。
- 清空数据会删除当前浏览器内该应用的全部记录，无法恢复。
- 导出的验证 JSON 使用字段白名单；不要把它当作真实用户研究结论。

## GitHub Pages

Vite 基础路径固定为 `/food-life-archive-mvp/`，页面使用 Hash 导航，刷新不会产生静态路由 404。`.github/workflows/deploy.yml` 在 `main` 分支执行 lint、类型检查、单元测试、构建、Chromium/WebKit E2E，然后通过 GitHub Pages 官方 Actions 发布 `dist/`。

计划地址：<https://zhangjie2759.github.io/food-life-archive-mvp/>

## 已知限制

- AI 建议是确定性的模拟数据，不识别真实照片内容或 GPS。
- 浏览器清站点数据、隐私模式限制或设备空间不足会造成数据丢失/保存失败。
- Safari 对摄像头权限、WebP、IndexedDB 与 PWA 的行为受系统版本影响，需要真机验收。
- 目前只验证新增记录，不支持历史相册批量导入、账号、社交或跨设备同步。
- 自动测试通过只说明工程闭环可复现，不代表验证指标已经达成。

## 回退与验收

- 代码回退：在 Git 中回退到上一已知通过的提交并重新部署；数据模型当前为 Dexie schema v1，无远端迁移。
- 用户验收：分别走一次“演示档案”和“空白开始”；完成新增、平局、稍后再比、刷新恢复、离线重载、匿名导出与清空。
- 发布前必须由 reviewer 完成第一轮只读复核；本目录不会自行创建或推送远端仓库。
