"""Convert GEE CSV export to anomaly_data.json for the app"""
import csv
import json
import os
from datetime import datetime

CSV_FILE = os.path.expanduser("~/Downloads/anomaly_data_kasomalang.csv")
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'anomaly_data.json')

anomalies = []
values = []

with open(CSV_FILE, 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        iron_value = float(row['IronOxide'])
        geo = json.loads(row['.geo'].replace('""', '"'))
        coords = geo['coordinates']
        
        anomalies.append({
            'lat': round(coords[1], 6),
            'lng': round(coords[0], 6),
            'iron_oxide_raw': round(iron_value, 4)
        })
        values.append(iron_value)

# Normalize
min_val = min(values)
max_val = max(values)
val_range = max_val - min_val if max_val != min_val else 1

for point in anomalies:
    normalized = (point['iron_oxide_raw'] - min_val) / val_range
    point['intensity'] = round(max(0.0, min(1.0, normalized)), 3)
    point['anomaly_level'] = (
        'critical' if normalized > 0.8 else
        'high' if normalized > 0.6 else
        'moderate' if normalized > 0.4 else
        'low'
    )

# Stats
intensities = [p['intensity'] for p in anomalies]
stats = {
    'total': len(anomalies),
    'critical': len([p for p in anomalies if p['anomaly_level'] == 'critical']),
    'high': len([p for p in anomalies if p['anomaly_level'] == 'high']),
    'moderate': len([p for p in anomalies if p['anomaly_level'] == 'moderate']),
    'low': len([p for p in anomalies if p['anomaly_level'] == 'low']),
    'avg': round(sum(intensities) / len(intensities), 3),
    'min_io': round(min_val, 4),
    'max_io': round(max_val, 4)
}

print(f"Total points: {stats['total']}")
print(f"Critical: {stats['critical']} | High: {stats['high']} | Moderate: {stats['moderate']} | Low: {stats['low']}")
print(f"Iron Oxide range: {stats['min_io']} - {stats['max_io']}")
print(f"Avg intensity: {stats['avg']}")

# Save
with open(OUTPUT_FILE, 'w') as f:
    json.dump({
        'metadata': {
            'area': 'Kasomalang Kulon',
            'bbox': [107.7150, -6.6850, 107.7450, -6.6600],
            'date_processed': datetime.now().isoformat(),
            'satellite': 'Sentinel-2 L2A',
            'source': 'Google Earth Engine (Real Data)',
            'index': 'Iron Oxide (B4/B2 ratio)',
            'total_points': len(anomalies),
            'value_range': {'min': stats['min_io'], 'max': stats['max_io']}
        },
        'anomalies': anomalies
    }, f, indent=2)

print(f"\nSaved to {OUTPUT_FILE}")

# Show top 10
print(f"\nTop 10 Anomaly Points:")
sorted_a = sorted(anomalies, key=lambda x: x['intensity'], reverse=True)
for i, p in enumerate(sorted_a[:10], 1):
    emoji = {'critical': '🔴', 'high': '', 'moderate': '🟡', 'low': ''}.get(p['anomaly_level'], '')
    print(f"  {emoji} {i}. Lat:{p['lat']:.6f} Lng:{p['lng']:.6f} IO:{p['iron_oxide_raw']:.4f} [{p['anomaly_level']}] {p['intensity']:.0%}")
