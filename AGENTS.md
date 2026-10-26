# 项目协作约定

本文件适用于整个仓库，供各种编码助手使用。开发命令、写作方式、配置入口和目录说明统一见 [README.md](README.md)；标签扩展的规则见其 [README.md](tools/article-tags-vscode/README.md)。

## 工作流程

- 在 `develop` 分批修改，完成后保留工作区变更供用户验收；用户明确通过后再按指示提交。
- 不自动推送、合并或发布。用户的新指示优先于这里的约定。
- 保留作者文章、草稿和引用资源；删除文件前检查引用与实际用途。
- 文档描述当前实现，更新原有说明，避免另外维护重复的架构或使用指南。
- 不提交依赖、构建产物、VSIX 或生成的标签索引。

## 实现约束

- 站点及栏目配置集中在 `src/config/site.ts`；域名和构建集成在 `astro.config.mjs`。
- 两个栏目共用 `src/pages/[collection]/` 路由模板。保持文章 URL 稳定，Giscus 使用 pathname 关联评论。
- 日期、排序、标签分组和 URL 复用 `src/lib/content.ts`；导航匹配复用 `src/lib/navigation.ts`。
- 样式只从 `src/styles/global.css` 导入。正文规则限定在 `.article-body`，不影响导航或评论。
- 侧栏交互集中在 `src/scripts/sidebar.ts`，CSS 通过根元素状态属性控制布局。调整断点时同步脚本和 CSS，目前为 768px。
- 标签扩展是独立 npm 项目。索引始终等于 `src/content/` 下所有已保存文章当前标签的去重并集；任何文章解析失败时保留上一次有效索引，修复并保存后重新全量扫描。

## 验证

- 网站或路由变更：根目录运行 `npm run check`。交互变更另检查桌面、手机和键盘操作。
- 扩展变更：在 `tools/article-tags-vscode/` 运行 `npm test`、`npm run package`；涉及 VS Code API 时按扩展说明运行宿主测试。
- 纯文档修改：检查本地链接与命令是否仍有效，无需反复构建。
- CI 使用 Node.js 22；网站与扩展分别使用各自锁文件安装依赖。
