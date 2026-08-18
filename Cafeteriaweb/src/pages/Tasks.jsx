import { useEffect, useState } from 'react'
import { api, API_URL } from '../api/client'
import Modal from '../components/Modal'
import { CheckSquare, Plus, CheckCircle2, User, AlertTriangle } from 'lucide-react'

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [selectedShift, setSelectedShift] = useState('Todos')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Modal Crear Tarea
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  async function loadData() {
    try {
      const [tasksData, usersData] = await Promise.all([
        api.get('/tasks'),
        api.get('/users')
      ])
      setTasks(tasksData || [])
      setUsers(usersData || [])
    } catch (err) {
      console.error('Error cargando tareas:', err)
      setPageError('No se pudieron cargar las tareas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Conexión SSE en tiempo real
    const eventSource = new EventSource(`${API_URL}/events`)
    eventSource.onmessage = (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch (e) {
        console.error('evento de tareas con payload inválido:', e)
        return
      }
      if (data.type === 'task_created' || data.type === 'task_status_updated') {
        loadData()
      }
    }

    eventSource.onerror = () => {
      console.error('conexión de eventos de tareas interrumpida, reintentando...')
    }

    return () => {
      eventSource.close()
    }
  }, [])

  function openCreateModal() {
    setTitle('')
    setDescription('')
    setAssignedTo('')
    setFormError('')
    setIsModalOpen(true)
  }

  async function handleCreateTask(e) {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')

    try {
      await api.post('/tasks', {
        title,
        description,
        assigned_to: assignedTo ? assignedTo : null
      })

      setIsModalOpen(false)
      await loadData()
    } catch (err) {
      setFormError(err.message || 'No se pudo crear la tarea')
    } finally {
      setSubmitting(false)
    }
  }

  const isTaskCompleted = (t) => t.status === 'done' || t.status === 'completed'

  async function toggleTaskStatus(task) {
    const newStatus = isTaskCompleted(task) ? 'pending' : 'done'
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: newStatus })
      await loadData()
    } catch (err) {
      alert('Error al actualizar el estado de la tarea: ' + (err.message || 'Error de conexión'))
    }
  }

  const completedCount = tasks.filter((t) => isTaskCompleted(t)).length
  const progressPercent = Math.round((completedCount / (tasks.length || 1)) * 100)

  const filteredTasks = tasks.filter((t) => {
    if (selectedShift === 'Todos') return true
    if (selectedShift === 'Pendientes') return !isTaskCompleted(t)
    if (selectedShift === 'Completadas') return isTaskCompleted(t)
    return true
  })

  if (loading) return <p className="p-4 text-sm font-semibold text-[#9F6839]">Cargando tareas operativas...</p>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#432414] dark:text-[#FEE4D7] tracking-tight">
            Tareas & Checklists de Turno
          </h2>
          <p className="text-xs font-semibold text-[#9F6839] dark:text-[#DABA8C] mt-0.5">
            Protocolos operativos de apertura, calibración de barra y cierre de cafetería
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#9F6839] hover:bg-[#835229] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nueva Tarea
        </button>
      </div>

      {pageError && (
        <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span>{pageError}</span>
        </div>
      )}

      {/* Barra de Progreso Operativo */}
      <div className="bg-[#FFFFFF] dark:bg-[#201009] border border-[#D4B28E] dark:border-[#9F6839]/40 rounded-3xl p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs font-bold text-[#432414] dark:text-[#FEE4D7] mb-2">
          <span className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#9F6839]" />
            Progreso Operativo del Día
          </span>
          <span className="text-[#9F6839] font-mono">
            {completedCount} de {tasks.length} completadas ({progressPercent}%)
          </span>
        </div>
        <div className="h-3 w-full bg-[#FEE4D7]/50 dark:bg-[#2A150C] rounded-full overflow-hidden border border-[#D4B28E]/60">
          <div
            className="h-full bg-[#9F6839] rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2">
        {['Todos', 'Pendientes', 'Completadas'].map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedShift(filter)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              selectedShift === filter
                ? 'bg-[#9F6839] text-white shadow-xs'
                : 'bg-white dark:bg-[#201009] border border-[#D4B28E] text-[#432414] dark:text-[#FEE4D7]'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Lista de Tareas */}
      <div className="space-y-3">
        {filteredTasks.map((t) => {
          const isDone = isTaskCompleted(t)
          return (
            <div
              key={t.id}
              onClick={() => toggleTaskStatus(t)}
              className={`p-4 rounded-3xl border transition-all cursor-pointer flex items-start justify-between gap-4 shadow-xs select-none ${
                isDone
                  ? 'bg-[#FEE4D7]/30 dark:bg-[#2E180E]/40 border-[#D4B28E]/40 opacity-75'
                  : 'bg-white dark:bg-[#201009] border-[#D4B28E] dark:border-[#9F6839]/40 hover:border-[#9F6839]'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className={`w-6 h-6 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${
                    isDone
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white dark:bg-[#150904] border-[#D4B28E] text-transparent'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 fill-current" />
                </div>

                <div>
                  <h4 className={`text-sm font-bold tracking-tight ${isDone ? 'line-through text-[#9F6839]' : 'text-[#432414] dark:text-[#FEE4D7]'}`}>
                    {t.title}
                  </h4>
                  {t.description && (
                    <p className="text-xs text-[#9F6839] dark:text-[#DABA8C] mt-1">{t.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[10px] text-[#9F6839] dark:text-[#DABA8C] font-semibold">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-[#9F6839]" />
                      Asignada a: <strong className="text-[#432414] dark:text-[#FEE4D7]">{t.assigned_to_name || t.assigned_to_username || 'Todo el Equipo'}</strong>
                    </span>
                    <span>• Asignada por: <strong className="text-[#432414] dark:text-[#FEE4D7]">{t.created_by_name || t.creator_username || 'Administrador'}</strong></span>
                  </div>
                </div>
              </div>

              {isDone && (
                <span className="text-[10px] text-emerald-600 font-extrabold shrink-0">
                  ✓ Completada
                </span>
              )}
            </div>
          )
        })}
        {filteredTasks.length === 0 && (
          <p className="text-xs text-[#9F6839] text-center py-8 font-semibold">
            No hay tareas en esta categoría.
          </p>
        )}
      </div>

      {/* Modal Crear Tarea */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Crear Nueva Tarea Operativa">
        <form onSubmit={handleCreateTask} className="space-y-4">
          {formError && (
            <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
              ⚠️ {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Título de la Tarea
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Calibrar molino de café / Limpieza de filtros"
              required
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Instrucciones / Detalles
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción del protocolo o procedimiento a seguir..."
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#432414] dark:text-[#DABA8C] uppercase tracking-wider mb-1">
              Asignar a Empleado / Cajero (Opcional)
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#150904] border border-[#D4B28E] text-sm font-semibold text-[#432414] dark:text-[#FEE4D7]"
            >
              <option value="">Todo el Equipo (General)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>

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
              {submitting ? 'Creando...' : 'Crear Tarea'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}