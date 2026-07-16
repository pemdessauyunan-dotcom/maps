import { useGeosat } from '../../context/GeosatContext'

export default function AnalysisPanel() {
  const { state } = useGeosat()
  const { ui, analysis } = state
  const { activeTab, loading } = ui

  if (loading) {
    return <div className="loading" style={{ textAlign: 'center', padding: 20, fontSize: 13, color: '#64748b' }}>⏳ Menganalisis...</div>
  }

  if (!analysis.thermal) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👆</div>
        <p style={{ color: '#64748b', fontSize: 13 }}>Klik peta untuk memulai analisis</p>
      </div>
    )
  }

  // Home tab — compact overview
  if (activeTab === 'home') {
    return <HomeView analysis={analysis} />
  }

  // Detail tabs
  switch (activeTab) {
    case 'spectrum': return <SpectrumView analysis={analysis} />
    case 'thermal': return <ThermalView analysis={analysis} />
    case 'alteration': return <AlterationView analysis={analysis} />
    case 'lineament': return <LineamentView analysis={analysis} />
    case 'vegetation': return <VegetationView analysis={analysis} />
    case 'depth': return <DepthView analysis={analysis} />
    case 'prospectivity': return <ProspectivityView analysis={analysis} />
    default: return <HomeView analysis={analysis} />
  }
}

// ===== HOME VIEW =====
function HomeView({ analysis }) {
  const { thermal, prospectivity, depth, geology, epithermal } = analysis
  return (
    <div>
      {/* Coordinate header */}
      <div className="panel" style={{ marginBottom: 8 }}>
        <div className="panel-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="panel-item">
            <span className="panel-label">LAT</span>
            <span className="panel-value highlight">{thermal.lat.toFixed(5)}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">LNG</span>
            <span className="panel-value highlight">{thermal.lng.toFixed(5)}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Elevasi</span>
            <span className="panel-value">{thermal.elevation}m</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Batuan</span>
            <span className="panel-value">{thermal.lithology.rockEmoji} {thermal.lithology.rockLabel}</span>
          </div>
        </div>
      </div>

      {/* Thermal card */}
      <div className="panel" style={{ marginBottom: 8 }}>
        <div className="panel-header">🌡️ Thermal</div>
        <div className="panel-grid">
          <div className="panel-item">
            <span className="panel-label">Suhu</span>
            <span className={`panel-value ${thermal.temperature.surface > 35 ? 'danger' : thermal.temperature.surface > 28 ? 'warning' : ''}`}>
              {thermal.temperature.surface}°C
            </span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Anomali</span>
            <span className={`panel-value ${thermal.anomalyLevel === 'critical' ? 'danger' : thermal.anomalyLevel === 'high' ? 'warning' : ''}`}>
              {thermal.anomalyLevel === 'normal' ? 'Normal' : `${(thermal.riskScore * 100).toFixed(0)}%`}
            </span>
          </div>
        </div>
        {thermal.anomalies.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {thermal.anomalies.slice(0, 4).map((a, i) => (
              <span key={i} style={{ fontSize: 10, padding: '2px 6px', background: '#1a2332', border: '1px solid #1e3a5f', borderRadius: 4 }}>
                {a.emoji} {a.label} <span style={{ color: '#3b82f6' }}>{(a.confidence * 100).toFixed(0)}%</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Prospectivity */}
      {prospectivity && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-header">🎯 Prospektivitas</div>
          <div style={{ textAlign: 'center', padding: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: prospectivity.riskLevel === 'high' ? '#ef4444' : '#f59e0b' }}>
              {(prospectivity.score * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Confidence {(prospectivity.confidence * 100).toFixed(0)}%</div>
          </div>
          {prospectivity.mineralPredictions.slice(0, 3).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: '1px solid #1e3a5f' }}>
              <span>{p.emoji} {p.label}</span>
              <span style={{ fontWeight: 700, color: p.confidence === 'high' ? '#ef4444' : '#f59e0b' }}>{(p.probability * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Depth */}
      {depth?.depth && (
        <div className="panel" style={{ marginBottom: 8, cursor: 'pointer' }}>
          <div className="panel-header">📏 Kedalaman</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>{depth.depth}<small style={{ fontSize: 11, color: '#64748b' }}>m</small></span>
            <span style={{ fontSize: 11 }}>{depth.classification.emoji} {depth.classification.label}</span>
          </div>
        </div>
      )}

      {/* Geology */}
      {geology && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-header">🪨 Geologi</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{geology.lithology || geology.rockType}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>{geology.formation}</div>
          {epithermal?.potential && (
            <div style={{ marginTop: 6, padding: 4, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 4, fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
              🏆 Potensi Epitermal: {(epithermal.score * 100).toFixed(0)}%
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ===== SPECTRUM VIEW =====
function SpectrumView({ analysis }) {
  const { spectral } = analysis
  if (!spectral) return null
  const { indices, anomalyLevel } = spectral

  const items = [
    { key: 'iron_oxide', label: 'Iron Oxide', emoji: '🟤' },
    { key: 'clay_minerals', label: 'Clay Minerals', emoji: '🟠' },
    { key: 'ferrous_minerals', label: 'Ferrous Minerals', emoji: '🔵' },
    { key: 'silica_index', label: 'Silica/Quartz', emoji: '⚪' },
    { key: 'ndvi', label: 'Vegetation Stress', emoji: '🟢' },
    { key: 'alteration_index', label: 'Alteration Index', emoji: '🔴' },
  ]

  return (
    <div>
      <div className={`panel-header`} style={{ fontSize: 13, marginBottom: 8 }}>🔬 Spektrum</div>
      <div style={{ padding: '4px 8px', marginBottom: 8, borderRadius: 4, fontSize: 11, fontWeight: 700, textAlign: 'center',
        background: anomalyLevel === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
        color: anomalyLevel === 'high' ? '#ef4444' : '#f59e0b',
        border: `1px solid ${anomalyLevel === 'high' ? '#ef4444' : '#f59e0b'}` }}>
        {anomalyLevel === 'high' ? 'TINGGI' : anomalyLevel === 'moderate' ? 'SEDANG' : 'RENDAH'}
      </div>
      {items.map(({ key, label, emoji }) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
            <span>{emoji} {label}</span>
            <span style={{ fontWeight: 700, color: '#3b82f6' }}>{(indices[key] * 100).toFixed(0)}%</span>
          </div>
          <div style={{ height: 5, background: '#0a0e17', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${indices[key] * 100}%`, background: 'linear-gradient(90deg, #3b82f6, #ef4444)', borderRadius: 3 }} />
          </div>
        </div>
      ))}
      {analysis.alteration && (
        <div className="panel" style={{ marginTop: 8 }}>
          <div className="panel-header">🧱 {analysis.alteration.name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{analysis.alteration.description}</div>
        </div>
      )}
    </div>
  )
}

// ===== THERMAL VIEW =====
function ThermalView({ analysis }) {
  const { thermal } = analysis
  if (!thermal) return null
  const { temperature, lithology, anomalies, terrain, elevation } = thermal

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🌡️ Thermal Detail</div>
      <div className="panel" style={{ marginBottom: 8 }}>
        <div className="panel-grid">
          <div className="panel-item">
            <span className="panel-label">Suhu</span>
            <span className="panel-value highlight" style={{ fontSize: 20 }}>{temperature.surface}°C</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Anomali</span>
            <span className={`panel-value ${temperature.anomaly > 2 ? 'danger' : temperature.anomaly < -2 ? '' : ''}`}>
              {temperature.anomaly > 0 ? '+' : ''}{temperature.anomaly}°C
            </span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Batuan</span>
            <span className="panel-value">{lithology.rockEmoji} {lithology.rockLabel}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Elevasi</span>
            <span className="panel-value">{elevation}m</span>
          </div>
        </div>
      </div>
      {anomalies.length > 0 && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-header">🔍 Anomali</div>
          {anomalies.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: '1px solid #1e3a5f' }}>
              <span>{a.emoji} {a.label}</span>
              <span style={{ color: '#94a3b8' }}>{a.tempAnomaly > 0 ? '+' : ''}{a.tempAnomaly}°C</span>
              <span style={{ fontWeight: 700, color: '#3b82f6' }}>{(a.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== ALTERATION VIEW =====
function AlterationView({ analysis }) {
  const { alteration, epithermal } = analysis
  if (!alteration) return null
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🧱 Alterasi</div>
      <div className="panel" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{alteration.emoji}</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{alteration.name}</span>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{alteration.description}</div>
        <div className="panel-grid">
          <div className="panel-item">
            <span className="panel-label">Suhu</span>
            <span className="panel-value">{alteration.temperature}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Intensitas</span>
            <span className="panel-value">{(alteration.intensity * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
      {epithermal && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-header">🏆 Epitermal</div>
          <div style={{ textAlign: 'center', padding: 8, fontSize: 22, fontWeight: 800, color: epithermal.potential ? '#ef4444' : '#64748b' }}>
            {(epithermal.score * 100).toFixed(0)}%
          </div>
          {epithermal.depositTypes?.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: '1px solid #1e3a5f' }}>
              <span>{d.type}</span>
              <span style={{ color: '#3b82f6' }}>{(d.conf * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== LINEAMENT VIEW =====
function LineamentView({ analysis }) {
  const { lineament } = analysis
  if (!lineament) return null
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🧵 Lineament</div>
      <div className="panel" style={{ marginBottom: 8 }}>
        <div className="panel-grid">
          <div className="panel-item">
            <span className="panel-label">Kerapatan</span>
            <span className="panel-value">{(lineament.density * 100).toFixed(1)}%</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Lineament</span>
            <span className="panel-value">{lineament.totalLineaments}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Arah</span>
            <span className="panel-value">{lineament.dominantDirection || '—'}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Confidence</span>
            <span className="panel-value">{(lineament.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>{lineament.summary}</div>
      </div>
    </div>
  )
}

// ===== VEGETATION VIEW =====
function VegetationView({ analysis }) {
  const { vegetation } = analysis
  if (!vegetation) return null
  const { indices, anomaly, stressPattern, stressFactors } = vegetation
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🌿 Vegetasi</div>
      <div style={{ padding: '4px 8px', marginBottom: 8, borderRadius: 4, fontSize: 11, fontWeight: 700, textAlign: 'center',
        background: anomaly.level === 'critical' ? 'rgba(239,68,68,0.15)' : anomaly.level === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
        color: anomaly.level === 'critical' ? '#ef4444' : anomaly.level === 'high' ? '#f59e0b' : '#22c55e',
        border: `1px solid ${anomaly.level === 'critical' ? '#ef4444' : anomaly.level === 'high' ? '#f59e0b' : '#22c55e'}` }}>
        {anomaly.level === 'critical' ? '⚠️ KRITIS' : anomaly.level === 'high' ? '⚠️ Stress' : '✓ Normal'}
      </div>
      <div className="panel" style={{ marginBottom: 8 }}>
        <div className="panel-grid">
          <div className="panel-item">
            <span className="panel-label">NDVI</span>
            <span className="panel-value">{indices.ndvi.toFixed(3)}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">NDRE</span>
            <span className="panel-value">{indices.ndre.toFixed(3)}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Red Edge</span>
            <span className="panel-value">{indices.redEdge.toFixed(3)}</span>
          </div>
          <div className="panel-item">
            <span className="panel-label">Kesehatan</span>
            <span className={`panel-value ${indices.health < 0.4 ? 'danger' : indices.health < 0.6 ? 'warning' : 'success'}`}>
              {(indices.health * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginBottom: 8 }}>
        <div className="panel-header">{stressPattern.emoji} {stressPattern.label}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{stressPattern.desc}</div>
      </div>
      {stressFactors.length > 0 && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-header">Faktor Stress</div>
          {stressFactors.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
              <span>{s.mineral}</span>
              <span style={{ color: '#94a3b8' }}>{s.indicator}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== DEPTH VIEW =====
function DepthView({ analysis }) {
  const { depth } = analysis
  if (!depth?.depth) return null
  const { depth: d, minDepth, maxDepth, confidence, classification, summary, recommendedExploration } = depth
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📏 Kedalaman</div>
      <div className="panel" style={{ marginBottom: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: '#3b82f6' }}>{d}<small style={{ fontSize: 14, color: '#64748b' }}>m</small></div>
        <div style={{ fontSize: 14, fontWeight: 600, margin: '4px 0' }}>{classification.emoji} {classification.label}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>Range: {minDepth}m - {maxDepth}m</div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Confidence: {(confidence * 100).toFixed(0)}%</div>
      </div>
      <div className="panel" style={{ marginBottom: 8 }}>
        <div className="panel-header">📊 Zona Alterasi</div>
        {Object.entries({
          silicification: { label: 'Silisifikasi', min: 0, max: 500, optimal: 200 },
          argillic: { label: 'Argilik', min: 100, max: 1000, optimal: 400 },
          propylitic: { label: 'Propilitik', min: 500, max: 2000, optimal: 1000 },
          potassic: { label: 'Potasik', min: 1000, max: 3000, optimal: 1800 },
        }).map(([key, info]) => {
          const isActive = d >= info.min && d <= info.max
          const isOptimal = d >= info.optimal - 100 && d <= info.optimal + 100
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 10,
              borderBottom: '1px solid #1e3a5f', borderRadius: 3,
              background: isOptimal ? 'rgba(34,197,94,0.12)' : isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
              borderLeft: isOptimal ? '2px solid #22c55e' : 'none',
            }}>
              <span style={{ width: 70, fontWeight: 600 }}>{isOptimal ? '⭐' : isActive ? '▫' : ' '} {info.label}</span>
              <span style={{ width: 60, color: '#64748b' }}>{info.min}m-{info.max}m</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>{summary}</div>
      <div style={{ padding: 8, background: '#0a0e17', border: `1px solid ${d > 800 ? '#ef4444' : d > 300 ? '#f59e0b' : '#64748b'}`, borderRadius: 6, fontSize: 11 }}>
        {recommendedExploration}
      </div>
    </div>
  )
}

// ===== PROSPECTIVITY VIEW =====
function ProspectivityView({ analysis }) {
  const { prospectivity } = analysis
  if (!prospectivity) return null
  const { score, confidence, riskLevel, features, mineralPredictions, recommendedAction } = prospectivity
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🎯 Prospektivitas</div>
      <div className="panel" style={{ marginBottom: 8, textAlign: 'center', borderColor: riskLevel === 'high' ? '#ef4444' : '#f59e0b' }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: riskLevel === 'high' ? '#ef4444' : '#f59e0b' }}>{(score * 100).toFixed(0)}%</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Confidence: {(confidence * 100).toFixed(0)}%</div>
        <div style={{ height: 6, background: '#0a0e17', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${score * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #ef4444)', borderRadius: 3 }} />
        </div>
      </div>
      {mineralPredictions.length > 0 && (
        <div className="panel" style={{ marginBottom: 8 }}>
          <div className="panel-header">Prediksi Mineral</div>
          {mineralPredictions.slice(0, 5).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 11, borderBottom: '1px solid #1e3a5f' }}>
              <span>{p.emoji} {p.label}</span>
              <span style={{ fontWeight: 700, color: p.confidence === 'high' ? '#ef4444' : '#f59e0b' }}>{(p.probability * 100).toFixed(0)}%</span>
              {p.thermalMatch && <span style={{ fontSize: 9, padding: '1px 4px', background: '#1a2332', borderRadius: 3 }}>🔥Termal</span>}
              {p.geoSupport && <span style={{ fontSize: 9, padding: '1px 4px', background: '#1a2332', borderRadius: 3 }}>🪨Geologi</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: 8, background: '#0a0e17', border: `1px solid ${riskLevel === 'high' ? '#ef4444' : '#f59e0b'}`, borderRadius: 6, fontSize: 11 }}>
        {recommendedAction}
      </div>
    </div>
  )
}