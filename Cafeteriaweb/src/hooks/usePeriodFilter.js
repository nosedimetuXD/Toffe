import { useState } from 'react'

// Estado y acciones compartidas del modal de filtro por período
// (presets, mes/año y rango personalizado). onApply recibe los params
// listos para buildPeriodQuery.
export function usePeriodFilter({ initialPeriod, initialLabel, initialTab = 'preset', onApply }) {
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [displayLabel, setDisplayLabel] = useState(initialLabel)
  const [period, setPeriod] = useState(initialPeriod)
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  function selectPreset(presetKey, label) {
    setPeriod(presetKey)
    setDisplayLabel(label)
    setIsFilterModalOpen(false)
    onApply({ period: presetKey })
  }

  function selectMonthYear(year, monthNum, monthFull) {
    setSelectedYear(year)
    setSelectedMonth(monthNum)
    setDisplayLabel(`${monthFull} de ${year}`)
    setIsFilterModalOpen(false)
    onApply({ year, monthNum })
  }

  function applyCustomRange(e) {
    e.preventDefault()
    if (!startDate || !endDate) {
      alert('Por favor selecciona una fecha de inicio y de fin')
      return
    }
    setDisplayLabel(`${startDate} al ${endDate}`)
    setIsFilterModalOpen(false)
    onApply({ startDate, endDate })
  }

  return {
    isFilterModalOpen,
    setIsFilterModalOpen,
    activeTab,
    setActiveTab,
    displayLabel,
    period,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectPreset,
    selectMonthYear,
    applyCustomRange
  }
}
