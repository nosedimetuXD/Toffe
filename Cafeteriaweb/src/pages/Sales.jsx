import { useEffect, useState, useMemo } from 'react'
import { api } from '../api/client'
import Modal from '../components/Modal'
import confetti from 'canvas-confetti'
import { processImageUrl } from '../utils/imageUtils'
import { bankDetailsString, createBankLine } from '../utils/paymentUtils'
import { useBankLines } from '../hooks/useBankLines'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Coffee,
  ShoppingBag,
  Utensils,
  Bike,
  Heart,
  CheckCircle2,
  Image as ImageIcon,
  Banknote,
  Smartphone,
  CreditCard,
  Building2,
  AlertCircle
} from 'lucide-react'

const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80'

const COMMON_BANKS = ['Bre-B/Llave', 'Nequi', 'Daviplata', 'Bancolombia', 'Nu', 'Davivienda', 'BBVA', 'Banco de Bogotá']

export default function Sales() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Almacenamiento local de URLs de imagen por ID de producto
  const [productImages, setProductImages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('toffe_product_images') || '{}')
    } catch (e) {
      return {}
    }
  })

  // Carrito de compras
  const [cartItems, setCartItems] = useState([])
  const [orderType, setOrderType] = useState('Para Llevar')
  const [tableNumber, setTableNumber] = useState('')
  const [tipAmount, setTipAmount] = useState(0)

  // Modal de cobro y cliente
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [cashAmount, setCashAmount] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  
  // Desglose de Bancos / Entidades para Transferencia y Pago Mixto
  const {
    lines: bankPayments,
    setLines: setBankPayments,
    addLine: addBankLine,
    removeLine: removeBankLine,
    updateLine: updateBankLine
  } = useBankLines((nextLines, field) => {
    // Auto-calcular suma de transferencias
    if (field === 'amount') {
      const sumTransfers = nextLines.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      setTransferAmount(String(sumTransfers))
    }
  })

  const [submitting, setSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [pastCustomers, setPastCustomers] = useState([])

  // Modal Recibo impreso / exito
  const [lastOrder, setLastOrder] = useState(null)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)

  const isProductActive = (p) => typeof p.active !== 'undefined' ? p.active : (p.is_active ?? true)

  async function loadData() {
    try {
      const [prodData, salesData] = await Promise.all([
        api.get('/products'),
        api.get('/sales')
      ])
      setProducts(prodData || [])

      const cats = Array.from(new Set((prodData || []).map((p) => p.category))).filter(Boolean)
      setCategories(['Todos', ...cats])

      const uniqueCustomers = Array.from(
        new Set(
          (salesData || [])
            .map((s) => s.customer_name?.trim())
            .filter((name) => name && name !== 'Cliente General')
        )
      )
      setPastCustomers(uniqueCustomers)
    } catch (err) {
      setError('No se pudieron cargar los productos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Carrito helpers
  function addToCart(product, qtyToAdd = 1) {
    if (!isProductActive(product)) return
    setCartItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + qtyToAdd }
            : item
        )
      }
      return [...prev, { product, quantity: qtyToAdd }]
    })
  }

  function updateQuantity(productId, delta) {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta
            return newQty > 0 ? { ...item, quantity: newQty } : null
          }
          return item
        })
        .filter(Boolean)
    )
  }

  function removeFromCart(productId) {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId))
  }

  function clearCart() {
    setCartItems([])
    setTableNumber('')
    setTipAmount(0)
  }

  // Cálculos de Totales
  const cartSubtotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0),
    [cartItems]
  )

  const cartTotal = useMemo(
    () => Math.max(0, cartSubtotal + tipAmount),
    [cartSubtotal, tipAmount]
  )

  // Mostrar solo productos activos en POS
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!isProductActive(p)) return false
      const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [products, selectedCategory, searchQuery])

  function openCheckout() {
    if (cartItems.length === 0) return
    setCustomerName('')
    setPaymentMethod('efectivo')
    setCashAmount(String(cartTotal))
    setTransferAmount('0')
    setBankPayments([createBankLine(String(cartTotal))])
    setCheckoutError('')
    setIsCheckoutOpen(true)
  }

  function handleSelectPaymentMethod(method) {
    setPaymentMethod(method)
    setCheckoutError('')
    if (method === 'efectivo') {
      setCashAmount(String(cartTotal))
      setTransferAmount('0')
    } else if (method === 'transferencia') {
      setCashAmount('0')
      setTransferAmount(String(cartTotal))
      setBankPayments([createBankLine(String(cartTotal))])
    } else if (method === 'mixto') {
      const half = Math.round(cartTotal / 2)
      setCashAmount(String(half))
      setTransferAmount(String(cartTotal - half))
      setBankPayments([createBankLine(String(cartTotal - half))])
    }
  }

  async function handleConfirmSale(e) {
    e.preventDefault()
    setSubmitting(true)
    setCheckoutError('')

    const finalCustomer = customerName.trim() || 'Cliente General'
    let numCash = Number(cashAmount) || 0
    let numTransfer = Number(transferAmount) || 0
    let bankDetailsStr = ''

    if (paymentMethod === 'efectivo') {
      if (numCash < cartTotal) {
        setCheckoutError(`El efectivo entregado ($${numCash.toLocaleString()}) es menor al total del pedido ($${cartTotal.toLocaleString()})`)
        setSubmitting(false)
        return
      }
      numTransfer = 0
    } else if (paymentMethod === 'transferencia') {
      numCash = 0
      const bankNamesSeen = new Set()

      for (const b of bankPayments) {
        const bankNameClean = b.bank.trim().toLowerCase()
        const bankAmountNum = Number(b.amount) || 0

        if (!bankNameClean) {
          setCheckoutError('Por favor selecciona o escribe el nombre del banco/entidad para cada transferencia.')
          setSubmitting(false)
          return
        }

        if (bankAmountNum <= 0) {
          setCheckoutError(`El monto asignado a "${b.bank}" debe ser mayor a $0.`)
          setSubmitting(false)
          return
        }

        if (bankNamesSeen.has(bankNameClean)) {
          setCheckoutError(`Has ingresado "${b.bank}" más de una vez. Por favor consolida el monto en una sola línea.`)
          setSubmitting(false)
          return
        }
        bankNamesSeen.add(bankNameClean)
      }

      numTransfer = bankPayments.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)

      if (numTransfer !== cartTotal) {
        if (numTransfer < cartTotal) {
          setCheckoutError(`La suma de transferencias ($${numTransfer.toLocaleString()}) es inferior al total del pedido ($${cartTotal.toLocaleString()}).`)
        } else {
          setCheckoutError(`La suma de transferencias ($${numTransfer.toLocaleString()}) supera el total del pedido ($${cartTotal.toLocaleString()}).`)
        }
        setSubmitting(false)
        return
      }

      bankDetailsStr = bankDetailsString(bankPayments)
    } else if (paymentMethod === 'mixto') {
      if (numCash <= 0) {
        setCheckoutError('En Pago Mixto el abono en efectivo debe ser mayor a $0. (Si no hay efectivo, usa el método Transferencia).')
        setSubmitting(false)
        return
      }

      const bankNamesSeen = new Set()
      for (const b of bankPayments) {
        const bankNameClean = b.bank.trim().toLowerCase()
        const bankAmountNum = Number(b.amount) || 0

        if (!bankNameClean) {
          setCheckoutError('Por favor selecciona o escribe el nombre del banco/entidad.')
          setSubmitting(false)
          return
        }

        if (bankAmountNum <= 0) {
          setCheckoutError(`En Pago Mixto el abono por transferencia en "${b.bank}" debe ser mayor a $0.`)
          setSubmitting(false)
          return
        }

        if (bankNamesSeen.has(bankNameClean)) {
          setCheckoutError(`Has ingresado "${b.bank}" más de una vez. Por favor consolida el monto en una sola línea.`)
          setSubmitting(false)
          return
        }
        bankNamesSeen.add(bankNameClean)
      }

      numTransfer = bankPayments.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)

      if (numTransfer <= 0) {
        setCheckoutError('En Pago Mixto el abono por transferencia debe ser mayor a $0. (Si no hay transferencia, usa el método Efectivo).')
        setSubmitting(false)
        return
      }

      if (numCash + numTransfer !== cartTotal) {
        if (numCash + numTransfer < cartTotal) {
          setCheckoutError(`La suma de efectivo ($${numCash.toLocaleString()}) + transferencias ($${numTransfer.toLocaleString()}) es $${(numCash + numTransfer).toLocaleString()}, inferior al total ($${cartTotal.toLocaleString()}).`)
        } else {
          setCheckoutError(`La suma de efectivo ($${numCash.toLocaleString()}) + transferencias ($${numTransfer.toLocaleString()}) es $${(numCash + numTransfer).toLocaleString()}, mayor al total ($${cartTotal.toLocaleString()}).`)
        }
        setSubmitting(false)
        return
      }

      bankDetailsStr = bankDetailsString(bankPayments)
    }

    try {
      const payload = {
        customer_name: orderType === 'Mesa' && tableNumber ? `${finalCustomer} (${tableNumber})` : finalCustomer,
        payment_method: paymentMethod,
        cash_amount: numCash,
        transfer_amount: numTransfer,
        bank_details: bankDetailsStr,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.product.price
        }))
      }

      const createdSale = await api.post('/sales', payload)

      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } })

      setLastOrder({
        ...createdSale,
        items: cartItems,
        total: cartTotal,
        customer_name: payload.customer_name,
        payment_method: payload.payment_method,
        bank_details: payload.bank_details
      })
      setIsCheckoutOpen(false)
      clearCart()
      setIsReceiptOpen(true)
      await loadData()
    } catch (err) {
      setCheckoutError(err.message || 'No se pudo procesar la venta en caja')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="p-4 text-sm font-semibold text-[#9F6839]">Cargando catálogo POS...</p>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-6rem)]">
      {/* Catálogo de Productos (Izquierda - 8 cols) */}
      <div className="lg:col-span-8 flex flex-col space-y-4 overflow-hidden">
        {/* Header de Filtros y Búsqueda */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#201009] p-4 rounded-3xl border border-[#D4B28E] dark:border-[#9F6839]/40 shadow-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9F6839]" />
            <input
              type="text"
              placeholder="Buscar producto por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#150904] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#9F6839] text-white shadow-xs'
                    : 'bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7] hover:bg-[#9F6839]/20'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
            ⚠️ {error}
          </div>
        )}

        {/* Grid de Productos */}
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredProducts.map((p) => {
              const rawImg = productImages[p.id] || p.image_url || DEFAULT_PRODUCT_IMAGE
              const displayImg = processImageUrl(rawImg)

              return (
                <div
                  key={p.id}
                  onClick={() => addToCart(p, 1)}
                  className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-3.5 shadow-xs hover:shadow-md hover:border-[#9F6839] transition-all cursor-pointer flex flex-col justify-between group overflow-hidden"
                >
                  <div className="space-y-2">
                    <div className="relative w-full h-32 rounded-2xl overflow-hidden bg-[#FEE4D7]/30 dark:bg-[#150904] border border-[#D4B28E]/40">
                      <img
                        src={displayImg}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.src = DEFAULT_PRODUCT_IMAGE
                        }}
                      />
                      <span className="absolute top-2 right-2 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#432414]/85 text-[#FEE4D7] backdrop-blur-xs uppercase tracking-wider">
                        {p.category}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-extrabold text-[#432414] dark:text-[#FEE4D7] line-clamp-1 group-hover:text-[#9F6839]">
                        {p.name}
                      </h4>
                      <p className="text-xs text-[#9F6839] dark:text-[#DABA8C] font-extrabold mt-0.5">
                        ${p.price.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-[#D4B28E]/30 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 shrink-0" /> Disponible
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        addToCart(p, 1)
                      }}
                      className="w-full py-2 px-3 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>Agregar 1</span>
                    </button>
                  </div>
                </div>
              )
            })}

            {filteredProducts.length === 0 && (
              <div className="col-span-full py-16 text-center bg-white dark:bg-[#201009] rounded-3xl border border-[#D4B28E] p-6 space-y-2">
                <Coffee className="w-8 h-8 text-[#9F6839] mx-auto opacity-50" />
                <p className="text-xs font-bold text-[#9F6839]">No hay productos disponibles en esta categoría</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Carrito de Compras POS (Derecha - 4 cols) */}
      <aside className="lg:col-span-4 bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs flex flex-col justify-between overflow-hidden">
        <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
          {/* Header Carrito */}
          <div className="flex items-center justify-between pb-3 border-b border-[#D4B28E]/60 dark:border-[#9F6839]/40">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#9F6839]" />
              <h3 className="text-base font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                Orden de Caja
              </h3>
            </div>
            {cartItems.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
              >
                Vaciar Carrito
              </button>
            )}
          </div>

          {/* Selector de Tipo de Servicio */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'Para Llevar', icon: ShoppingBag },
              { id: 'Mesa', icon: Utensils }
            ].map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOrderType(t.id)}
                  className={`py-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    orderType === t.id
                      ? 'bg-[#9F6839] text-white shadow-xs'
                      : 'bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.id}</span>
                </button>
              )
            })}
          </div>

          {orderType === 'Mesa' && (
            <input
              type="text"
              placeholder="Número / Nombre de Mesa (Ej. Mesa 4)..."
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          )}

          {/* Lista de Items en Carrito */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {cartItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#9F6839] space-y-2">
                <Coffee className="w-10 h-10 opacity-30" />
                <p className="text-xs font-bold">Tu carrito está vacío</p>
                <p className="text-[11px] text-[#9F6839]/70">Selecciona productos del catálogo para armar el pedido</p>
              </div>
            ) : (
              cartItems.map((item) => {
                const rawImg = productImages[item.product.id] || item.product.image_url || DEFAULT_PRODUCT_IMAGE
                const displayImg = processImageUrl(rawImg)

                return (
                  <div
                    key={item.product.id}
                    className="p-2.5 rounded-2xl bg-[#FEE4D7]/30 dark:bg-[#2A150C] border border-[#D4B28E]/50 flex items-center justify-between gap-3 text-xs"
                  >
                    <img
                      src={displayImg}
                      alt={item.product.name}
                      className="w-10 h-10 rounded-xl object-cover border border-[#D4B28E]/60 shrink-0"
                      onError={(e) => {
                        e.target.src = DEFAULT_PRODUCT_IMAGE
                      }}
                    />

                    <div className="flex-1 min-w-0">
                      <h5 className="font-extrabold text-[#432414] dark:text-[#FEE4D7] truncate">
                        {item.product.name}
                      </h5>
                      <span className="text-[10px] text-[#9F6839] font-bold">
                        ${item.product.price.toLocaleString()} c/u
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-6 h-6 rounded-lg bg-white dark:bg-[#150904] border border-[#D4B28E] flex items-center justify-center text-[#432414] hover:bg-[#9F6839] hover:text-white cursor-pointer font-bold"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <span className="w-5 text-center font-extrabold text-xs text-[#432414] dark:text-[#FEE4D7]">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-6 h-6 rounded-lg bg-white dark:bg-[#150904] border border-[#D4B28E] flex items-center justify-center text-[#432414] hover:bg-[#9F6839] hover:text-white cursor-pointer font-bold"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                        ${(item.product.price * item.quantity).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Totales y Botón de Cobro */}
        <div className="pt-4 border-t border-[#D4B28E]/60 dark:border-[#9F6839]/30 space-y-3">
          <div className="space-y-1.5 text-xs text-[#9F6839] font-semibold">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-bold text-[#432414] dark:text-[#FEE4D7]">${cartSubtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-[#432414] dark:text-[#FEE4D7] pt-2 border-t border-[#D4B28E]/40">
              <span>Total a Pagar:</span>
              <span className="text-lg text-emerald-600">${cartTotal.toLocaleString()}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={openCheckout}
            disabled={cartItems.length === 0}
            className="w-full py-3.5 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white font-extrabold text-sm shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Proceder al Cobro (${cartTotal.toLocaleString()})
          </button>
        </div>
      </aside>

      {/* Modal de Cobro */}
      <Modal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} title="Finalizar Venta en Caja">
        <form onSubmit={handleConfirmSale} className="space-y-4">
          {checkoutError && (
            <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{checkoutError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Nombre del Cliente (Opcional)
            </label>
            <input
              type="text"
              list="customer-autocomplete"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ej. Mateo, Camilo, Cliente General"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
            <datalist id="customer-autocomplete">
              {pastCustomers.map((cust, idx) => (
                <option key={idx} value={cust} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Método de Pago
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'efectivo', label: 'Efectivo', icon: Banknote },
                { id: 'transferencia', label: 'Transferencia', icon: Smartphone },
                { id: 'mixto', label: 'Pago Mixto', icon: CreditCard }
              ].map((m) => {
                const Icon = m.icon
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectPaymentMethod(m.id)}
                    className={`py-2.5 px-2 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentMethod === m.id
                        ? 'bg-[#9F6839] text-white border-[#9F6839] shadow-xs'
                        : 'bg-white dark:bg-[#150904] border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <datalist id="banks-list">
            {COMMON_BANKS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>

          {/* Pago 1: Solo Efectivo */}
          {paymentMethod === 'efectivo' && (
            <div>
              <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
                Efectivo Recibido ($)
              </label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="Monto en dinero entregado..."
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
              />
              {Number(cashAmount) >= cartTotal && (
                <p className="mt-1 text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Cambio a Entregar: ${(Number(cashAmount) - cartTotal).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Pago 2: Transferencia (Desglose por Banco/Entidad) */}
          {paymentMethod === 'transferencia' && (
            <div className="space-y-3 p-3.5 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E]">
              <span className="block text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#9F6839]" />
                Detalle de Entidad / Banco de Transferencia
              </span>

              {bankPayments.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      list="banks-list"
                      placeholder="Banco / Entidad (ej. Bre-B/Llave, Nequi...)"
                      value={item.bank}
                      onChange={(e) => updateBankLine(idx, 'bank', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold text-[#432414] dark:text-[#FEE4D7]"
                    />
                  </div>

                  <div className="w-32">
                    <input
                      type="number"
                      placeholder="Monto ($)"
                      value={item.amount}
                      onChange={(e) => updateBankLine(idx, 'amount', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7]"
                    />
                  </div>

                  {bankPayments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBankLine(idx)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addBankLine}
                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#9F6839] hover:underline cursor-pointer pt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Dividir en otro banco / entidad</span>
              </button>
            </div>
          )}

          {/* Pago 3: Pago Mixto (Efectivo + Transferencia por Bancos) */}
          {paymentMethod === 'mixto' && (
            <div className="space-y-4 p-3.5 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E]">
              <div>
                <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
                  Abono en Efectivo ($)
                </label>
                <input
                  type="number"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-[#D4B28E]/40">
                <span className="block text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#9F6839]" />
                  Abonos por Transferencia (Bancos / Entidades)
                </span>

                {bankPayments.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      list="banks-list"
                      placeholder="Banco / Entidad (ej. Bre-B/Llave, Nequi...)"
                      value={item.bank}
                      onChange={(e) => updateBankLine(idx, 'bank', e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold text-[#432414] dark:text-[#FEE4D7]"
                    />

                    <input
                      type="number"
                      placeholder="Monto ($)"
                      value={item.amount}
                      onChange={(e) => updateBankLine(idx, 'amount', e.target.value)}
                      className="w-32 px-3 py-2 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7]"
                    />

                    {bankPayments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBankLine(idx)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addBankLine}
                  className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#9F6839] hover:underline cursor-pointer pt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar otro banco / entidad</span>
                </button>
              </div>

              {/* Resumen de Pago Mixto */}
              <div className="p-3 rounded-xl bg-white dark:bg-[#150904] border border-[#D4B28E]/60 text-xs space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Monto Total Pedido:</span>
                  <span className="font-extrabold text-[#432414] dark:text-[#FEE4D7]">${cartTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[#9F6839]">
                  <span>Total Cubierto (Efectivo + Bancos):</span>
                  <span className="font-extrabold">${((Number(cashAmount) || 0) + (Number(transferAmount) || 0)).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-3">
            <button
              type="button"
              onClick={() => setIsCheckoutOpen(false)}
              className="px-4 py-2.5 rounded-2xl bg-white dark:bg-[#201009] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Procesando...' : 'Confirmar Venta'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Ticket Venta Impreso */}
      <Modal isOpen={isReceiptOpen} onClose={() => setIsReceiptOpen(false)} title="Venta Realizada con Éxito">
        {lastOrder && (
          <div className="space-y-4">
            <div id="printable-receipt" className="p-6 bg-white border border-gray-200 rounded-2xl text-center space-y-3 font-mono text-xs text-gray-800">
              <div className="flex flex-col items-center justify-center border-b border-[#D4B28E]/60 pb-3 text-center">
                <img src="/icon-192.png" alt="Toffee Logo" className="w-12 h-12 rounded-2xl border border-[#9F6839] mb-1 object-cover" />
                <h2 className="text-base font-black text-[#432414] uppercase tracking-wider">Toffee</h2>
                <p className="text-[10px] text-[#9F6839] font-extrabold uppercase tracking-widest">"Hecho por y para estudiantes"</p>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Comprobante de Venta</p>
              <p className="text-[10px] text-gray-500">{new Date().toLocaleString()}</p>

              <div className="text-left space-y-1 text-xs">
                <div><strong>Cliente:</strong> {lastOrder.customer_name}</div>
                <div><strong>Forma Pago:</strong> {lastOrder.payment_method?.toUpperCase()} {lastOrder.bank_details ? `(${lastOrder.bank_details})` : ''}</div>
                <div><strong>Estado:</strong> Venta Registrada & Comanda Creada</div>
              </div>

              <div className="flex justify-between text-sm font-extrabold pt-2 border-t">
                <span>TOTAL FACTURADO:</span>
                <span>${(lastOrder.total || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsReceiptOpen(false)}
                className="px-5 py-2.5 rounded-2xl bg-[#9F6839] text-white text-xs font-extrabold shadow-md cursor-pointer"
              >
                Aceptar & Siguiente Venta
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}