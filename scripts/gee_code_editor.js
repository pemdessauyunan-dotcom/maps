// ============================================================
// GEE CODE EDITOR SCRIPT - Paste this into code.earthengine.google.com
// Detects Iron Oxide anomalies from Sentinel-2 satellite imagery
// ============================================================

// Area of Interest: Kasomalang Kulon
var roi = ee.Geometry.Rectangle([107.7150, -6.6850, 107.7450, -6.6600]);

// Fetch Sentinel-2 L2A imagery (dry season, low cloud)
var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2024-06-01', '2024-10-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
  .median()
  .clip(roi);

print('Imagery loaded:', collection);

// Calculate Iron Oxide Index (B4 Red / B2 Blue)
var ironOxide = collection.select('B4').divide(collection.select('B2')).rename('IronOxide');

// Sample 300 points across the ROI
var samplePoints = ironOxide.sample({
  region: roi,
  scale: 20,
  numPixels: 300,
  geometries: true,
  seed: 42
});

print('Sample points:', samplePoints.size());

// Add intensity and anomaly level properties
var anomalies = samplePoints.map(function(feature) {
  var ironValue = feature.get('IronOxide');
  return feature.set('iron_oxide_raw', ironValue);
});

// Export as CSV - click "RUN" then check the Tasks tab
Export.table.toDrive({
  collection: anomalies,
  description: 'anomaly_data_kasomalang',
  fileFormat: 'CSV',
  folder: 'GEE_Exports'
});

// Also show stats
var values = anomalies.aggregate_array('iron_oxide_raw');
print('Min Iron Oxide:', values.reduce(ee.Reducer.min()));
print('Max Iron Oxide:', values.reduce(ee.Reducer.max()));
print('Mean Iron Oxide:', values.reduce(ee.Reducer.mean()));
print('Total Points:', anomalies.size());

// Visualize on map
Map.centerObject(roi, 13);
Map.addLayer(ironOxide, {min: 0.5, max: 3, palette: ['blue', 'green', 'yellow', 'red']}, 'Iron Oxide Index');
Map.addLayer(roi, {color: 'red'}, 'ROI');

print('Done! Check the TASKS tab (right panel) for the CSV export.');
print('After export, download the CSV from your Google Drive.');
