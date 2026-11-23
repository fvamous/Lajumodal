import {
  AllocationSplit,
  AssetCategory,
  AutomationRule,
  OpportunityBlueprint,
  PortfolioAsset,
} from "../types/finance";

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function formatCompactIDR(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(2).replace(".", ",")} M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(".", ",")} Jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000)} rb`;
  }
  return `${sign}Rp ${Math.round(abs)}`;
}

export const INITIAL_ASSETS: PortfolioAsset[] = [
  {
    id: "asset-rdpu",
    name: "Reksa Dana Pasar Uang Likuid",
    ticker: "RDPU-ID",
    category: AssetCategory.LIKUID_DARURAT,
    balanceIDR: 9000000,
    targetPercent: 35,
    annualYieldPercent: 5.2,
    autoDcaMonthlyIDR: 750000,
  },
  {
    id: "asset-sbn",
    name: "SBN Ritel / Sukuk Negara",
    ticker: "SR-021",
    category: AssetCategory.PENDAPATAN_TETAP,
    balanceIDR: 5000000,
    targetPercent: 25,
    annualYieldPercent: 6.4,
    autoDcaMonthlyIDR: 500000,
  },
  {
    id: "asset-etf",
    name: "ETF Indeks & Saham Dividen",
    ticker: "IDX-DIV20",
    category: AssetCategory.EKUITAS_DIVIDEN,
    balanceIDR: 3500000,
    targetPercent: 30,
    annualYieldPercent: 11.5,
    autoDcaMonthlyIDR: 750000,
  },
  {
    id: "asset-seed",
    name: "Kas Putar Peluang Mikro",
    ticker: "KAS-PUTAR",
    category: AssetCategory.MODAL_USAHA,
    balanceIDR: 1000000,
    targetPercent: 10,
    annualYieldPercent: 0,
    autoDcaMonthlyIDR: 250000,
  },
];

export const INITIAL_RULES: AutomationRule[] = [
  {
    id: "rule-payday-dca",
    title: "Auto-DCA Tanggal Gajian",
    trigger: "Setiap tanggal 26 pukul 09:00 WIB",
    actionSummary: "Tarik otomatis ke RDPU, SBN Ritel, dan ETF sesuai target bobot portofolio.",
    enabled: true,
    allocationPercent: 25,
  },
  {
    id: "rule-side-sweep",
    title: "Cash Sweep Pendapatan Peluang Sampingan",
    trigger: "Setiap ada pembayaran klien atau penjualan produk digital masuk",
    actionSummary: "Kunci 40% langsung ke portofolio investasi sebelum dipakai untuk konsumsi.",
    enabled: true,
    allocationPercent: 40,
  },
  {
    id: "rule-drip",
    title: "Reinvestasi Otomatis Kupon & Dividen",
    trigger: "Saat kupon SBN bulanan atau dividen tahunan cair",
    actionSummary: "Putar kembali 100% hasil imbal hasil ke aset dengan bobot terendah dari target.",
    enabled: true,
    allocationPercent: 100,
  },
  {
    id: "rule-rebalance",
    title: "Peringatan Rebalance Deviasi Portofolio",
    trigger: "Jika bobot kategori menyimpang > 5% dari target",
    actionSummary: "Alihkan setoran DCA bulan berikutnya ke kelas aset yang tertinggal (tanpa jual rugi).",
    enabled: true,
  },
];

export const INITIAL_SPLIT: AllocationSplit = {
  emergencyPercent: 35,
  fixedIncomePercent: 25,
  equityDividendPercent: 30,
  businessSeedPercent: 10,
};

export const CURATED_OPPORTUNITIES: OpportunityBlueprint[] = [
  {
    id: "opp-gmaps-landing",
    title: "Jasa Optimasi Google Maps Bisnis + Halaman Penawaran 1 Halaman",
    categoryTag: "Jasa Komputer",
    modelType: "Jasa Setup + Retainer Bulanan",
    capitalTier: "0-500rb",
    requiredCapitalIDR: 0,
    daysToFirstCash: 5,
    projectedMonthlyRecurringIDR: 3000000,
    autoSweepPercent: 40,
    whereToFindBuyers:
      "Cari di Google Maps bisnis lokal (bengkel, klinik gigi, salon, katering, laundry, kontraktor) yang belum ada website, fotonya sedikit, atau belum punya tombol chat WhatsApp rapi.",
    sampleOfferScript:
      "Halo Pak/Bu [Nama Usaha], saya lihat usaha Bapak/Ibu sudah ada di Google Maps dengan ulasan bagus, tapi belum ada halaman katalog/tombol pesan WA langsung. Saya buatkan 1 halaman profil + rapikan Google Maps-nya dulu supaya calon pembeli gampang hubungi. Boleh saya kirim contoh jadinya dulu tanpa biaya di muka?",
    whyItWorks:
      "Hanya bermodal browser dan komputer. Anda menjual paket setup Rp 400rb–600rb/bisnis plus biaya update bulanan Rp 150rb–250rb (ganti promo, upload foto baru, balas ulasan). Target 5 klien saja sudah menutup Rp 2–3jt di bulan pertama.",
    first7DaysSteps: [
      "Buat 2 contoh halaman profil sederhana memakai Carrd/Google Sites/HTML gratis untuk simulasi bengkel & klinik.",
      "Kumpulkan 30 kontak WhatsApp bisnis lokal dari Google Maps yang profilnya belum lengkap.",
      "Kirim pesan penawaran ke 10 bisnis per hari dengan contoh preview visual agar langsung terlihat nilainya.",
    ],
  },
  {
    id: "opp-excel-cleanup",
    title: "Jasa Rapikan Laporan Kas, Stok & Rekap Marketplace (Excel/Sheets)",
    categoryTag: "Jasa Komputer",
    modelType: "Jasa Proyek + Langganan Rekap Mingguan",
    capitalTier: "0-500rb",
    requiredCapitalIDR: 0,
    daysToFirstCash: 7,
    projectedMonthlyRecurringIDR: 2800000,
    autoSweepPercent: 40,
    whereToFindBuyers:
      "Seller Shopee/TikTok Shop/Tokopedia yang penjualannya ramai tapi pemiliknya bingung hitung untung bersih, atau UMKM kuliner/reseller di grup Facebook & Instagram.",
    sampleOfferScript:
      "Halo Kak [Nama Toko], banyak seller ramai order tapi masih pusing rekap potongan admin marketplace dan HPP bersih per produk. Saya bantu rapikan file Excel/Google Sheets otomatis supaya Kakak tinggal tempel data export dan langsung lihat laba bersihnya. Tarif setup Rp 350rb sekali jadi, mau saya kirim contoh tampilannya?",
    whyItWorks:
      "Pemilik bisnis benci administrasi dan takut salah hitung margin. Bermodal Google Sheets (gratis), Anda bisa menjual setup Rp 350rb–750rb atau jasa rekap mingguan Rp 300rb/bulan per toko.",
    first7DaysSteps: [
      "Siapkan 1 template Google Sheets otomatis (Import CSV order -> keluar omzet, potongan admin, HPP, laba bersih).",
      "Rekam video layar 60 detik di komputer menunjukkan cara kerjanya dengan data dummy.",
      "Hubungi 20 toko online skala kecil-menengah lewat DM/WhatsApp atau tawarkan di platform jasa lokal (Sribu/Fastwork).",
    ],
  },
  {
    id: "opp-product-visual",
    title: "Jasa Perbaikan Foto Produk Marketplace, Katalog PDF & Deskripsi Jualan",
    categoryTag: "Jasa Komputer",
    modelType: "Productized Service per Paket",
    capitalTier: "0-500rb",
    requiredCapitalIDR: 100000,
    daysToFirstCash: 6,
    projectedMonthlyRecurringIDR: 2500000,
    autoSweepPercent: 40,
    whereToFindBuyers:
      "Toko produk fisik di Shopee/Tokopedia/Instagram (fashion lokal, kerajinan, makanan kemasan, sparepart) yang foto produknya gelap atau tanpa teks keunggulan.",
    sampleOfferScript:
      "Halo Kak, produk di toko [Nama Toko] menarik sekali, hanya foto utamanya masih polos sehingga kalah menonjol di halaman pencarian. Saya bantu rapikan 10 foto produk + bingkai keunggulan & katalog PDF seharga Rp 250rb. Boleh saya buatkan 1 contoh foto gratis dari produk Kakak untuk dilihat dulu?",
    whyItWorks:
      "Dengan Canva/Photopea dan bantuan AI pembersih latar di komputer, 1 paket 10–15 foto bisa selesai dalam 2–3 jam. Sangat mudah menawarkan bukti nyata (editkan 1 foto dulu gratis) untuk menutup transaksi cepat.",
    first7DaysSteps: [
      "Pilih 3 seller dengan foto kurang rapi, editkan masing-masing 1 foto sampul produk sebagai portofolio mini.",
      "Kirim hasil editan 1 foto tersebut langsung ke chat toko/WA pemilik dengan penawaran paket 10 foto Rp 250rb.",
      "Tawarkan paket lanjutan bulanan (update banner promo + 10 foto produk baru) untuk arus berulang.",
    ],
  },
  {
    id: "opp-digital-sheets",
    title: "Produk Digital: Template Sistem Keuangan, HPP & Operasional Spesifik Sektor",
    categoryTag: "Produk Digital",
    modelType: "Buat Sekali, Jual Berulang (Margin ~95%)",
    capitalTier: "0-500rb",
    requiredCapitalIDR: 0,
    daysToFirstCash: 10,
    projectedMonthlyRecurringIDR: 2000000,
    autoSweepPercent: 50,
    whereToFindBuyers:
      "Pemilik usaha spesifik (kedai kopi, laundry kiloan, konter pulsa, pre-order kue) atau pekerja muda usia 25–35 tahun lewat TikTok/Reels edukasi, Lynk.id, Mayar, dan grup komunitas.",
    sampleOfferScript:
      "Punya usaha [Laundry/Kedai/Olshop] tapi uang kas sering tercampur sama uang pribadi? Pakai Template Kas & HPP Otomatis ini—cukup isi pemasukan & pengeluaran harian di HP/laptop, otomatis keluar laporan laba bersih & stok. Sekali beli Rp 59rb, pakai selamanya.",
    whyItWorks:
      "Produk digital yang laku bukan yang terlalu umum, melainkan yang menyelesaikan 1 masalah hitung-hitungan spesifik. Jual Rp 59rb × 35 pembeli/bulan sudah menghasilkan Rp 2jt bersih tanpa kirim paket fisik.",
    first7DaysSteps: [
      "Pilih 1 target spesifik (misal: Kalkulator HPP & Kas Kedai Minuman atau Tracker Cicilan & Tabungan Keluarga).",
      "Bangun file Google Sheets + video panduan 3 menit agar pembeli awam langsung bisa pakai.",
      "Upload ke Lynk.id/Mayar (gratis daftar), lalu buat 1 video demo layar setiap hari selama 14 hari.",
    ],
  },
  {
    id: "opp-digital-cs-kit",
    title: "Produk Digital: Paket Skrip Chat CS, SOP Admin & Konten Siap Pakai UMKM",
    categoryTag: "Produk Digital",
    modelType: "Aset Digital + Lisensi Akses",
    capitalTier: "0-500rb",
    requiredCapitalIDR: 0,
    daysToFirstCash: 12,
    projectedMonthlyRecurringIDR: 1750000,
    autoSweepPercent: 50,
    whereToFindBuyers:
      "Pemilik toko online pemula, reseller skincare/fashion, dan agen properti/jasa yang bingung cara membalas chat agar closing tanpa terdengar kaku.",
    sampleOfferScript:
      "Sering calon pembeli cuma tanya harga lalu hilang? Ini Paket 120+ Template Chat Closing WhatsApp & SOP Follow-Up khusus toko online—tinggal salin, tempel, dan sesuaikan nama produk. Harga rilis Rp 49rb.",
    whyItWorks:
      "Biaya pembuatan nol rupiah selain riset dan penulisan di komputer. Sangat mudah dibundel dengan update template bulanan atau upsell jasa setup.",
    first7DaysSteps: [
      "Susun 100+ skenario chat nyata (hadapi pembeli nawar, PHP, komplain pengiriman, follow-up H+2) di dokumen rapi.",
      "Tambahkan 15 template teks deskripsi produk siap pakai sebagai bonus.",
      "Jual di harga masuk Rp 49rb–79rb via halaman checkout instan dan promosikan lewat studi kasus sebelum-sesudah.",
    ],
  },
  {
    id: "opp-digital-career-kit",
    title: "Produk Digital: Paket CV ATS, Template Portofolio & Tracker Lamaran Kerja",
    categoryTag: "Produk Digital",
    modelType: "Produk Digital Evergreen",
    capitalTier: "0-500rb",
    requiredCapitalIDR: 0,
    daysToFirstCash: 10,
    projectedMonthlyRecurringIDR: 1600000,
    autoSweepPercent: 50,
    whereToFindBuyers:
      "Pencari kerja usia 22–35 tahun, fresh graduate, dan profesional yang ingin pindah kerja lewat TikTok, X (Twitter), LinkedIn, dan komunitas loker.",
    sampleOfferScript:
      "Jangan kirim CV desain berat yang sering gagal dibaca sistem HRD. Gunakan Paket 5 Template CV ATS (Word/Google Docs) + Contoh Kalimat Pencapaian + Tracker Lamaran Otomatis. Hanya Rp 39rb, langsung bisa diedit di laptop atau HP.",
    whyItWorks:
      "Permintaan stabil sepanjang tahun (evergreen). Harga Rp 39rb–59rb termasuk impulse buy yang cepat dibeli jika disertai contoh perbandingan CV sebelum & sesudah diperbaiki.",
    first7DaysSteps: [
      "Buat 5 template CV ATS bersih di Google Docs/Word + 1 Sheet pelacak status lamaran & jadwal wawancara.",
      "Sertakan panduan PDF 10 halaman berisi contoh kalimat pencapaian untuk admin, sales, marketing, dan operasional.",
      "Pasarkan dengan konten bedah kesalahan CV 45 detik setiap hari disertai tautan pembelian langsung.",
    ],
  },
  {
    id: "opp-ayam-petelur-digital",
    title: "Digitalisasi Peternakan Ayam Petelur (Tracking FCR, Produksi & Order B2B)",
    categoryTag: "Jasa Komputer",
    modelType: "Setup Sistem + Retainer / Template Niche",
    capitalTier: "0-500rb",
    requiredCapitalIDR: 0,
    daysToFirstCash: 7,
    projectedMonthlyRecurringIDR: 3200000,
    autoSweepPercent: 45,
    whereToFindBuyers:
      "Peternak ayam petelur mandiri skala 1.000–10.000 ekor di grup Facebook peternak layer, Google Maps peternakan/agen telur, atau toko pakan ternak lokal.",
    sampleOfferScript:
      "Halo Pak/Bu [Nama Peternak], banyak kandang layer kebobolan margin bukan karena harga telur, tapi FCR (rasio pakan/telur) dan telur pecah/hilang tidak terlacak harian. Saya buatkan sistem input 1 menit dari HP mandor kandang yang otomatis kirim laporan Hen-Day %, pemakaian pakan, dan estimasi untung rugi harian langsung ke WA Bapak/Ibu. Boleh saya tunjukkan contoh demonya dulu?",
    whyItWorks:
      "Pakan menyumbang ~70% biaya peternakan ayam petelur. Selisih FCR 0,1 saja pada 3.000 ekor bernilai jutaan rupiah per bulan. Anda bisa menjualnya sebagai produk digital template Google Sheets/AppSheet (Rp 149rb–299rb) atau jasa setup khusus kandang + sistem langganan telur langsung ke bakery/warung (Rp 500rb setup + Rp 250rb/bln).",
    first7DaysSteps: [
      "Buat 1 Google Sheets + form input harian HP (jumlah ayam, pakan masuk kg, panen telur kg/butir, telur retak, ayam mati/afkir) yang otomatis hitung Hen-Day %, FCR, dan HPP per kg telur.",
      "Tambahkan 1 halaman katalog order langganan mingguan untuk menembus bakery, warung sembako, dan katering tanpa bergantung 100% pada tengkulak.",
      "Tawarkan demo gratis ke 10 peternak atau grup komunitas ayam petelur, lalu jual sebagai paket setup atau produk digital siap pakai.",
    ],
  },
];
