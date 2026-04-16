import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const MAX_STAFF_PER_EVENT = 10

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

    const { data: staff, error } = await supabaseAdmin
      .from('evento_staff')
      .select(`
        id,
        evento_id,
        usuario_id,
        nombre_staff,
        puede_validar,
        puede_ver_reportes,
        fecha_asignacion,
        usuario (
          id,
          nombre,
          email
        )
      `)
      .eq('evento_id', eventoId)
      .order('fecha_asignacion', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      data: staff || [],
      total: staff?.length || 0,
      maximo: MAX_STAFF_PER_EVENT
    })
  } catch (error: any) {
    console.error('Error al obtener staff:', error)
    return NextResponse.json(
      { error: error.message || 'Error al obtener staff' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventoId: string }> }
) {
  try {
    const { eventoId } = await params
    const body = await request.json()
    const { email, nombre_staff, puede_validar = true, puede_ver_reportes = false } = body

    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

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
        .select('id, organizador_id')
        .eq('id', eventoId)
        .eq('organizador_id', user.id)
        .single()

      if (!evento) {
        return NextResponse.json({ error: 'Evento no encontrado o no eres el organizador' }, { status: 404 })
      }
    }

    const { data: usuarioInvitado } = await supabase
      .from('usuario')
      .select('id, nombre, email, rol')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (!usuarioInvitado) {
      return NextResponse.json({ error: 'Usuario no encontrado con ese email' }, { status: 404 })
    }

    if (usuarioInvitado.rol === 'admin') {
      return NextResponse.json({ error: 'No puedes asignar staff a un administrador' }, { status: 400 })
    }

    if (usuarioInvitado.id === user.id) {
      return NextResponse.json({ error: 'No puedes asignarte como staff de tu propio evento' }, { status: 400 })
    }

    const { data: staffActual } = await supabaseAdmin
      .from('evento_staff')
      .select('id')
      .eq('evento_id', eventoId)

    if (staffActual && staffActual.length >= MAX_STAFF_PER_EVENT) {
      return NextResponse.json(
        { error: `Máximo ${MAX_STAFF_PER_EVENT} staff por evento` },
        { status: 400 }
      )
    }

    const { data: existeStaff } = await supabaseAdmin
      .from('evento_staff')
      .select('id')
      .eq('evento_id', eventoId)
      .eq('usuario_id', usuarioInvitado.id)
      .single()

    if (existeStaff) {
      return NextResponse.json({ error: 'Este usuario ya es staff de este evento' }, { status: 400 })
    }

    const { data: nuevoStaff, error } = await supabaseAdmin
      .from('evento_staff')
      .insert({
        evento_id: eventoId,
        usuario_id: usuarioInvitado.id,
        nombre_staff: nombre_staff || usuarioInvitado.nombre,
        puede_validar,
        puede_ver_reportes
      })
      .select(`
        id,
        evento_id,
        usuario_id,
        nombre_staff,
        puede_validar,
        puede_ver_reportes,
        fecha_asignacion,
        usuario (
          id,
          nombre,
          email
        )
      `)
      .single()

    if (error) throw error

    return NextResponse.json({
      data: nuevoStaff,
      message: 'Staff asignado correctamente'
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error al asignar staff:', error)
    return NextResponse.json(
      { error: error.message || 'Error al asignar staff' },
      { status: 500 }
    )
  }
}
