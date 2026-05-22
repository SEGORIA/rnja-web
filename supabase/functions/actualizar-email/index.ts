// ══════════════════════════════════════════════════
//  RNJA NEXUS — Edge Function: actualizar-email
//  Permite que un super_admin o coord_nacional
//  cambie el email y/o contraseña de cualquier usuario.
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
    const { user_id, email, password } = await req.json()
    if (!user_id) throw new Error('Falta user_id')
    if (!email && !password) throw new Error('Debes indicar email o password a cambiar')
    if (email && !email.includes('@')) throw new Error('Email inválido')
    if (password && password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres')

    // Construir payload de actualización
    const updatePayload: { email?: string; password?: string } = {}
    if (email) updatePayload.email = email
    if (password) updatePayload.password = password

    const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      updatePayload
    )

    if (updateError) throw new Error(`Error actualizando credenciales: ${updateError.message}`)

    return new Response(
      JSON.stringify({
        success: true,
        email_updated: !!email,
        password_updated: !!password,
        email: updated.user.email,
      }),
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
