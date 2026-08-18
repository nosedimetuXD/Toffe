import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, API_URL } from './client'

let store

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}

function errorResponse(status, text) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text
  }
}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value
    },
    removeItem: (key) => {
      delete store[key]
    }
  })
  vi.stubGlobal('window', { location: { pathname: '/pos', href: '/pos' } })
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API_URL', () => {
  it('usa el backend local por defecto', () => {
    expect(API_URL).toBe('http://localhost:8080')
  })
})

describe('api.get', () => {
  it('llama al backend sin header de autorización cuando no hay token', async () => {
    const data = await api.get('/products')

    expect(data).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:8080/products')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('agrega el header Bearer cuando hay token guardado', async () => {
    localStorage.setItem('token', 'jwt-de-prueba')

    await api.get('/products')

    const [, options] = fetch.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer jwt-de-prueba')
  })

  it('devuelve null en respuestas 204 sin contenido', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}), text: async () => '' })

    await expect(api.get('/products')).resolves.toBeNull()
  })
})

describe('métodos con cuerpo', () => {
  it('serializa el cuerpo y usa el método correcto', async () => {
    const cases = [
      [() => api.post('/products', { name: 'Latte' }), 'POST'],
      [() => api.put('/products/1', { name: 'Latte' }), 'PUT'],
      [() => api.patch('/comandas/1/status', { status: 'listo' }), 'PATCH']
    ]

    for (const [call, method] of cases) {
      fetch.mockClear()
      await call()
      const [, options] = fetch.mock.calls[0]
      expect(options.method).toBe(method)
      expect(JSON.parse(options.body)).toBeTypeOf('object')
    }
  })

  it('delete no envía cuerpo', async () => {
    await api.delete('/products/1')

    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:8080/products/1')
    expect(options.method).toBe('DELETE')
    expect(options.body).toBeUndefined()
  })
})

describe('manejo de errores', () => {
  it('lanza el texto devuelto por el backend', async () => {
    fetch.mockResolvedValueOnce(errorResponse(400, 'la venta debe tener al menos un producto'))

    await expect(api.post('/sales', {})).rejects.toThrow('la venta debe tener al menos un producto')
  })

  it('usa un mensaje genérico cuando el backend no devuelve texto', async () => {
    fetch.mockResolvedValueOnce(errorResponse(500, ''))

    await expect(api.get('/sales')).rejects.toThrow('Error 500')
  })

  it('limpia la sesión y redirige al login ante un 401', async () => {
    localStorage.setItem('token', 'jwt-vencido')
    localStorage.setItem('user', '{"username":"ana"}')
    fetch.mockResolvedValueOnce(errorResponse(401, 'token inválido o expirado'))

    await expect(api.get('/sales')).rejects.toThrow('token inválido o expirado')

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('no redirige si ya se está en la pantalla de login', async () => {
    window.location.pathname = '/login'
    window.location.href = '/login-original'
    fetch.mockResolvedValueOnce(errorResponse(401, 'usuario o contraseña incorrectos'))

    await expect(api.post('/login', {})).rejects.toThrow('usuario o contraseña incorrectos')

    expect(window.location.href).toBe('/login-original')
  })
})
