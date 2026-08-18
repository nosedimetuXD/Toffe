// Utilidades compartidas para el desglose de bancos y la construcción de la forma de pago

export const DEFAULT_BANK = 'Bre-B/Llave'

export function createBankLine(amount = '') {
  return { bank: DEFAULT_BANK, amount }
}

export function formatMoney(value) {
  return (Number(value) || 0).toLocaleString()
}

// "Nequi ($10.000) + Bre-B/Llave" — omite el monto cuando no se especifica
export function bankLineParts(bankLines) {
  return bankLines
    .filter((l) => l.bank.trim() !== '')
    .map((l) => (l.amount ? `${l.bank.trim()} ($${Number(l.amount).toLocaleString()})` : l.bank.trim()))
}

// "Nequi: $10.000 | Bre-B/Llave: $5.000"
export function bankDetailsString(bankLines) {
  return bankLines.map((b) => `${b.bank.trim()}: $${Number(b.amount).toLocaleString()}`).join(' | ')
}

export function buildExpensePaymentMethod(paymentMethod, { bankLines, cashAmount }) {
  const bankParts = bankLineParts(bankLines)

  if (paymentMethod === 'transferencia') {
    return bankParts.length > 0 ? `transferencia: ${bankParts.join(' + ')}` : 'transferencia'
  }

  if (paymentMethod === 'mixto') {
    const cashPart = cashAmount ? `$${Number(cashAmount).toLocaleString()} Efectivo` : 'Efectivo'
    const bankStr = bankParts.length > 0 ? bankParts.join(' + ') : 'Transferencia'
    return `mixto (${cashPart} + ${bankStr})`
  }

  return paymentMethod
}
