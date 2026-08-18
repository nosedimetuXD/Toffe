import { useEffect, useState, useMemo } from 'react'
import { api } from '../api/client'
import Modal from '../components/Modal'
import { usePeriodFilter } from '../hooks/usePeriodFilter'
import { MONTH_NAMES, buildPeriodQuery } from '../utils/periodFilter'
import {
  Search,
  FileText,
  Printer,
  Clock,
  TrendingUp,
  Calendar,
  CalendarDays,
  Zap,
  Sun,
  Building2,
  Globe,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react'

export default function SalesHistory() {
  const [sales, setSales] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMethod, setSelectedMethod] = useState('Todos')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Modal Recibo impreso
  const [selectedSale, setSelectedSale] = useState(null)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)

  // Control de filtro de periodos (Predeterminado: Histórico Total)
  const {
    isFilterModalOpen,
    setIsFilterModalOpen,
    activeTab,
    setActiveTab,
    displayLabel,
    period,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectPreset: handleSelectPreset,
    selectMonthYear: handleSelectMonthYear,
    applyCustomRange: handleApplyCustomRange
  } = usePeriodFilter({
    initialPeriod: 'all',
    initialLabel: 'Histórico Total',
    onApply: (params) => loadSales(params)
  })

  async function loadSales(params = {}) {
    setLoading(true)
    setPageError('')
    try {
      const data = await api.get(`/sales?${buildPeriodQuery(params, period)}`)
      setSales(data || [])
    } catch (err) {
      setPageError('No se pudo cargar el historial de ventas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSales({ period: 'all' })
  }, [])

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const matchSearch =
        s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sold_by_username?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchMethod = selectedMethod === 'Todos' || s.payment_method === selectedMethod
      return matchSearch && matchMethod
    })
  }, [sales, searchQuery, selectedMethod])

  const totalSalesVolume = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + s.total, 0)
  }, [filteredSales])

  function handlePrintReceipt(sale) {
    setSelectedSale(sale)
    setIsReceiptOpen(true)
  }

  function executeBrowserPrint() {
    window.print()
  }

  if (loading) return <p className="p-4 text-sm font-semibold text-[#9F6839]">Cargando historial de ventas...</p>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#432414] dark:text-[#FEE4D7] tracking-tight">
            Historial de Ventas & Recibos
          </h2>
          <p className="text-xs font-semibold text-[#9F6839] dark:text-[#DABA8C] mt-0.5">
            Registro cronológico de ventas, cobros y comprobantes de la cafetería
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Botón Selector de Período */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-3xl bg-white dark:bg-[#201009] hover:bg-[#FEE4D7]/50 border border-[#D4B28E] dark:border-[#9F6839]/40 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] shadow-xs transition-all cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-[#9F6839]" />
            <span>{displayLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#9F6839]" />
          </button>

          {/* Tarjeta Total Facturado */}
          <div className="flex items-center gap-3 bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 px-4 py-2.5 rounded-3xl shadow-xs">
            <div className="p-2 rounded-2xl bg-[#432414] text-[#DABA8C]">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-[#9F6839] uppercase font-bold tracking-wider block">Total Facturado</span>
              <div className="text-lg font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                ${totalSalesVolume.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
          ⚠️ {pageError}
        </div>
      )}

      {/* Buscador & Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9F6839]" />
          <input
            type="text"
            placeholder="Buscar por cliente o cajero..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 focus:border-[#9F6839] rounded-2xl pl-10 pr-3 py-2.5 text-xs font-semibold text-[#432414] dark:text-[#FEE4D7] focus:outline-none shadow-xs"
          />
        </div>

        <select
          value={selectedMethod}
          onChange={(e) => setSelectedMethod(e.target.value)}
          className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-2xl px-3 py-2.5 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] focus:outline-none shadow-xs cursor-pointer"
        >
          <option value="Todos">Todos los Métodos de Pago</option>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="mixto">Pago Mixto</option>
        </select>
      </div>

      {/* Tabla de Historial de Ventas */}
      <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-[#FEE4D7]/50 dark:bg-[#2A150C] text-[#9F6839] dark:text-[#DABA8C] uppercase tracking-wider text-[10px] border-b border-[#D4B28E]/60 font-bold">
              <tr>
                <th className="py-3.5 px-4">Fecha / Hora</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Resumen del Pedido</th>
                <th className="py-3.5 px-4">Método de Pago & Entidad</th>
                <th className="py-3.5 px-4">Atendido Por</th>
                <th className="py-3.5 px-4 text-right">Total</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4B28E]/30 text-[#432414] dark:text-[#FEE4D7]">
              {filteredSales.map((s) => {
                const sDate = new Date(s.created_at)
                const dateFormatted = sDate.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                const timeFormatted = sDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
                const itemsSummary = (s.items || []).map((i) => `${i.quantity}x ${i.product_name || 'Producto'}`).join(', ') || 'Sin productos'

                return (
                  <tr key={s.id} className="hover:bg-[#FEE4D7]/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[#9F6839] shrink-0" />
                        <div className="flex flex-col">
                          <span className="font-extrabold text-[#432414] dark:text-[#FEE4D7]">{dateFormatted}</span>
                          <span className="text-[11px] font-semibold text-[#9F6839] dark:text-[#DABA8C]">{timeFormatted}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold">{s.customer_name || 'Cliente General'}</td>
                    <td className="py-3.5 px-4">
                      <div className="max-w-[220px] font-semibold text-[#432414] dark:text-[#FEE4D7] text-xs truncate" title={itemsSummary}>
                        {itemsSummary}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#FEE4D7] dark:bg-[#34180D] text-[#9F6839] dark:text-[#DABA8C] border border-[#D4B28E] font-extrabold text-[10px] uppercase tracking-wider w-max">
                          {s.payment_method}
                        </span>
                        {s.bank_details && (
                          <span className="text-[10px] text-[#9F6839] dark:text-[#DABA8C] font-bold">
                            {s.bank_details}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold">{s.sold_by_username || 'Vendedor'}</td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-sm text-emerald-600">
                      ${s.total.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handlePrintReceipt(s)}
                        className="p-2 rounded-xl text-[#9F6839] hover:bg-[#FEE4D7] dark:hover:bg-[#2E180E] transition-colors cursor-pointer"
                        title="Imprimir / Ver Ticket"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-[#9F6839] font-medium">
                    No se encontraron ventas registradas en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Recibo Impreso */}
      <Modal isOpen={isReceiptOpen} onClose={() => setIsReceiptOpen(false)} title="Recibo de Venta Toffee">
        {selectedSale && (
          <div className="space-y-4">
            <div id="printable-receipt" className="p-6 bg-white border border-gray-200 rounded-2xl text-center space-y-3 font-mono text-xs text-gray-800">
              <div className="flex flex-col items-center justify-center border-b border-[#D4B28E]/60 pb-3 text-center">
                <img src="/icon-192.png" alt="Toffee Logo" className="w-12 h-12 rounded-2xl border border-[#9F6839] mb-1 object-cover" />
                <h2 className="text-base font-black text-[#432414] uppercase tracking-wider">Toffee</h2>
                <p className="text-[10px] text-[#9F6839] font-extrabold uppercase tracking-widest">"Hecho por y para estudiantes"</p>
              </div>

              <div className="text-left space-y-1 text-xs">
                <div><strong>Cliente:</strong> {selectedSale.customer_name || 'Cliente General'}</div>
                <div><strong>Forma Pago:</strong> {selectedSale.payment_method}</div>
                <div><strong>Cajero:</strong> {selectedSale.sold_by_username || 'Caja'}</div>
                <div><strong>Fecha:</strong> {new Date(selectedSale.created_at).toLocaleString()}</div>
              </div>

              <div className="border-t border-b py-3 space-y-1 text-left">
                {(selectedSale.items || []).map((it, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span>{it.quantity}x {it.product_name}</span>
                    <span>${(it.unit_price * it.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-sm font-bold pt-1">
                <span>TOTAL FACTURADO:</span>
                <span className="text-base">${selectedSale.total.toLocaleString()}</span>
              </div>

              <div className="pt-4 border-t border-dashed text-[10px] text-gray-500 text-center">
                ¡Gracias por tu compra en Toffee! ☕<br />
                Vuelve pronto.
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsReceiptOpen(false)}
                className="px-4 py-2 rounded-2xl border border-gray-300 text-xs font-extrabold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cerrar
              </button>
              <button
                onClick={executeBrowserPrint}
                className="px-4 py-2 rounded-2xl bg-[#9F6839] text-white text-xs font-extrabold hover:bg-[#835229] shadow-xs cursor-pointer flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal / Popover de Filtro de Período y Fechas */}
      <Modal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filtrar Período de Ventas"
      >
        <div className="space-y-5">
          {/* Navegación por pestañas */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#FEE4D7]/50 dark:bg-[#2E180E] border border-[#D4B28E]">
            <button
              type="button"
              onClick={() => setActiveTab('preset')}
              className={`flex-1 py-2 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'preset'
                  ? 'bg-[#9F6839] text-white shadow-xs'
                  : 'text-[#432414] dark:text-[#FEE4D7] hover:bg-[#9F6839]/10'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Rápido</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('month_year')}
              className={`flex-1 py-2 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'month_year'
                  ? 'bg-[#9F6839] text-white shadow-xs'
                  : 'text-[#432414] dark:text-[#FEE4D7] hover:bg-[#9F6839]/10'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Mes & Año</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`flex-1 py-2 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'custom'
                  ? 'bg-[#9F6839] text-white shadow-xs'
                  : 'text-[#432414] dark:text-[#FEE4D7] hover:bg-[#9F6839]/10'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Rango Calendario</span>
            </button>
          </div>

          {/* TAB 1: Opciones Rápidas */}
          {activeTab === 'preset' && (
            <div className="grid grid-cols-2 gap-3 p-1">
              <button
                type="button"
                onClick={() => handleSelectPreset('all', 'Histórico Total')}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] hover:bg-[#FEE4D7]/50 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] text-left cursor-pointer flex items-center gap-2"
              >
                <Globe className="w-4 h-4 text-blue-600" />
                <span>Histórico Total</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('month', 'Mes Actual')}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] hover:bg-[#FEE4D7]/50 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] text-left cursor-pointer flex items-center gap-2"
              >
                <Calendar className="w-4 h-4 text-[#9F6839]" />
                <span>Mes Actual</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('prev_month', 'Mes Anterior')}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] hover:bg-[#FEE4D7]/50 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] text-left cursor-pointer flex items-center gap-2"
              >
                <Clock className="w-4 h-4 text-[#9F6839]" />
                <span>Mes Anterior</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('week', 'Esta Semana')}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] hover:bg-[#FEE4D7]/50 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] text-left cursor-pointer flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4 text-[#9F6839]" />
                <span>Esta Semana</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('today', 'Hoy')}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] hover:bg-[#FEE4D7]/50 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] text-left cursor-pointer flex items-center gap-2"
              >
                <Sun className="w-4 h-4 text-amber-500" />
                <span>Hoy</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('year', 'Este Año')}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] hover:bg-[#FEE4D7]/50 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] text-left cursor-pointer flex items-center gap-2"
              >
                <Building2 className="w-4 h-4 text-[#9F6839]" />
                <span>Este Año</span>
              </button>
            </div>
          )}

          {/* TAB 2: Mes & Año */}
          {activeTab === 'month_year' && (
            <div className="space-y-4 p-4 rounded-3xl bg-white dark:bg-[#150904] border border-[#D4B28E] shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#D4B28E]/40">
                <button
                  type="button"
                  onClick={() => setSelectedYear(selectedYear - 1)}
                  className="p-2 rounded-xl border border-[#D4B28E] hover:bg-[#FEE4D7] dark:hover:bg-[#2E180E] text-[#432414] dark:text-[#FEE4D7] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                  {selectedYear}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedYear(selectedYear + 1)}
                  className="p-2 rounded-xl border border-[#D4B28E] hover:bg-[#FEE4D7] dark:hover:bg-[#2E180E] text-[#432414] dark:text-[#FEE4D7] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2.5 pt-1">
                {MONTH_NAMES.map((m) => {
                  const isSelected = selectedMonth === m.num

                  return (
                    <button
                      key={m.num}
                      type="button"
                      onClick={() => handleSelectMonthYear(selectedYear, m.num, m.full)}
                      className={`py-3 rounded-xl text-xs font-bold text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0066FF] text-white font-black shadow-md border-2 border-black dark:border-white ring-2 ring-blue-400'
                          : 'bg-gray-100 dark:bg-[#2A150C] text-[#432414] dark:text-[#FEE4D7] hover:bg-blue-100 dark:hover:bg-blue-950/60 border border-gray-200 dark:border-[#9F6839]/40'
                      }`}
                    >
                      {m.short}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Rango Calendario */}
          {activeTab === 'custom' && (
            <form onSubmit={handleApplyCustomRange} className="space-y-4 p-4 rounded-3xl bg-white dark:bg-[#150904] border border-[#D4B28E]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase mb-1">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase mb-1">
                    Fecha Fin
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                <Filter className="w-4 h-4" />
                <span>Aplicar Rango de Fechas</span>
              </button>
            </form>
          )}
        </div>
      </Modal>
    </div>
  )
}
