// supabase/functions/claude-bridge/index.ts
// Deploy: supabase functions deploy claude-bridge

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { user_id, role, message, context } = await req.json()
    console.log('claude-bridge request:', { user_id, role, preview: message?.slice(0, 50), context })

    return new Response(
      JSON.stringify({ status: 'not_implemented', message: 'Claude bridge coming soon' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
