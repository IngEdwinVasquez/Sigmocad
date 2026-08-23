import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const publicKey = url.searchParams.get('publicKey');
    const slotSlug = url.searchParams.get('slot');
    const format = url.searchParams.get('format') || 'json';

    console.log('Embed request:', { publicKey, slotSlug, format });

    if (!publicKey || !slotSlug) {
      return new Response(
        JSON.stringify({ error: 'Missing publicKey or slot parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: media, error: mediaError } = await supabase
      .from('media')
      .select('id, status')
      .eq('public_key', publicKey)
      .maybeSingle();

    console.log('Media query:', { media, mediaError });

    if (mediaError || !media) {
      if (format === 'html') {
        return new Response('<div>No media found</div>', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
      }
      return new Response(JSON.stringify({ error: 'Media not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: slot, error: slotError } = await supabase
      .from('slots')
      .select('id, width, height, status')
      .eq('media_id', media.id)
      .eq('slug', slotSlug)
      .maybeSingle();

    console.log('Slot query:', { slot, slotError });

    if (slotError || !slot) {
      if (format === 'html') {
        return new Response('<div>Slot not found</div>', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
      }
      return new Response(JSON.stringify({ error: 'Slot not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: assignments, error: assignError } = await supabase
      .from('assignments')
      .select('id, creative_id, is_active, weight, start_at, end_at, creatives(*)')
      .eq('slot_id', slot.id)
      .eq('is_active', true);

    console.log('Assignments query:', { assignments, assignError });

    if (assignError || !assignments || assignments.length === 0) {
      if (format === 'html') {
        return new Response('<div>No active campaigns</div>', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
      }
      return new Response(JSON.stringify({ error: 'No assignments' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Filter assignments based on scheduling
    const now = new Date();
    const validAssignments = assignments.filter(assignment => {
      // Check if assignment has start_at and if we're before it
      if (assignment.start_at && now < new Date(assignment.start_at)) {
        return false;
      }

      // Check if assignment has end_at and if we're after it
      if (assignment.end_at && now > new Date(assignment.end_at)) {
        // Auto-deactivate expired assignments
        supabase.from('assignments')
          .update({ is_active: false })
          .eq('id', assignment.id)
          .then(() => console.log(`Auto-deactivated expired assignment ${assignment.id}`));
        return false;
      }

      return true;
    });

    console.log('Valid assignments after scheduling filter:', validAssignments);

    if (validAssignments.length === 0) {
      if (format === 'html') {
        return new Response('<div>No active campaigns</div>', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
      }
      return new Response(JSON.stringify({ error: 'No assignments in valid schedule' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const selectedAssignment = validAssignments[0];
    const creative = selectedAssignment.creatives;

    console.log('Selected creative:', creative);

    // Record impression
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                     req.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = req.headers.get('user-agent') || '';
    const referrer = url.searchParams.get('ref') || req.headers.get('referer') || '';

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
      media_id: media.id,
      slot_id: slot.id,
      creative_id: creative.id,
      type: 'IMPRESSION',
      user_agent: userAgent,
      ip: clientIp,
      referrer: referrer,
      country,
      city,
      region,
      language,
    });

    if (format === 'html') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const clickUrl = `${supabaseUrl}/functions/v1/click?mediaId=${media.id}&slotId=${slot.id}&creativeId=${creative.id}`;

      let bodyContent = '';

      if (creative.type === 'HTML' && creative.html) {
        // For HTML creatives, wrap the HTML in a clickable div
        bodyContent = `
  <div onclick="window.open('${clickUrl}', '_blank')" style="cursor: pointer; width: 100%; height: 100%;">
    ${creative.html}
  </div>`;
      } else {
        // For image creatives, use img tag
        bodyContent = `
  <a href="${clickUrl}" target="_blank" rel="noopener noreferrer">
    <img src="${creative.src}" alt="Ad" />
  </a>`;
      }

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-H232QZN77X"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-H232QZN77X');
  </script>

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { display: flex; align-items: center; justify-content: center; }
    a { display: block; width: 100%; height: 100%; }
    img {
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      cursor: pointer;
    }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;

      return new Response(htmlContent, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    return new Response(JSON.stringify({
      mediaId: media.id,
      slotId: slot.id,
      creativeId: creative.id,
      type: creative.type,
      src: creative.src,
      src2: creative.src2,
      html: creative.html,
      clickUrl: creative.click_url
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Embed function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});