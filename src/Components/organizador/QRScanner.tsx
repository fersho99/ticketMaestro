'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { X, Camera, Loader2, CheckCircle, XCircle } from 'lucide-react'

interface QRScannerProps {
  isOpen: boolean
  onClose: () => void
  onScan: (ticketId: string) => void
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const startScanner = async () => {
      try {
        setError('')
        setScanning(true)

        const scanner = new Html5Qrcode('qr-reader')
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            handleScan(decodedText)
          },
          () => {}
        )
      } catch (err: any) {
        console.error('Error al iniciar scanner:', err)
        setScanning(false)
        if (err.message?.includes('permission')) {
          setError('Permiso de cámara denegado. Por favor permite el acceso a la cámara.')
        } else if (err.message?.includes('NotFoundError')) {
          setError('No se encontró cámara. Asegúrate de tener una cámara disponible.')
        } else {
          setError('Error al iniciar la cámara: ' + (err.message || 'Error desconocido'))
        }
      }
    }

    startScanner()

    return () => {
      stopScanner()
    }
  }, [isOpen])

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch (e) {
        console.error('Error al detener scanner:', e)
      }
    }
    setScanning(false)
  }

  const handleScan = (decodedText: string) => {
    setLastScanned(decodedText)

    try {
      const decoded = JSON.parse(atob(decodedText))
      if (decoded.ticketId) {
        setLastScanned(decoded.ticketId)
        onScan(decoded.ticketId)
        setTimeout(() => {
          onClose()
        }, 1500)
      }
    } catch {
      const ticketIdMatch = decodedText.match(/BOL-[A-Z0-9]+/i)
      if (ticketIdMatch) {
        setLastScanned(ticketIdMatch[0])
        onScan(ticketIdMatch[0])
        setTimeout(() => {
          onClose()
        }, 1500)
      }
    }
  }

  const handleClose = async () => {
    await stopScanner()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-[#1a1625] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
              <Camera className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Escanear QR</h2>
              <p className="text-xs text-gray-400">Apunta la cámara al código QR</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4">
          <div 
            id="qr-reader" 
            ref={containerRef}
            className="w-full rounded-xl overflow-hidden bg-black"
            style={{ minHeight: '300px' }}
          />

          {scanning && !lastScanned && (
            <div className="mt-4 flex items-center justify-center gap-2 text-pink-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Buscando código QR...</span>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
              <div className="flex items-start gap-2">
                <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Error</p>
                  <p className="text-red-400/80">{error}</p>
                </div>
              </div>
            </div>
          )}

          {lastScanned && (
            <div className="mt-4 p-4 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold">¡Código detectado!</p>
                  <p className="text-green-400/80 font-mono">{lastScanned}</p>
                  <p className="text-xs mt-1">Abriendo validación...</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 bg-black/20">
          <p className="text-center text-xs text-gray-400">
            Mantén el código QR firme y bien iluminado
          </p>
        </div>
      </div>
    </div>
  )
}
