import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { validateQRPayload } from '@/lib/utils/generateSecureQR'
import type { ValidationResultType } from '@/types'

const ANTI_FRAUDE_SECONDS = 30

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { qr_content } = body

    if (!qr_content) {
      return NextResponse.json({ error: 'QR content requerido' }, { status: 400 })
    }

    const supabase = await createClient()
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: usuario } = await supabase
      .from('usuario')
      .select('id, rol')
      .eq('id', user.id)
      .single()

    if (!usuario || (usuario.rol !== 'organizador' && usuario.rol !== 'admin')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const payload = validateQRPayload(qr_content)

    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (!payload) {
      await registrarValidacion(supabaseAdmin, null, user.id, 'invalido', 'QR malformado o firma inválida', ip)
      return NextResponse.json({
        valid: false,
        message: 'QR inválido o malformado'
      }, { status: 400 })
    }

    const { data: boleto, error: boletoError } = await supabaseAdmin
      .from('boleto')
      .select(`
        id,
        estado,
        tipo,
        evento_id,
        orden (
          usuario (
            id,
            nombre,
            email
          )
        )
      `)
      .eq('id', payload.ticketId)
      .single()

    if (boletoError || !boleto) {
      await registrarValidacion(supabaseAdmin, payload.ticketId, user.id, 'no_existe', 'Boleto no encontrado', ip)
      return NextResponse.json({
        valid: false,
        message: 'Boleto no encontrado'
      }, { status: 404 })
    }

    if (boleto.estado === 'usado') {
      await registrarValidacion(supabaseAdmin, payload.ticketId, user.id, 'ya_usado', 'Boleto ya fue usado', ip)
      return NextResponse.json({
        valid: false,
        message: 'Este boleto ya fue usado'
      }, { status: 400 })
    }

    if (boleto.estado !== 'vendido') {
      await registrarValidacion(supabaseAdmin, payload.ticketId, user.id, 'invalido', `Estado: ${boleto.estado}`, ip)
      return NextResponse.json({
        valid: false,
        message: 'Boleto no válido - estado: ' + boleto.estado
      }, { status: 400 })
    }

    if (usuario.rol === 'organizador') {
      const { data: evento } = await supabase
        .from('evento')
        .select('id')
        .eq('id', boleto.evento_id)
        .eq('organizador_id', user.id)
        .single()

      if (!evento) {
        await registrarValidacion(supabaseAdmin, payload.ticketId, user.id, 'evento_incorrecto', 'No tienes acceso a este evento', ip)
        return NextResponse.json({
          valid: false,
          message: 'Este boleto no pertenece a uno de tus eventos'
        }, { status: 403 })
      }
    }

    if (payload.eventId !== boleto.evento_id) {
      await registrarValidacion(supabaseAdmin, payload.ticketId, user.id, 'evento_incorrecto', 'QR no corresponde al evento', ip)
      return NextResponse.json({
        valid: false,
        message: 'Este QR no corresponde a este evento'
      }, { status: 400 })
    }

    await registrarValidacion(supabaseAdmin, payload.ticketId, user.id, 'valido', null, ip)

    return NextResponse.json({
      valid: true,
      ticket: {
        id: boleto.id,
        tipo: boleto.tipo,
        estado: boleto.estado,
        comprador: (boleto.orden as any)?.usuario?.nombre || 'Anónimo',
        email: (boleto.orden as any)?.usuario?.email || ''
      },
      message: 'Boleto válido'
    })
  } catch (error: any) {
    console.error('Error en validación:', error)
    return NextResponse.json(
      { error: error.message || 'Error en validación' },
      { status: 500 }
    )
  }
}

async function registrarValidacion(
  supabase: any,
  boletoId: string | null,
  escaneadoPor: string,
  resultado: ValidationResultType,
  motivo: string | null,
  ip: string
) {
  if (!boletoId) return

  try {
    await supabase
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
