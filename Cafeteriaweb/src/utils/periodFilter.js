// Constantes y construcción de query para los filtros de período compartidos

export const MONTH_NAMES = [
  { num: 1, short: 'ene.', full: 'Enero' },
  { num: 2, short: 'feb.', full: 'Febrero' },
  { num: 3, short: 'mar.', full: 'Marzo' },
  { num: 4, short: 'abr.', full: 'Abril' },
  { num: 5, short: 'may.', full: 'Mayo' },
  { num: 6, short: 'jun.', full: 'Junio' },
  { num: 7, short: 'jul.', full: 'Julio' },
  { num: 8, short: 'ago.', full: 'Agosto' },
  { num: 9, short: 'sep.', full: 'Septiembre' },
  { num: 10, short: 'oct.', full: 'Octubre' },
  { num: 11, short: 'nov.', full: 'Noviembre' },
  { num: 12, short: 'dic.', full: 'Diciembre' }
]

export function buildPeriodQuery(params = {}, fallbackPeriod = 'all') {
  if (params.startDate && params.endDate) {
    return `start_date=${params.startDate}&end_date=${params.endDate}`
  }
  if (params.year && params.monthNum) {
    return `year=${params.year}&month_num=${params.monthNum}`
  }
  return `period=${params.period || fallbackPeriod}`
}
