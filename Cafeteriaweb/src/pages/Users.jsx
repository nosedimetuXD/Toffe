import { useEffect, useState, useMemo } from 'react'
import { api, loadAllSettled } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { processImageUrl, compressAndReadFile } from '../utils/imageUtils'
import { Users as UsersIcon, Shield, Key, Plus, Edit2, Lock, Camera, Upload, Trash2, BarChart3, TrendingUp, DollarSign, ShoppingBag, CheckSquare, ShieldAlert, AlertCircle } from 'lucide-react'

export default function Users() {
  const { user: currentUser, updateUser } = useAuth()
  const [users, setUsers] = useState([])
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [tasks, setTasks] = useState([])
  const [wasteReports, setWasteReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Modal Crear / Editar Usuario
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('employee')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Modal Stats Personales de Usuario
  const [selectedUserForStats, setSelectedUserForStats] = useState(null)

  async function loadData() {
    try {
      const { data, failed } = await loadAllSettled({
        usuarios: api.get('/users'),
        ventas: api.get('/sales?period=all'),
        gastos: api.get('/expenses?period=all'),
        tareas: api.get('/tasks'),
        desperdicios: api.get('/waste')
      })
      setUsers(data.usuarios || [])
      setSales(data.ventas || [])
      setExpenses(data.gastos || [])
      setTasks(data.tareas || [])
      setWasteReports(data.desperdicios || [])
      setPageError(failed.length > 0 ? `No se pudieron cargar: ${failed.join(', ')}` : '')
    } catch (err) {
      console.error('Error cargando usuarios:', err)
      setPageError('No se pudieron cargar los usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function openCreateModal() {
    setEditingUser(null)
    setUsername('')
    setPassword('')
    setRole('employee')
    setAvatarUrl('')
    setFormError('')
    setIsModalOpen(true)
  }

  function openEditModal(userItem) {
    setEditingUser(userItem)
    setUsername(userItem.username)
    setPassword('')
    setRole(userItem.role)
    setAvatarUrl(userItem.avatar_url || '')
    setFormError('')
    setIsModalOpen(true)
  }

  function openStatsModal(userItem) {
    setSelectedUserForStats(userItem)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    compressAndReadFile(file, (compressedDataUrl) => {
      setAvatarUrl(compressedDataUrl)
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')

    try {
      const finalAvatar = avatarUrl.trim()

      if (editingUser) {
        const updated = await api.put(`/users/${editingUser.id}`, {
          username,
          password: password ? password : undefined,
          role,
          avatar_url: finalAvatar
        })

        if (currentUser && currentUser.id === editingUser.id) {
          updateUser({ username: updated.username, role: updated.role, avatar_url: finalAvatar })
        }
      } else {
        await api.post('/users', { username, password, role, avatar_url: finalAvatar })
      }

      setIsModalOpen(false)
      await loadData()
    } catch (err) {
      setFormError(
        err.message.includes('ya')
          ? 'Ese nombre de usuario ya está registrado'
          : err.message || 'No se pudo guardar el usuario'
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteUser(userItem) {
    if (userItem.is_primary || userItem.username.trim().toLowerCase() === 'camilo osorio') {
      alert('El dueño principal está protegido permanentemente y no se puede eliminar.')
      return
    }
    if (currentUser && currentUser.id === userItem.id) {
      alert('No puedes eliminar tu propia cuenta activa.')
      return
    }

    if (!window.confirm(`¿Estás seguro de eliminar permanentemente al usuario "${userItem.username}"?`)) {
      return
    }

    try {
      await api.delete(`/users/${userItem.id}`)
      await loadData()
    } catch (err) {
      alert(err.message || 'No se pudo eliminar el usuario')
    }
  }

  const userStatsCalculated = useMemo(() => {
    if (!selectedUserForStats) return null

    const uSales = sales.filter((s) => s.sold_by === selectedUserForStats.id || s.sold_by_username?.toLowerCase() === selectedUserForStats.username.toLowerCase())
    const uExpenses = expenses.filter((e) => e.registered_by === selectedUserForStats.id || e.registerer_name?.toLowerCase() === selectedUserForStats.username.toLowerCase())
    const uTasksAssigned = tasks.filter((t) => t.assigned_to === selectedUserForStats.id || t.assigned_username?.toLowerCase() === selectedUserForStats.username.toLowerCase())
    const uTasksCompleted = uTasksAssigned.filter((t) => t.completed)
    const uWaste = wasteReports.filter((w) => w.reported_by === selectedUserForStats.id || w.reporter_name?.toLowerCase() === selectedUserForStats.username.toLowerCase())

    let totalRevenue = 0
    const productCounts = {}

    uSales.forEach((s) => {
      totalRevenue += Number(s.total) || 0
      if (Array.isArray(s.items)) {
        s.items.forEach((item) => {
          const pName = item.product_name || item.name || 'Producto'
          const qty = Number(item.quantity) || 1
          productCounts[pName] = (productCounts[pName] || 0) + qty
        })
      }
    })

    const topProductEntry = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]

    let totalExpensesSum = 0
    uExpenses.forEach((e) => {
      totalExpensesSum += Number(e.amount) || 0
    })

    let totalPrepMin = 0
    let prepCount = 0
    comandas.forEach((c) => {
      const isMyPrep = (selectedUserForStats?.id && c.prepared_by === selectedUserForStats.id) ||
                       (c.prepared_by_username && c.prepared_by_username.toLowerCase() === selectedUserForStats?.username?.toLowerCase())

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
    const avgUserPrepMin = prepCount > 0 ? Math.round(totalPrepMin / prepCount) : 0

    return {
      salesCount: uSales.length,
      totalRevenue,
      ticketAverage: uSales.length > 0 ? totalRevenue / uSales.length : 0,
      topProductName: topProductEntry ? topProductEntry[0] : 'Sin ventas',
      topProductQty: topProductEntry ? topProductEntry[1] : 0,
      expensesCount: uExpenses.length,
      totalExpensesSum,
      tasksAssignedCount: uTasksAssigned.length,
      tasksCompletedCount: uTasksCompleted.length,
      wasteCount: uWaste.length,
      avgUserPrepMin,
      recentSales: uSales.slice(0, 5)
    }
  }, [selectedUserForStats, sales, expenses, tasks, wasteReports, comandas])

  const roleBadges = {
    owner: { label: 'DUEÑO', style: 'bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
    admin: { label: 'ADMINISTRADOR', style: 'bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
    employee: { label: 'EMPLEADO', style: 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800' }
  }

  const isPrimaryOwner = Boolean(
    editingUser?.is_primary || (editingUser && editingUser.username.trim().toLowerCase() === 'camilo osorio')
  )

  if (loading) return <p className="p-4 text-sm font-semibold text-[#9F6839]">Cargando usuarios...</p>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#432414] dark:text-[#FEE4D7] tracking-tight">
            Gestión de Usuarios & Personal
          </h2>
          <p className="text-xs font-semibold text-[#9F6839] dark:text-[#DABA8C] mt-0.5">
            Cuentas, credenciales, rendimiento individual y permisos del equipo Toffee
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Usuario</span>
        </button>
      </div>

      {pageError && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span>{pageError}</span>
        </div>
      )}

      {/* Grid de Tarjetas de Usuario */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {users.map((u) => {
          const isCurrentUser = currentUser?.id === u.id
          const badge = roleBadges[u.role] || roleBadges.employee
          const rawUAvatar = u.avatar_url || ''
          const uAvatar = processImageUrl(rawUAvatar)
          const isPrimary = Boolean(u.is_primary || u.username.trim().toLowerCase() === 'camilo osorio')

          return (
            <div
              key={u.id}
              className={`bg-white dark:bg-[#201009] border rounded-3xl p-5 flex flex-col justify-between shadow-xs transition-all ${
                isCurrentUser
                  ? 'border-[#9F6839] ring-2 ring-[#9F6839]/30 shadow-md'
                  : 'border-[#D4B28E]/60 dark:border-[#9F6839]/40 hover:border-[#9F6839]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  {uAvatar ? (
                    <img
                      src={uAvatar}
                      alt={u.username}
                      className="w-12 h-12 rounded-2xl object-cover border border-[#D4B28E]/50 shadow-xs"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-[#FEE4D7] dark:bg-[#34180D] text-[#9F6839] dark:text-[#DABA8C] font-extrabold text-xl flex items-center justify-center border border-[#D4B28E]/50">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full border uppercase tracking-wider ${badge.style}`}>
                    {badge.label}
                  </span>
                </div>

                <h3 className="text-base font-bold text-[#432414] dark:text-[#FEE4D7] flex items-center gap-1.5">
                  {u.username}
                  {isCurrentUser && (
                    <span className="text-[10px] font-bold bg-[#FEE4D7] text-[#9F6839] px-2 py-0.5 rounded-full border border-[#D4B28E]">
                      (Tú)
                    </span>
                  )}
                </h3>

                <div className="mt-4 pt-3 border-t border-[#D4B28E]/40 dark:border-[#9F6839]/30 space-y-1.5 text-xs text-[#9F6839] dark:text-[#DABA8C]">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-[#9F6839]" />
                    <span>Permisos: {u.role === 'owner' ? 'Acceso Total' : u.role === 'admin' ? 'Administración' : 'POS & Ventas'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-[#9F6839]" />
                    <span>Creado: {new Date(u.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[#D4B28E]/40 dark:border-[#9F6839]/30 space-y-2">
                <button
                  onClick={() => openStatsModal(u)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Ver Rendimiento & Stats</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(u)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-2xl bg-[#FEE4D7]/50 dark:bg-[#2E180E] hover:bg-[#D4B28E]/40 text-[#432414] dark:text-[#FEE4D7] border border-[#D4B28E]/60 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[#9F6839]" />
                    <span>Editar</span>
                  </button>

                  {!isPrimary && !isCurrentUser && (
                    <button
                      onClick={() => handleDeleteUser(u)}
                      className="p-2 rounded-2xl bg-red-50 dark:bg-red-950/40 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 dark:border-red-800 text-xs font-bold transition-all cursor-pointer"
                      title="Eliminar usuario"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal Rendimiento & Stats Personales de Usuario */}
      {selectedUserForStats && userStatsCalculated && (
        <Modal
          isOpen={Boolean(selectedUserForStats)}
          onClose={() => setSelectedUserForStats(null)}
          title={`Stats & Rendimiento de: ${selectedUserForStats.username}`}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#FEE4D7]/40 dark:bg-[#2A150C] border border-[#D4B28E] flex items-center gap-3">
              {selectedUserForStats.avatar_url ? (
                <img
                  src={processImageUrl(selectedUserForStats.avatar_url)}
                  alt={selectedUserForStats.username}
                  className="w-12 h-12 rounded-2xl object-cover border border-[#9F6839]"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-[#9F6839] text-white font-black text-xl flex items-center justify-center">
                  {selectedUserForStats.username.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h4 className="text-base font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                  {selectedUserForStats.username}
                </h4>
                <span className="text-xs font-bold text-[#9F6839] uppercase tracking-wider">
                  Rol: {selectedUserForStats.role}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] space-y-1">
                <span className="text-[11px] font-bold text-[#9F6839] uppercase flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Total Vendido
                </span>
                <p className="text-xl font-extrabold text-emerald-600">
                  ${userStatsCalculated.totalRevenue.toLocaleString()}
                </p>
                <span className="text-[10px] text-[#9F6839] font-medium">
                  {userStatsCalculated.salesCount} ventas registradas
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] space-y-1">
                <span className="text-[11px] font-bold text-[#9F6839] uppercase flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-blue-600" /> Promedio Ticket
                </span>
                <p className="text-xl font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                  ${Math.round(userStatsCalculated.ticketAverage).toLocaleString()}
                </p>
                <span className="text-[10px] text-[#9F6839] font-medium">
                  Por venta realizada
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#9F6839] uppercase flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-[#9F6839]" /> Producto Estrella Vendido
                </span>
                <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                  {userStatsCalculated.topProductName} ({userStatsCalculated.topProductQty} un.)
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-bold pt-2 border-t border-[#D4B28E]/40">
                <span className="text-[#9F6839] uppercase flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-[#9F6839]" /> Tareas Completadas
                </span>
                <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                  {userStatsCalculated.tasksCompletedCount} / {userStatsCalculated.tasksAssignedCount} asignadas
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-bold pt-2 border-t border-[#D4B28E]/40">
                <span className="text-[#9F6839] uppercase flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" /> Demora Promedio Comandas
                </span>
                <span className="text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7]">
                  {userStatsCalculated.avgUserPrepMin > 0 ? `${userStatsCalculated.avgUserPrepMin} min` : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-bold pt-2 border-t border-[#D4B28E]/40">
                <span className="text-[#9F6839] uppercase flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> Reportes de Daños
                </span>
                <span className="text-xs font-extrabold text-amber-600">
                  {userStatsCalculated.wasteCount} mermas reportadas
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForStats(null)}
                className="px-5 py-2.5 rounded-2xl bg-[#9F6839] text-white font-extrabold text-xs cursor-pointer shadow-md"
              >
                Cerrar Stats
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Crear / Editar Usuario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? `Editar Usuario: ${editingUser.username}` : 'Nuevo Usuario'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-xs font-bold">
              ⚠️ {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Nombre de Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej. carlos_barista"
              required
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] dark:border-[#9F6839]/60 text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Contraseña {editingUser ? '(Opcional: Vacío para conservar actual)' : '(Mínimo 8 caracteres)'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editingUser ? '•••••••• (vacío para no cambiar)' : 'Escribe una contraseña segura'}
              required={!editingUser}
              minLength={password ? 8 : undefined}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] dark:border-[#9F6839]/60 text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-[#9F6839]" /> Foto de Perfil (Avatar)
            </label>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#FEE4D7] dark:bg-[#2A150C] border border-[#D4B28E] hover:bg-[#9F6839] hover:text-white text-xs font-extrabold text-[#432414] dark:text-[#FEE4D7] transition-all cursor-pointer shadow-xs">
                <Upload className="w-4 h-4" />
                <span>Subir imagen</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-[#9F6839] font-medium">o escribe URL enlace</span>
            </div>

            <input
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://... o foto seleccionada"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] dark:border-[#9F6839]/60 text-xs font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Rol de Sistema
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isPrimaryOwner}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] dark:border-[#9F6839]/60 text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            >
              <option value="employee">Empleado (Ventas, Comandas, Inventario lectura)</option>
              <option value="admin">Administrador (Acceso completo salvo gestión usuarios)</option>
              <option value="owner">Dueño (Control total del sistema)</option>
            </select>
            {isPrimaryOwner && (
              <p className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                El rol del dueño principal está protegido permanentemente por ID y no se puede modificar.
              </p>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-[#D4B28E]/40">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 rounded-2xl bg-white dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839] text-xs font-bold text-[#432414] dark:text-[#FEE4D7] hover:bg-[#FEE4D7]/50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white text-xs font-extrabold shadow-md disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Guardando...' : editingUser ? 'Actualizar Usuario' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}