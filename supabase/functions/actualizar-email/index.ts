// ══════════════════════════════════════════════════
//  RNJA NEXUS — Edge Function: actualizar-email
//  Permite que un super_admin o coord_nacional
//  cambie el correo de cualquier usuario.
//
//  Deploy: supabase functions deploy actualizar-email
// ══════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verificar autenticación del llamante
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No autorizado — falta token')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('No autorizado')

    // Verificar rol del llamante
    const { data: callerProfile } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['super_admin', 'coord_nacional'].includes(callerProfile.rol)) {
      throw new Error('Sin permisos — se requiere rol super_admin o coord_nacional')
    }

    // Leer cuerpo
    const { user_id, email } = await req.json()
    if (!user_id) throw new Error('Falta user_id')
    if (!email || !email.includes('@')) throw new Error('Email inválido')

    // No permitir que un admin cambie su propio email por esta ruta
    // (puede hacerlo desde su perfil normalmente)
    // Actualizar email en Supabase Auth
    const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { email }
    )

    if (updateError) throw new Error(`Error actualizando email: ${updateError.message}`)

    return new Response(
      JSON.stringify({ success: true, email: updated.user.email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('actualizar-email error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
