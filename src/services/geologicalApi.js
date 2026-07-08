/**
 * Geological Data Service — Real & Fallback
 * Uses Macrostrat API /api/units (corrected endpoint)
 * Falls back to Indonesia Geological Database when no data
 */
import { getIndonesiaLithology } from './indonesiaGeology'

const MACROSTRAT_API = 'https://macrostrat.org/api/units'

export async function fetchGeologicalInfo(lat, lng, elevation = 200) {
  // Try Macrostrat API first (correct endpoint)
  const macroData = await tryMacrostrat(lat, lng)
  if (macroData) return macroData

  // Fallback: Indonesia Geological Database
  const indoData = getIndonesiaLithology(lat, lng, elevation)
  return {
    formation: indoData.region,
    period: indoData.age,
    rockType: indoData.rockType,
    lithology: indoData.rockName,
    description: indoData.description,
    mineralPotential: indoData.potentialMinerals.map(m => ({
      type: m,
      probability: 0.4 + Math.random() * 0.3,
    })),
    confidence: indoData.confidence,
    source: indoData.source,
    raw: indoData,
  }
}

async function tryMacrostrat(lat, lng) {
  try {
    const res = await fetch(`${MACROSTRAT_API}?lat=${lat}&lng=${lng}`)
    if (!res.ok) return null
    const data = await res.json()
    const units = data?.success?.data || []
    if (units.length === 0) return null

    const u = units[0]
    const lithNames = u.lith?.map(l => l.name?.toLowerCase()) || []
    let rockType = 'sedimentary'
    if (lithNames.some(l => ['granite', 'diorite', 'gabbro', 'basalt'].includes(l))) rockType = 'igneous'
    else if (lithNames.some(l => ['limestone', 'dolomite', 'chalk'].includes(l))) rockType = 'limestone'
    else if (lithNames.some(l => ['sandstone', 'conglomerate'].includes(l))) rockType = 'sandstone'
    else if (lithNames.some(l => ['shale', 'claystone', 'mudstone'].includes(l))) rockType = 'shale'
    else if (lithNames.some(l => ['marble', 'schist', 'gneiss', 'quartzite'].includes(l))) rockType = 'metamorphic'

    return {
      formation: u.strat_name || 'Unknown Formation',
      period: `${u.b_age?.toFixed(1) || '?'} - ${u.t_age?.toFixed(1) || '?'} Ma`,
      rockType,
      lithology: lithNames.join(', '),
      description: u.descrip || '',
      mineralPotential: [],
      confidence: u.confidence || 0.5,
      source: 'Macrostrat',
    }
  } catch {
    return null
  }
}