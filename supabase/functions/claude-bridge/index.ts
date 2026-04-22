// ============================================================
// claude-bridge — Edge Function skeleton
// מקבל: { user_id, role, message, context }
// מחזיר: { status, message }
//
// TODO: לחבר לאנתרופיק API ולהחזיר תשובה אמיתית
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { user_id, role, message, context } = body

    if (!user_id || !message) {
      return new Response(
        JSON.stringify({ error: 'user_id and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[claude-bridge] user=' + user_id + ' role=' + role + ' msg="' + message.slice(0, 50) + '..."')

    // ─── TODO: Anthropic API call here ───────────────────
    // const response = await fetch('https://api.anthropic.com/v1/messages', {
    //   method: 'POST',
    //   headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, ... },
    //   body: JSON.stringify({ model: 'claude-opus-4-6', ... })
    // })
    // ─────────────────────────────────────────────────────

    return new Response(
      JSON.stringify({
        status: 'not_implemented',
        message: 'Claude bridge coming soon',
        received: { user_id, role, message_length: message.length },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
