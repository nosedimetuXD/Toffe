import { describe, it, expect } from 'vitest'
import { AVAILABLE_UNITS, convertQuantity, formatConvertedHint } from './unitConverter'

describe('AVAILABLE_UNITS', () => {
  it('expone unidades con valor, etiqueta y tipo', () => {
    expect(AVAILABLE_UNITS.length).toBeGreaterThan(0)
    for (const unit of AVAILABLE_UNITS) {
      expect(unit).toEqual({
        value: expect.any(String),
        label: expect.any(String),
        type: expect.stringMatching(/^(volume|mass|unit)$/)
      })
    }
  })
})

describe('convertQuantity', () => {
  it('devuelve 0 para valores no numéricos o no positivos', () => {
    expect(convertQuantity('abc', 'ml', 'L')).toBe(0)
    expect(convertQuantity(0, 'ml', 'L')).toBe(0)
    expect(convertQuantity(-5, 'ml', 'L')).toBe(0)
    expect(convertQuantity(null, 'ml', 'L')).toBe(0)
    expect(convertQuantity(undefined, 'ml', 'L')).toBe(0)
  })

  it('devuelve el valor original si falta alguna unidad', () => {
    expect(convertQuantity(200, '', 'L')).toBe(200)
    expect(convertQuantity(200, 'ml', '')).toBe(200)
  })

  it('devuelve el valor original si las unidades son equivalentes', () => {
    expect(convertQuantity(200, 'ml', 'ml')).toBe(200)
    expect(convertQuantity(200, ' ML ', 'ml')).toBe(200)
  })

  it('convierte volumen entre ml y litros', () => {
    expect(convertQuantity(200, 'ml', 'L')).toBeCloseTo(0.2)
    expect(convertQuantity(300, 'ml', 'litros')).toBeCloseTo(0.3)
    expect(convertQuantity(300, 'ml', 'litro')).toBeCloseTo(0.3)
    expect(convertQuantity(1.5, 'L', 'ml')).toBe(1500)
    expect(convertQuantity(2, 'litros', 'ml')).toBe(2000)
    expect(convertQuantity(2, 'litro', 'ml')).toBe(2000)
  })

  it('convierte masa entre mg, g y kg', () => {
    expect(convertQuantity(500, 'mg', 'g')).toBeCloseTo(0.5)
    expect(convertQuantity(2000000, 'mg', 'kg')).toBeCloseTo(2)
    expect(convertQuantity(500, 'g', 'kg')).toBeCloseTo(0.5)
    expect(convertQuantity(2, 'g', 'mg')).toBe(2000)
    expect(convertQuantity(2, 'kg', 'g')).toBe(2000)
    expect(convertQuantity(2, 'kg', 'mg')).toBe(2000000)
  })

  it('convierte onzas a masa y a volumen', () => {
    expect(convertQuantity(1, 'oz', 'g')).toBeCloseTo(28.3495)
    expect(convertQuantity(10, 'oz', 'kg')).toBeCloseTo(0.283495)
    expect(convertQuantity(1, 'oz', 'ml')).toBeCloseTo(29.5735)
    expect(convertQuantity(10, 'oz', 'L')).toBeCloseTo(0.295735)
    expect(convertQuantity(10, 'oz', 'litros')).toBeCloseTo(0.295735)
  })

  it('acepta valores en texto y unidades con mayúsculas o espacios', () => {
    expect(convertQuantity('250', ' Ml ', ' L ')).toBeCloseTo(0.25)
  })

  it('devuelve el valor original si no existe conversión definida', () => {
    expect(convertQuantity(3, 'unidad', 'kg')).toBe(3)
    expect(convertQuantity(3, 'ml', 'g')).toBe(3)
  })
})

describe('formatConvertedHint', () => {
  it('devuelve null cuando falta el valor o alguna unidad', () => {
    expect(formatConvertedHint(0, 'ml', 'L')).toBeNull()
    expect(formatConvertedHint('', 'ml', 'L')).toBeNull()
    expect(formatConvertedHint(200, null, 'L')).toBeNull()
    expect(formatConvertedHint(200, 'ml', undefined)).toBeNull()
  })

  it('devuelve null cuando las unidades son equivalentes', () => {
    expect(formatConvertedHint(200, 'ml', 'ML')).toBeNull()
    expect(formatConvertedHint(200, ' g ', 'g')).toBeNull()
  })

  it('describe la conversión con el valor convertido', () => {
    expect(formatConvertedHint(200, 'ml', 'L')).toBe('200 ml ➔ 0.2 L')
    expect(formatConvertedHint(2, 'kg', 'g')).toBe('2 kg ➔ 2000 g')
  })

  it('redondea a cuatro decimales los resultados no enteros', () => {
    expect(formatConvertedHint(1, 'oz', 'g')).toBe('1 oz ➔ 28.3495 g')
    expect(formatConvertedHint(1, 'mg', 'kg')).toBe('1 mg ➔ 0 kg')
  })
})
