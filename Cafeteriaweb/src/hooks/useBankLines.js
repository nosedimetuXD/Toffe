import { useState } from 'react'
import { createBankLine } from '../utils/paymentUtils'

// Estado compartido del desglose de bancos (transferencia / pago mixto).
// onLinesChange recibe las líneas actualizadas y el campo modificado.
export function useBankLines(onLinesChange) {
  const [lines, setLines] = useState([createBankLine()])

  function addLine() {
    setLines((prev) => [...prev, createBankLine()])
  }

  function removeLine(index) {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function updateLine(index, field, value) {
    setLines((prev) => {
      const next = prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
      if (onLinesChange) onLinesChange(next, field)
      return next
    })
  }

  function resetLines(initial = [createBankLine()]) {
    setLines(initial)
  }

  return { lines, setLines, addLine, removeLine, updateLine, resetLines }
}
