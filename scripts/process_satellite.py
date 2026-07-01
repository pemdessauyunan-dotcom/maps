"""
Google Earth Engine - Sentinel-2 Satellite Anomaly Detection
Processes real satellite imagery to detect iron oxide anomalies
"""

import ee
import json
import os
from datetime import datetime

# Initialize GEE with project
GEE_PROJECT = 'maps-501113'
try:
    ee.Initialize(project=GEE_PROJECT)
    print(f"✓ Google Earth Engine initialized (project: {GEE_PROJECT})")
except Exception as e:
    print(f"Error: {e}")
    print("Trying authentication...")
    ee.Authenticate(auth_mode='localhost')
    ee.Initialize(project=GEE_PROJECT)
    print(f"✓ GEE authenticated and initialized")

# Area of interest (Kasomalang Kulon bounding box)
ROI_COORDS = [107.7150, -6.6850, 107.7450, -6.6600]
roi = ee.Geometry.Rectangle(ROI_COORDS)

def fetch_sentinel2_data():
    print("\n🛰️  Fetching Sentinel-2 imagery...")
    
    collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterBounds(roi)
                  .filterDate('2024-06-01', '2024-10-31')
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
                  .median()
                  .clip(roi))
    
    print("✓ Imagery fetched and composited")
    
    # Iron Oxide Index (B4/B2)
    iron_oxide = collection.select('B4').divide(collection.select('B2')).rename('IronOxide')
    print("✓ Iron Oxide index calculated (B4/B2 ratio)")
    
    # Also calculate NDVI for vegetation masking
    ndvi = collection.normalizedDifference(['B8', 'B4']).rename('NDVI')
    
    # Sample pixels
    print("📊 Extracting anomaly coordinates...")
    sample_points = iron_oxide.sample(
        region=roi,
        scale=20,
        numPixels=300,
        geometries=True,
        seed=42
    ).getInfo()
    
    anomaly_data = []
    values = []
    
    for feature in sample_points['features']:
        coords = feature['geometry']['coordinates']
        iron_value = feature['properties'].get('IronOxide', 0)
        
        if iron_value is not None and iron_value > 0:
            values.append(iron_value)
            anomaly_data.append({
                'lat': round(coords[1], 6),
                'lng': round(coords[0], 6),
                'iron_oxide_raw': round(iron_value, 4)
            })
    
    # Normalize
    if values:
        min_val = min(values)
        max_val = max(values)
        val_range = max_val - min_val if max_val != min_val else 1
        
        for point in anomaly_data:
            normalized = (point['iron_oxide_raw'] - min_val) / val_range
            point['intensity'] = round(max(0.0, min(1.0, normalized)), 3)
            point['anomaly_level'] = (
                'critical' if normalized > 0.8 else
                'high' if normalized > 0.6 else
                'moderate' if normalized > 0.4 else
                'low'
            )
    
    print(f"✓ Extracted {len(anomaly_data)} anomaly points")
    return anomaly_data, values

if __name__ == '__main__':
    print("=" * 60)
    print("SATELLITE ANOMALY DETECTION - KASOMALANG KULON")
    print("Source: Google Earth Engine / Sentinel-2 L2A")
    print("=" * 60)
    
    anomaly_data, values = fetch_sentinel2_data()
    
    if not anomaly_data:
        print("\n✗ No data extracted.")
        exit(1)
    
    intensities = [p['intensity'] for p in anomaly_data]
    stats = {
        'total_points': len(anomaly_data),
        'critical': len([p for p in anomaly_data if p['anomaly_level'] == 'critical']),
        'high': len([p for p in anomaly_data if p['anomaly_level'] == 'high']),
        'moderate': len([p for p in anomaly_data if p['anomaly_level'] == 'moderate']),
        'low': len([p for p in anomaly_data if p['anomaly_level'] == 'low']),
        'avg_intensity': round(sum(intensities) / len(intensities), 3),
    }
    
    print(f"\n📈 Statistics:")
    print(f"   Total: {stats['total_points']} | Critical: {stats['critical']} | High: {stats['high']} | Moderate: {stats['moderate']} | Low: {stats['low']}")
    print(f"   Avg Intensity: {stats['avg_intensity']}")
    
    # Save
    output_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'anomaly_data.json')
    with open(output_file, 'w') as f:
        json.dump({
            'metadata': {
                'area': 'Kasomalang Kulon',
                'bbox': ROI_COORDS,
                'date_processed': datetime.now().isoformat(),
                'satellite': 'Sentinel-2 L2A',
                'source': 'Google Earth Engine',
                'index': 'Iron Oxide (B4/B2)',
                'total_points': len(anomaly_data),
                'value_range': {'min': round(min(values), 4), 'max': round(max(values), 4)}
            },
            'anomalies': anomaly_data
        }, f, indent=2)
    
    print(f"\n✅ Saved to {output_file}")
    
    print(f"\n🔴 Top 10 Anomaly Points:")
    sorted_anomalies = sorted(anomaly_data, key=lambda x: x['intensity'], reverse=True)
    for i, p in enumerate(sorted_anomalies[:10], 1):
        emoji = {'critical': '🔴', 'high': '', 'moderate': '🟡', 'low': ''}.get(p['anomaly_level'], '⚪')
        print(f"  {emoji} {i}. Lat:{p['lat']:.6f} Lng:{p['lng']:.6f} IO:{p['iron_oxide_raw']:.4f} [{p['anomaly_level']}] {p['intensity']:.0%}")
    
    print("\n" + "=" * 60)
