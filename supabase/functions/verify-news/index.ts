import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SocialMediaUrls {
  instagram_url?: string;
  twitter_url?: string;
  youtube_url?: string;
  tiktok_url?: string;
}

interface VerifyNewsRequest {
  newsTitle: string;
  mediaId: string;
  sitemapUrl?: string;
  domains?: string[];
  socialMediaUrls?: SocialMediaUrls;
}

interface VerifyNewsResponse {
  verified_on_website: boolean;
  website_url?: string;
  verified_on_instagram: boolean;
  instagram_url?: string;
  verified_on_twitter: boolean;
  twitter_url?: string;
  verified_on_youtube: boolean;
  youtube_url?: string;
  verified_on_tiktok: boolean;
  tiktok_url?: string;
  method: string;
}

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsVerificationBot/1.0)',
      },
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

async function searchInSitemap(sitemapUrl: string, newsTitle: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(sitemapUrl);
    if (!response || !response.ok) return null;

    const text = await response.text();
    const urlRegex = /<loc>([^<]+)<\/loc>/g;
    const urls: string[] = [];
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      urls.push(match[1]);
    }

    // Normalize and create keywords from title
    const normalizedTitle = newsTitle.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, ' ') // Remove special chars
      .split(/\s+/)
      .filter(word => word.length > 3);

    // First pass: Look for URLs that contain multiple keywords
    for (const url of urls.slice(0, 100)) {
      const urlLower = url.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const matchCount = normalizedTitle.filter(keyword =>
        urlLower.includes(keyword)
      ).length;

      // If URL contains at least 50% of keywords, it's likely a match
      if (matchCount >= Math.max(2, Math.floor(normalizedTitle.length * 0.5))) {
        return url;
      }
    }

    return null;
  } catch (error) {
    console.error('Error searching sitemap:', error);
    return null;
  }
}

async function searchInDomain(domain: string, newsTitle: string): Promise<string | null> {
  try {
    const searchUrl = `https://${domain}`;
    const response = await fetchWithTimeout(searchUrl);

    if (!response || !response.ok) return null;

    const text = await response.text();

    // Normalize title for better matching
    const normalizedTitle = newsTitle.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Extract all links from the homepage
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;
    const potentialLinks: { url: string, text: string, score: number }[] = [];

    while ((match = linkRegex.exec(text)) !== null) {
      const href = match[1];
      const linkText = match[2];

      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = `https://${domain}${href}`;
        } else if (!href.startsWith('http')) {
          fullUrl = `https://${domain}/${href}`;
        }

        // Score the link based on URL and link text
        const urlLower = fullUrl.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const textLower = linkText.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        let score = 0;
        normalizedTitle.forEach(keyword => {
          if (urlLower.includes(keyword)) score += 2;
          if (textLower.includes(keyword)) score += 3;
        });

        if (score > 0) {
          potentialLinks.push({ url: fullUrl, text: linkText, score });
        }
      }
    }

    // Sort by score and return the best match
    potentialLinks.sort((a, b) => b.score - a.score);

    if (potentialLinks.length > 0 && potentialLinks[0].score >= 5) {
      return potentialLinks[0].url;
    }

    return null;
  } catch (error) {
    console.error('Error searching domain:', error);
    return null;
  }
}

async function searchInSocialMedia(platformUrl: string, newsTitle: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(platformUrl, 8000);
    if (!response || !response.ok) return null;
    
    const text = await response.text();
    const textLower = text.toLowerCase();
    const titleLower = newsTitle.toLowerCase();
    const keywords = newsTitle.toLowerCase().split(' ').filter(word => word.length > 3);
    
    let matchCount = 0;
    keywords.forEach(keyword => {
      if (textLower.includes(keyword)) {
        matchCount++;
      }
    });
    
    if (matchCount >= Math.min(2, keywords.length) || textLower.includes(titleLower)) {
      return platformUrl;
    }
    
    return null;
  } catch (error) {
    console.error(`Error searching social media ${platformUrl}:`, error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { newsTitle, mediaId, sitemapUrl, domains, socialMediaUrls }: VerifyNewsRequest = await req.json();
    
    if (!newsTitle) {
      return new Response(
        JSON.stringify({ error: 'newsTitle is required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    let websiteUrl: string | null = null;
    let method = 'NONE';
    
    if (sitemapUrl) {
      websiteUrl = await searchInSitemap(sitemapUrl, newsTitle);
      if (websiteUrl) {
        method = 'SITEMAP';
      }
    }
    
    if (!websiteUrl && domains && domains.length > 0) {
      for (const domain of domains) {
        websiteUrl = await searchInDomain(domain, newsTitle);
        if (websiteUrl) {
          method = 'DOMAIN_SEARCH';
          break;
        }
      }
    }
    
    let instagramUrl: string | null = null;
    let twitterUrl: string | null = null;
    let youtubeUrl: string | null = null;
    let tiktokUrl: string | null = null;
    
    if (socialMediaUrls) {
      const socialPromises = [];
      
      if (socialMediaUrls.instagram_url) {
        socialPromises.push(
          searchInSocialMedia(socialMediaUrls.instagram_url, newsTitle)
            .then(url => { instagramUrl = url; })
        );
      }
      
      if (socialMediaUrls.twitter_url) {
        socialPromises.push(
          searchInSocialMedia(socialMediaUrls.twitter_url, newsTitle)
            .then(url => { twitterUrl = url; })
        );
      }
      
      if (socialMediaUrls.youtube_url) {
        socialPromises.push(
          searchInSocialMedia(socialMediaUrls.youtube_url, newsTitle)
            .then(url => { youtubeUrl = url; })
        );
      }
      
      if (socialMediaUrls.tiktok_url) {
        socialPromises.push(
          searchInSocialMedia(socialMediaUrls.tiktok_url, newsTitle)
            .then(url => { tiktokUrl = url; })
        );
      }
      
      await Promise.all(socialPromises);
    }
    
    const response: VerifyNewsResponse = {
      verified_on_website: !!websiteUrl,
      website_url: websiteUrl || undefined,
      verified_on_instagram: !!instagramUrl,
      instagram_url: instagramUrl || undefined,
      verified_on_twitter: !!twitterUrl,
      twitter_url: twitterUrl || undefined,
      verified_on_youtube: !!youtubeUrl,
      youtube_url: youtubeUrl || undefined,
      verified_on_tiktok: !!tiktokUrl,
      tiktok_url: tiktokUrl || undefined,
      method: method,
    };
    
    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});