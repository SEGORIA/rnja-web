// ══════════════════════════════════════════════════
//  RNJA NEXUS — Edge Function: aprobar-solicitud
//  Invocada desde el dashboard de admin al aprobar
//  una solicitud de ingreso. Crea el usuario en
//  Supabase Auth y registra el perfil.
//
//  Deploy: supabase functions deploy aprobar-solicitud
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
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://rnja-web.vercel.app'

    // Cliente admin (service role — solo disponible server-side)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verificar que quien llama está autenticado y es admin
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

    // Leer cuerpo de la petición
    const { solicitud_id, notas = '' } = await req.json()
    if (!solicitud_id) throw new Error('Falta solicitud_id')

    // Obtener la solicitud
    const { data: solicitud, error: solError } = await supabaseAdmin
      .from('solicitudes')
      .select('*')
      .eq('id', solicitud_id)
      .single()

    if (solError || !solicitud) throw new Error('Solicitud no encontrada')
    if (solicitud.estado === 'aprobada') throw new Error('Esta solicitud ya fue aprobada')

    // Marcar como "revisando" mientras procesamos
    await supabaseAdmin
      .from('solicitudes')
      .update({ estado: 'revisando', revisado_por: user.id })
      .eq('id', solicitud_id)

    const redirectTo = `${siteUrl}/index.html`
    let userId: string | null = null
    let isReenvio = false

    // Intentar invitar (nuevo usuario)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      solicitud.email,
      { redirectTo, data: { solicitud_id, nombres: solicitud.nombres } }
    )

    if (inviteError) {
      const yaExiste = inviteError.message.toLowerCase().includes('already been registered')
                    || inviteError.message.toLowerCase().includes('already registered')

      if (!yaExiste) {
        // Error distinto — revertir y lanzar
        await supabaseAdmin.from('solicitudes').update({ estado: 'pendiente' }).eq('id', solicitud_id)
        throw new Error(`Error al invitar: ${inviteError.message}`)
      }

      // Usuario ya existe — enviar email de recuperación para que establezca contraseña
      isReenvio = true
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
        solicitud.email,
        { redirectTo }
      )

      if (resetError) {
        await supabaseAdmin.from('solicitudes').update({ estado: 'pendiente' }).eq('id', solicitud_id)
        throw new Error(`Error al reenviar acceso: ${resetError.message}`)
      }

      // Buscar el perfil existente para obtener el user_id
      const { data: perfilExistente } = await supabaseAdmin
        .from('perfiles')
        .select('id')
        .eq('cedula', solicitud.cedula)
        .single()
      userId = perfilExistente?.id ?? null

    } else {
      userId = inviteData.user.id

      // Crear perfil del nuevo usuario
      const { error: profileError } = await supabaseAdmin
        .from('perfiles')
        .insert({
          id: userId,
          nombres: solicitud.nombres,
          apellidos: solicitud.apellidos,
          cedula: solicitud.cedula,
          fecha_nacimiento: solicitud.fecha_nacimiento || null,
          telefono: solicitud.telefono || null,
          departamento: solicitud.departamento || null,
          municipio: solicitud.municipio || null,
          genero: solicitud.genero || null,
          grupo_etnico: solicitud.grupo_etnico || null,
          rol: 'voluntario',
          estado: 'activo',
        })

      if (profileError) {
        console.error('Error creando perfil:', profileError)
      }
    }

    // Marcar solicitud como aprobada
    await supabaseAdmin
      .from('solicitudes')
      .update({ estado: 'aprobada', notas_revision: notas, revisado_por: user.id })
      .eq('id', solicitud_id)

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email: solicitud.email,
        reenvio: isReenvio,
        message: isReenvio
          ? `Email de acceso reenviado a ${solicitud.email}`
          : `Invitación enviada a ${solicitud.email}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('aprobar-solicitud error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
