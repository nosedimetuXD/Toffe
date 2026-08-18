export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getToken() {
    return localStorage.getItem('token')
}

async function request(path, options = {}) {
    const token = getToken()

    let response
    try {
        response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers
            }
        })
    } catch (err) {
        console.error(`fallo de red en ${path}:`, err)
        throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.')
    }

    if (!response.ok) {
        if (response.status === 401) {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            if (window.location.pathname !== '/login') {
                window.location.href = '/login'
            }
        }
        const errorText = await response.text()
        throw new Error(errorText || `Error ${response.status}`)
    }

    if (response.status === 204) return null
    try {
        return await response.json()
    } catch (err) {
        console.error(`respuesta no válida en ${path}:`, err)
        throw new Error('El servidor devolvió una respuesta inválida')
    }
}

// Carga varios recursos a la vez sin ocultar los que fallan: devuelve los datos
// que sí llegaron y los nombres de los que no, para poder avisar al usuario.
export async function loadAllSettled(requests) {
    const entries = Object.entries(requests)
    const results = await Promise.allSettled(entries.map(([, promise]) => promise))

    const data = {}
    const failed = []
    results.forEach((result, i) => {
        const [key] = entries[i]
        if (result.status === 'fulfilled') {
            data[key] = result.value
        } else {
            data[key] = null
            failed.push(key)
            console.error(`no se pudo cargar ${key}:`, result.reason)
        }
    })

    return { data, failed }
}

export const api = {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (path) => request(path, { method: 'DELETE' })
}