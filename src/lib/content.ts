import type { CollectionEntry } from 'astro:content';

export type Article = CollectionEntry<'thoughts' | 'learning'>;

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

export function sortArticles<T extends Article>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function groupArticlesByTag(entries: readonly Article[]): Map<string, Article[]> {
  const groups = new Map<string, Article[]>();
  for (const entry of entries) {
    for (const tag of new Set(entry.data.tags)) {
      const group = groups.get(tag) ?? [];
      group.push(entry);
      groups.set(tag, group);
    }
  }
  return groups;
}

export function articleUrl(entry: Article): string {
  return `/${entry.collection}/${entry.slug}/`;
}

export function tagUrl(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}/`;
}
