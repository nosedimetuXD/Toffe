import { useEffect, useState } from 'react'
import { api } from '../api/client'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { AVAILABLE_UNITS, convertQuantity, formatConvertedHint } from '../utils/unitConverter'
import { buildExpensePaymentMethod } from '../utils/paymentUtils'
import { useBankLines } from '../hooks/useBankLines'
import { Package, Plus, Minus, AlertTriangle, Search, Edit2, ShieldAlert, History, DollarSign, ArrowRightLeft, Trash2, CreditCard, Banknote, Smartphone, Building2 } from 'lucide-react'

export default function Inventory() {
  const { user } = useAuth()
  const userRole = (user?.role || '').toLowerCase()
  const isEmployee = userRole === 'empleado' || userRole === 'employee' || !['owner', 'admin'].includes(userRole)

  const [ingredients, setIngredients] = useState([])
  const [wasteReports, setWasteReports] = useState([])
  const [activeTab, setActiveTab] = useState('inventory')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Modal Crear / Editar Insumo
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState(null)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('L')
  const [minQuantity, setMinQuantity] = useState('5')
  const [unitCost, setUnitCost] = useState('0')
  const [addAsExpense, setAddAsExpense] = useState(false)
  const [expensePaymentMethod, setExpensePaymentMethod] = useState('efectivo')
  const [expenseCashAmount, setExpenseCashAmount] = useState('')

  const {
    lines: expenseBankLines,
    addLine: addExpenseBankLine,
    removeLine: removeExpenseBankLine,
    updateLine: updateExpenseBankLine,
    resetLines: resetExpenseBankLines
  } = useBankLines()

  // Modal Reportar Daño / Merma
  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false)
  const [wasteIngredientId, setWasteIngredientId] = useState('')
  const [wasteQuantity, setWasteQuantity] = useState('')
  const [wasteUnit, setWasteUnit] = useState('ml')
  const [wasteReason, setWasteReason] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function loadData() {
    try {
      const [ingData, wasteData] = await Promise.all([
        api.get('/ingredients'),
        api.get('/waste')
      ])

      const validIngredients = Array.isArray(ingData) ? ingData : []
      setIngredients(validIngredients)
      setWasteReports(Array.isArray(wasteData) ? wasteData : [])

      if (validIngredients.length > 0 && !wasteIngredientId) {
        setWasteIngredientId(validIngredients[0].id)
        setWasteUnit(validIngredients[0].unit === 'L' ? 'ml' : validIngredients[0].unit)
      }
    } catch (err) {
      setPageError('No se pudieron cargar los datos del inventario')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function openCreateModal() {
    if (isEmployee) return
    setEditingIngredient(null)
    setName('')
    setQuantity('')
    setUnit('L')
    setMinQuantity('5')
    setUnitCost('0')
    setAddAsExpense(false)
    setExpensePaymentMethod('efectivo')
    setExpenseCashAmount('')
    resetExpenseBankLines()
    setFormError('')
    setIsModalOpen(true)
  }

  function openEditModal(ing) {
    if (isEmployee) return
    setEditingIngredient(ing)
    setName(ing.name)
    setQuantity(String(ing.quantity))
    setUnit(ing.unit)
    setMinQuantity(String(ing.min_quantity || 5))
    setUnitCost(String(ing.unit_cost || 0))
    setAddAsExpense(false)
    setFormError('')
    setIsModalOpen(true)
  }

  function openWasteModal() {
    if (ingredients.length > 0) {
      setWasteIngredientId(ingredients[0].id)
      setWasteUnit(ingredients[0].unit === 'L' ? 'ml' : ingredients[0].unit)
    }
    setWasteQuantity('')
    setWasteReason('')
    setFormError('')
    setIsWasteModalOpen(true)
  }

  async function handleSubmitIngredient(e) {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')

    try {
      const payload = {
        name,
        quantity: Number(quantity),
        unit,
        min_quantity: Number(minQuantity),
        unit_cost: Number(unitCost) || 0
      }

      if (editingIngredient) {
        await api.put(`/ingredients/${editingIngredient.id}`, payload)
      } else {
        const createdIng = await api.post('/ingredients', payload)
        if (addAsExpense && (Number(quantity) * Number(unitCost)) > 0) {
          const totalExpenseAmount = Number(quantity) * Number(unitCost)

          const finalPaymentMethod = buildExpensePaymentMethod(expensePaymentMethod, {
            bankLines: expenseBankLines,
            cashAmount: expenseCashAmount
          })

          await api.post('/expenses', {
            description: `Compra inicial de insumo: ${name} (${quantity} ${unit})`,
            amount: totalExpenseAmount,
            category: 'insumos',
            payment_method: finalPaymentMethod,
            ingredient_id: createdIng?.id || null,
            quantity_added: 0
          })
        }
      }

      setIsModalOpen(false)
      await loadData()
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar el insumo')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteIngredient(ing) {
    if (isEmployee) return
    if (!window.confirm(`¿Estás seguro de eliminar el insumo "${ing.name}"? Se quitará de las recetas y del inventario.`)) {
      return
    }
    try {
      await api.delete(`/ingredients/${ing.id}`)
      await loadData()
    } catch (err) {
      alert(err.message || 'Error al eliminar el insumo')
    }
  }

  async function quickAdjustStock(ing, delta) {
    if (isEmployee) return
    const newQty = Math.max(0, (ing.quantity || 0) + delta)
    try {
      await api.put(`/ingredients/${ing.id}`, {
        name: ing.name,
        unit: ing.unit,
        quantity: newQty,
        min_quantity: ing.min_quantity,
        unit_cost: ing.unit_cost
      })
      await loadData()
    } catch (err) {
      alert('No se pudo ajustar el stock')
    }
  }

  const selectedWasteIng = ingredients.find((i) => i.id === wasteIngredientId)
  const convertedWasteQuantity = selectedWasteIng && Number(wasteQuantity) > 0
    ? convertQuantity(wasteQuantity, wasteUnit, selectedWasteIng.unit)
    : Number(wasteQuantity) || 0

  const estimatedWasteLoss = selectedWasteIng && convertedWasteQuantity > 0
    ? convertedWasteQuantity * (selectedWasteIng.unit_cost || 0)
    : 0

  async function handleSubmitWaste(e) {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')

    try {
      await api.post('/waste', {
        ingredient_id: wasteIngredientId,
        user_quantity: Number(wasteQuantity),
        user_unit: wasteUnit,
        reason: wasteReason
      })

      setIsWasteModalOpen(false)
      await loadData()
    } catch (err) {
      setFormError(err.message || 'No se pudo registrar el reporte de merma')
    } finally {
      setSubmitting(false)
    }
  }

  const lowStockCount = ingredients.filter((i) => i.quantity <= i.min_quantity).length
  const filteredIngredients = ingredients.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))

  if (loading) return <p className="p-4 text-sm font-semibold text-[#9F6839]">Cargando inventario...</p>

  return (
    <div className="space-y-6">
      {/* Header Page Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D4B28E]/40">
        <div>
          <h2 className="text-2xl font-black text-[#432414] dark:text-[#FEE4D7] tracking-tight">
            Control de Inventario & Reporte de Mermas
          </h2>
          <p className="text-xs font-semibold text-[#9F6839] mt-1">
            Existencias, alertas de stock mínimo, costos por unidad y registro unificado de daños
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openWasteModal}
            className="px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Reportar Daño / Merma</span>
          </button>

          {!isEmployee && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2.5 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Insumo</span>
            </button>
          )}
        </div>
      </div>

      {pageError && (
        <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
          ⚠️ {pageError}
        </div>
      )}

      {/* Alerta de Stock Bajo */}
      {lowStockCount > 0 && (
        <div className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
          <div>
            <span className="font-extrabold text-sm block">¡Alerta de Inventario Bajo!</span>
            <span>
              Tienes {lowStockCount} insumo(s) por debajo de su stock mínimo configurado.
            </span>
          </div>
        </div>
      )}

      {/* Buscador & Tabs */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9F6839]" />
          <input
            type="text"
            placeholder="Buscar insumo por nombre (ej. Café, Leche, Vaso)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 focus:border-[#9F6839] rounded-2xl pl-10 pr-3 py-2.5 text-xs font-semibold text-[#432414] dark:text-[#FEE4D7] focus:outline-none shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 border-b border-[#D4B28E]/40 pb-2 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-4 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'inventory'
                ? 'bg-[#9F6839] text-white shadow-xs'
                : 'bg-white dark:bg-[#201009] border border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7]'
            }`}
          >
            <Package className={`w-3.5 h-3.5 ${activeTab === 'inventory' ? 'text-white' : 'text-[#9F6839]'}`} />
            <span>Existencias ({ingredients.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('waste')}
            className={`px-4 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'waste'
                ? 'bg-[#9F6839] text-white shadow-xs'
                : 'bg-white dark:bg-[#201009] border border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7]'
            }`}
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${activeTab === 'waste' ? 'text-white' : 'text-amber-500'}`} />
            <span>Reportes de Mermas ({wasteReports.length})</span>
          </button>
        </div>
      </div>

      {/* Pestaña 1: Tabla de Insumos */}
      {activeTab === 'inventory' && (
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="bg-[#FEE4D7]/50 dark:bg-[#2A150C] text-[#9F6839] dark:text-[#DABA8C] uppercase tracking-wider text-[10px] border-b border-[#D4B28E]/60 font-bold">
                <tr>
                  <th className="py-3.5 px-4">Insumo</th>
                  <th className="py-3.5 px-4">Stock</th>
                  <th className="py-3.5 px-4">Costo/u</th>
                  <th className="py-3.5 px-4">Min</th>
                  <th className="py-3.5 px-4">Estado</th>
                  {!isEmployee && <th className="py-3.5 px-4 text-center">Ajuste</th>}
                  {!isEmployee && <th className="py-3.5 px-4 text-center">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4B28E]/30 text-[#432414] dark:text-[#FEE4D7]">
                {filteredIngredients.map((ing) => {
                  const isLow = ing.quantity <= ing.min_quantity
                  return (
                    <tr key={ing.id} className={isLow ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                      <td className="py-3.5 px-4 font-bold">{ing.name}</td>
                      <td className="py-3.5 px-4 font-extrabold text-sm">
                        {ing.quantity} <span className="text-xs font-semibold text-[#9F6839]">{ing.unit}</span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-600">
                        ${(ing.unit_cost || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-[#9F6839]">{ing.min_quantity}</td>
                      <td className="py-3.5 px-4">
                        {isLow ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 text-[10px] font-bold">¡Alerta!</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold">OK</span>
                        )}
                      </td>
                      {!isEmployee && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => quickAdjustStock(ing, -1)} className="p-1 rounded bg-[#FEE4D7] text-[#9F6839]"><Minus className="w-3 h-3" /></button>
                            <button onClick={() => quickAdjustStock(ing, 1)} className="p-1 rounded bg-[#FEE4D7] text-[#9F6839]"><Plus className="w-3 h-3" /></button>
                          </div>
                        </td>
                      )}
                      {!isEmployee && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openEditModal(ing)}
                              className="p-2 rounded-xl text-[#9F6839] hover:bg-[#FEE4D7] dark:hover:bg-[#2E180E] transition-colors cursor-pointer"
                              title="Editar insumo"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteIngredient(ing)}
                              className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                              title="Eliminar insumo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {filteredIngredients.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-[#9F6839] font-medium">
                      No se encontraron insumos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pestaña 2: Historial de Reportes de Mermas */}
      {activeTab === 'waste' && (
        <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-[#FEE4D7]/50 dark:bg-[#2A150C] text-[#9F6839] dark:text-[#DABA8C] uppercase tracking-wider text-[10px] border-b border-[#D4B28E]/60 font-bold">
                <tr>
                  <th className="py-3.5 px-4">Fecha / Hora</th>
                  <th className="py-3.5 px-4">Insumo</th>
                  <th className="py-3.5 px-4">Cantidad Reportada</th>
                  <th className="py-3.5 px-4">Descontado del Stock</th>
                  <th className="py-3.5 px-4 text-right">Pérdida Estimada ($)</th>
                  <th className="py-3.5 px-4">Motivo del Daño</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4B28E]/30 text-[#432414] dark:text-[#FEE4D7]">
                {wasteReports.map((w) => (
                  <tr key={w.id}>
                    <td className="py-3.5 px-4 font-semibold text-[#9F6839]">
                      {new Date(w.created_at).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-bold">{w.ingredient_name || 'Insumo'}</td>
                    <td className="py-3.5 px-4 font-extrabold text-amber-700 dark:text-amber-300">
                      {w.user_quantity} {w.user_unit}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-red-600">
                      -{w.quantity_used} {w.ingredient_unit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-red-600 text-sm">
                      -${(w.estimated_loss || 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 italic text-[#9F6839] dark:text-[#DABA8C]">{w.reason}</td>
                  </tr>
                ))}
                {wasteReports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[#9F6839] font-medium">
                      No hay mermas reportadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Reportar Daño / Merma */}
      <Modal isOpen={isWasteModalOpen} onClose={() => setIsWasteModalOpen(false)} title="Reportar Daño o Pérdida">
        <form onSubmit={handleSubmitWaste} className="space-y-4">
          {formError && (
            <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
              ⚠️ {formError}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">Insumo Afectado</label>
            <select
              value={wasteIngredientId}
              onChange={(e) => setWasteIngredientId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            >
              {ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <input type="number" step="0.01" value={wasteQuantity} onChange={(e) => setWasteQuantity(e.target.value)} placeholder="Cantidad" required className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-[#D4B28E]" />
             <select value={wasteUnit} onChange={(e) => setWasteUnit(e.target.value)} className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-[#D4B28E]">
                {AVAILABLE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
             </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">Motivo / Razón del Daño</label>
            <textarea
              value={wasteReason}
              onChange={(e) => setWasteReason(e.target.value)}
              placeholder="Ej. Se venció la leche, empaque roto, derrame accidental..."
              required
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>
          {estimatedWasteLoss > 0 && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 flex items-center justify-between text-xs">
              <span className="font-extrabold text-red-800 dark:text-red-300">Pérdida Financiera Estimada:</span>
              <strong className="text-sm font-black text-red-600">-${estimatedWasteLoss.toLocaleString()}</strong>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-3">
            <button type="button" onClick={() => setIsWasteModalOpen(false)} className="px-4 py-2.5 rounded-2xl bg-white border border-[#D4B28E] text-xs font-bold">Cancelar</button>
            <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-md">
              {submitting ? 'Registrando...' : 'Registrar Pérdida'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Crear / Editar Insumo */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingIngredient ? 'Editar Insumo' : 'Nuevo Insumo'}>
        <form onSubmit={handleSubmitIngredient} className="space-y-4">
          {formError && (
            <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
              ⚠️ {formError}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">Nombre del Insumo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Leche Entera 1L" required className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7] placeholder-[#9F6839]/60 dark:placeholder-[#DABA8C]/60" />
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div>
               <label className="block text-[11px] font-bold text-[#432414] dark:text-[#DABA8C] uppercase mb-1">Cantidad Inicial</label>
               <input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Cantidad" required className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7] placeholder-[#9F6839]/60 dark:placeholder-[#DABA8C]/60" />
             </div>
             <div>
               <label className="block text-[11px] font-bold text-[#432414] dark:text-[#DABA8C] uppercase mb-1">Unidad Medida</label>
               <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]">
                  {AVAILABLE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
               </select>
             </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div>
               <label className="block text-[11px] font-bold text-[#432414] dark:text-[#DABA8C] uppercase mb-1">Costo Unitario ($)</label>
               <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Costo por unidad" required className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7] placeholder-[#9F6839]/60 dark:placeholder-[#DABA8C]/60" />
             </div>
             <div>
               <label className="block text-[11px] font-bold text-[#432414] dark:text-[#DABA8C] uppercase mb-1">Stock Mínimo Alerta</label>
               <input type="number" step="0.01" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} placeholder="Stock Mínimo" required className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7] placeholder-[#9F6839]/60 dark:placeholder-[#DABA8C]/60" />
             </div>
          </div>

          {!editingIngredient && (
            <div className="p-3.5 rounded-2xl bg-[#FEE4D7]/50 dark:bg-[#2E180E] border border-[#D4B28E] space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="addAsExpense"
                  checked={addAsExpense}
                  onChange={(e) => setAddAsExpense(e.target.checked)}
                  className="w-4 h-4 text-[#9F6839] accent-[#9F6839] rounded cursor-pointer"
                />
                <label htmlFor="addAsExpense" className="text-xs font-bold text-[#432414] dark:text-[#FEE4D7] cursor-pointer select-none">
                  Registrar compra inicial como gasto en Contabilidad (${(Number(quantity || 0) * Number(unitCost || 0)).toLocaleString()})
                </label>
              </div>

              {addAsExpense && (
                <div className="pt-2 border-t border-[#D4B28E]/40 space-y-3">
                  <div>
                    <label className="block text-[11px] font-extrabold text-[#9F6839] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
                      Forma de Pago del Gasto
                    </label>
                    <select
                      value={expensePaymentMethod}
                      onChange={(e) => setExpensePaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7]"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="mixto">Pago Mixto</option>
                    </select>
                  </div>

                  <datalist id="bankSuggestions">
                    <option value="Bre-B/Llave" />
                    <option value="Nequi" />
                    <option value="Bancolombia" />
                    <option value="Daviplata" />
                    <option value="Mercado Pago" />
                    <option value="Nu" />
                  </datalist>

                  {expensePaymentMethod === 'mixto' && (
                    <div>
                      <label className="block text-[10px] font-extrabold text-[#9F6839] dark:text-[#DABA8C] uppercase mb-1">
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

                  {(expensePaymentMethod === 'transferencia' || expensePaymentMethod === 'mixto') && (
                    <div className="p-3 rounded-xl bg-white/60 dark:bg-[#150904] border border-[#D4B28E] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-[#9F6839] flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" /> Desglose de Bancos
                        </span>
                        <button
                          type="button"
                          onClick={addExpenseBankLine}
                          className="text-[11px] font-bold text-[#9F6839] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Agregar otro banco
                        </button>
                      </div>

                      {expenseBankLines.map((line, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            list="bankSuggestions"
                            value={line.bank}
                            onChange={(e) => updateExpenseBankLine(idx, 'bank', e.target.value)}
                            placeholder="Banco (ej. Nequi, Bre-B/Llave)"
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#D4B28E] text-xs font-semibold"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.amount}
                            onChange={(e) => updateExpenseBankLine(idx, 'amount', e.target.value)}
                            placeholder={expenseBankLines.length > 1 ? "Monto ($)" : "Monto opcional"}
                            className="w-28 px-2.5 py-1.5 rounded-lg border border-[#D4B28E] text-xs font-semibold"
                          />
                          {expenseBankLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeExpenseBankLine(idx)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar línea"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7] hover:bg-[#FEE4D7]/40 dark:hover:bg-[#2E180E] transition-colors cursor-pointer">Cancelar</button>
            <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50">
              {submitting ? 'Guardando...' : editingIngredient ? 'Actualizar' : 'Crear Insumo'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}