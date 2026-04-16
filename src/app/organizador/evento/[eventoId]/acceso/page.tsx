import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import Link from 'next/link'
import { ArrowLeft, Users, FileText } from 'lucide-react'
import AccessDashboard from '@/Components/organizador/AccessDashboard'
import StaffManagement from '@/Components/organizador/StaffManagement'

interface PageProps {
  params: Promise<{ eventoId: string }>
}

export default async function AccesoPage({ params }: PageProps) {
  const { eventoId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login?redirect=' + encodeURIComponent(`/organizador/evento/${eventoId}/acceso`))
  }

  const { data: usuario } = await supabase
    .from('usuario')
    .select('id, rol')
    .eq('id', user.id)
    .single()

  if (!usuario || (usuario.rol !== 'organizador' && usuario.rol !== 'admin')) {
    redirect('/organizador')
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
      redirect('/organizador')
    }
  }

  const { data: evento } = await supabaseAdmin
    .from('evento')
    .select('id, titulo, fecha, ubicacion')
    .eq('id', eventoId)
    .single()

  if (!evento) {
    redirect('/organizador')
  }

  return (
    <div className="min-h-screen bg-[#0e0a17] text-white">
      <header className="border-b border-white/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/organizador"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Volver al panel</span>
            </Link>
            
            <div className="flex items-center gap-4">
              <Link
                href={`/organizador/evento/${eventoId}/reporte`}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Reporte</span>
              </Link>
              <span className="px-3 py-1 rounded-full bg-pink-500/20 text-pink-400 text-sm font-medium">
                Panel de Acceso
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <AccessDashboard
          eventoId={eventoId}
          evento={{
            titulo: evento.titulo,
            fecha: evento.fecha,
            ubicacion: evento.ubicacion || ''
          }}
        />

        <div className="mt-8">
          <StaffManagement eventoId={eventoId} />
        </div>
      </main>
    </div>
  )
}
