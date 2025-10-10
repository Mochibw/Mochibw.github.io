# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 Astro 框架构建的个人网站项目（Linatur 的知识库与思考花园），部署在 GitHub Pages 上。网站采用简约、清新的设计风格，主要包含"想法"和"学习"两个内容板块。

## 技术栈

- **框架**: Astro.js 5.14.1 - 静态网站生成器，支持组件化开发
- **UI/CSS**: Tailwind CSS 4.1.13 - 原子化 CSS 框架，使用 Vite 集成
- **内容**: Markdown + MDX - 通过 @astrojs/mdx 支持
- **语法高亮**: rehype-highlight - 代码块语法高亮
- **部署**: GitHub Pages - 通过 GitHub Actions 自动部署

## 常用命令

```bash
# 安装依赖
npm install

# 启动开发服务器 (localhost:4321)
npm run dev

# 构建生产版本到 ./dist/ 目录
npm run build

# 预览构建后的本地版本
npm run preview

# Astro CLI 命令
npm run astro [command]
```

## 项目架构

### 内容管理
- 使用 **Astro Content Collections** 结构化管理内容
- 内容配置: `src/content/config.ts` - 定义了 thoughts 和 learning 两个集合
- 内容目录:
  - `src/content/thoughts/` - 想法文章 (Markdown)
  - `src/content/learning/` - 学习笔记 (Markdown)

### 页面结构
- `src/pages/index.astro` - 首页，展示最新内容
- `src/pages/thoughts/` - 想法相关页面
  - `index.astro` - 想法列表页
  - `[slug].astro` - 想法详情页
- `src/pages/learning/` - 学习相关页面
  - `index.astro` - 学习列表页
  - `[slug].astro` - 学习详情页
- `src/pages/tags/[tag].astro` - 标签详情页
- `src/pages/about.astro` - 关于我页面

### 布局系统
- `src/layouts/Layout.astro` - 主布局，包含侧边栏控制逻辑
- `src/layouts/ArticleLayout.astro` - 文章详情页布局

### 核心组件
- `src/components/Sidebar.astro` - 左侧固定侧边栏，包含个人信息和导航
- `src/components/Header.astro` - 顶部导航栏
- `src/components/Footer.astro` - 页脚
- `src/components/ArticleCard.astro` - 文章卡片组件，支持悬停动效
- `src/components/TagPill.astro` - 标签组件

### 样式系统
- `src/styles/global.css` - 全局样式和 CSS 变量定义
- `src/styles/theme.css` - 主题相关样式
- **配色方案**:
  - 天蓝色主色调: #66ccff
  - 青色辅助色: #14B8A6
  - 背景色: #F9FAFB
  - 文字色: #1E293B (主要), #64748B (次要)

## 关键特性

### 侧边栏系统
- 左侧固定侧边栏，支持桌面端收放和移动端抽屉
- 状态持久化: 使用 localStorage 保存收放状态
- 滚动位置记忆: 使用 sessionStorage 保存滚动位置
- 平滑过渡动画，避免页面切换时的闪烁

### 内容元数据
每篇内容文件需要包含以下 frontmatter:
```yaml
---
title: 文章标题
pubDate: 2025-10-10
description: 文章简短摘要 (50-100字)
tags: [标签1, 标签2, 标签3, 标签4]
---
```

### 响应式设计
- 移动端 (<768px): 侧边栏隐藏，通过汉堡菜单访问
- 桌面端 (≥768px): 侧边栏固定显示，支持收放
- 内容区域最大宽度 800px，居中显示

## 部署配置

- **网站 URL**: https://mochibw.github.io
- **Astro 配置**: `astro.config.mjs` - 已配置 site 和 base
- **GitHub Actions**: `.github/workflows/deploy.yml` - 自动构建和部署
- **构建输出**: `dist/ 目录` → 部署到 gh-pages 分支

## 开发注意事项

1. **内容管理**: 所有内容应放在 `src/content/` 下的相应目录中
2. **组件复用**: 新页面应使用现有的 Layout 组件保持一致性
3. **样式规范**: 使用 Tailwind CSS 类名，必要时通过 CSS 变量自定义颜色
4. **图片资源**: 静态图片放在 `public/image/` 目录
5. **路由规则**: Astro 基于文件系统自动生成路由
6. **SEO 优化**: 每个页面都应设置适当的 title 和 description

## 测试与部署流程

1. 本地开发: `npm run dev`
2. 构建测试: `npm run build` (确保无错误)
3. 提交代码: `git add . && git commit -m "描述" && git push`
4. 自动部署: GitHub Actions 会自动构建并部署到 GitHub Pages
5. 访问网站: https://mochibw.github.io 查看更新