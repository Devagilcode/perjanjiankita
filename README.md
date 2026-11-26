# Perjanjian Kita

Aplikasi web statis (Next.js) untuk menyusun, menandatangani, mencetak, dan mengunduh surat perjanjian bersama ke PDF — **tanpa database** dan **langsung terbuka tanpa login**.

## Fitur Utama

- **Simpan Otomatis Lokal**: Setiap perubahan poin, tempat, tanggal, dan tanda tangan langsung tersimpan otomatis di browser (`localStorage`).
- **Sinkronisasi Otomatis Lintas Jaringan (GitHub Gist)**: Menggunakan satu Secret GitHub Gist sebagai file JSON bersama sehingga kamu dan pasangan bisa membuka dari HP/Wi-Fi/jaringan seluler berbeda dan perubahan otomatis tersinkron tanpa database.
- **Link Pasangan 1-Klik**: Setelah perangkat pertama terhubung, cukup salin **Link Pasangan** dan kirim ke pasanganmu. Pasangan cukup membuka link tersebut sekali untuk menghubungkan perangkatnya secara permanen.
- **Cetak & Simpan PDF A4**: Mendukung cetak langsung (`window.print()`) dan ekspor PDF A4 rapi.
- **Link Snapshot Cadangan**: Bisa menyalin link terkompresi untuk berbagi salinan surat secara langsung.

## Cara Mengaktifkan Sinkronisasi Antar Jaringan

1. Buka halaman aplikasi (misalnya di GitHub Pages: `https://devagilcode.github.io/perjanjiankita/`).
2. Di panel **Sinkronisasi Otomatis**, klik **Aktifkan Sinkronisasi**.
3. Buat GitHub Token dengan izin **`gist`** melalui `https://github.com/settings/tokens/new?scopes=gist&description=Perjanjian%20Kita`, tempelkan, lalu klik **Buat & Hubungkan**.
4. Klik **Salin Link Pasangan** dan kirimkan ke pasanganmu. Saat ia membuka link itu sekali di HP-nya, kedua perangkat langsung tersinkron otomatis.

## Pengembangan Lokal

```bash
npm install
npm run dev
```

Saat di-push ke branch `main`, GitHub Actions otomatis membangun output statis (`./out`) dan men-deploy ke GitHub Pages.
