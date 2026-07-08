# 🌡️ Thermal Lithology Mapper

**Deteksi anomali bawah tanah via analisis termal & litologi real-time.**

Menggabungkan data elevasi SRTM, litologi Macrostrat, dan komputasi termal untuk mendeteksi:
- 🔥 **Deposit mineral** (emas, besi, tembaga) — anomali termal positif
- 🕳️ **Rongga & terowongan** — anomali termal negatif
- 💧 **Air tanah** — cold spot termal
- 🪨 **Jenis batuan & formasi geologi** — klasifikasi litologi real-time
- 📈 **Cross-section termal** — profil suhu permukaan sepanjang garis

## 🚀 Fitur

| Fitur | Deskripsi |
|---|---|
| 🌡️ **Thermal Map** | Peta sebaran suhu permukaan dengan deteksi anomali |
| 📍 **GPS Live Tracking** | Tracking posisi real-time dengan auto-deteksi anomali |
| 📈 **Thermal Cross-Section** | Profil elevasi + suhu sepanjang garis |
| 🪨 **Lithology Analysis** | Klasifikasi batuan dari data geologi Macrostrat |
| 🔴 **Real-Time API** | Data dikomputasi on-the-fly, bukan dari file statis |

## 🧪 Cara Kerja

1. Buka peta → klik **🌡️ TAMPILKAN PETA TERMAL** untuk melihat sebaran suhu
2. Klik titik mana pun di peta → analisis termal + litologi otomatis
3. Aktifkan **📍 GPS** → jalan sambil deteksi anomali real-time
4. Gunakan **📈 Cross-Section** → gambar garis untuk profil termal

## 🔧 Tech Stack

- **Frontend:** React + Vite + Leaflet
- **Data Elevasi:** Open-Meteo SRTM (real-time, gratis)
- **Data Geologi:** Macrostrat API (real-time)
- **Komputasi Termal:** In-browser + Vercel API
- **Deploy:** Vercel

## 🚀 Deploy

```bash
npm install
npm run dev     # development
npm run build   # production build
```

## 📄 Lisensi

MIT