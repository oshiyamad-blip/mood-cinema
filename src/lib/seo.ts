import { useEffect } from 'react';

const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://mood-cinema.example.com';

interface SeoInput {
  title: string;
  description?: string;
  image?: string;
  canonicalPath?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
  lang?: 'ja' | 'en';
}

function setMeta(selector: string, attr: string, value: string) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    const [name, val] = selector.replace('meta[', '').replace(']', '').split('=');
    el.setAttribute(name, val.replace(/"/g, ''));
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setLink(rel: string, href: string) {
  const id = `seo-${rel}`;
  let el = document.head.querySelector(`link[data-seo="${id}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute('data-seo', id);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(data: Record<string, unknown>) {
  const id = 'seo-json-ld';
  let el = document.head.querySelector(`script[data-seo="${id}"]`) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.setAttribute('type', 'application/ld+json');
    el.setAttribute('data-seo', id);
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function setHreflang(hreflangVal: string, href: string) {
  const id = `seo-hreflang-${hreflangVal}`;
  let el = document.head.querySelector(`link[data-seo="${id}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'alternate');
    el.setAttribute('hreflang', hreflangVal);
    el.setAttribute('data-seo', id);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useSeo({ title, description, image, canonicalPath, noindex, jsonLd, lang }: SeoInput) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    if (description) {
      setMeta('meta[name="description"]', 'content', description);
      setMeta('meta[property="og:description"]', 'content', description);
    }
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:url"]', 'content', SITE_URL + (canonicalPath ?? window.location.pathname + window.location.search));

    if (image) {
      setMeta('meta[property="og:image"]', 'content', image);
    }

    if (canonicalPath !== undefined) {
      setLink('canonical', SITE_URL + canonicalPath);
    }

    // hreflang: if page has a language, emit alternate links for both versions
    if (lang && canonicalPath !== undefined) {
      const isEn = lang === 'en';
      const jaPath = isEn ? canonicalPath.replace(/^\/en/, '') || '/' : canonicalPath;
      const enPath = isEn ? canonicalPath : `/en${canonicalPath}`;
      setHreflang('ja', SITE_URL + jaPath);
      setHreflang('en', SITE_URL + enPath);
      setHreflang('x-default', SITE_URL + jaPath);
    }

    setMeta('meta[name="robots"]', 'content', noindex ? 'noindex,follow' : 'index,follow');

    const defaultJsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Tsumugi',
      url: SITE_URL,
      description: '脚本を組み立てる編集卓',
    };

    setJsonLd(jsonLd ?? defaultJsonLd);

    return () => {
      document.title = prevTitle;
    };
  }, [title, description, image, canonicalPath, jsonLd]);
}
