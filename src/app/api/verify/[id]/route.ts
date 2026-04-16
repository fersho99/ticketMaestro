import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import type { ValidationResultType } from '@/types'

const ANTI_FRAUDE_SECONDS = 30

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ticketId } = await params
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      await registrarValidacion(null, null, 'invalido', 'No autorizado', ip)
      return NextResponse.json({ error: 'Debes iniciar sesión para escanear boletos' }, { status: 401 })
    }

    const { data: usuarioDb } = await supabase
      .from('usuario')
      .select('id, rol')
      .eq('id', user.id)
      .single()

    if (!usuarioDb) {
      await registrarValidacion(null, user.id, 'invalido', 'Usuario no encontrado', ip)
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const esAdmin = usuarioDb.rol === 'admin'
    const esOrganizador = usuarioDb.rol === 'organizador'

    if (!esAdmin && !esOrganizador) {
      await registrarValidacion(null, user.id, 'invalido', 'No es organizador ni admin', ip)
      return NextResponse.json({ error: 'Acceso Denegado. Solo personal autorizado.' }, { status: 403 })
    }

    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: boleto, error } = await supabaseAdmin
      .from('boleto')
      .select(`
        id,
        estado,
        tipo,
        codigo_qr,
        evento_id,
        evento (
          id,
          titulo,
          fecha,
          ubicacion,
          organizador_id
        ),
        orden (
          usuario (
            id,
            nombre,
            email
          )
        )
      `)
      .eq('id', ticketId)
      .single()

    if (error || !boleto) {
      await registrarValidacion(ticketId, user.id, 'no_existe', 'Boleto no encontrado', ip)
      return NextResponse.json({ error: 'Boleto Inexistente o Falso.' }, { status: 404 })
    }

    if (esOrganizador && !esAdmin) {
      const { data: esStaff } = await supabaseAdmin
        .from('evento_staff')
        .select('id, puede_validar')
        .eq('evento_id', boleto.evento_id)
        .eq('usuario_id', user.id)
        .single()

      if (!esStaff && (boleto.evento as any)?.organizador_id !== user.id) {
        await registrarValidacion(ticketId, user.id, 'evento_incorrecto', 'No tiene acceso a este evento', ip)
        return NextResponse.json({ error: 'No tienes acceso a este evento' }, { status: 403 })
      }

      if (esStaff && !esStaff.puede_validar) {
        await registrarValidacion(ticketId, user.id, 'invalido', 'Staff sin permisos de validación', ip)
        return NextResponse.json({ error: 'No tienes permisos para validar boletos' }, { status: 403 })
      }
    }

    return NextResponse.json({ data: boleto })
  } catch (e: any) {
    console.error('Error en GET verify:', e)
    return NextResponse.json({ error: e.message || 'Error del servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ticketId } = await params
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: usuarioDb } = await supabase
      .from('usuario')
      .select('id, rol')
      .eq('id', user.id)
      .single()

    if (!usuarioDb) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const esAdmin = usuarioDb.rol === 'admin'
    const esOrganizador = usuarioDb.rol === 'organizador'

    if (!esAdmin && !esOrganizador) {
      return NextResponse.json({ error: 'Acceso Denegado.' }, { status: 403 })
    }

    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: checkBoleto } = await supabaseAdmin
      .from('boleto')
      .select(`
        id, 
        estado, 
        evento_id, 
        evento (
          id,
          organizador_id
        )
      `)
      .eq('id', ticketId)
      .single()

    if (!checkBoleto) {
      await registrarValidacion(ticketId, user.id, 'no_existe', 'Boleto no encontrado', ip)
      return NextResponse.json({ error: 'Boleto Inexistente' }, { status: 404 })
    }

    if (checkBoleto.estado === 'usado') {
      await registrarValidacion(ticketId, user.id, 'ya_usado', 'Boleto ya usado', ip)
      return NextResponse.json({ error: 'Boleto YA FUE USADO.' }, { status: 400 })
    }

    if (checkBoleto.estado !== 'vendido') {
      await registrarValidacion(ticketId, user.id, 'invalido', `Estado: ${checkBoleto.estado}`, ip)
      return NextResponse.json({ error: 'Boleto no válido - estado: ' + checkBoleto.estado }, { status: 400 })
    }

    if (esOrganizador && !esAdmin) {
      const { data: esStaff } = await supabaseAdmin
        .from('evento_staff')
        .select('id, puede_validar')
        .eq('evento_id', checkBoleto.evento_id)
        .eq('usuario_id', user.id)
        .single()

      if (!esStaff && (checkBoleto.evento as any)?.organizador_id !== user.id) {
        return NextResponse.json({ error: 'No tienes acceso a este evento' }, { status: 403 })
      }

      if (esStaff && !esStaff.puede_validar) {
        return NextResponse.json({ error: 'No tienes permisos para validar boletos' }, { status: 403 })
      }
    }

    const { data: ultimaValidacion } = await supabaseAdmin
      .from('validacion')
      .select('fecha_hora')
      .eq('boleto_id', ticketId)
      .eq('resultado', 'valido')
      .order('fecha_hora', { ascending: false })
      .limit(1)
      .single()

    if (ultimaValidacion) {
      const segundosDesdeUltimoEscaneo = (Date.now() - new Date(ultimaValidacion.fecha_hora).getTime()) / 1000
      if (segundosDesdeUltimoEscaneo < ANTI_FRAUDE_SECONDS) {
        await registrarValidacion(ticketId, user.id, 'invalido', `Anti-fraude: ${Math.round(ANTI_FRAUDE_SECONDS - segundosDesdeUltimoEscaneo)}s restantes`, ip)
        return NextResponse.json({
          error: `Espera ${Math.ceil(ANTI_FRAUDE_SECONDS - segundosDesdeUltimoEscaneo)} segundos antes de validar este boleto nuevamente`,
          anti_fraude: true
        }, { status: 429 })
      }
    }

    const { data: updatedBoleto, error } = await supabaseAdmin
      .from('boleto')
      .update({ estado: 'usado' })
      .eq('id', ticketId)
      .select('id, estado, tipo')
      .single()

    if (error) throw error

    await registrarValidacion(ticketId, user.id, 'valido', null, ip)

    return NextResponse.json({
      success: true,
      estado: updatedBoleto.estado,
      tipo: updatedBoleto.tipo,
      message: 'Boleto marcado como usado'
    })
  } catch (e: any) {
    console.error('Error en PUT verify:', e)
    return NextResponse.json({ error: e.message || 'Error del servidor' }, { status: 500 })
  }
}

async function registrarValidacion(
  boletoId: string | null,
  escaneadoPor: string | null,
  resultado: ValidationResultType,
  motivo: string | null,
  ip: string
) {
  if (!boletoId || !escaneadoPor) return

  try {
    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabaseAdmin
      .from('validacion')
      .insert({
        boleto_id: boletoId,
        escaneado_por: escaneadoPor,
        resultado,
        motivo,
        ip_dispositivo: ip
      })
  } catch (error) {
    console.error('Error al registrar validación:', error)
  }
}
