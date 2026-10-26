# Linatur 的知识库与思考花园

记录生活思考、阅读感悟和学习笔记的个人网站：[mochibw.github.io](https://mochibw.github.io/)。使用 Astro 5、Markdown / MDX、Tailwind CSS 4 和 Shiki 生成静态页面，由 GitHub Pages 托管，评论使用 Giscus。

## 本地开发

使用 Node.js 22，与 CI 保持一致。从项目根目录执行：

```sh
npm ci
npm run dev
```

打开终端显示的地址，默认是 `http://localhost:4321`。Windows PowerShell 也可以使用 `npm.cmd`。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 开发预览与热更新 |
| `npm run build` | 生成 `dist/` 静态文件 |
| `npm run check` | 构建，并检查页面标题、描述、canonical、站内链接和资源 |
| `npm run preview` | 本地查看已构建的版本 |

`check` 不访问外部服务，页面交互仍需浏览器验收。`learning` 没有文章时，Astro 的空集合提示不影响构建。

## 写文章

想法写在 `src/content/thoughts/`，学习笔记写在 `src/content/learning/`，支持 `.md` 和 `.mdx`。文件开头填写 YAML frontmatter，四个字段均为必填项：

```markdown
---
title: 文章标题
pubDate: 2026-10-26
description: 简短说明这篇文章的内容
tags: ["读书", "感悟", "个人网站"]
---

这里是正文。
```

标签使用字符串数组，清空时写 `tags: []`。`tags: [读书, 感悟]` 也有效，逗号后的分隔空格不会成为标签内容；统一加引号可以避免数字、`true`、`null` 等值被识别成其他类型。

首页各显示最新三篇想法和学习笔记；栏目页按发布日期倒序，日期统一按 UTC 显示；标签页汇总两个栏目。发布文章直接放在栏目目录中，现有 `[slug]` 路由使用单段参数。改名或移动已发布文章会影响 URL，Giscus 评论按 pathname 关联。

`drop_content/` 存放草稿和临时笔记，不参与发布或标签索引。准备发布后移入相应内容目录，并补齐 frontmatter。

VS Code 标签补全的安装、使用、同步规则和开发命令统一见[扩展说明](tools/article-tags-vscode/README.md)。扩展可自由输入新标签，索引仅反映所有已保存文章当前使用的标签。

## 配置与维护

| 需要修改的内容 | 文件 |
| --- | --- |
| 作者、站点标题与简介、头像、社交链接、页脚年份 | [src/config/site.ts](src/config/site.ts) 的 `siteConfig` |
| 栏目介绍、空状态文案 | 同一文件的 `articleSections` |
| 导航项目 / 图标 | `siteConfig.navigation` / [SidebarNav.astro](src/components/SidebarNav.astro) |
| 域名、根路径、MDX 集成、Shiki 高亮主题 | [astro.config.mjs](astro.config.mjs) |
| 文章字段校验 | [src/content/config.ts](src/content/config.ts) |
| 关于页正文 | [src/pages/about.astro](src/pages/about.astro) |
| 主题颜色 | [src/styles/theme.css](src/styles/theme.css) |
| 基础字体、焦点与页面动效 | [src/styles/global.css](src/styles/global.css) |
| 正文排版 | [src/styles/article.css](src/styles/article.css) |
| 侧栏尺寸、状态与交互 | [src/styles/sidebar.css](src/styles/sidebar.css) / [src/scripts/sidebar.ts](src/scripts/sidebar.ts) |

`public/` 下资源按根路径访问，例如 `public/image/example.webp` 写作 `![图片说明](/image/example.webp)`。`public/favicon.svg` 同时用于浏览器标签和页头标识。

评论配置位于 `siteConfig.comments`，`enabled` 控制开关，其余字段设置 Giscus 仓库、分类 ID、主题和语言。父页面只控制评论容器及 iframe 外框，iframe 内部颜色由 Giscus 主题控制。迁移仓库、分类或文章 URL 前，应确认已有讨论的归属。

## 项目结构

```text
src/
  config/site.ts                站点与栏目配置
  content/                      文章与共享 schema
  lib/                          日期、排序、标签 URL 与导航工具
  components/                   页头、侧栏、文章列表项、标签与评论
  layouts/                      页面外壳与文章布局
  pages/
    [collection]/index.astro    想法 / 学习列表共用模板
    [collection]/[slug].astro   想法 / 学习详情共用模板
    tags/[tag].astro            标签聚合页
  scripts/sidebar.ts            侧栏状态、键盘交互与偏好恢复
  styles/                       全局、主题、正文与侧栏样式
public/                         静态资源
drop_content/                   草稿与临时笔记
scripts/check-build.mjs         构建结果检查
tools/article-tags-vscode/      独立 npm 项目的标签补全扩展
.github/workflows/ci.yml        检查、扩展打包与 Pages 部署
AGENTS.md                       编码助手的协作约定
```

Astro 在构建时读取文章，按 schema 校验后生成页面。`Layout.astro` 提供 HTML、元数据和公共组件，`ArticleLayout.astro` 提供文章标题、日期、摘要与评论。列表和详情根据 `articleSections` 生成两个栏目的路径，现有 URL 保持不变。

样式统一从 `global.css` 导入，确保 CSS layer 顺序。正文规则限定在 `.article-body`，桌面正文列宽约 720px、字号 17px、行高 1.85。侧栏以 768px 为断点，由一个状态对象同步 HTML 状态属性及无障碍属性，再由 CSS 布局；桌面收放偏好保存在 `localStorage.sidebarCollapsed`，滚动位置保存在 `sessionStorage.sidebarScrollPos`，手机抽屉状态不持久化。

## 检查与部署

[ci.yml](.github/workflows/ci.yml) 在推送 `main` / `develop`、面向 `main` 的 PR 和手动触发时执行。网站运行 `npm run check`；标签扩展独立安装依赖，运行单元测试并打包 VSIX，安装包保存在 Actions artifact 中。

推送 `main`，或在 `main` 手动运行工作流时，两项检查通过后部署 GitHub Pages；`develop` 和 PR 只检查。Pages 来源应设置为 **GitHub Actions**，通过上传 `dist/` artifact 发布。

网站和扩展各自保留 `package-lock.json`。依赖、构建产物、VSIX 和生成的标签索引均由 [.gitignore](.gitignore) 排除。
