import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateQRPayload } from '@/lib/utils/generateSecureQR'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { qr_content, ticket_id } = body

    if (!qr_content && !ticket_id) {
      return NextResponse.json({ error: 'Se requiere qr_content o ticket_id' }, { status: 400 })
    }

    if (qr_content) {
      const isValid = validateQRPayload(qr_content)
      
      if (isValid) {
        return NextResponse.json({
          valid: true,
          payload: isValid,
          message: 'QR válido'
        })
      } else {
        let decoded = null
        try {
          decoded = atob(qr_content)
        } catch {}

        return NextResponse.json({
          valid: false,
          raw: qr_content,
          decoded: decoded,
          message: 'QR no válido o malformado'
        })
      }
    }

    if (ticket_id) {
      const supabase = await createClient()
      const supabaseAdmin = (await import('@supabase/supabase-js')).createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: boleto } = await supabaseAdmin
        .from('boleto')
        .select('id, codigo_qr, estado, tipo, evento_id, evento(titulo)')
        .eq('id', ticket_id)
        .single()

      if (!boleto) {
        return NextResponse.json({ error: 'Boleto no encontrado' }, { status: 404 })
      }

      return NextResponse.json({
        boleto: {
          id: boleto.id,
          estado: boleto.estado,
          tipo: boleto.tipo,
          evento: (boleto.evento as any)?.titulo,
          codigo_qr: boleto.codigo_qr,
          codigo_qr_preview: boleto.codigo_qr ? {
            length: boleto.codigo_qr.length,
            prefix: boleto.codigo_qr.substring(0, 50) + '...',
            isBase64: /^[A-Za-z0-9+/=]+$/.test(boleto.codigo_qr) && boleto.codigo_qr.length > 20
          } : null
        }
      })
    }
  } catch (error: any) {
    console.error('Error en debug-qr:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
