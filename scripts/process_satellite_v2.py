"""
Google Earth Engine v2 - Multi-Index Satellite Anomaly Detection
Processes real satellite imagery to detect multiple mineral/anomaly indices
"""
import ee
import json
import os
import math
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


def calculate_indices(collection):
    """Calculate all satellite indices"""
    print("\n   Calculating indices...")

    # Iron Oxide (B4/B2)
    iron_oxide = collection.select('B4').divide(collection.select('B2')).rename('IronOxide')

    # Clay Minerals (B7/B11)
    clay_minerals = collection.select('B7').divide(collection.select('B11')).rename('ClayMinerals')

    # Ferrous Minerals (B11/B12)
    ferrous_minerals = collection.select('B11').divide(collection.select('B12')).rename('FerrousMinerals')

    # Silica Index (1 - B11/B12)
    silica_index = ee.Image(1).subtract(ferrous_minerals).rename('SilicaIndex')

    # NDVI
    ndvi = collection.normalizedDifference(['B8', 'B4']).rename('NDVI')

    # Combined Mineral Potential (weighted)
    mineral_potential = (
        iron_oxide.multiply(0.25)
        .add(clay_minerals.multiply(0.35))
        .add(ferrous_minerals.multiply(0.10))
        .add(silica_index.multiply(0.15))
        .add(ee.Image(1).subtract(ndvi).multiply(0.15))
    ).rename('MineralPotential')

    return iron_oxide, clay_minerals, ferrous_minerals, silica_index, ndvi, mineral_potential


def normalize_indices(iron, clay, ferrous, silica, ndvi, mineral):
    """Normalize indices to 0-1 range"""
    print("   Normalizing indices...")

    def norm_image(img, low, high):
        return img.where(img.lt(low), 0).where(img.gt(high), 1)\
            .subtract(low).divide(high - low)\
            .rename(img.bandNames().get(0))

    iron_norm = norm_image(iron, 0.7, 2.2)
    clay_norm = norm_image(clay, 0.5, 2.0)
    ferrous_norm = norm_image(ferrous, 0.3, 1.5)
    silica_norm = ee.Image(1).subtract(norm_image(ferrous, 0.3, 1.5))
    ndvi_stress = ee.Image(1).subtract(norm_image(ndvi, -0.5, 0.8))

    return iron_norm, clay_norm, ferrous_norm, silica_norm, ndvi_stress


def classify_anomaly(combined_score, iron_val, clay_val, ndvi_stress_val):
    """Classify anomaly type based on multi-index pattern"""
    classifications = []

    # Gold deposit: high clay + iron + vegetation stress
    if clay_val > 0.5 and iron_val > 0.4 and ndvi_stress_val > 0.3:
        classifications.append({
            'type': 'gold_deposit',
            'confidence': min((clay_val * 0.35 + iron_val * 0.25 + ndvi_stress_val * 0.20) * 1.5, 1)
        })

    # Iron deposit: high iron + ferrous
    if iron_val > 0.5:
        classifications.append({
            'type': 'iron_deposit',
            'confidence': min(iron_val * 0.7 + ndvi_stress_val * 0.3, 1)
        })

    # Tunnel potential: vegetation stress + moderate iron (soil disturbance)
    if ndvi_stress_val > 0.4 and 0.2 < iron_val < 0.6:
        classifications.append({
            'type': 'tunnel_potential',
            'confidence': min(ndvi_stress_val * 0.5 + (1 - abs(iron_val - 0.4)) * 0.3, 1)
        })

    # Cave/limestone: low iron, moderate clay
    if clay_val > 0.3 and iron_val < 0.3:
        classifications.append({
            'type': 'cave_karst',
            'confidence': min(clay_val * 0.4 + (1 - iron_val) * 0.3, 1)
        })

    # Sort by confidence
    classifications.sort(key=lambda x: x['confidence'], reverse=True)

    return classifications if classifications else [{'type': 'unknown', 'confidence': 0}]


def fetch_multi_index_data():
    """Fetch and analyze multi-index satellite data"""
    print("\n🛰️  Fetching Sentinel-2 imagery...")

    collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterBounds(roi)
                  .filterDate('2024-06-01', '2024-10-31')
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
                  .median()
                  .clip(roi))

    print("✓ Imagery fetched and composited")

    # Calculate indices
    iron, clay, ferrous, silica, ndvi, mineral = calculate_indices(collection)

    # Normalize
    iron_n, clay_n, ferrous_n, silica_n, ndvi_stress_n = normalize_indices(
        iron, clay, ferrous, silica, ndvi, mineral
    )

    # Combined band for sampling
    all_bands = iron.addBands(clay).addBands(ferrous).addBands(silica)\
        .addBands(ndvi).addBands(mineral)

    print("📊 Extracting anomaly coordinates...")

    # Sample pixels
    sample_points = all_bands.sample(
        region=roi,
        scale=20,
        numPixels=500,
        geometries=True,
        seed=42
    ).getInfo()

    anomaly_data = []

    for feature in sample_points['features']:
        coords = feature['geometry']['coordinates']
        props = feature['properties']

        iron_val = props.get('IronOxide', 0)
        clay_val = props.get('ClayMinerals', 0)
        ferrous_val = props.get('FerrousMinerals', 0)
        silica_val = props.get('SilicaIndex', 0)
        ndvi_val = props.get('NDVI', 0)
        mineral_val = props.get('MineralPotential', 0)

        if iron_val is None or iron_val <= 0:
            continue

        # Normalize each index to 0-1
        iron_norm = max(0, min(1, (iron_val - 0.7) / 1.5))
        clay_norm = max(0, min(1, (clay_val - 0.5) / 1.0))
        ferrous_norm = max(0, min(1, (ferrous_val - 0.3) / 0.8))
        ndvi_stress = max(0, min(1, 1 - (ndvi_val - (-0.5)) / 1.3))

        # Combined score (weighted)
        combined = (
            iron_norm * 0.25 +
            clay_norm * 0.35 +
            ferrous_norm * 0.10 +
            max(0, min(1, silica_val)) * 0.15 +
            ndvi_stress * 0.15
        )
        combined = round(max(0, min(1, combined)), 3)

        # Classify anomaly type
        classifications = classify_anomaly(combined, iron_norm, clay_norm, ndvi_stress)

        primary_type = classifications[0]['type']
        primary_confidence = round(classifications[0]['confidence'], 3)

        anomaly_level = (
            'critical' if combined > 0.7 else
            'high' if combined > 0.5 else
            'moderate' if combined > 0.3 else
            'low'
        )

        anomaly_data.append({
            'lat': round(coords[1], 6),
            'lng': round(coords[0], 6),
            'indices': {
                'iron_oxide': round(iron_val, 4),
                'clay_minerals': round(clay_val, 4),
                'ferrous_minerals': round(ferrous_val, 4),
                'silica_index': round(silica_val, 4),
                'ndvi': round(ndvi_val, 4),
            },
            'normalized': {
                'iron_oxide': round(iron_norm, 3),
                'clay_minerals': round(clay_norm, 3),
                'ferrous_minerals': round(ferrous_norm, 3),
                'ndvi_stress': round(ndvi_stress, 3),
            },
            'combined_score': combined,
            'anomaly_level': anomaly_level,
            'classification': {
                'primary_type': primary_type,
                'confidence': primary_confidence,
                'all_types': [
                    {'type': c['type'], 'confidence': round(c['confidence'], 3)}
                    for c in classifications[:3]
                ]
            }
        })

    print(f"✓ Extracted {len(anomaly_data)} anomaly points")
    return anomaly_data


if __name__ == '__main__':
    print("=" * 60)
    print("SATELLITE ANOMALY DETECTION v2 - MULTI-INDEX")
    print("Source: Google Earth Engine / Sentinel-2 L2A")
    print("=" * 60)

    anomaly_data = fetch_multi_index_data()

    if not anomaly_data:
        print("\n✗ No data extracted.")
        exit(1)

    # Stats
    levels = {'critical': 0, 'high': 0, 'moderate': 0, 'low': 0}
    types = {}
    for a in anomaly_data:
        levels[a['anomaly_level']] = levels.get(a['anomaly_level'], 0) + 1
        t = a['classification']['primary_type']
        types[t] = types.get(t, 0) + 1

    scores = [a['combined_score'] for a in anomaly_data]
    avg_score = sum(scores) / len(scores)

    print(f"\n📈 Statistics:")
    print(f"   Total: {len(anomaly_data)}")
    print(f"   Levels: Critical={levels['critical']} High={levels['high']} Moderate={levels['moderate']} Low={levels['low']}")
    print(f"   Avg Combined Score: {avg_score:.3f}")
    print(f"\n   Classification Breakdown:")
    for t, count in sorted(types.items(), key=lambda x: -x[1]):
        print(f"     {t}: {count} ({count/len(anomaly_data)*100:.1f}%)")

    # Save
    output_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'public', 'anomaly_data_v2.json'
    )
    with open(output_file, 'w') as f:
        json.dump({
            'metadata': {
                'area': 'Kasomalang Kulon',
                'bbox': ROI_COORDS,
                'date_processed': datetime.now().isoformat(),
                'satellite': 'Sentinel-2 L2A',
                'source': 'Google Earth Engine (Multi-Index)',
                'indices': ['Iron Oxide (B4/B2)', 'Clay Minerals (B7/B11)',
                           'Ferrous Minerals (B11/B12)', 'Silica Index',
                           'NDVI', 'Combined Mineral Potential'],
                'version': 'v2',
                'total_points': len(anomaly_data),
                'classification_stats': types,
                'level_stats': levels,
                'avg_combined_score': round(avg_score, 3),
            },
            'anomalies': anomaly_data
        }, f, indent=2)

    print(f"\n✅ Saved to {output_file}")

    # Show top 10
    print(f"\n🔴 Top 10 Anomaly Points (Combined Score):")
    sorted_data = sorted(anomaly_data, key=lambda x: x['combined_score'], reverse=True)
    for i, a in enumerate(sorted_data[:10], 1):
        emoji = {'critical': '🔴', 'high': '🟠', 'moderate': '🟡', 'low': '🟢'}.get(a['anomaly_level'], '⚪')
        ptype = a['classification']['primary_type']
        conf = a['classification']['confidence']
        print(f"  {emoji} {i}. Lat:{a['lat']:.6f} Lng:{a['lng']:.6f}")
        print(f"      Score:{a['combined_score']:.3f} [{a['anomaly_level']}] Type:{ptype} Confidence:{conf:.2f}")
        print(f"      Iron:{a['indices']['iron_oxide']:.3f} Clay:{a['indices']['clay_minerals']:.3f} NDVI:{a['indices']['ndvi']:.3f}")

    print("\n" + "=" * 60)