import { createContext, useContext, useReducer, useCallback } from 'react'

// ===== STATE SHAPE =====
const initialState = {
  coordinate: { lat: -6.68, lng: 107.73, zoom: 14 },
  survey: { active: false, points: [], mode: null },
  telemetry: { tracking: false, position: null, path: [], accuracy: null },
  ui: { sidebarCollapsed: false, activeTab: 'home', loading: false, commandOpen: false },
  theme: { mode: 'dark', font: 'system' },
  analysis: { thermal: null, spectral: null, alteration: null, lineament: null, vegetation: null, depth: null, prospectivity: null, geology: null },
  notifications: [],
}

// ===== ACTIONS =====
const SET_COORDINATE = 'SET_COORDINATE'
const SET_SURVEY = 'SET_SURVEY'
const SET_TELEMETRY = 'SET_TELEMETRY'
const SET_UI = 'SET_UI'
const SET_ANALYSIS = 'SET_ANALYSIS'
const ADD_NOTIFICATION = 'ADD_NOTIFICATION'
const REMOVE_NOTIFICATION = 'REMOVE_NOTIFICATION'

function reducer(state, action) {
  switch (action.type) {
    case SET_COORDINATE:
      return { ...state, coordinate: { ...state.coordinate, ...action.payload } }
    case SET_SURVEY:
      return { ...state, survey: { ...state.survey, ...action.payload } }
    case SET_TELEMETRY:
      return { ...state, telemetry: { ...state.telemetry, ...action.payload } }
    case SET_UI:
      return { ...state, ui: { ...state.ui, ...action.payload } }
    case SET_ANALYSIS:
      return { ...state, analysis: { ...state.analysis, ...action.payload } }
    case ADD_NOTIFICATION:
      return { ...state, notifications: [...state.notifications, { id: Date.now(), ...action.payload }] }
    case REMOVE_NOTIFICATION:
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload) }
    default:
      return state
  }
}

// ===== CONTEXT =====
const GeosatContext = createContext(null)

export function GeosatProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setCoordinate = useCallback((p) => dispatch({ type: SET_COORDINATE, payload: p }), [])
  const setSurvey = useCallback((p) => dispatch({ type: SET_SURVEY, payload: p }), [])
  const setTelemetry = useCallback((p) => dispatch({ type: SET_TELEMETRY, payload: p }), [])
  const setUI = useCallback((p) => dispatch({ type: SET_UI, payload: p }), [])
  const setAnalysis = useCallback((p) => dispatch({ type: SET_ANALYSIS, payload: p }), [])
  const notify = useCallback((p) => dispatch({ type: ADD_NOTIFICATION, payload: p }), [])
  const dismiss = useCallback((id) => dispatch({ type: REMOVE_NOTIFICATION, payload: id }), [])

  return (
    <GeosatContext.Provider value={{
      state, dispatch,
      setCoordinate, setSurvey, setTelemetry, setUI, setAnalysis, notify, dismiss
    }}>
      {children}
    </GeosatContext.Provider>
  )
}

export function useGeosat() {
  const ctx = useContext(GeosatContext)
  if (!ctx) throw new Error('useGeosat must be used within GeosatProvider')
  return ctx
}