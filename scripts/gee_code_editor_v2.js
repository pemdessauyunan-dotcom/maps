// ============================================================
// GEE CODE EDITOR SCRIPT v2 - Enhanced Multi-Index Detection
// Detects multiple satellite indices for mineral/tunnel prospecting
// Paste this into code.earthengine.google.com
// ============================================================

// Area of Interest - expandable to any location
var roi = ee.Geometry.Rectangle([107.7150, -6.6850, 107.7450, -6.6600]);

// === STEP 1: Load & Filter Imagery ===
var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2024-06-01', '2024-10-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
  .median()
  .clip(roi);

print('Imagery loaded:', collection);

// === STEP 2: Calculate All Indices ===

// Iron Oxide Index (B4 Red / B2 Blue)
var ironOxide = collection.select('B4').divide(collection.select('B2')).rename('IronOxide');

// Clay Minerals Index (B7 Shortwave IR / B11 Shortwave IR)
// Higher values = more clay alteration minerals (kaolinite, illite)
var clayMinerals = collection.select('B7').divide(collection.select('B11')).rename('ClayMinerals');

// Ferrous Minerals Index (B11 / B12)
// Higher values = more iron-bearing minerals in bedrock
var ferrousMinerals = collection.select('B11').divide(collection.select('B12')).rename('FerrousMinerals');

// Silica Index (1 - B11/B12) - inverted ferrous
// Higher values = quartz/silica rich zones
var silicaIndex = ee.Image(1).subtract(ferrousMinerals).rename('SilicaIndex');

// NDVI (Normalized Difference Vegetation Index)
var ndvi = collection.normalizedDifference(['B8', 'B4']).rename('NDVI');

// === STEP 3: Combined Mineral Potential (weighted) ===
// Gold prospecting weight: Clay(0.35) + Iron(0.25) + Silica(0.20) + VegetationStress(0.20)
var mineralPotential = ironOxide.multiply(0.25)
  .add(clayMinerals.multiply(0.35))
  .add(fuller(ferrousMinerals, 0.3, 1.5).multiply(0.10))
  .add(silicaIndex.multiply(0.15))
  .add(ee.Image(1).subtract(ndvi).multiply(0.15))
  .rename('MineralPotential');

// Helper: normalize values to 0-1 range
function normalize(image) {
  var min = image.reduceRegion({reducer: ee.Reducer.min(), geometry: roi, scale: 20, bestEffort: true});
  var max = image.reduceRegion({reducer: ee.Reducer.max(), geometry: roi, scale: 20, bestEffort: true});
  return image.subtract(ee.Image.constant(min.getNumber(image.bandNames().get(0))))
    .divide(ee.Image.constant(max.getNumber(image.bandNames().get(0))).subtract(ee.Image.constant(min.getNumber(image.bandNames().get(0)))));
}

function fuller(img, low, high) {
  return img.where(img.lt(low), 0).where(img.gt(high), 1).subtract(low).divide(high - low);
}

// === STEP 4: Sample Points ===
var allIndices = ironOxide.addBands(clayMinerals)
  .addBands(ferrousMinerals)
  .addBands(silicaIndex)
  .addBands(ndvi)
  .addBands(mineralPotential);

print('All indices:', allIndices);

// Sample 500 points across ROI
var samplePoints = allIndices.sample({
  region: roi,
  scale: 20,
  numPixels: 500,
  geometries: true,
  seed: 42
});

print('Sample points:', samplePoints.size());

// Export all data
Export.table.toDrive({
  collection: samplePoints,
  description: 'anomaly_data_v2_kasomalang',
  fileFormat: 'CSV',
  folder: 'GEE_Exports'
});

// === STEP 5: Stats ===
// Print per-index stats
var indices = ['IronOxide', 'ClayMinerals', 'FerrousMinerals', 'SilicaIndex', 'NDVI', 'MineralPotential'];
indices.forEach(function(name) {
  var vals = samplePoints.aggregate_array(name);
  print(name + ' - Min:', vals.reduce(ee.Reducer.min()));
  print(name + ' - Max:', vals.reduce(ee.Reducer.max()));
  print(name + ' - Mean:', vals.reduce(ee.Reducer.mean()));
});

print('Total points:', samplePoints.size());

// === STEP 6: Visualize on Map ===
Map.centerObject(roi, 13);

// Iron Oxide
Map.addLayer(ironOxide, {min: 0.5, max: 3, palette: ['blue', 'green', 'yellow', 'red']}, '1. Iron Oxide (B4/B2)');

// Clay Minerals
Map.addLayer(clayMinerals, {min: 0.5, max: 2.5, palette: ['blue', 'cyan', 'yellow', 'orange', 'brown']}, '2. Clay Minerals (B7/B11)');

// Ferrous Minerals
Map.addLayer(ferrousMinerals, {min: 0.3, max: 1.8, palette: ['blue', 'green', 'yellow', 'red']}, '3. Ferrous Minerals (B11/B12)');

// Silica Index
Map.addLayer(silicaIndex, {min: -1, max: 0.6, palette: ['red', 'yellow', 'white']}, '4. Silica/Quartz (inverted)');

// NDVI
Map.addLayer(ndvi, {min: -0.5, max: 0.8, palette: ['red', 'yellow', 'green', 'darkgreen']}, '5. NDVI - Vegetation');

// Combined Mineral Potential
Map.addLayer(mineralPotential, {
  min: 0, max: 1,
  palette: ['blue', 'cyan', 'green', 'yellow', 'orange', 'red']
}, '6. Combined Mineral Potential');

// ROI boundary
Map.addLayer(roi, {color: 'red'}, 'ROI');

print('Done! Check TASKS tab for CSV export.');
print('After export, download CSV from Google Drive and convert with process_satellite_v2.py');