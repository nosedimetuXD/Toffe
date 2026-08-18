import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, loadAllSettled } from '../api/client'
import Modal from '../components/Modal'
import { processImageUrl, compressAndReadFile } from '../utils/imageUtils'
import {
  User,
  Lock,
  Camera,
  CheckCircle2,
  Shield,
  Upload,
  ShoppingBag,
  TrendingUp,
  Award,
  FileText,
  Edit2,
  Clock,
  Sparkles
} from 'lucide-react'

export default function Profile() {
  const { user, updateUser } = useAuth()

  const rawAvatar = user?.avatar_url || ''
  const currentAvatarUrl = processImageUrl(rawAvatar)

  // Estado del Modal de Edición
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [avatarInput, setAvatarInput] = useState(rawAvatar)

  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [formError, setFormError] = useState('')

  // Métricas personales del usuario
  const [userSales, setUserSales] = useState([])
  const [userComandas, setUserComandas] = useState([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [statsError, setStatsError] = useState('')

  useEffect(() => {
    async function fetchUserData() {
      try {
        const { data, failed } = await loadAllSettled({
          ventas: api.get('/sales?period=all'),
          comandas: api.get('/comandas')
        })
        const mySales = (data.ventas || []).filter(
          (s) => (user?.id && s.sold_by === user.id) || s.sold_by_username?.toLowerCase() === user?.username?.toLowerCase()
        )
        setUserSales(mySales)
        setUserComandas(data.comandas || [])
        setStatsError(failed.length > 0 ? `No se pudieron cargar: ${failed.join(', ')}` : '')
      } catch (e) {
        console.error('Error cargando datos del usuario', e)
        setStatsError('No se pudieron cargar tus métricas')
      } finally {
        setLoadingStats(false)
      }
    }
    fetchUserData()
  }, [user])

  useEffect(() => {
    if (user) {
      setUsername(user.username || '')
      setAvatarInput(user.avatar_url || '')
    }
  }, [user])

  // Cálculo de Estadísticas Personales
  const stats = useMemo(() => {
    const totalCount = userSales.length
    const totalRevenue = userSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0)
    const avgSale = totalCount > 0 ? totalRevenue / totalCount : 0

    const productCounts = {}
    userSales.forEach((s) => {
      let items = s.items
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items)
        } catch (e) {
          console.error('venta con items en formato inválido:', e)
          items = []
        }
      }
      (items || []).forEach((it) => {
        const name = it.product_name || it.ProductName || it.name || 'Producto'
        const q = Number(it.quantity || it.Quantity || 1)
        productCounts[name] = (productCounts[name] || 0) + q
      })
    })

    let topProduct = 'Ninguno aún'
    let maxQty = 0
    Object.entries(productCounts).forEach(([name, qty]) => {
      if (qty > maxQty) {
        maxQty = qty
        topProduct = name
      }
    })

    let totalPrepMin = 0
    let prepCount = 0
    userComandas.forEach((c) => {
      const isMyPrep = (user?.id && c.prepared_by === user.id) || 
                       (c.prepared_by_username && c.prepared_by_username.toLowerCase() === user?.username?.toLowerCase())
      
      if (isMyPrep && (c.status === 'listo' || c.status === 'entregado') && c.created_at) {
        const end = new Date(c.ready_at || c.updated_at || c.created_at)
        const start = new Date(c.created_at)
        const min = (end - start) / (1000 * 60)
        if (min >= 0 && min < 1440) {
          totalPrepMin += min
          prepCount += 1
        }
      }
    })
    const avgPrepTimeMin = prepCount > 0 ? Math.round(totalPrepMin / prepCount) : 0

    return {
      totalCount,
      totalRevenue,
      avgSale,
      topProduct,
      maxQty,
      avgPrepTimeMin
    }
  }, [userSales, userComandas])

  function openEditModal() {
    setUsername(user?.username || '')
    setPassword('')
    setAvatarInput(user?.avatar_url || '')
    setFormError('')
    setIsEditModalOpen(true)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    compressAndReadFile(file, (compressedDataUrl) => {
      setAvatarInput(compressedDataUrl)
    })
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg('')
    setFormError('')

    try {
      const finalAvatar = avatarInput.trim()
      const payload = {
        username: username.trim(),
        avatar_url: finalAvatar
      }
      if (password.trim()) {
        payload.password = password.trim()
      }

      // Guardar avatar_url en la base de datos PostgreSQL de Supabase
      const updatedUser = await api.put('/users/me', payload)

      // Actualizar estado global del AuthContext
      updateUser({ ...updatedUser, avatar_url: finalAvatar })

      setPassword('')
      setIsEditModalOpen(false)
      setSuccessMsg('¡Perfil y foto guardados correctamente!')
    } catch (err) {
      setFormError(err.message || 'No se pudo actualizar el perfil')
    } finally {
      setSaving(false)
    }
  }

  const roleLabels = {
    owner: 'DUEÑO',
    admin: 'ADMINISTRADOR',
    employee: 'EMPLEADO'
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header General */}
      <div>
        <h2 className="text-2xl font-extrabold text-[#432414] dark:text-[#FEE4D7] tracking-tight">
          Mi Perfil & Estadísticas Personales
        </h2>
        <p className="text-xs font-semibold text-[#9F6839] dark:text-[#DABA8C] mt-0.5">
          Información de cuenta Toffee, credenciales y resumen de rendimiento en caja
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid Principal Armónico */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tarjeta Perfil de Usuario (Izquierda / 5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl overflow-hidden shadow-xs">
          {/* Banner de Fondo de Marca Toffee */}
          <div className="relative h-28 bg-[#432414] p-4">
            <div
              className="absolute inset-0 opacity-30 bg-cover bg-center pointer-events-none"
              style={{ backgroundImage: "url('/toffe-pattern-dark.png')" }}
            />
          </div>

          <div className="px-6 pb-6 pt-0 relative space-y-5">
            {/* Avatar Superpuesto */}
            <div className="-mt-14 flex flex-col items-center text-center">
              {currentAvatarUrl ? (
                <img
                  src={currentAvatarUrl}
                  alt={user?.username}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-[#201009] shadow-md bg-white mb-2"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-[#9F6839] text-[#FEE4D7] font-black text-3xl flex items-center justify-center border-4 border-white dark:border-[#201009] shadow-md mb-2">
                  {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
                </div>
              )}

              <h3 className="text-xl font-extrabold text-[#432414] dark:text-[#FEE4D7] leading-tight">
                {user?.username}
              </h3>
              <div className="mt-1.5">
                <span className="text-[10px] font-extrabold px-3 py-1 rounded-full bg-[#FEE4D7] dark:bg-[#34180D] text-[#9F6839] dark:text-[#DABA8C] border border-[#D4B28E] uppercase tracking-wider inline-flex items-center gap-1">
                  <Shield className="w-3 h-3 text-[#9F6839]" />
                  ROL: {roleLabels[user?.role] || user?.role}
                </span>
              </div>
            </div>

            {/* Detalles de Cuenta Organizados */}
            <div className="space-y-2.5 text-xs text-[#9F6839] dark:text-[#DABA8C] pt-2 border-t border-[#D4B28E]/40">
              <div className="flex items-center justify-between py-1 border-b border-[#D4B28E]/20">
                <span className="font-semibold flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#9F6839]" /> Usuario:
                </span>
                <strong className="text-[#432414] dark:text-[#FEE4D7] font-bold">{user?.username}</strong>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[#D4B28E]/20">
                <span className="font-semibold flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#9F6839]" /> Permisos:
                </span>
                <strong className="text-[#432414] dark:text-[#FEE4D7] font-bold">
                  {user?.role === 'owner' ? 'Acceso Total (Dueño)' : user?.role === 'admin' ? 'Administración' : 'Ventas & Comandas'}
                </strong>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Cuenta:
                </span>
                <strong className="text-emerald-600 font-extrabold">✓ Activa</strong>
              </div>
            </div>

            {/* Botón de Acción */}
            <button
              onClick={openEditModal}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold shadow-md cursor-pointer transition-all border border-white/20"
            >
              <Edit2 className="w-4 h-4" />
              <span>Editar Mi Perfil</span>
            </button>
          </div>
        </div>

        {/* Panel de Estadísticas Personales & Últimas Ventas (Derecha / 7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Tarjeta de Métricas */}
          <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-extrabold text-[#432414] dark:text-[#FEE4D7] flex items-center gap-2 pb-2 border-b border-[#D4B28E]/40">
              <TrendingUp className="w-4 h-4 text-[#9F6839]" /> Mis Estadísticas Personales en Caja
            </h3>

            {loadingStats ? (
              <p className="text-xs font-semibold text-[#9F6839] py-4 text-center">Cargando tus métricas...</p>
            ) : statsError ? (
              <p className="text-xs font-semibold text-red-600 py-4 text-center">{statsError}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E]/60 space-y-1">
                  <span className="text-[10px] font-bold text-[#9F6839] uppercase tracking-wider block">
                    Ventas Realizadas
                  </span>
                  <p className="text-2xl font-black text-[#432414] dark:text-[#FEE4D7]">
                    {stats.totalCount}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E]/60 space-y-1">
                  <span className="text-[10px] font-bold text-[#9F6839] uppercase tracking-wider block">
                    Ingresos Generados
                  </span>
                  <p className="text-2xl font-black text-emerald-600">
                    ${stats.totalRevenue.toLocaleString()}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E]/60 space-y-1">
                  <span className="text-[10px] font-bold text-[#9F6839] uppercase tracking-wider block">
                    Venta Promedio Ticket
                  </span>
                  <p className="text-lg font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                    ${Math.round(stats.avgSale).toLocaleString()}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E]/60 space-y-1">
                  <span className="text-[10px] font-bold text-[#9F6839] uppercase tracking-wider block flex items-center gap-1">
                    <Award className="w-3 h-3 text-[#9F6839]" /> Más Vendido por Ti
                  </span>
                  <p className="text-xs font-bold text-[#432414] dark:text-[#FEE4D7] truncate" title={stats.topProduct}>
                    {stats.topProduct}
                  </p>
                  {stats.maxQty > 0 && (
                    <span className="text-[10px] text-[#9F6839] font-semibold block">
                      ({stats.maxQty} unidades)
                    </span>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E]/60 space-y-1">
                  <span className="text-[10px] font-bold text-[#9F6839] uppercase tracking-wider block flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-600" /> Demora Comandas
                  </span>
                  <p className="text-lg font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                    {stats.avgPrepTimeMin > 0 ? `${stats.avgPrepTimeMin} min` : '—'}
                  </p>
                  <span className="text-[10px] text-[#9F6839] font-semibold block">
                    Promedio preparación
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Historial Reciente de Mis Ventas */}
          <div className="bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#D4B28E]/40">
              <h4 className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#9F6839]" /> Mis Últimas Ventas Registradas
              </h4>
              <span className="text-[11px] font-bold text-[#9F6839]">
                {userSales.length} ventas totales
              </span>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {userSales.length === 0 ? (
                <p className="text-xs text-[#9F6839] py-6 text-center font-medium">
                  Aún no has registrado ventas en el punto de venta.
                </p>
              ) : (
                userSales.slice(0, 8).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-[#FEE4D7]/30 dark:bg-[#2A150C] border border-[#D4B28E]/50 text-xs hover:border-[#9F6839] transition-colors"
                  >
                    <div className="space-y-0.5">
                      <span className="font-bold text-[#432414] dark:text-[#FEE4D7] block text-xs">
                        {s.customer_name || 'Cliente General'}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-[#9F6839] font-semibold">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#9F6839]" />
                          {new Date(s.created_at).toLocaleString()}
                        </span>
                        <span>•</span>
                        <span className="uppercase text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-[#9F6839]/10 text-[#9F6839]">
                          {s.payment_method || 'Efectivo'}
                        </span>
                      </div>
                    </div>
                    <span className="font-black text-emerald-600 text-sm">
                      ${Number(s.total).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Editar Perfil */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Mi Perfil">
        <form onSubmit={handleSaveProfile} className="space-y-4">
          {formError && (
            <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
              ⚠️ {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#9F6839]" /> Nombre de Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#9F6839]" /> Nueva Contraseña (Opcional)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres (vacío para conservar)"
              minLength={8}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-[#D4B28E]/30">
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-[#9F6839]" /> Foto de Perfil (Avatar)
            </label>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#FEE4D7] dark:bg-[#2A150C] border border-[#D4B28E] hover:bg-[#9F6839] hover:text-white text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] transition-all cursor-pointer shadow-xs">
                <Upload className="w-4 h-4" />
                <span>Subir foto del dispositivo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-[#9F6839] font-medium">o pega un enlace abajo</span>
            </div>

            <input
              type="text"
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="https://... o enlace de foto"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-xs font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Rol de Usuario (Solo Lectura)
            </label>
            <input
              type="text"
              value={roleLabels[user?.role] || user?.role || ''}
              disabled
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#150904] border border-[#D4B28E] text-sm font-extrabold text-[#9F6839] cursor-not-allowed"
            />
          </div>

          <div className="flex gap-3 justify-end pt-3">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2.5 rounded-2xl bg-white dark:bg-[#201009] border border-[#D4B28E] text-xs font-bold text-[#432414] dark:text-[#FEE4D7] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Mi Perfil'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
