import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import type { EventoStats } from '@/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventoId: string }> }
) {
  try {
    const { eventoId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: usuario } = await supabase
      .from('usuario')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!usuario || (usuario.rol !== 'organizador' && usuario.rol !== 'admin')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (usuario.rol === 'organizador') {
      const { data: evento } = await supabase
        .from('evento')
        .select('id')
        .eq('id', eventoId)
        .eq('organizador_id', user.id)
        .single()

      if (!evento) {
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
      }
    }

    const { data: evento } = await supabaseAdmin
      .from('evento')
      .select('id, titulo, fecha, ubicacion, capacidad')
      .eq('id', eventoId)
      .single()

    if (!evento) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
    }

    const { data: boletos } = await supabaseAdmin
      .from('boleto')
      .select('estado')
      .eq('evento_id', eventoId)

    const totalVendidos = boletos?.filter(b => b.estado === 'vendido' || b.estado === 'usado').length || 0
    const totalUsados = boletos?.filter(b => b.estado === 'usado').length || 0
    const totalRestantes = totalVendidos - totalUsados
    const asistenciaPorcentaje = totalVendidos > 0
      ? Math.round((totalUsados / totalVendidos) * 100 * 10) / 10
      : 0

    const { data: validaciones } = await supabaseAdmin
      .from('validacion')
      .select('resultado')
      .eq('boleto_id',
        supabaseAdmin.from('boleto').select('id').eq('evento_id', eventoId)
      )
      .gte('fecha_hora', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())

    const resumenValidaciones = {
      total_intentos: validaciones?.length || 0,
      validos: validaciones?.filter(v => v.resultado === 'valido').length || 0,
      invalidos: validaciones?.filter(v => v.resultado !== 'valido').length || 0,
      ya_usados: validaciones?.filter(v => v.resultado === 'ya_usado').length || 0
    }

    const { data: ultimosBoletos } = await supabaseAdmin
      .from('boleto')
      .select(`
        id,
        tipo,
        fecha_emision,
        orden (
          usuario (
            nombre
          )
        )
      `)
      .eq('evento_id', eventoId)
      .in('estado', ['usado'])
      .order('fecha_emision', { ascending: false })
      .limit(20)

    const ultimosIngresos = (ultimosBoletos || []).map(b => ({
      boleto_id: b.id,
      comprador: (b.orden as any)?.usuario?.nombre || 'Anónimo',
      tipo: b.tipo,
      hora: new Date(b.fecha_emision).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    }))

    const stats: EventoStats = {
      evento: {
        id: evento.id,
        titulo: evento.titulo,
        fecha: evento.fecha,
        ubicacion: evento.ubicacion,
        capacidad: evento.capacidad
      },
      boletos: {
        total_vendidos: totalVendidos,
        total_usados: totalUsados,
        total_restantes: totalRestantes,
        asistencia_porcentaje: asistenciaPorcentaje
      },
      ultimos_ingresos: ultimosIngresos,
      resumen_validaciones: resumenValidaciones
    }

    return NextResponse.json({ data: stats })
  } catch (error: any) {
    console.error('Error al obtener stats:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener estadísticas' },
      { status: 500 }
    )
  }
}
