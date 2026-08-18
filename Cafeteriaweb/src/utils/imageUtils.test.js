import { describe, it, expect } from 'vitest'
import { processImageUrl } from './imageUtils'

describe('processImageUrl', () => {
  it('devuelve cadena vacía para valores vacíos', () => {
    expect(processImageUrl('')).toBe('')
    expect(processImageUrl(null)).toBe('')
    expect(processImageUrl(undefined)).toBe('')
  })

  it('recorta espacios de enlaces normales', () => {
    expect(processImageUrl('  https://cdn.example.com/foto.png  ')).toBe('https://cdn.example.com/foto.png')
  })

  it('convierte enlaces de Google Drive con formato /file/d/ID', () => {
    expect(processImageUrl('https://drive.google.com/file/d/ABC123/view?usp=sharing'))
      .toBe('https://lh3.googleusercontent.com/d/ABC123')
  })

  it('convierte enlaces de Google Drive con parámetro id', () => {
    expect(processImageUrl('https://drive.google.com/uc?export=view&id=XYZ789'))
      .toBe('https://lh3.googleusercontent.com/d/XYZ789')
  })

  it('prioriza el formato /file/d/ID cuando el enlace tiene ambos', () => {
    expect(processImageUrl('https://drive.google.com/file/d/ABC123/view?id=OTRO'))
      .toBe('https://lh3.googleusercontent.com/d/ABC123')
  })

  it('deja intactos los data URLs', () => {
    const dataUrl = 'data:image/webp;base64,AAAA'
    expect(processImageUrl(dataUrl)).toBe(dataUrl)
  })
})
