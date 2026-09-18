// Movie Tracker - Claude Chat Proxy
//
// This Worker sits between your movie-tracker.html page and Anthropic's API.
// Your Anthropic API key lives ONLY here, as an encrypted secret, never in
// the page's source code. The page calls this Worker's URL instead of
// calling api.anthropic.com directly.
//
// SETUP (one-time):
//   1. Go to https://dash.cloudflare.com -> Workers & Pages -> Create -> Create Worker
//   2. Name it something like "movie-chat-proxy", click Deploy
//   3. Click "Edit code", delete the placeholder, paste this entire file, click Deploy
//   4. Go to Settings -> Variables and Secrets -> Add
//      Name: ANTHROPIC_API_KEY   Type: Secret   Value: <your real key>
//      (Using "Secret" type, not "Text", is what keeps it encrypted/hidden)
//   5. Go to Settings -> Variables and Secrets -> Add another
//      Name: ALLOWED_ORIGIN   Type: Text
//      Value: the exact URL your tracker is hosted at, e.g.
//             https://yourusername.github.io
//      (This stops other websites from using your Worker/key. Use the origin
//       only - no path, no trailing slash.)
//   6. Copy your Worker's URL (shown at the top of its page, looks like
//      https://movie-chat-proxy.YOURNAME.workers.dev) and paste it into
//      movie-tracker.html where marked (CHAT_PROXY_URL).

export default {
  async fetch(request, env) {
    // CORS: only allow requests from your tracker's own origin
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Browsers send a preflight OPTIONS request before the real POST - answer it
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Only POST is supported' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (allowedOrigin && origin !== allowedOrigin) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: ANTHROPIC_API_KEY secret is not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Expecting: { messages: [{role, content}, ...], system: "...", useTools: true }
    // The page builds the actual prompt; this Worker just forwards it with
    // the real API key attached, and caps a few fields server-side as a
    // safety net against a modified/compromised page sending something huge.
    const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
    const system = typeof body.system === 'string' ? body.system.slice(0, 20000) : undefined;

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tool schema is defined HERE, server-side, not trusted from the page -
    // the page can only turn it on/off (useTools: true), never redefine what
    // it does. This is what lets Claude suggest a specific movie as a
    // clickable card in the chat, instead of only describing it in text.
    const MOVIE_SUGGESTION_TOOL = {
      name: 'suggest_movie_card',
      description: 'Suggest a specific movie or show as an actionable card the user can tap to add to their list. Use this whenever you recommend a specific title, so the user can act on it with one tap instead of typing it in themselves. You can call this multiple times in one reply to suggest several titles.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The exact movie or show title' },
          year: { type: 'string', description: 'Release year, if known' },
        },
        required: ['title'],
      },
    };

    const requestBody = {
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: system,
      messages: messages,
    };

    if (body.useTools) {
      requestBody.tools = [MOVIE_SUGGESTION_TOOL];
    }

    try {
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await anthropicResponse.json();

      return new Response(JSON.stringify(data), {
        status: anthropicResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to reach Claude API', details: String(error) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
