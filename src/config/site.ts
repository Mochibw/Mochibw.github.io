const author = 'Linatur';

export const articleSections = {
  thoughts: {
    label: '想法',
    description: '记录我对生活、读书和世界的思考与感悟。这些文字是我内心世界的真实写照。',
    emptyMessage: '还没有想法文章',
  },
  learning: {
    label: '学习',
    description: '整理我在技术学习和知识探索过程中的笔记。这里记录着成长的每一步。',
    emptyMessage: '还没有学习笔记',
  },
} as const;

export type ArticleSection = keyof typeof articleSections;

export const siteConfig = {
  name: author,
  title: `${author} 的知识库与思考花园`,
  description: '简约、清新、精致的个人网站，分享想法与学习笔记',
  homeTitle: `${author} 的思考花园`,
  homeDescription: '在这里记录对生活的思考、读书的感悟，以及学习路上的点滴。',
  headerSubtitle: '知识库与思考花园',
  sidebarDescription: '热爱生活，喜欢思考。在这里分享我的想法和学习笔记，记录成长路上的点点滴滴。',
  portrait: '/image/portrait.jpg',
  startYear: 2025,
  social: {
    github: 'https://github.com/Mochibw',
    email: 'hubowu233@gmail.com',
    bilibili: 'https://space.bilibili.com/',
    bilibiliLabel: 'Bilibili: 寻易寒',
  },
  navigation: [
    { href: '/', label: '首页', icon: 'home' },
    { href: '/thoughts/', label: articleSections.thoughts.label, icon: 'thoughts' },
    { href: '/learning/', label: articleSections.learning.label, icon: 'learning' },
    { href: '/about/', label: '关于我', icon: 'about' },
  ],
  comments: {
    enabled: true,
    repo: 'Mochibw/Mochibw.github.io',
    repoId: 'R_kgDOP6Tspw',
    category: 'Comments',
    categoryId: 'DIC_kwDOP6Tsp84CwdWV',
    theme: 'preferred_color_scheme',
    language: 'zh-CN',
  },
} as const;

export function pageTitle(label: string): string {
  return `${label} - ${siteConfig.title}`;
}
