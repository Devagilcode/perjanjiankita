# Perjanjian Kita

Aplikasi Next.js untuk menyusun, menandatangani, mencetak, dan menyimpan satu surat perjanjian bersama secara otomatis **tanpa database**, **tanpa login**, **tanpa token**, dan **tanpa salin link**.

## Cara Penyimpanan Otomatis

- **Saat dijalankan lokal / di server Node.js**: Data surat dan tanda tangan langsung tersimpan otomatis ke 1 file JSON lokal (`data/agreement.json`), ditambah cadangan di browser (`localStorage`).
- **Saat di-deploy ke Vercel (Lintas Semua Jaringan)**: Cukup hubungkan **Vercel Blob** (store mode `Private`) ke project Vercel. Data tersimpan otomatis sebagai 1 file JSON tanpa database, tanpa login, dan langsung sinkron antara perangkatmu dan pasangan dari jaringan mana saja.

## Menjalankan Lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Setiap perubahan tempat, tanggal, poin kesepakatan, dan tanda tangan otomatis tersimpan ke `data/agreement.json`.

## Deploy ke Vercel (Gratis, Akses Semua Jaringan)

1. Impor repository GitHub ini ke [Vercel](https://vercel.com).
2. Di dashboard project Vercel, buka **Storage -> Create Database -> Blob** (pilih **Private**) lalu hubungkan ke project.
3. Deploy — aplikasi langsung bisa dibuka dari HP kamu dan HP pacarmu lewat satu URL Vercel yang sama tanpa login dan tanpa token.
