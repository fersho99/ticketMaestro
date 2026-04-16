'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, ShieldCheck, ShieldAlert, Ticket as TicketIcon, User, Calendar, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react'

const SUCCESS_SOUND = 'data:audio/wav;base64,UklGRl9vAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU9vAAA='
const ERROR_SOUND = 'data:audio/wav;base64,UklGRl9vAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU9vAAA='

export default function VerifyTicketPage() {
  const params = useParams()
  const router = useRouter()
  const ticketId = params.id as string

  const [loading, setLoading] = useState(true)
  const [ticketData, setTicketData] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [burning, setBurning] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [antiFraude, setAntiFraude] = useState(false)

  const playSound = useCallback((isSuccess: boolean) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      if (isSuccess) {
        oscillator.frequency.value = 880
        oscillator.type = 'sine'
        gainNode.gain.value = 0.3
      } else {
        oscillator.frequency.value = 220
        oscillator.type = 'square'
        gainNode.gain.value = 0.2
      }

      oscillator.start()
      oscillator.stop(audioContext.currentTime + (isSuccess ? 0.2 : 0.5))
    } catch (e) {
      console.log('Audio not supported')
    }
  }, [])

  const vibrate = useCallback((isSuccess: boolean) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(isSuccess ? [100] : [200, 100, 200])
    }
  }, [])

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const res = await fetch(`/api/verify/${ticketId}`)
        const data = await res.json()
        
        if (!res.ok) {
          setErrorMsg(data.error || 'Error al validar boleto')
          playSound(false)
          vibrate(false)
        } else {
          setTicketData(data.data)
          if (data.data.estado === 'usado') {
            setErrorMsg('Este boleto ya fue usado')
            playSound(false)
            vibrate(false)
          }
        }
      } catch (err) {
        setErrorMsg('Falla de red contactando al servidor de escaneo.')
        playSound(false)
        vibrate(false)
      } finally {
        setLoading(false)
      }
    }
    fetchTicket()
  }, [ticketId, playSound, vibrate])

  const burnTicket = async () => {
    setBurning(true)
    setErrorMsg('')
    setSuccessMsg('')
    setAntiFraude(false)
    
    try {
      const res = await fetch(`/api/verify/${ticketId}`, { method: 'PUT' })
      const data = await res.json()
      
      if (!res.ok) {
        const isAntiFraude = data.anti_fraude
        setAntiFraude(isAntiFraude || false)
        setErrorMsg(data.error || 'Error al quemar boleto')
        playSound(false)
        vibrate(false)
      } else {
        setSuccessMsg('¡Acceso Permitido!')
        setTicketData((prev: any) => ({ ...prev, estado: 'usado' }))
        playSound(true)
        vibrate(true)
      }
    } catch (err) {
      setErrorMsg('Error de red al intentar quemar el boleto.')
      playSound(false)
      vibrate(false)
    } finally {
      setBurning(false)
    }
  }

  const handleBack = () => {
    router.back()
  }

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo?.toLowerCase()) {
      case 'vip':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'preferente':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0a17] text-white flex flex-col">
      <header className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Volver</span>
          </button>
          <span className="text-pink-400 font-bold text-sm">ESCÁNER</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
            
            <div className="text-center mb-6">
               <h1 className="text-2xl font-black mb-1 tracking-tight">Validación de Boleto</h1>
               <p className="text-gray-400 text-sm font-mono">{ticketId}</p>
            </div>

            {loading ? (
                <div className="bg-white/5 border border-white/10 rounded-3xl p-12 flex flex-col items-center justify-center shadow-2xl backdrop-blur-md">
                    <div className="w-16 h-16 rounded-full border-4 border-pink-500/30 border-t-pink-500 animate-spin mb-4"></div>
                    <p className="text-sm font-bold text-gray-300 animate-pulse">Verificando...</p>
                </div>
            ) : errorMsg && !ticketData ? (
                <div className="bg-red-500/10 border border-red-500/50 rounded-3xl p-8 text-center shadow-2xl">
                    <ShieldAlert className="w-20 h-20 text-red-500 mx-auto mb-4"/>
                    <h2 className="text-xl font-black text-red-400 mb-2">ACCESO DENEGADO</h2>
                    <p className="text-gray-300 font-medium text-sm">{errorMsg}</p>
                </div>
            ) : ticketData ? (
                <div className="relative">
                    {ticketData.estado === 'usado' && !successMsg && (
                       <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white font-black px-4 py-1.5 rounded-full uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(220,38,38,0.6)] z-20 whitespace-nowrap border-2 border-red-400 animate-bounce">
                           ⚠️ BOLETO YA USADO ⚠️
                       </div>
                    )}

                    {successMsg && (
                       <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white font-black px-4 py-1.5 rounded-full uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(34,197,94,0.6)] z-20 whitespace-nowrap border-2 border-green-300 animate-pulse">
                           ✓ {successMsg}
                       </div>
                    )}

                    {antiFraude && (
                       <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-600 text-white font-black px-4 py-1.5 rounded-full uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(234,179,8,0.6)] z-20 whitespace-nowrap border-2 border-amber-400">
                           ⚠ ANTI-FRAUDE ⚠
                       </div>
                    )}

                    <div className={`bg-linear-to-b from-[#1a1625] to-[#110e1b] border-2 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 ${
                        ticketData.estado === 'usado' ? 'border-red-500/50 grayscale' : 'border-green-500/50'
                    }`}>
                        
                        <div className="p-6 text-center border-b border-white/5">
                            {ticketData.estado !== 'usado' ? (
                                <ShieldCheck className="w-14 h-14 text-green-400 mx-auto mb-3"/>
                            ) : successMsg ? (
                                <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-3 animate-pulse"/>
                            ) : (
                                <XCircle className="w-14 h-14 text-red-500 mx-auto mb-3"/>
                            )}
                            <h2 className="text-xl font-black mb-1">{ticketData.evento?.titulo}</h2>
                            <p className="text-green-400/80 font-bold text-xs uppercase tracking-widest">Validación Oficial</p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="bg-black/40 rounded-xl p-4 flex items-center gap-4">
                                <TicketIcon className="w-6 h-6 text-gray-500"/>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Tipo de Pase</p>
                                    <span className={`inline-block mt-1 px-3 py-1 rounded-full border text-sm font-bold ${getTipoBadgeColor(ticketData.tipo)}`}>
                                      {ticketData.tipo || 'General'}
                                    </span>
                                </div>
                            </div>

                            <div className="bg-black/40 rounded-xl p-4 flex items-center gap-4">
                                <User className="w-6 h-6 text-gray-500"/>
                                <div>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Titular</p>
                                    <p className="font-bold">{ticketData.orden?.usuario?.nombre || 'Anónimo'}</p>
                                    <p className="text-xs text-gray-500">{ticketData.orden?.usuario?.email}</p>
                                </div>
                            </div>

                            <div className="bg-black/40 rounded-xl p-4 flex items-center gap-4">
                                <Calendar className="w-6 h-6 text-gray-500"/>
                                <div>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Fecha del Evento</p>
                                    <p className="font-bold text-sm">{new Date(ticketData.evento?.fecha).toLocaleDateString('es-MX', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'})}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-black/50 border-t border-white/5">
                            {ticketData.estado !== 'usado' ? (
                                <button 
                                    onClick={burnTicket}
                                    disabled={burning}
                                    className="w-full py-4 rounded-xl font-black text-lg bg-green-500 text-white hover:bg-green-400 transition-all shadow-[0_0_30px_rgba(34,197,94,0.4)] disabled:opacity-50 disabled:animate-pulse flex items-center justify-center gap-2 active:scale-95"
                                >
                                    {burning ? (
                                      <>
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        Procesando...
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle2 className="w-6 h-6"/>
                                        PERMITIR ACCESO
                                      </>
                                    )}
                                </button>
                            ) : (
                                <div className="w-full py-4 rounded-xl font-black text-lg bg-red-950/50 text-red-500 border border-red-900/50 text-center uppercase tracking-widest">
                                    {successMsg ? 'ACCESO REGISTRADO' : 'BOLETO USADO'}
                                </div>
                            )}
                            
                            {errorMsg && !antiFraude && (
                              <p className="text-center text-red-400 text-sm mt-3">{errorMsg}</p>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

        </div>
      </main>
    </div>
  )
}
