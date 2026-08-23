/**
 * Heuristic verification of whether a news title was published by a media outlet:
 * checks the sitemap, the homepage links, and the configured social profiles.
 * Ported from the former Supabase Edge Function `verify-news`.
 */

export interface SocialMediaUrls {
  instagram_url?: string | null;
  twitter_url?: string | null;
  youtube_url?: string | null;
  tiktok_url?: string | null;
}

export interface VerifyNewsInput {
  newsTitle: string;
  sitemapUrl?: string | null;
  domains?: string[];
  socialMediaUrls?: SocialMediaUrls;
}

export interface VerifyNewsResult {
  verified_on_website: boolean;
  website_url: string | null;
  verified_on_instagram: boolean;
  instagram_url: string | null;
  verified_on_twitter: boolean;
  twitter_url: string | null;
  verified_on_youtube: boolean;
  youtube_url: string | null;
  verified_on_tiktok: boolean;
  tiktok_url: string | null;
  method: string;
}

const UA = 'Mozilla/5.0 (compatible; SIGMOCAD-NewsVerificationBot/1.0)';

export async function fetchWithTimeout(url: string, timeout = 10000, method = 'GET'): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { method, signal: controller.signal, headers: { 'User-Agent': UA }, redirect: 'follow' });
    clearTimeout(timer);
    return response;
  } catch {
    return null;
  }
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function titleKeywords(title: string): string[] {
  return normalize(title)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

async function searchInSitemap(sitemapUrl: string, newsTitle: string): Promise<string | null> {
  const response = await fetchWithTimeout(sitemapUrl);
  if (!response || !response.ok) return null;
  const text = await response.text();

  const urls: string[] = [];
  const urlRegex = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) urls.push(match[1]);

  const keywords = titleKeywords(newsTitle);
  if (keywords.length === 0) return null;
  const threshold = Math.max(2, Math.floor(keywords.length * 0.5));

  for (const url of urls.slice(0, 200)) {
    const urlLower = normalize(url);
    const matchCount = keywords.filter((k) => urlLower.includes(k)).length;
    if (matchCount >= threshold) return url;
  }
  return null;
}

async function searchInDomain(domain: string, newsTitle: string): Promise<string | null> {
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const response = await fetchWithTimeout(base);
  if (!response || !response.ok) return null;
  const text = await response.text();

  const keywords = titleKeywords(newsTitle);
  if (keywords.length === 0) return null;

  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  const candidates: { url: string; score: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    const href = match[1];
    const linkText = match[2];
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

    let fullUrl = href;
    if (href.startsWith('/')) fullUrl = `${base.replace(/\/+$/, '')}${href}`;
    else if (!href.startsWith('http')) fullUrl = `${base.replace(/\/+$/, '')}/${href}`;

    const urlLower = normalize(fullUrl);
    const textLower = normalize(linkText);
    let score = 0;
    for (const k of keywords) {
      if (urlLower.includes(k)) score += 2;
      if (textLower.includes(k)) score += 3;
    }
    if (score > 0) candidates.push({ url: fullUrl, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 && candidates[0].score >= 5 ? candidates[0].url : null;
}

async function searchInSocialMedia(platformUrl: string, newsTitle: string): Promise<string | null> {
  const response = await fetchWithTimeout(platformUrl, 8000);
  if (!response || !response.ok) return null;
  const textLower = (await response.text()).toLowerCase();
  const titleLower = newsTitle.toLowerCase();
  const keywords = titleLower.split(' ').filter((w) => w.length > 3);
  const matchCount = keywords.filter((k) => textLower.includes(k)).length;
  if (matchCount >= Math.min(2, keywords.length) || textLower.includes(titleLower)) return platformUrl;
  return null;
}

export async function verifyNews(input: VerifyNewsInput): Promise<VerifyNewsResult> {
  let websiteUrl: string | null = null;
  let method = 'NONE';

  if (input.sitemapUrl) {
    websiteUrl = await searchInSitemap(input.sitemapUrl, input.newsTitle);
    if (websiteUrl) method = 'SITEMAP';
  }

  if (!websiteUrl && input.domains && input.domains.length > 0) {
    for (const domain of input.domains) {
      websiteUrl = await searchInDomain(domain, input.newsTitle);
      if (websiteUrl) {
        method = 'DOMAIN_SEARCH';
        break;
      }
    }
  }

  const social = input.socialMediaUrls || {};
  const [instagramUrl, twitterUrl, youtubeUrl, tiktokUrl] = await Promise.all([
    social.instagram_url ? searchInSocialMedia(social.instagram_url, input.newsTitle) : null,
    social.twitter_url ? searchInSocialMedia(social.twitter_url, input.newsTitle) : null,
    social.youtube_url ? searchInSocialMedia(social.youtube_url, input.newsTitle) : null,
    social.tiktok_url ? searchInSocialMedia(social.tiktok_url, input.newsTitle) : null,
  ]);

  return {
    verified_on_website: !!websiteUrl,
    website_url: websiteUrl,
    verified_on_instagram: !!instagramUrl,
    instagram_url: instagramUrl,
    verified_on_twitter: !!twitterUrl,
    twitter_url: twitterUrl,
    verified_on_youtube: !!youtubeUrl,
    youtube_url: youtubeUrl,
    verified_on_tiktok: !!tiktokUrl,
    tiktok_url: tiktokUrl,
    method,
  };
}
