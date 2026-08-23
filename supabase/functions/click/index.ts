import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

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
    const mediaId = url.searchParams.get('mediaId');
    const slotId = url.searchParams.get('slotId');
    const creativeId = url.searchParams.get('creativeId');

    if (!mediaId || !slotId || !creativeId) {
      return new Response('Missing parameters', { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                     req.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = req.headers.get('user-agent') || '';
    const referrer = req.headers.get('referer') || '';

    const acceptLanguage = req.headers.get('accept-language') || '';
    const language = acceptLanguage.split(',')[0].split('-')[0] || null;

    let country = null;
    let city = null;
    let region = null;

    if (clientIp !== 'unknown') {
      try {
        const geoResponse = await fetch(`http://ip-api.com/json/${clientIp}?fields=country,city,regionName`);
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          country = geoData.country || null;
          city = geoData.city || null;
          region = geoData.regionName || null;
        }
      } catch (geoError) {
        console.error('Geolocation error:', geoError);
      }
    }

    await supabase.from('metrics').insert({
      media_id: mediaId,
      slot_id: slotId,
      creative_id: creativeId,
      type: 'CLICK',
      user_agent: userAgent,
      ip: clientIp,
      referrer: referrer,
      country,
      city,
      region,
      language,
    });

    const { data: creative } = await supabase
      .from('creatives')
      .select('click_url')
      .eq('id', creativeId)
      .maybeSingle();

    const clickUrl = creative?.click_url || 'about:blank';

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': clickUrl,
      },
    });
  } catch (error) {
    console.error('Click function error:', error);
    return new Response('Error processing click', {
      status: 500,
      headers: corsHeaders,
    });
  }
});