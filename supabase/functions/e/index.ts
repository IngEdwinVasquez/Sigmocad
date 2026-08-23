const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const publicKeyWithExt = pathParts[pathParts.length - 1];
    const publicKey = publicKeyWithExt.replace(/\.js$/, '');

    if (!publicKey) {
      return new Response('// Missing public key', {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/javascript' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const embedUrl = `${supabaseUrl}/functions/v1/embed`;
    const clickUrl = `${supabaseUrl}/functions/v1/click`;
    const impressionUrl = `${supabaseUrl}/functions/v1/impression`;

    const jsContent = `
(function() {
  'use strict';
  
  const scripts = document.querySelectorAll('script[src*="/e/${publicKey}.js"]');
  const currentScript = scripts[scripts.length - 1];
  
  if (!currentScript) {
    console.error('GEV: Could not find script tag');
    return;
  }
  
  const slotSlug = currentScript.getAttribute('data-slot');
  const width = currentScript.getAttribute('data-width') || '300';
  const height = currentScript.getAttribute('data-height') || '250';
  
  if (!slotSlug) {
    console.error('GEV: Missing data-slot attribute');
    return;
  }
  
  const containerId = 'gev-' + slotSlug;
  let container = document.getElementById(containerId);
  
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    currentScript.parentNode.insertBefore(container, currentScript);
  }
  
  const referrer = encodeURIComponent(document.referrer || window.location.href);
  const embedApiUrl = '${embedUrl}?publicKey=${publicKey}&slot=' + slotSlug + '&ref=' + referrer;
  
  fetch(embedApiUrl)
    .then(function(response) {
      if (response.status === 204 || !response.ok) {
        return null;
      }
      return response.json();
    })
    .then(function(data) {
      if (!data) return;
      
      const mediaId = data.mediaId;
      const slotId = data.slotId;
      const creativeId = data.creativeId;
      const clickDestUrl = '${clickUrl}?mediaId=' + mediaId + '&slotId=' + slotId + '&creativeId=' + creativeId;
      
      navigator.sendBeacon('${impressionUrl}', JSON.stringify({
        mediaId: mediaId,
        slotId: slotId,
        creativeId: creativeId,
        referrer: document.referrer || window.location.href
      }));
      
      container.style.cssText = 'display:inline-block;position:relative;width:' + width + 'px;height:' + height + 'px;overflow:hidden;';
      
      if (data.type === 'IMAGE' || data.type === 'GIF') {
        const link = document.createElement('a');
        link.href = clickDestUrl;
        link.target = '_blank';
        link.rel = 'noopener nofollow';
        link.style.cssText = 'display:block;width:100%;height:100%;';
        
        const img = document.createElement('img');
        img.src = data.src;
        img.alt = 'Ad';
        img.style.cssText = 'max-width:100%;max-height:100%;width:auto;height:auto;display:block;margin:auto;';
        
        link.appendChild(img);
        container.appendChild(link);
      } else if (data.type === 'VIDEO') {
        const videoWrap = document.createElement('div');
        videoWrap.style.cssText = 'position:relative;width:100%;height:100%;';
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
        
        if (data.src) {
          const source = document.createElement('source');
          source.src = data.src;
          source.type = 'video/mp4';
          video.appendChild(source);
        }
        if (data.src2) {
          const source2 = document.createElement('source');
          source2.src = data.src2;
          source2.type = 'video/webm';
          video.appendChild(source2);
        }
        
        const overlay = document.createElement('a');
        overlay.href = clickDestUrl;
        overlay.target = '_blank';
        overlay.rel = 'noopener nofollow';
        overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;cursor:pointer;';
        
        videoWrap.appendChild(video);
        videoWrap.appendChild(overlay);
        container.appendChild(videoWrap);
      } else if (data.type === 'HTML' && data.html) {
        const htmlWrap = document.createElement('div');
        htmlWrap.style.cssText = 'width:100%;height:100%;overflow:hidden;';
        
        const cleanHtml = data.html
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
        
        htmlWrap.innerHTML = cleanHtml;
        
        if (data.clickUrl) {
          const overlay = document.createElement('a');
          overlay.href = clickDestUrl;
          overlay.target = '_blank';
          overlay.rel = 'noopener nofollow';
          overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1000;';
          container.style.position = 'relative';
          container.appendChild(htmlWrap);
          container.appendChild(overlay);
        } else {
          container.appendChild(htmlWrap);
        }
      }
    })
    .catch(function(error) {
      console.error('GEV: Failed to load creative', error);
    });
})();
`;

    return new Response(jsContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('EJS function error:', error);
    return new Response('// Error loading script', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/javascript' },
    });
  }
});