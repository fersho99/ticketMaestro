import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventoId: string; staffId: string }> }
) {
  try {
    const { eventoId, staffId } = await params
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
        return NextResponse.json({ error: 'Evento no encontrado o no eres el organizador' }, { status: 404 })
      }
    }

    const { data: staff, error: fetchError } = await supabaseAdmin
      .from('evento_staff')
      .select('id')
      .eq('id', staffId)
      .eq('evento_id', eventoId)
      .single()

    if (fetchError || !staff) {
      return NextResponse.json({ error: 'Staff no encontrado' }, { status: 404 })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('evento_staff')
      .delete()
      .eq('id', staffId)

    if (deleteError) throw deleteError

    return NextResponse.json({
      message: 'Staff eliminado correctamente'
    })
  } catch (error: any) {
    console.error('Error al eliminar staff:', error)
    return NextResponse.json(
      { error: error.message || 'Error al eliminar staff' },
      { status: 500 }
    )
  }
}
