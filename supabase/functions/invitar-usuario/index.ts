// ══════════════════════════════════════════════════
//  RNJA NEXUS — Edge Function: invitar-usuario
//  Envía invitación por email a un perfil importado
//  y vincula su auth.user_id con perfiles.user_id
//
//  Deploy: supabase functions deploy invitar-usuario
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

    // Solo super_admin y coord_nacional pueden invitar
    const { data: callerProfile } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .single()

    if (!callerProfile || !['super_admin', 'coord_nacional'].includes(callerProfile.rol)) {
      throw new Error('Sin permisos — se requiere rol super_admin o coord_nacional')
    }

    const { perfil_id, email } = await req.json()
    if (!perfil_id) throw new Error('Falta perfil_id')
    if (!email || !email.includes('@')) throw new Error('Email inválido')

    // Verificar que el perfil existe
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfiles')
      .select('id, user_id, nombres, apellidos')
      .eq('id', perfil_id)
      .single()

    if (perfilError || !perfil) throw new Error('Perfil no encontrado')
    if (perfil.user_id) throw new Error('Este usuario ya tiene una cuenta activa vinculada')

    // Enviar invitación — crea el auth.user
    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: 'https://rnja-web.vercel.app',
        data: { perfil_id }
      }
    )

    if (inviteError) {
      // Si ya existe en auth, obtener su ID y vincular
      if (inviteError.message?.toLowerCase().includes('already been registered')) {
        throw new Error('Ya existe una cuenta con ese email — usa "Cambiar email" en su lugar')
      }
      throw new Error(`Error al invitar: ${inviteError.message}`)
    }

    // Vincular el nuevo auth user con el perfil
    const newAuthId = invited.user.id
    const { error: linkError } = await supabaseAdmin
      .from('perfiles')
      .update({ user_id: newAuthId, email: email })
      .eq('id', perfil_id)

    if (linkError) throw new Error(`Invitación enviada pero error al vincular: ${linkError.message}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitación enviada a ${email}`,
        user_id: newAuthId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('invitar-usuario error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
