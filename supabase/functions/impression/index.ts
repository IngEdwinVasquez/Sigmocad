import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ImpressionPayload {
  mediaId: string;
  slotId: string;
  creativeId: string;
  referrer?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const payload: ImpressionPayload = await req.json();
    const { mediaId, slotId, creativeId, referrer } = payload;

    if (!mediaId || !slotId || !creativeId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                     req.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = req.headers.get('user-agent') || '';

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

    const { error } = await supabase.from('metrics').insert({
      media_id: mediaId,
      slot_id: slotId,
      creative_id: creativeId,
      type: 'IMPRESSION',
      user_agent: userAgent,
      ip: clientIp,
      referrer: referrer || '',
      country,
      city,
      region,
      language,
    });

    if (error) {
      console.error('Error inserting impression:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to record impression' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Impression function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});