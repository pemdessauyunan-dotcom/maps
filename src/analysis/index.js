/**
 * Geosat Scientific Engine
 * Pure functions organized by domain.
 * No React, no JSX, no DOM.
 * 
 * Usage:
 *   import { Thermal, Alteration, Lithology, Confidence } from '../analysis'
 *   Thermal.calcSurfaceTemp(elevation)
 *   Alteration.detectAlteration(indices, lithology)
 *   Lithology.classifyRockType(province, elevation)
 *   Confidence.calcConfidence(factors)
 */

export * as Thermal from './thermal/thermalEquations'
export * as Alteration from './alteration/alterationEquations'
export * as Lithology from './lithology/lithologyClassifier'
export * as Confidence from './confidence/confidenceEngine'