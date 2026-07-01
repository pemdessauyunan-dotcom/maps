"""
Google Earth Engine - Sentinel-2 Satellite Anomaly Detection
Processes satellite imagery to detect iron oxide anomalies (potential mineral deposits)
"""

import ee
import json
import os
from datetime import datetime

# Initialize GEE
try:
    ee.Initialize()
    print("✓ Google Earth Engine initialized")
except Exception as e:
    print("Authenticating GEE...")
    ee.Authenticate()
    ee.Initialize()
    print("✓ Google Earth Engine authenticated and initialized")

# Define area of interest (Kasomalang Kulon bounding box)
# Format: [west, south, east, north]
ROI_COORDS = [107.7150, -6.6850, 107.7450, -6.6600]
roi = ee.Geometry.Rectangle(ROI_COORDS)

def fetch_sentinel2_data():
    """
    Fetch Sentinel-2 imagery and calculate iron oxide index
    Returns anomaly data as JSON
    """
    print("\n🛰️  Fetching Sentinel-2 imagery...")
    
    # Get Sentinel-2 Level 2A (atmospherically corrected)
    # Filter for dry season to minimize clouds
    collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterBounds(roi)
                  .filterDate('2024-06-01', '2024-10-31')  # Dry season
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
                  .median()  # Composite to remove remaining clouds
                  .clip(roi))
    
    print("✓ Imagery fetched and composited")
    
    # Calculate Iron Oxide Index (Band 4 / Band 2)
    # B4 = Red (665nm), B2 = Blue (490nm)
    # High ratio indicates iron oxide presence
    iron_oxide = collection.select('B4').divide(collection.select('B2')).rename('IronOxide')
    
    print("✓ Iron Oxide index calculated (B4/B2 ratio)")
    
    # Sample pixels to get coordinate points
    # Scale = 20m resolution, get top anomaly points
    print("📊 Extracting anomaly coordinates...")
    
    sample_points = iron_oxide.sample(
        region=roi,
        scale=20,  # 20 meter resolution
        numPixels=200,  # Get 200 sample points
        geometries=True,
        seed=42  # Consistent sampling
    ).getInfo()
    
    # Process and normalize the data
    anomaly_data = []
    values = []
    
    for feature in sample_points['features']:
        coords = feature['geometry']['coordinates']
        iron_value = feature['properties'].get('IronOxide', 0)
        
        if iron_value is not None:
            values.append(iron_value)
            anomaly_data.append({
                'lat': coords[1],
                'lng': coords[0],
                'iron_oxide_raw': round(iron_value, 4)
            })
    
    # Normalize values to 0-1 scale for heatmap
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
    
    # Save to JSON file
    output_file = 'anomaly_data.json'
    with open(output_file, 'w') as f:
        json.dump({
            'metadata': {
                'area': 'Kasomalang Kulon',
                'bbox': ROI_COORDS,
                'date_processed': datetime.now().isoformat(),
                'satellite': 'Sentinel-2',
                'index': 'Iron Oxide (B4/B2)',
                'total_points': len(anomaly_data),
                'value_range': {
                    'min': round(min(values), 4) if values else 0,
                    'max': round(max(values), 4) if values else 0
                }
            },
            'anomalies': anomaly_data
        }, f, indent=2)
    
    print(f" Data saved to {output_file}")
    
    return anomaly_data

def get_statistics(anomaly_data):
    """Calculate statistics from anomaly data"""
    if not anomaly_data:
        return None
    
    intensities = [p['intensity'] for p in anomaly_data]
    
    stats = {
        'total_points': len(anomaly_data),
        'critical': len([p for p in anomaly_data if p['anomaly_level'] == 'critical']),
        'high': len([p for p in anomaly_data if p['anomaly_level'] == 'high']),
        'moderate': len([p for p in anomaly_data if p['anomaly_level'] == 'moderate']),
        'low': len([p for p in anomaly_data if p['anomaly_level'] == 'low']),
        'avg_intensity': round(sum(intensities) / len(intensities), 3),
        'max_intensity': round(max(intensities), 3),
        'min_intensity': round(min(intensities), 3)
    }
    
    print("\n📈 Statistics:")
    print(f"   Total Points: {stats['total_points']}")
    print(f"   Critical (>80%): {stats['critical']}")
    print(f"   High (60-80%): {stats['high']}")
    print(f"   Moderate (40-60%): {stats['moderate']}")
    print(f"   Low (<40%): {stats['low']}")
    print(f"   Average Intensity: {stats['avg_intensity']}")
    
    return stats

if __name__ == '__main__':
    print("=" * 60)
    print("SATELLITE ANOMALY DETECTION - KASOMALANG KULON")
    print("=" * 60)
    
    # Fetch and process data
    anomaly_data = fetch_sentinel2_data()
    
    # Calculate statistics
    stats = get_statistics(anomaly_data)
    
    print("\n✅ Processing complete!")
    print(f"\nTop 5 Anomaly Points:")
    sorted_anomalies = sorted(anomaly_data, key=lambda x: x['intensity'], reverse=True)
    for i, point in enumerate(sorted_anomalies[:5], 1):
        print(f"{i}. Lat: {point['lat']:.6f}, Lng: {point['lng']:.6f}, Intensity: {point['intensity']:.2%}")
    
    print("\n" + "=" * 60)
    print("Next steps:")
    print("1. Use 'anomaly_data.json' in your React app")
    print("2. Or upload to Supabase for real-time access")
    print("=" * 60)
