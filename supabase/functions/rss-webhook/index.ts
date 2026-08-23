import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RSSArticle {
  title: string;
  description?: string;
  link: string;
  source: string;
  pubDate?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const article: RSSArticle = await req.json();

    if (!article.title || !article.link || !article.source) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, link, source" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get all active keywords from all companies
    const { data: keywords, error: keywordsError } = await supabase
      .from("monitoring_keywords")
      .select("id, company_id, keyword")
      .eq("is_active", true);

    if (keywordsError) {
      console.error("Error fetching keywords:", keywordsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch keywords" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!keywords || keywords.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active keywords configured" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prepare content for keyword matching
    const contentToSearch = `${article.title.toLowerCase()} ${(article.description || "").toLowerCase()}`;

    // Group keywords by company and find matches
    const companiesWithMatches = new Map<string, string[]>();

    for (const kw of keywords) {
      const keywordLower = kw.keyword.toLowerCase();
      if (contentToSearch.includes(keywordLower)) {
        if (!companiesWithMatches.has(kw.company_id)) {
          companiesWithMatches.set(kw.company_id, []);
        }
        companiesWithMatches.get(kw.company_id)!.push(kw.keyword);
      }
    }

    if (companiesWithMatches.size === 0) {
      return new Response(
        JSON.stringify({ message: "No keyword matches found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert articles for each company with matching keywords
    const insertPromises = [];
    const results = [];

    for (const [companyId, matchedKeywords] of companiesWithMatches.entries()) {
      const insertPromise = supabase
        .from("monitored_articles")
        .insert({
          company_id: companyId,
          title: article.title,
          description: article.description || null,
          url: article.link,
          source: article.source,
          published_at: article.pubDate || new Date().toISOString(),
          matched_keywords: matchedKeywords,
          read_status: false,
        })
        .select()
        .maybeSingle();

      insertPromises.push(
        insertPromise.then((result) => {
          if (!result.error) {
            results.push({
              company_id: companyId,
              matched_keywords: matchedKeywords,
              status: "saved",
            });
          } else if (result.error.code === "23505") {
            // Duplicate URL - article already exists
            results.push({
              company_id: companyId,
              matched_keywords: matchedKeywords,
              status: "duplicate",
            });
          } else {
            console.error(`Error inserting article for company ${companyId}:`, result.error);
            results.push({
              company_id: companyId,
              matched_keywords: matchedKeywords,
              status: "error",
              error: result.error.message,
            });
          }
        })
      );
    }

    await Promise.all(insertPromises);

    return new Response(
      JSON.stringify({
        message: "Article processed",
        article_title: article.title,
        article_url: article.link,
        companies_matched: companiesWithMatches.size,
        results: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
