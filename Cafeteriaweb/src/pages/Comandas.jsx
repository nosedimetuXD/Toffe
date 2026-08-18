import { useEffect, useState } from 'react'
import { api, API_URL } from '../api/client'
import { useAuth } from '../context/AuthContext'
import {
  UtensilsCrossed,
  Clock,
  CheckCircle2,
  Bell,
  Play,
  Check,
  User
} from 'lucide-react'

export default function Comandas() {
  const { user } = useAuth()
  const [comandas, setComandas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadComandas() {
    try {
      const data = await api.get('/comandas')
      setComandas(data || [])
    } catch (err) {
      console.error('Error cargando comandas:', err)
      setError('No se pudieron cargar las comandas')
    } finally {
      setLoading(false)
    }
  }

  function playBellSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1318.51, ctx.currentTime) // E6
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.12) // C6
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.6)
    } catch (err) {
      // El sonido es un extra: si el navegador lo bloquea seguimos igual,
      // pero dejamos rastro para poder diagnosticarlo
      console.warn('no se pudo reproducir el aviso sonoro:', err)
    }
  }

  useEffect(() => {
    loadComandas()

    // Conexión SSE en tiempo real
    const eventSource = new EventSource(`${API_URL}/events`)

    eventSource.onmessage = (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch (e) {
        console.error('evento de comandas con payload inválido:', e)
        return
      }
      if (data.type === 'comanda_created' || data.type === 'comanda_status_updated' || data.type === 'comanda_updated') {
        playBellSound()
        loadComandas()
      }
    }

    eventSource.onerror = () => {
      console.error('conexión de eventos de comandas interrumpida, reintentando...')
    }

    return () => {
      eventSource.close()
    }
  }, [])

  async function handleStatusChange(id, newStatus) {
    try {
      const preparerName = user?.username || ''

      await api.patch(`/comandas/${id}/status`, {
        status: newStatus,
        prepared_by_username: preparerName
      })
      if (newStatus === 'listo') {
        playBellSound()
      }
      await loadComandas()
    } catch (err) {
      console.error('Error al cambiar estado de comanda:', err)
      alert(err.message || 'Error al actualizar el estado de la comanda')
    }
  }

  const formatElapsedTime = (dateStr) => {
    if (!dateStr) return '0 min'
    const totalMins = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000))
    if (totalMins < 60) {
      return `${totalMins} min`
    }
    const hours = Math.floor(totalMins / 60)
    const remainingMins = totalMins % 60
    if (remainingMins === 0) {
      return `${hours} h`
    }
    return `${hours} h ${remainingMins} min`
  }

  const formatDuration = (startStr, endStr) => {
    if (!startStr) return '0 min'
    const start = new Date(startStr).getTime()
    const end = endStr ? new Date(endStr).getTime() : Date.now()
    const totalMins = Math.max(0, Math.floor((end - start) / 60000))
    if (totalMins < 60) {
      return `${totalMins} min`
    }
    const hours = Math.floor(totalMins / 60)
    const remainingMins = totalMins % 60
    if (remainingMins === 0) {
      return `${hours} h`
    }
    return `${hours} h ${remainingMins} min`
  }

  const pending = comandas.filter((c) => c.status === 'pendiente')
  const inPrep = comandas.filter((c) => c.status === 'en_preparacion')
  const ready = comandas.filter((c) => c.status === 'listo')
  const delivered = comandas.filter((c) => c.status === 'entregado').slice(0, 15)

  if (loading) return <p className="p-4 text-sm font-semibold text-[#9F6839]">Cargando comandas en vivo...</p>

  const renderCard = (c, colType) => {
    const isFinished = c.status === 'listo' || c.status === 'entregado'
    const prepDuration = isFinished
      ? formatDuration(c.created_at, c.ready_at || c.updated_at)
      : formatElapsedTime(c.created_at)

    return (
      <div
        key={c.id}
        className="bg-[#FEE4D7]/20 dark:bg-[#2A150C] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 flex flex-col justify-between gap-3 shadow-xs hover:border-[#9F6839] transition-all"
      >
        <div>
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#D4B28E]/60 dark:border-[#9F6839]/30">
            <div className="flex flex-col">
              <span className="text-[10px] font-extrabold text-[#9F6839] dark:text-[#DABA8C] uppercase tracking-wider leading-tight">
                Comanda
              </span>
              <span className="text-base font-extrabold text-[#432414] dark:text-[#FEE4D7] leading-tight">
                #{c.order_number || c.id.slice(0, 4)}
              </span>
            </div>

            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#FEE4D7] text-[#9F6839] dark:bg-[#381C10] dark:text-[#DABA8C] border border-[#D4B28E] dark:border-[#9F6839]/60 whitespace-nowrap shrink-0">
              <Clock className="w-3 h-3 shrink-0 text-[#9F6839] dark:text-[#DABA8C]" />
              <span>{isFinished ? `Prep: ${prepDuration}` : prepDuration}</span>
            </span>
          </div>

          <div className="text-xs text-[#432414] dark:text-[#FEE4D7] mt-2 font-semibold">
            Cliente: <span className="font-bold">{c.customer_name || 'Cliente General'}</span>
          </div>

          {c.prepared_by_username && c.prepared_by_username !== 'Por asignar' ? (
            <div className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] font-extrabold flex items-center gap-1.5 mt-1.5 bg-[#FEE4D7]/60 dark:bg-[#34180D] px-2.5 py-1 rounded-xl border border-[#D4B28E]/60 max-w-full overflow-hidden">
              <User className="w-3.5 h-3.5 text-[#9F6839] shrink-0" />
              <span className="truncate">Prep: <span className="font-extrabold">{c.prepared_by_username}</span></span>
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 font-semibold flex items-center gap-1 mt-1.5">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>Por asignar</span>
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            {(c.items || []).map((item, idx) => {
              const unitPrice = typeof item.unit_price !== 'undefined' ? item.unit_price : (item.price || 0)

              return (
                <div
                  key={idx}
                  className="bg-white dark:bg-[#201009] border border-[#D4B28E]/70 p-2.5 rounded-2xl text-xs flex items-center justify-between font-bold text-[#432414] dark:text-[#FEE4D7]"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-[#9F6839] text-white font-bold flex items-center justify-center text-[10px]">
                      {item.quantity}
                    </span>
                    {item.product_name}
                  </span>
                  {unitPrice > 0 && (
                    <span className="text-[11px] font-extrabold text-[#9F6839] dark:text-[#DABA8C]">
                      ${(unitPrice * item.quantity).toLocaleString()}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-[#D4B28E]/60 dark:border-[#9F6839]/30">
          {colType === 'pending' && (
            <button
              onClick={() => handleStatusChange(c.id, 'en_preparacion')}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Iniciar Preparación</span>
            </button>
          )}

          {colType === 'in_prep' && (
            <button
              onClick={() => handleStatusChange(c.id, 'listo')}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Listo para Servir</span>
            </button>
          )}

          {colType === 'ready' && (
            <button
              onClick={() => handleStatusChange(c.id, 'entregado')}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-[#432414] hover:bg-[#201009] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Marcar Entregado</span>
            </button>
          )}

          {colType === 'delivered' && (
            <span className="text-xs text-emerald-600 font-bold flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Entregada
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-extrabold text-[#432414] dark:text-[#FEE4D7] tracking-tight">
              Comandas (Cocina & Barista)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FEE4D7] text-[#9F6839] border border-[#D4B28E]">
              En Vivo
            </span>
          </div>
          <p className="text-xs font-semibold text-[#9F6839] dark:text-[#DABA8C] mt-0.5">
            Monitor de comandas en tiempo real (KDS) para preparación de café y productos
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-2">
          <Clock className="w-4 h-4 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid de Columnas KDS alineadas arriba */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {/* Columna 1: Pendientes */}
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 flex flex-col justify-start items-stretch shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#D4B28E]/60">
            <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Pendientes ({pending.length})</span>
            </span>
          </div>
          <div className="space-y-3">
            {pending.length === 0 ? (
              <p className="text-xs text-[#9F6839] text-center py-8 font-semibold">Sin comandas pendientes</p>
            ) : (
              pending.map((c) => renderCard(c, 'pending'))
            )}
          </div>
        </div>

        {/* Columna 2: En Preparación */}
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 flex flex-col justify-start items-stretch shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#D4B28E]/60">
            <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] uppercase tracking-wider flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5 text-orange-500" />
              <span>En Preparación ({inPrep.length})</span>
            </span>
          </div>
          <div className="space-y-3">
            {inPrep.length === 0 ? (
              <p className="text-xs text-[#9F6839] text-center py-8 font-semibold">Sin órdenes en preparación</p>
            ) : (
              inPrep.map((c) => renderCard(c, 'in_prep'))
            )}
          </div>
        </div>

        {/* Columna 3: Listas en Barra */}
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 flex flex-col justify-start items-stretch shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#D4B28E]/60">
            <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] uppercase tracking-wider flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-emerald-600" />
              <span>Listas en Barra ({ready.length})</span>
            </span>
          </div>
          <div className="space-y-3">
            {ready.length === 0 ? (
              <p className="text-xs text-[#9F6839] text-center py-8 font-semibold">Sin órdenes listas por entregar</p>
            ) : (
              ready.map((c) => renderCard(c, 'ready'))
            )}
          </div>
        </div>

        {/* Columna 4: Entregadas */}
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 flex flex-col justify-start items-stretch shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#D4B28E]/60">
            <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Entregadas ({delivered.length})</span>
            </span>
          </div>
          <div className="space-y-3">
            {delivered.length === 0 ? (
              <p className="text-xs text-[#9F6839] text-center py-8 font-semibold">Sin historial reciente</p>
            ) : (
              delivered.map((c) => renderCard(c, 'delivered'))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
