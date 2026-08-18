import { useEffect } from 'react'
import { API_URL } from '../api/client'

export function useEvents(eventTypes, onEvent) {
    useEffect(() => {
        const token = localStorage.getItem('token')
        if (!token) return

        const evtSource = new EventSource(`${API_URL}/events?token=${encodeURIComponent(token)}`)

        const listeners = eventTypes.map((type) => {
            const handler = (e) => {
                let data
                try {
                    data = JSON.parse(e.data)
                } catch (err) {
                    console.error(`evento ${type} con payload inválido:`, err)
                    return
                }
                onEvent(type, data)
            }
            evtSource.addEventListener(type, handler)
            return { type, handler }
        })

        // El navegador reconecta solo, pero sin este log una caída del stream
        // pasaría totalmente inadvertida
        const onError = () => {
            console.error('conexión de eventos interrumpida, reintentando...')
        }
        evtSource.addEventListener('error', onError)

        return () => {
            listeners.forEach(({ type, handler }) => evtSource.removeEventListener(type, handler))
            evtSource.removeEventListener('error', onError)
            evtSource.close()
        }
    }, [eventTypes, onEvent])
}
