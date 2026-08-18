import { useEffect, useState } from 'react'
import { api } from '../api/client'
import Modal from '../components/Modal'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Award,
  Users,
  Calendar,
  CalendarDays,
  AlertTriangle,
  Trophy,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Zap,
  Sun,
  Globe
} from 'lucide-react'

const MONTH_NAMES = [
  { num: 1, short: 'ene.', full: 'Enero' },
  { num: 2, short: 'feb.', full: 'Febrero' },
  { num: 3, short: 'mar.', full: 'Marzo' },
  { num: 4, short: 'abr.', full: 'Abril' },
  { num: 5, short: 'may.', full: 'Mayo' },
  { num: 6, short: 'jun.', full: 'Junio' },
  { num: 7, short: 'jul.', full: 'Julio' },
  { num: 8, short: 'ago.', full: 'Agosto' },
  { num: 9, short: 'sep.', full: 'Septiembre' },
  { num: 10, short: 'oct.', full: 'Octubre' },
  { num: 11, short: 'nov.', full: 'Noviembre' },
  { num: 12, short: 'dic.', full: 'Diciembre' }
]

export default function Stats() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Control de filtro y modal
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('month_year')
  const [displayLabel, setDisplayLabel] = useState('Mes Actual')

  // Estados de filtro
  const [period, setPeriod] = useState('month')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  async function loadStats(params = {}) {
    setLoading(true)
    setPageError('')
    try {
      let queryStr = ''
      if (params.startDate && params.endDate) {
        queryStr = `start_date=${params.startDate}&end_date=${params.endDate}`
      } else if (params.year && params.monthNum) {
        queryStr = `year=${params.year}&month_num=${params.monthNum}`
      } else {
        queryStr = `period=${params.period || period}`
      }

      const data = await api.get(`/accounting/summary?${queryStr}`)
      setSummary(data)
    } catch (err) {
      setPageError('No se pudieron cargar las estadísticas del período seleccionado')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats({ period: 'month' })
  }, [])

  function handleSelectPreset(presetKey, label) {
    setPeriod(presetKey)
    setDisplayLabel(label)
    setIsFilterModalOpen(false)
    loadStats({ period: presetKey })
  }

  function handleSelectMonthYear(year, monthNum, monthFull) {
    setSelectedYear(year)
    setSelectedMonth(monthNum)
    setDisplayLabel(`${monthFull} de ${year}`)
    setIsFilterModalOpen(false)
    loadStats({ year, monthNum })
  }

  function handleApplyCustomRange(e) {
    e.preventDefault()
    if (!startDate || !endDate) {
      alert('Por favor selecciona una fecha de inicio y de fin')
      return
    }
    setDisplayLabel(`${startDate} al ${endDate}`)
    setIsFilterModalOpen(false)
    loadStats({ startDate, endDate })
  }

  const mStats = summary?.monthly_stats

  return (
    <div className="space-y-6">
      {/* Header Banner con Patron de Marca Toffe */}
      <div className="relative rounded-3xl overflow-hidden p-6 border border-[#D4B28E] dark:border-[#9F6839]/40 shadow-sm bg-[#432414] text-[#FEE4D7]">
        <div className="absolute inset-0 opacity-15 bg-cover bg-center pointer-events-none" style={{ backgroundImage: "url('/toffe-pattern-dark.png')" }} />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#DABA8C]" />
              <span>Estadísticas Ejecutivas & Reportes</span>
            </h2>
            <p className="text-xs font-semibold text-[#DABA8C] mt-1">
              Dashboard exclusivo del dueño con ranking de ventas, productos estrella y clientes top
            </p>
          </div>

          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 text-xs font-bold text-white shadow-sm transition-all cursor-pointer shrink-0"
          >
            <Calendar className="w-4 h-4 text-[#DABA8C]" />
            <span>{displayLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#DABA8C]" />
          </button>
        </div>
      </div>

      {pageError && (
        <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span>{pageError}</span>
        </div>
      )}

      {/* Tarjetas KPI Financieras Exec */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#9F6839] dark:text-[#DABA8C] mb-2">
            <span>Ventas Totales</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">
            ${(mStats?.monthly_income || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] mt-1 font-semibold">
            Ingreso bruto facturado
          </p>
        </div>

        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#9F6839] dark:text-[#DABA8C] mb-2">
            <span>Gastos Totales</span>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-extrabold text-red-600">
            ${(mStats?.monthly_expenses || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] mt-1 font-semibold">
            Egresos del período
          </p>
        </div>

        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#9F6839] dark:text-[#DABA8C] mb-2">
            <span>Ganancia Neta</span>
            <DollarSign className="w-4 h-4 text-[#9F6839]" />
          </div>
          <div className={`text-2xl font-extrabold ${(mStats?.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            ${(mStats?.net_profit || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] mt-1 font-semibold">
            Utilidad disponible
          </p>
        </div>

        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#9F6839] dark:text-[#DABA8C] mb-2">
            <span>Tiempo Prom. Comandas</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#432414] dark:text-[#FEE4D7]">
            {mStats?.avg_prep_time_minutes > 0 ? `${Math.round(mStats.avg_prep_time_minutes)} min` : '—'}
          </div>
          <p className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] mt-1 font-semibold">
            Demora salida de comandas
          </p>
        </div>

        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#9F6839] dark:text-[#DABA8C] mb-2">
            <span className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-500" /> Mejor Vendedor
            </span>
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          {mStats?.top_seller ? (
            <div>
              <div className="text-base font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                {mStats.top_seller.username} <span className="text-[10px] bg-[#FEE4D7] dark:bg-[#34180D] px-2 py-0.5 rounded-full border border-[#D4B28E]">({mStats.top_seller.role})</span>
              </div>
              <div className="text-xs font-bold text-emerald-600 mt-1">
                ${mStats.top_seller.total_amount.toLocaleString()} ({mStats.top_seller.sales_count} ventas)
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#9F6839]">Sin ventas este mes</p>
          )}
        </div>
      </div>

      {/* Rankings Grid: Top 10 Productos Más Vendidos y Top 10 Clientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 10 Productos Más Vendidos */}
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#D4B28E]/40">
            <h3 className="text-base font-extrabold text-[#432414] dark:text-[#FEE4D7] flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <span>Top 10 Productos Más Vendidos</span>
            </h3>
            <span className="text-xs font-bold text-[#9F6839]">Por unidades vendidas</span>
          </div>

          {!mStats?.top_products || mStats.top_products.length === 0 ? (
            <p className="text-xs text-[#9F6839] font-medium py-4 text-center">No hay productos vendidos en este periodo.</p>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {mStats.top_products.slice(0, 10).map((prod, idx) => (
                <div key={prod.product_name || idx} className="p-3 rounded-2xl bg-[#FEE4D7]/20 dark:bg-[#2A150C] border border-[#D4B28E]/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-full text-white text-[11px] font-black flex items-center justify-center shrink-0 ${idx === 0 ? 'bg-amber-500 shadow-xs' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-amber-700' : 'bg-[#9F6839]'}`}>
                      #{idx + 1}
                    </span>
                    <span className="text-sm font-extrabold text-[#432414] dark:text-[#FEE4D7] truncate">{prod.product_name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-[#9F6839] dark:text-[#DABA8C] block">{prod.total_qty} ud(s)</span>
                    <span className="text-[11px] font-bold text-emerald-600">${prod.total_amount.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 10 Clientes del Periodo */}
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#D4B28E]/40">
            <h3 className="text-base font-extrabold text-[#432414] dark:text-[#FEE4D7] flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              <span>Top 10 Clientes del Periodo</span>
            </h3>
            <span className="text-xs font-bold text-[#9F6839]">Por total invertido</span>
          </div>

          {!mStats?.top_customers || mStats.top_customers.length === 0 ? (
            <p className="text-xs text-[#9F6839] font-medium py-4 text-center">No hay compras registradas con nombre de cliente este mes.</p>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {mStats.top_customers.slice(0, 10).map((c, idx) => (
                <div key={c.customer_name || idx} className="p-3 rounded-2xl bg-[#FEE4D7]/20 dark:bg-[#2A150C] border border-[#D4B28E]/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-full text-white text-[11px] font-black flex items-center justify-center shrink-0 ${idx === 0 ? 'bg-emerald-600 shadow-xs' : idx === 1 ? 'bg-emerald-500' : idx === 2 ? 'bg-teal-600' : 'bg-[#9F6839]'}`}>
                      #{idx + 1}
                    </span>
                    <span className="text-sm font-extrabold text-[#432414] dark:text-[#FEE4D7] truncate">{c.customer_name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-emerald-600 block">${c.total_spent.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-[#9F6839]">{c.orders_count} compra(s)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal / Popover de Filtro de Período y Fechas */}
      <Modal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filtrar Período & Fechas de Estadísticas"
      >
        <div className="space-y-5">
          {/* Navegación por pestañas */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#FEE4D7]/50 dark:bg-[#2E180E] border border-[#D4B28E]">
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
          </div>

          {/* TAB 1: Mes & Año (Exacto a la imagen del usuario) */}
          {activeTab === 'month_year' && (
            <div className="space-y-4 p-4 rounded-3xl bg-white dark:bg-[#150904] border border-[#D4B28E] shadow-2xs">
              {/* Selector de Año */}
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

              {/* Grid de 12 Meses */}
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

          {/* TAB 2: Rango Calendario (Fecha Inicio - Fecha Fin) */}
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

          {/* TAB 3: Opciones Rápidas */}
          {activeTab === 'preset' && (
            <div className="grid grid-cols-2 gap-3 p-1">
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
                <BarChart3 className="w-4 h-4 text-[#9F6839]" />
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
              <button
                type="button"
                onClick={() => handleSelectPreset('all', 'Histórico Total')}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] hover:bg-[#FEE4D7]/50 text-xs font-bold text-[#432414] dark:text-[#FEE4D7] text-left cursor-pointer flex items-center gap-2"
              >
                <Globe className="w-4 h-4 text-blue-600" />
                <span>Histórico Total</span>
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
