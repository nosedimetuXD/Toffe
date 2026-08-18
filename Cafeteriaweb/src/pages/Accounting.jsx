import { useEffect, useState, useMemo } from 'react'
import { api } from '../api/client'
import Modal from '../components/Modal'
import { AVAILABLE_UNITS, convertQuantity, formatConvertedHint } from '../utils/unitConverter'
import { buildExpensePaymentMethod } from '../utils/paymentUtils'
import { useBankLines } from '../hooks/useBankLines'
import {
  DollarSign,
  Plus,
  TrendingUp,
  TrendingDown,
  Calendar,
  Wallet,
  Package,
  Zap,
  Wrench,
  User,
  FileText,
  Banknote,
  Smartphone,
  CreditCard,
  ArrowUpDown,
  CircleDot,
  Building2,
  RefreshCw,
  ShieldAlert,
  ArrowRightLeft,
  Award,
  Users
} from 'lucide-react'

export default function Accounting() {
  const [expenses, setExpenses] = useState([])
  const [sales, setSales] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [wasteReports, setWasteReports] = useState([])
  const [period, setPeriod] = useState('month')
  const [activeTab, setActiveTab] = useState('sales')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Modal Registrar Gasto
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('insumos')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [expenseCashAmount, setExpenseCashAmount] = useState('')
  const [ingredientId, setIngredientId] = useState('')
  const [quantityAdded, setQuantityAdded] = useState('')
  const [addedUnit, setAddedUnit] = useState('ml')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const {
    lines: expenseBankLines,
    addLine: addExpenseBankLine,
    removeLine: removeExpenseBankLine,
    updateLine: updateExpenseBankLine,
    resetLines: resetExpenseBankLines
  } = useBankLines()

  async function loadData() {
    setLoading(true)
    setPageError('')
    try {
      const [expData, ingData, salesData, wasteData] = await Promise.all([
        api.get('/expenses?period=all').catch(() => []),
        api.get('/ingredients').catch(() => []),
        api.get('/sales?period=all').catch(() => []),
        api.get('/waste').catch(() => [])
      ])
      setExpenses(Array.isArray(expData) ? expData : [])
      setIngredients(Array.isArray(ingData) ? ingData : [])
      setSales(Array.isArray(salesData) ? salesData : [])
      setWasteReports(Array.isArray(wasteData) ? wasteData : [])
    } catch (err) {
      console.error('Error cargando contabilidad:', err)
      setPageError('No se pudo cargar la información de contabilidad')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function openCreateModal() {
    setDescription('')
    setAmount('')
    setCategory('insumos')
    setPaymentMethod('efectivo')
    setExpenseCashAmount('')
    resetExpenseBankLines()
    setIngredientId('')
    setQuantityAdded('')
    setAddedUnit('ml')
    setFormError('')
    setIsModalOpen(true)
  }

  const selectedAddedIng = ingredients.find((i) => i.id === ingredientId)
  const convertedAddedQuantity = selectedAddedIng && Number(quantityAdded) > 0
    ? convertQuantity(quantityAdded, addedUnit, selectedAddedIng.unit)
    : Number(quantityAdded) || 0

  async function handleCreateExpense(e) {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')

    try {
      const finalPaymentMethod = buildExpensePaymentMethod(paymentMethod, {
        bankLines: expenseBankLines,
        cashAmount: expenseCashAmount
      })

      await api.post('/expenses', {
        description,
        amount: Number(amount) || 0,
        category,
        payment_method: finalPaymentMethod,
        ingredient_id: category === 'insumos' && ingredientId ? ingredientId : null,
        quantity_added: category === 'insumos' && ingredientId ? convertedAddedQuantity : 0
      })

      setIsModalOpen(false)
      await loadData()
    } catch (err) {
      setFormError(err.message || 'No se pudo registrar el gasto')
    } finally {
      setSubmitting(false)
    }
  }

  const categoryBadges = {
    insumos: { label: 'Insumos', style: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
    servicios: { label: 'Servicios', style: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
    mantenimiento: { label: 'Mantenimiento', style: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
    nomina: { label: 'Nómina', style: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
    otros: { label: 'Otros', style: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' }
  }

  const paymentBadges = {
    efectivo: { label: 'Efectivo', style: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
    transferencia: { label: 'Transferencia', style: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
    mixto: { label: 'Pago Mixto', style: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' }
  }

  const safeSales = Array.isArray(sales) ? sales : []
  const safeExpenses = Array.isArray(expenses) ? expenses : []

  // Filtro de ventas por zona horaria local de navegador
  const filteredSales = useMemo(() => {
    return safeSales.filter((s) => {
      if (!s || !s.created_at) return true
      const saleDate = new Date(s.created_at)
      if (isNaN(saleDate.getTime())) return true
      const now = new Date()

      if (period === 'today') {
        return saleDate.toDateString() === now.toDateString()
      }
      if (period === 'week') {
        const startOfWeek = new Date()
        startOfWeek.setDate(now.getDate() - 7)
        startOfWeek.setHours(0, 0, 0, 0)
        return saleDate >= startOfWeek
      }
      if (period === 'month') {
        return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear()
      }
      return true
    })
  }, [safeSales, period])

  // Filtro de egresos por zona horaria local de navegador
  const filteredExpenses = useMemo(() => {
    return safeExpenses.filter((e) => {
      if (!e || !e.created_at) return true
      const expDate = new Date(e.created_at)
      if (isNaN(expDate.getTime())) return true
      const now = new Date()

      if (period === 'today') {
        return expDate.toDateString() === now.toDateString()
      }
      if (period === 'week') {
        const startOfWeek = new Date()
        startOfWeek.setDate(now.getDate() - 7)
        startOfWeek.setHours(0, 0, 0, 0)
        return expDate >= startOfWeek
      }
      if (period === 'month') {
        return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear()
      }
      return true
    })
  }, [safeExpenses, period])

  // Filtro de mermas por periodo
  const filteredWaste = useMemo(() => {
    return (Array.isArray(wasteReports) ? wasteReports : []).filter((w) => {
      if (!w || !w.created_at) return true
      const wDate = new Date(w.created_at)
      if (isNaN(wDate.getTime())) return true
      const now = new Date()

      if (period === 'today') {
        return wDate.toDateString() === now.toDateString()
      }
      if (period === 'week') {
        const startOfWeek = new Date()
        startOfWeek.setDate(now.getDate() - 7)
        startOfWeek.setHours(0, 0, 0, 0)
        return wDate >= startOfWeek
      }
      if (period === 'month') {
        return wDate.getMonth() === now.getMonth() && wDate.getFullYear() === now.getFullYear()
      }
      return true
    })
  }, [wasteReports, period])

  const totalWasteLoss = useMemo(() => {
    return filteredWaste.reduce((sum, w) => {
      const loss = Number(w.estimated_loss) || (Number(w.quantity_lost) * Number(w.unit_cost || 0))
      return sum + loss
    }, 0)
  }, [filteredWaste])

  // Resumen dinámico sincronizado
  const summary = useMemo(() => {
    let totalIncome = 0
    let cashIncome = 0
    let transferIncome = 0

    filteredSales.forEach((s) => {
      const tot = Number(s.total) || 0
      totalIncome += tot
      cashIncome += Number(s.cash_amount) || 0
      transferIncome += Number(s.transfer_amount) || 0
    })

    let totalExpenses = 0
    filteredExpenses.forEach((e) => {
      totalExpenses += Number(e.amount) || 0
    })

    return {
      total_income: totalIncome,
      sales_count: filteredSales.length,
      total_expenses: totalExpenses,
      expenses_count: filteredExpenses.length,
      net_balance: totalIncome - totalExpenses - totalWasteLoss,
      income_by_payment_method: {
        efectivo: cashIncome,
        transferencia: transferIncome
      }
    }
  }, [filteredSales, filteredExpenses, totalWasteLoss])

  const combinedMovements = useMemo(() => {
    return [
      ...filteredSales.map((s) => ({
        id: s.id || Math.random().toString(),
        type: 'income',
        date: s.created_at || new Date().toISOString(),
        concept: `Venta - ${s.customer_name || 'Cliente General'}`,
        details: `${s.sold_by_username ? `Vendido por ${s.sold_by_username}` : 'Venta POS'}${s.bank_details ? ` (${s.bank_details})` : ''}`,
        paymentMethod: s.payment_method || 'efectivo',
        amount: Number(s.total) || 0
      })),
      ...filteredExpenses.map((e) => ({
        id: e.id || Math.random().toString(),
        type: 'expense',
        date: e.created_at || new Date().toISOString(),
        concept: e.description || 'Gasto registrado',
        details: e.registerer_name ? `Registrado por ${e.registerer_name}` : 'Gasto operativo',
        paymentMethod: e.payment_method || 'efectivo',
        amount: Number(e.amount) || 0
      })),
      ...filteredWaste.map((w) => ({
        id: w.id || Math.random().toString(),
        type: 'waste',
        date: w.created_at || new Date().toISOString(),
        concept: `Merma / Daño: ${w.ingredient_name || 'Insumo'} (-${w.quantity_lost} ${w.unit || ''})`,
        details: `Motivo: ${w.reason || 'Daño'} | Reportado por ${w.reporter_name || 'Personal'}`,
        paymentMethod: 'pérdida de inventario',
        amount: Number(w.estimated_loss) || (Number(w.quantity_lost) * Number(w.unit_cost || 0))
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [filteredSales, filteredExpenses, filteredWaste])

  // Ranking Top 5 Bancos / Entidades más usados
  const topBanksRanking = useMemo(() => {
    const bankStats = {} // bankName -> { count, total }

    filteredSales.forEach((s) => {
      if (!s) return
      if (s.bank_details && typeof s.bank_details === 'string' && s.bank_details.trim()) {
        const parts = s.bank_details.split('|')
        parts.forEach((part) => {
          if (!part) return
          const subParts = part.split(':')
          if (subParts.length >= 2) {
            const bName = subParts[0].trim()
            const bAmountStr = subParts[1].replace(/[^0-9]/g, '')
            const bAmount = Number(bAmountStr) || 0

            if (bName) {
              if (!bankStats[bName]) bankStats[bName] = { count: 0, total: 0 }
              bankStats[bName].count += 1
              bankStats[bName].total += bAmount
            }
          }
        })
      } else if (s.payment_method === 'transferencia') {
        const bName = 'Transferencia General'
        if (!bankStats[bName]) bankStats[bName] = { count: 0, total: 0 }
        bankStats[bName].count += 1
        bankStats[bName].total += (Number(s.transfer_amount) || Number(s.total) || 0)
      }
    })

    const sorted = Object.entries(bankStats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count || b.total - a.total)

    const maxCount = sorted.length > 0 ? sorted[0].count : 1

    return sorted.slice(0, 5).map((item) => ({
      ...item,
      percentage: Math.round((item.count / maxCount) * 100)
    }))
  }, [filteredSales])

  // Top 10 Clientes que más han comprado
  const top10Customers = useMemo(() => {
    const custMap = {}
    filteredSales.forEach((s) => {
      const name = (s.customer_name || '').trim()
      if (name && name.toLowerCase() !== 'cliente general') {
        if (!custMap[name]) custMap[name] = { name, count: 0, total: 0 }
        custMap[name].count += 1
        custMap[name].total += Number(s.total) || 0
      }
    })
    const sorted = Object.values(custMap).sort((a, b) => b.total - a.total).slice(0, 10)
    const maxTotal = sorted.length > 0 ? sorted[0].total : 1
    return sorted.map((c) => ({ ...c, percentage: Math.round((c.total / maxTotal) * 100) }))
  }, [filteredSales])

  // Top 10 Productos Más Vendidos
  const top10Products = useMemo(() => {
    const prodMap = {}
    filteredSales.forEach((s) => {
      if (Array.isArray(s.items)) {
        s.items.forEach((item) => {
          const pName = item.product_name || 'Producto'
          const qty = Number(item.quantity) || 0
          const unitPrice = Number(item.unit_price) || 0
          if (!prodMap[pName]) prodMap[pName] = { name: pName, qty: 0, total: 0 }
          prodMap[pName].qty += qty
          prodMap[pName].total += qty * unitPrice
        })
      }
    })
    const sorted = Object.values(prodMap).sort((a, b) => b.qty - a.qty).slice(0, 10)
    const maxQty = sorted.length > 0 ? sorted[0].qty : 1
    return sorted.map((p) => ({ ...p, percentage: Math.round((p.qty / maxQty) * 100) }))
  }, [filteredSales])

  if (loading) {
    return (
      <div className="p-8 text-center space-y-3">
        <RefreshCw className="w-6 h-6 text-[#9F6839] animate-spin mx-auto" />
        <p className="text-sm font-semibold text-[#9F6839]">Cargando contabilidad...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Banner con Fondo de Marca Oficial Toffe */}
      <div className="relative rounded-3xl overflow-hidden p-6 border border-[#D4B28E] dark:border-[#9F6839]/40 shadow-sm bg-[#432414] text-[#FEE4D7]">
        <div className="absolute inset-0 opacity-20 dark:opacity-25 bg-cover bg-center pointer-events-none" style={{ backgroundImage: "url('/toffe-pattern-dark.png')" }} />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>Contabilidad & Balance Financiero</span>
            </h2>
            <p className="text-xs font-semibold text-[#DABA8C] mt-1">
              Registro unificado de ventas, ingresos, egresos y flujo de caja en Toffe Coffee
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
              <Calendar className="w-3.5 h-3.5 text-[#DABA8C]" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-transparent text-xs font-bold text-white cursor-pointer outline-none"
              >
                <option value="today" className="text-black">Hoy</option>
                <option value="week" className="text-black">Esta Semana</option>
                <option value="month" className="text-black">Este Mes</option>
                <option value="all" className="text-black">Histórico Total</option>
              </select>
            </div>

            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white font-extrabold text-xs shadow-md cursor-pointer transition-all border border-white/20"
            >
              <Plus className="w-4 h-4" /> Registrar Gasto
            </button>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center justify-between">
          <span>⚠️ {pageError}</span>
          <button onClick={loadData} className="px-3 py-1 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 text-xs font-extrabold">
            Reintentar
          </button>
        </div>
      )}

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9F6839] dark:text-[#DABA8C] text-xs font-bold mb-2">
            <span>Ingresos Totales</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">
            ${(Number(summary.total_income) || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] mt-1 font-semibold">
            Ventas realizadas: {summary.sales_count || 0}
          </p>
        </div>

        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9F6839] dark:text-[#DABA8C] text-xs font-bold mb-2">
            <span>Gastos Registrados</span>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-extrabold text-red-600">
            ${(Number(summary.total_expenses) || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] mt-1 font-semibold">
            Egresos cargados: {summary.expenses_count || 0}
          </p>
        </div>

        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9F6839] dark:text-[#DABA8C] text-xs font-bold mb-2">
            <span>Pérdidas por Mermas</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600">
            ${(totalWasteLoss || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] mt-1 font-semibold">
            {filteredWaste.length} reportes de daños
          </p>
        </div>

        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9F6839] dark:text-[#DABA8C] text-xs font-bold mb-2">
            <span>Balance Neto Real</span>
            <DollarSign className="w-4 h-4 text-[#9F6839]" />
          </div>
          <div className={`text-2xl font-extrabold ${(Number(summary.net_balance) || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            ${(Number(summary.net_balance) || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#9F6839] dark:text-[#DABA8C] mt-1 font-semibold">
            Ingresos - Gastos - Mermas
          </p>
        </div>

        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-[#9F6839] dark:text-[#DABA8C] text-xs font-bold mb-2">
            <span>Métodos de Pago</span>
            <Wallet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="space-y-2 mt-1 text-[#432414] dark:text-[#FEE4D7]">
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1.5 font-bold text-xs min-w-0 truncate">
                <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">Efectivo</span>
              </span>
              <strong className="text-xs font-extrabold text-emerald-600 shrink-0">
                ${(Number(summary.income_by_payment_method.efectivo) || 0).toLocaleString()}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1.5 font-bold text-xs min-w-0 truncate">
                <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">Transfer.</span>
              </span>
              <strong className="text-xs font-extrabold text-blue-600 shrink-0">
                ${(Number(summary.income_by_payment_method.transferencia) || 0).toLocaleString()}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Ranking Top 5 Bancos / Entidades Más Usados */}
      <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#D4B28E]/40">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#9F6839]" />
            <h3 className="text-base font-extrabold text-[#432414] dark:text-[#FEE4D7]">
              Ranking Top 5 Bancos / Entidades Más Usados
            </h3>
          </div>
          <span className="text-xs font-bold text-[#9F6839]">
            Basado en transferencias recibidas
          </span>
        </div>

        {topBanksRanking.length === 0 ? (
          <p className="text-xs text-[#9F6839] font-medium py-3 text-center">
            No hay transferencias ni pagos digitales registrados en este periodo.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {topBanksRanking.map((bank, index) => (
              <div
                key={bank.name}
                className="p-3.5 rounded-2xl bg-[#FEE4D7]/30 dark:bg-[#2A150C] border border-[#D4B28E]/50 space-y-2 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] flex items-center gap-1.5 truncate">
                    <span className="w-5 h-5 rounded-full bg-[#9F6839] text-white text-[10px] flex items-center justify-center font-black shrink-0">
                      #{index + 1}
                    </span>
                    <span className="truncate">{bank.name}</span>
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#9F6839] font-bold">
                    <span>{bank.count} {bank.count === 1 ? 'pago' : 'pagos'}</span>
                    <span className="text-[#432414] dark:text-[#FEE4D7] font-extrabold">${(Number(bank.total) || 0).toLocaleString()}</span>
                  </div>

                  <div className="w-full h-1.5 bg-[#D4B28E]/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#9F6839] rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(10, bank.percentage)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pestañas (Ingresos / Gastos / Flujo Combinado) */}
      <div className="flex items-center gap-2 border-b border-[#D4B28E]/40 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'sales'
              ? 'bg-[#9F6839] text-white shadow-xs'
              : 'bg-white dark:bg-[#201009] border border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          <span>Ingresos por Ventas</span>
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'expenses'
              ? 'bg-[#9F6839] text-white shadow-xs'
              : 'bg-white dark:bg-[#201009] border border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7]'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5 text-red-500" />
          <span>Gastos & Egresos</span>
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-[#9F6839] text-white shadow-xs'
              : 'bg-white dark:bg-[#201009] border border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7]'
          }`}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-[#9F6839]" />
          <span>Flujo de Caja Combinado</span>
        </button>
      </div>

      {/* Pestaña 1: Ingresos por Ventas */}
      {activeTab === 'sales' && (
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="bg-[#FEE4D7]/50 dark:bg-[#2A150C] text-[#9F6839] dark:text-[#DABA8C] uppercase tracking-wider text-[10px] border-b border-[#D4B28E]/60 font-bold">
                <tr>
                  <th className="py-3.5 px-4">Fecha / Hora</th>
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Método de Pago & Entidad</th>
                  <th className="py-3.5 px-4">Vendido Por</th>
                  <th className="py-3.5 px-4 text-right">Monto Ingresado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4B28E]/30 text-[#432414] dark:text-[#FEE4D7]">
                {filteredSales.map((s) => {
                  const pBadge = paymentBadges[s.payment_method] || paymentBadges.efectivo
                  const amt = Number(s.total) || 0
                  return (
                    <tr key={s.id || Math.random()}>
                      <td className="py-3.5 px-4 font-semibold">{s.created_at ? new Date(s.created_at).toLocaleString() : '—'}</td>
                      <td className="py-3.5 px-4 font-bold">{s.customer_name || 'Cliente General'}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className={`px-2.5 py-0.5 rounded-full font-extrabold text-[10px] w-max uppercase tracking-wider ${pBadge.style}`}>
                            {pBadge.label}
                          </span>
                          {s.bank_details && (
                            <span className="text-[10px] text-[#9F6839] dark:text-[#DABA8C] font-bold">
                              {s.bank_details}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">{s.sold_by_username || 'Vendedor'}</td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-emerald-600 text-sm">
                        +${amt.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-[#9F6839] font-medium">
                      No hay ingresos registrados en este periodo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pestaña 2: Gastos Registrados */}
      {activeTab === 'expenses' && (
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="bg-[#FEE4D7]/50 dark:bg-[#2A150C] text-[#9F6839] dark:text-[#DABA8C] uppercase tracking-wider text-[10px] border-b border-[#D4B28E]/60 font-bold">
                <tr>
                  <th className="py-3.5 px-4">Fecha</th>
                  <th className="py-3.5 px-4">Descripción</th>
                  <th className="py-3.5 px-4">Categoría</th>
                  <th className="py-3.5 px-4">Forma Pago</th>
                  <th className="py-3.5 px-4">Insumo Asociado</th>
                  <th className="py-3.5 px-4 text-right">Monto Erogado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4B28E]/30 text-[#432414] dark:text-[#FEE4D7]">
                {filteredExpenses.map((exp) => {
                  const catBadge = categoryBadges[exp.category] || categoryBadges.otros
                  const amt = Number(exp.amount) || 0
                  return (
                    <tr key={exp.id || Math.random()}>
                      <td className="py-3.5 px-4 font-semibold">{exp.created_at ? new Date(exp.created_at).toLocaleDateString() : '—'}</td>
                      <td className="py-3.5 px-4 font-bold">{exp.description || 'Gasto'}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full font-extrabold text-[10px] uppercase tracking-wider ${catBadge.style}`}>
                          {catBadge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold">
                        {exp.payment_method === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                      </td>
                      <td className="py-3.5 px-4">
                        {exp.ingredient_name ? (
                          <span className="text-emerald-600 font-bold text-xs">
                            + {exp.quantity_added} unidades de {exp.ingredient_name}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-red-600 text-sm">
                        -${amt.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[#9F6839] font-medium">
                      No hay gastos registrados en este periodo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pestaña 3: Flujo de Caja Combinado */}
      {activeTab === 'all' && (
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="bg-[#FEE4D7]/50 dark:bg-[#2A150C] text-[#9F6839] dark:text-[#DABA8C] uppercase tracking-wider text-[10px] border-b border-[#D4B28E]/60 font-bold">
                <tr>
                  <th className="py-3.5 px-4">Fecha / Hora</th>
                  <th className="py-3.5 px-4">Tipo</th>
                  <th className="py-3.5 px-4">Concepto / Cliente</th>
                  <th className="py-3.5 px-4">Detalles</th>
                  <th className="py-3.5 px-4 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4B28E]/30 text-[#432414] dark:text-[#FEE4D7]">
                {combinedMovements.map((m) => (
                  <tr key={m.id || Math.random()} className={m.type === 'income' ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : m.type === 'expense' ? 'bg-red-50/30 dark:bg-red-950/20' : 'bg-amber-50/30 dark:bg-amber-950/20'}>
                    <td className="py-3.5 px-4 font-semibold">{m.date ? new Date(m.date).toLocaleString() : '—'}</td>
                    <td className="py-3.5 px-4">
                      {m.type === 'income' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px] uppercase tracking-wider inline-flex items-center gap-1">
                          <CircleDot className="w-3 h-3 text-emerald-600" /> Ingreso
                        </span>
                      ) : m.type === 'expense' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-extrabold text-[10px] uppercase tracking-wider inline-flex items-center gap-1">
                          <CircleDot className="w-3 h-3 text-red-600" /> Gasto
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[10px] uppercase tracking-wider inline-flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 text-amber-600" /> Pérdida/Merma
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-bold">{m.concept}</td>
                    <td className="py-3.5 px-4 text-[#9F6839] dark:text-[#DABA8C]">{m.details}</td>
                    <td className={`py-3.5 px-4 text-right font-extrabold text-sm ${m.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {m.type === 'income' ? `+$${(Number(m.amount) || 0).toLocaleString()}` : `-$${(Number(m.amount) || 0).toLocaleString()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Registrar Gasto */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Registrar Nuevo Gasto / Egreso">
        <form onSubmit={handleCreateExpense} className="space-y-4">
          {formError && (
            <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
              ⚠️ {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Descripción del Gasto
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Compra de 5kg Café en Grano / Servicio de Luz"
              required
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
                Monto ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
                Forma de Pago
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="mixto">Pago Mixto</option>
              </select>
            </div>
          </div>

          <datalist id="expenseBankSuggestions">
            <option value="Bre-B/Llave" />
            <option value="Nequi" />
            <option value="Bancolombia" />
            <option value="Daviplata" />
            <option value="Mercado Pago" />
            <option value="Nu" />
          </datalist>

          {paymentMethod === 'mixto' && (
            <div className="p-3 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2E180E] border border-[#D4B28E]">
              <label className="block text-xs font-extrabold text-[#9F6839] dark:text-[#DABA8C] uppercase mb-1">
                Monto abonado en Efectivo ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={expenseCashAmount}
                onChange={(e) => setExpenseCashAmount(e.target.value)}
                placeholder="Ej. 10000"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold text-[#432414] dark:text-[#FEE4D7]"
              />
            </div>
          )}

          {(paymentMethod === 'transferencia' || paymentMethod === 'mixto') && (
            <div className="p-3.5 rounded-2xl bg-[#FEE4D7]/50 dark:bg-[#2E180E] border border-[#D4B28E] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#9F6839]" />
                  Desglose de Transferencias / Bancos
                </span>
                <button
                  type="button"
                  onClick={addExpenseBankLine}
                  className="text-xs font-bold text-[#9F6839] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar otro banco
                </button>
              </div>

              {expenseBankLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    list="expenseBankSuggestions"
                    value={line.bank}
                    onChange={(e) => updateExpenseBankLine(idx, 'bank', e.target.value)}
                    placeholder="Banco / Entidad (ej. Nequi, Bre-B/Llave)"
                    className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold text-[#432414] dark:text-[#FEE4D7]"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.amount}
                    onChange={(e) => updateExpenseBankLine(idx, 'amount', e.target.value)}
                    placeholder={expenseBankLines.length > 1 ? "Monto ($)" : "Monto opcional ($)"}
                    className="w-32 px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold text-[#432414] dark:text-[#FEE4D7]"
                  />
                  {expenseBankLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExpenseBankLine(idx)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                      title="Eliminar línea de banco"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            >
              <option value="insumos">Insumos / Materia Prima</option>
              <option value="servicios">Servicios Básicos</option>
              <option value="mantenimiento">Mantenimiento & Equipos</option>
              <option value="nomina">Nómina & Empleados</option>
              <option value="otros">Otros Gastos</option>
            </select>
          </div>

          {category === 'insumos' && (
            <div className="p-3.5 rounded-2xl bg-[#FEE4D7]/50 dark:bg-[#2E180E] border border-[#D4B28E] space-y-3">
              <span className="block text-xs font-bold text-[#9F6839] dark:text-[#DABA8C]">
                Reabastecer Inventario (Opcional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={ingredientId}
                  onChange={(e) => {
                    const id = e.target.value
                    setIngredientId(id)
                    const ing = ingredients.find((i) => i.id === id)
                    if (ing) {
                      setAddedUnit(ing.unit === 'L' ? 'ml' : ing.unit)
                    }
                  }}
                  className="sm:col-span-1 w-full px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold"
                >
                  <option value="">No sumar a inventario</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} (Stock: {ing.quantity} {ing.unit})
                    </option>
                  ))}
                </select>

                {ingredientId && (
                  <>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={quantityAdded}
                      onChange={(e) => setQuantityAdded(e.target.value)}
                      placeholder="Cantidad a sumar"
                      required
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold"
                    />

                    <select
                      value={addedUnit}
                      onChange={(e) => setAddedUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-bold"
                    >
                      {AVAILABLE_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              {selectedAddedIng && formatConvertedHint(quantityAdded, addedUnit, selectedAddedIng.unit) && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
                  <span>
                    Conversión automática: <strong>{formatConvertedHint(quantityAdded, addedUnit, selectedAddedIng.unit)}</strong> (se sumará al stock base en {selectedAddedIng.unit}).
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 rounded-2xl bg-white dark:bg-[#201009] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Registrar Gasto'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
