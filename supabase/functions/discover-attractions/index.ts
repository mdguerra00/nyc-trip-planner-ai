import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { withAuth, corsHeaders } from "../_shared/auth.ts";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";
import { DiscoverAttractionsRequestSchema } from "../_shared/schemas.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// Fallback: use Lovable AI to convert text to JSON
async function convertTextToJson(text: string, region: string): Promise<any[]> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    console.error('LOVABLE_API_KEY not available for fallback');
    return [];
  }

  console.log('🔄 Using Lovable AI fallback to convert text to JSON...');

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a JSON converter. Extract tourist attractions from the text and return ONLY a valid JSON array. No explanations.'
        },
        {
          role: 'user',
          content: `Extract attractions from this text about ${region} and return as a JSON array with objects containing: name, type, address, hours, description, estimatedDuration (number), neighborhood. Text:\n\n${text}`
        }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    console.error('Lovable AI fallback failed:', await response.text());
    return [];
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  try {
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleanContent.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Fallback JSON parse also failed');
    return [];
  }
}

Deno.serve(withAuth(async ({ req, supabaseUrl, supabaseKey, user }) => {
  try {
    const parsedBody = DiscoverAttractionsRequestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload", details: parsedBody.error.format() }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const { region, date, userSuggestion, requestMore } = parsedBody.data;
    const userId = user.id;

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityApiKey) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: jsonHeaders }
      );
    }

    console.log(`🔍 Searching attractions for ${region} on ${date}`, { userSuggestion, requestMore, userId });

    // Build travel context
    let contextualPrefix = "";
    const travelContext = await buildTravelContext(
      userId,
      supabaseUrl,
      supabaseKey,
      date,
      region
    );
    
    const specificContext = `
Searching attractions for ${region} on ${date}.
${userSuggestion ? `User suggestion: "${userSuggestion}"` : ""}
${requestMore ? "User wants lesser-known options." : ""}
`;
    
    contextualPrefix = buildContextualPrompt(travelContext, specificContext);

    // Simplified prompt structure
    const baseFields = `Each object must have:
- name: official name
- type: museum/restaurant/park/event/attraction
- address: full address
- hours: operating hours
- description: 2-3 sentence description
- estimatedDuration: minutes (number)
- neighborhood: area name
- rating: rating if known (e.g., "4.5/5")
- whyRecommended: why worth visiting`;

    let prompt: string;
    let expectedCount: string;
    
    // Context is added at end to not confuse the model's JSON output
    const contextSuffix = contextualPrefix ? `\n\nAdditional context:\n${contextualPrefix}` : "";

    if (userSuggestion) {
      expectedCount = "1-3";
      prompt = `Find information about "${userSuggestion}" in ${region}, New York for ${date}.

${baseFields}

Return a JSON array with ${expectedCount} results.${contextSuffix}`;
    } else if (requestMore) {
      expectedCount = "6-10";
      prompt = `List lesser-known attractions, hidden gems, restaurants and activities in ${region}, New York for ${date}.

${baseFields}

Return a JSON array with ${expectedCount} different suggestions.${contextSuffix}`;
    } else {
      expectedCount = "8-12";
      prompt = `List the best attractions, restaurants and activities in ${region}, New York for ${date}.

If "${region}" is a specific point (like "Columbus Circle", "Times Square"), prioritize places within 10-15 min walking distance.

${baseFields}

Return a JSON array with ${expectedCount} varied suggestions.${contextSuffix}`;
    }

    console.log('📤 Sending request to Perplexity...');

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are a JSON API for NYC tourism. Always respond with ONLY a valid JSON array. No explanations, no markdown code blocks, no text before or after - just the raw JSON array starting with [ and ending with ].'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch attractions from Perplexity' }),
        { status: response.status, headers: jsonHeaders }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error('No content in Perplexity response');
      return new Response(
        JSON.stringify({ error: 'No content received from AI' }),
        { status: 500, headers: jsonHeaders }
      );
    }

    // Extract JSON from response
    let attractions: any[] = [];
    try {
      console.log('Raw content from Perplexity:', content.substring(0, 300));
      
      let cleanContent = content.trim();
      
      // Remove markdown code blocks
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      cleanContent = cleanContent.trim();
      
      // Try to find JSON array in the response
      const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      
      console.log('Cleaned content preview:', cleanContent.substring(0, 200));
      attractions = JSON.parse(cleanContent);

      if (!Array.isArray(attractions)) {
        throw new Error('Response is not an array');
      }

    } catch (parseError) {
      console.error('Failed to parse Perplexity response:', parseError);
      console.log('Attempting fallback with Lovable AI...');
      
      // Use fallback to convert text to JSON
      attractions = await convertTextToJson(content, region);
      
      if (attractions.length === 0) {
        return new Response(
          JSON.stringify({
            error: 'Failed to parse AI response',
            attractions: []
          }),
          { status: 200, headers: jsonHeaders }
        );
      }
    }

    // Validate and enrich data
    attractions = attractions.map((attr: any, index: number) => ({
      id: `attr-${Date.now()}-${index}`,
      name: attr.name || 'Unknown',
      type: attr.type || 'atração',
      address: attr.address || 'Endereço não especificado',
      hours: attr.hours || 'Verificar horários',
      description: attr.description || 'Sem descrição',
      estimatedDuration: typeof attr.estimatedDuration === 'number' ? attr.estimatedDuration : 60,
      neighborhood: attr.neighborhood || region,
      imageUrl: attr.imageUrl || null,
      infoUrl: attr.infoUrl || null,
      rating: attr.rating || null,
      reviewCount: attr.reviewCount || null,
      whyRecommended: attr.whyRecommended || null,
      verificationUrl: attr.verificationUrl || null,
    }));

    console.log(`✅ Found ${attractions.length} attractions`);

    return new Response(
      JSON.stringify({ attractions }),
      { headers: jsonHeaders }
    );

  } catch (error) {
    console.error('Error in discover-attractions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: jsonHeaders }
    );
  }
}));
