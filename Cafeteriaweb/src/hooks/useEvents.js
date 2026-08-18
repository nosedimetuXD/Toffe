import { useEffect } from 'react'
import { API_URL } from '../api/client'

export function useEvents(eventTypes, onEvent) {
    useEffect(() => {
        const token = localStorage.getItem('token')
        if (!token) return

        const evtSource = new EventSource(`${API_URL}/events?token=${encodeURIComponent(token)}`)

        const listeners = eventTypes.map((type) => {
            const handler = (e) => onEvent(type, JSON.parse(e.data))
            evtSource.addEventListener(type, handler)
            return { type, handler }
        })

        return () => {
            listeners.forEach(({ type, handler }) => evtSource.removeEventListener(type, handler))
            evtSource.close()
        }
    }, [eventTypes, onEvent])
}