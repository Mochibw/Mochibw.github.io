import { siteConfig } from '../config/site';

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/?$/, '/');
}

export function isActivePath(pathname: string, href: string): boolean {
  const path = normalizePath(pathname);
  return href === '/' ? path === '/' : path.startsWith(normalizePath(href));
}

export function navigationCurrent(pathname: string, href: string): 'page' | 'location' | undefined {
  return normalizePath(pathname) === normalizePath(href)
    ? 'page' : isActivePath(pathname, href) ? 'location' : undefined;
}

export function sectionLabel(pathname: string): string {
  if (isActivePath(pathname, '/tags/')) return '标签';
  return siteConfig.navigation.find(item => item.href !== '/' && isActivePath(pathname, item.href))?.label
    ?? siteConfig.headerSubtitle;
}
