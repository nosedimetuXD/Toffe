import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user')
    if (!saved) return null
    try {
      return JSON.parse(saved)
    } catch (e) {
      console.error('usuario guardado corrupto, se descarta la sesión local:', e)
      localStorage.removeItem('user')
      return null
    }
  })

  // Sincronización automática de perfil con PostgreSQL en cada carga de app
  useEffect(() => {
    async function syncUserProfile() {
      const token = localStorage.getItem('token')
      if (!token || !user) return
      try {
        const users = await api.get('/users')
        if (Array.isArray(users)) {
          const freshUser = users.find((u) => u.id === user.id || u.username === user.username)
          if (freshUser) {
            setUser((prev) => {
              const updated = { ...prev, ...freshUser }
              localStorage.setItem('user', JSON.stringify(updated))
              return updated
            })
          }
        }
      } catch (e) {
        console.error('no se pudo sincronizar el perfil del usuario:', e)
      }
    }

    syncUserProfile()
  }, [])

  async function login(username, password) {
    const data = await api.post('/login', { username, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  function updateUser(updatedUser) {
    const nextUser = { ...user, ...updatedUser }
    localStorage.setItem('user', JSON.stringify(nextUser))
    setUser(nextUser)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}