// ══════════════════════════════════════════════════
//  RNJA NEXUS — Edge Function: notificar-certificado
//  Envía un correo motivador al voluntario cuando
//  la coordinación le emite un certificado.
//
//  Requiere: RESEND_API_KEY en Supabase secrets
//  Deploy: supabase functions deploy notificar-certificado
// ══════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIPO_LABELS: Record<string, string> = {
  participacion: 'Participación en actividad',
  pertenencia:   'Pertenencia a la Red',
  trayectoria:   'Trayectoria y servicio',
  reconocimiento:'Reconocimiento y mérito',
  coordinacion:  'Rol de coordinación',
  formacion:     'Formación y capacitación',
}

const TIPO_EMOJI: Record<string, string> = {
  participacion: '🌿',
  pertenencia:   '🤝',
  trayectoria:   '⭐',
  reconocimiento:'🏆',
  coordinacion:  '🎯',
  formacion:     '📚',
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

    const { cert_id } = await req.json()
    if (!cert_id) throw new Error('Falta cert_id')

    // Obtener certificado + perfil del destinatario
    const { data: cert, error } = await supabaseAdmin
      .from('certificados')
      .select('*, perfil:perfiles!perfil_id(nombres, apellidos, email, nodo, departamento)')
      .eq('id', cert_id)
      .single()

    if (error || !cert) throw new Error('Certificado no encontrado')

    const email = cert.perfil?.email
    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Sin email registrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const nombre = [cert.perfil?.nombres, cert.perfil?.apellidos]
      .filter(Boolean).join(' ') || 'Joven de Ambiente'

    const nodo = cert.perfil?.nodo || cert.perfil?.departamento || 'Colombia'

    const fechaStr = cert.fecha_actividad
      ? new Date(cert.fecha_actividad + 'T12:00:00').toLocaleDateString('es-CO', {
          day: '2-digit', month: 'long', year: 'numeric'
        })
      : new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

    const tipoLabel = TIPO_LABELS[cert.tipo] || cert.tipo
    const tipoEmoji = TIPO_EMOJI[cert.tipo] || '📜'

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_KEY) throw new Error('RESEND_API_KEY no configurado en secrets')

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f0f7f0;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.1);">

    <!-- Encabezado -->
    <div style="background:linear-gradient(135deg,#1a4a28 0%,#255C36 50%,#2d7a4f 100%);padding:40px 32px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">🌿</div>
      <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;line-height:1.3;">
        Red Nacional Jóvenes de Ambiente
      </h1>
      <p style="color:rgba(255,255,255,.65);margin:8px 0 0;font-size:14px;">RNJA NEXUS · Colombia</p>
    </div>

    <!-- Cuerpo -->
    <div style="padding:36px 32px;">
      <p style="color:#255C36;font-size:22px;font-weight:800;margin:0 0 8px;">
        ${tipoEmoji} ¡Felicitaciones, ${nombre}!
      </p>
      <p style="color:#555;font-size:15px;line-height:1.75;margin:0 0 28px;">
        Nos llena de orgullo comunicarte que la coordinación de la RNJA te ha emitido un nuevo
        certificado. Cada paso que das en este camino deja una huella verde en Colombia.
        <strong>¡Gracias por ser parte de esta familia ambiental!</strong> 🇨🇴💚
      </p>

      <!-- Tarjeta del certificado -->
      <div style="background:linear-gradient(135deg,#f0f7f0,#e8f5e9);border-left:5px solid #2d7a4f;border-radius:12px;padding:24px;margin-bottom:28px;">
        <p style="color:#255C36;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 10px;">
          Tu nuevo certificado
        </p>
        <p style="color:#062A14;font-size:19px;font-weight:800;margin:0 0 14px;line-height:1.3;">
          ${cert.titulo || 'Certificado RNJA'}
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#555;width:40%;">📋 Tipo</td>
            <td style="padding:5px 0;font-size:13px;color:#062A14;font-weight:600;">${tipoLabel}</td>
          </tr>
          ${cert.horas ? `<tr>
            <td style="padding:5px 0;font-size:13px;color:#555;">⏱️ Horas</td>
            <td style="padding:5px 0;font-size:13px;color:#062A14;font-weight:600;">${cert.horas} horas</td>
          </tr>` : ''}
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#555;">📅 Fecha</td>
            <td style="padding:5px 0;font-size:13px;color:#062A14;font-weight:600;">${fechaStr}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#555;">📍 Nodo</td>
            <td style="padding:5px 0;font-size:13px;color:#062A14;font-weight:600;">${nodo}</td>
          </tr>
        </table>
        <div style="margin-top:16px;padding:10px 14px;background:#ffffff;border-radius:20px;display:inline-block;">
          <span style="font-size:12px;color:#2d7a4f;font-weight:700;font-family:monospace;letter-spacing:1px;">
            🔑 ${cert.codigo}
          </span>
        </div>
      </div>

      <!-- Mensaje motivador -->
      <p style="color:#444;font-size:14px;line-height:1.75;margin:0 0 28px;">
        Este certificado es el reflejo de tu dedicación, tu tiempo y tu amor por el planeta.
        Compártelo con orgullo: cada hora de voluntariado ambiental construye el futuro que
        Colombia necesita. Puedes descargarlo en cualquier momento desde la plataforma
        <strong>RNJA NEXUS</strong> en la sección <em>"Mis Certificados"</em>.
      </p>

      <!-- Botón CTA -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="https://rnja-web.vercel.app"
           style="display:inline-block;background:linear-gradient(135deg,#255C36,#2d7a4f);color:#ffffff;
                  text-decoration:none;padding:16px 40px;border-radius:50px;font-weight:800;font-size:15px;
                  letter-spacing:0.3px;box-shadow:0 4px 16px rgba(37,92,54,.35);">
          Ver mis certificados →
        </a>
      </div>
    </div>

    <!-- Pie -->
    <div style="background:#f9faf9;border-top:1px solid #e8f0e8;padding:24px 32px;text-align:center;">
      <p style="color:#888;font-size:12px;margin:0 0 4px;line-height:1.6;">
        <strong style="color:#2d7a4f;">Red Nacional Jóvenes de Ambiente</strong><br>
        Ministerio de Ambiente y Desarrollo Sostenible · Colombia<br>
        Código de verificación: <span style="font-family:monospace;color:#255C36;">${cert.codigo}</span>
      </p>
    </div>

  </div>
</body>
</html>`

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RNJA NEXUS <certificados@rnja.org.co>',
        to:   [email],
        subject: `${tipoEmoji} Tu certificado RNJA está listo — ${cert.titulo || 'RNJA'}`,
        html,
      }),
    })

    if (!emailResp.ok) {
      const errText = await emailResp.text()
      throw new Error(`Resend error (${emailResp.status}): ${errText}`)
    }

    const emailData = await emailResp.json()
    console.log('Email enviado:', emailData.id, '→', email)

    return new Response(
      JSON.stringify({ success: true, email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('notificar-certificado error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
