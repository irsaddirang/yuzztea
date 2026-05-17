# Requirements Document

## Introduction

Yuzztea POS SaaS adalah aplikasi web hybrid yang menggabungkan **Point of Sale (POS)** untuk transaksi harian di gerai dengan **SaaS Management Console** untuk operasional bisnis kedai Es Teh "Yuzztea". Aplikasi ini melayani 4 gerai (dapat diperluas) di bawah satu organisasi, dengan tiga peran utama: Owner, Outlet_Manager, dan Cashier.

Aplikasi di-deploy sebagai Single Page Application (SPA) statis ke GitHub Pages, dengan Supabase sebagai backend untuk autentikasi, database (Postgres), Row Level Security (RLS), dan realtime sync. Karena seluruh logic berjalan di klien, isolasi data antar gerai dijaga di sisi database melalui RLS.

UI menggunakan gaya **glassmorphism** dan harus responsif penuh untuk perangkat mobile (kasir di tablet/HP), tablet, dan desktop (manager/owner di laptop).

Dokumen ini mendefinisikan kebutuhan fungsional dan non-fungsional untuk fase awal: autentikasi & otorisasi, manajemen organisasi/gerai, manajemen menu, manajemen stok, transaksi POS, laporan & statistik, serta standar UI responsif.

## Glossary

- **Yuzztea_App**: Aplikasi web SPA yang menjalankan POS dan Management Console di sisi klien.
- **POS_Module**: Bagian aplikasi yang digunakan Cashier untuk mencatat transaksi penjualan di gerai.
- **Management_Console**: Bagian aplikasi yang digunakan Owner dan Outlet_Manager untuk mengelola menu, stok, staff, dan laporan.
- **Auth_System**: Sub-sistem autentikasi berbasis Supabase Auth yang memverifikasi kredensial dan menerbitkan sesi pengguna.
- **Authorization_System**: Sub-sistem yang mengevaluasi peran (role) dan keanggotaan gerai untuk menentukan akses fitur dan data.
- **Organization**: Entitas tenant utama yang menaungi seluruh gerai Yuzztea.
- **Outlet**: Gerai fisik Yuzztea. Aplikasi mendukung minimal 4 Outlet pada peluncuran awal dan harus dapat menambah Outlet baru tanpa perubahan kode.
- **Owner**: Peran dengan akses penuh ke seluruh Outlet dalam Organization.
- **Outlet_Manager**: Peran yang mengelola satu atau lebih Outlet yang ditugaskan, mencakup menu, stok, staff, dan laporan Outlet tersebut.
- **Cashier**: Peran yang hanya dapat menggunakan POS_Module pada Outlet yang ditugaskan.
- **Menu_Item**: Produk jadi yang dijual ke pelanggan (misal: Es Teh Original, Es Teh Lemon).
- **Raw_Material**: Bahan baku yang dikonsumsi untuk membuat Menu_Item (misal: teh celup, gula, lemon, air, cup).
- **Recipe**: Pemetaan kuantitas Raw_Material yang dibutuhkan untuk satu unit Menu_Item.
- **Inventory_System**: Sub-sistem yang melacak stok Raw_Material dan Menu_Item per Outlet.
- **Transaction**: Catatan satu transaksi penjualan yang berisi daftar Menu_Item, harga, total, metode bayar, waktu, kasir, dan Outlet.
- **Receipt**: Dokumen struk yang dihasilkan dari Transaction untuk diberikan ke pelanggan (cetak atau digital).
- **Receipt_Formatter**: Komponen yang memformat Transaction menjadi teks Receipt.
- **Report_System**: Sub-sistem yang menghasilkan ringkasan dan statistik penjualan per Outlet maupun gabungan.
- **RLS**: Row Level Security pada database Supabase, digunakan untuk isolasi data per Organization dan per Outlet.
- **Session**: Sesi login aktif yang berisi identitas pengguna, peran, dan daftar Outlet yang dapat diakses.

## Requirements

### Requirement 1: Autentikasi Pengguna

**User Story:** Sebagai pengguna terdaftar (Owner, Outlet_Manager, atau Cashier), saya ingin login ke Yuzztea_App menggunakan email dan password, sehingga saya dapat mengakses fitur sesuai peran saya.

#### Acceptance Criteria

1. WHEN seorang pengguna mengirim email berformat valid (mengandung "@" dan domain dengan ".") sepanjang 5-254 karakter dan password sepanjang 8-128 karakter, THE Auth_System SHALL memverifikasi kredensial dan menerbitkan Session yang berisi user_id, role, dan daftar outlet_id yang dapat diakses dalam waktu paling lama 3 detik.
2. IF email atau password yang dikirim tidak sesuai format minimum atau tidak cocok dengan kredensial yang tersimpan, THEN THE Auth_System SHALL menolak login dan menampilkan pesan kesalahan generik tanpa membedakan email salah atau password salah.
3. WHEN sebuah Session telah aktif selama 12 jam tanpa aktivitas, THE Auth_System SHALL meng-invalidasi Session dan mengarahkan pengguna ke halaman /login.
4. WHEN pengguna memilih aksi logout, THE Auth_System SHALL menghapus Session pada klien dan mencabut token akses pada Supabase dalam waktu paling lama 2 detik.
5. WHILE tidak ada Session yang aktif, THE Yuzztea_App SHALL hanya mengizinkan akses ke halaman publik (landing page) dan halaman /login, dan SHALL mengarahkan permintaan halaman terproteksi ke /login.
6. IF percobaan login gagal lebih dari 5 kali berturut-turut dalam 10 menit dari satu email, THEN THE Auth_System SHALL memberlakukan jeda eksponensial dimulai 1 detik dan digandakan setiap kegagalan berikutnya hingga batas maksimum 5 menit sebelum percobaan berikutnya diterima.

### Requirement 2: Otorisasi Berbasis Peran dan Gerai

**User Story:** Sebagai Owner, saya ingin sistem membatasi akses fitur dan data berdasarkan peran dan gerai pengguna, sehingga setiap staf hanya melihat data yang relevan dengan tanggung jawabnya.

#### Acceptance Criteria

1. THE Authorization_System SHALL mendukung tiga peran: Owner, Outlet_Manager, dan Cashier.
2. WHEN pengguna ber-peran Owner mengakses data Transaction, Menu_Item, Raw_Material, atau Report, THE Authorization_System SHALL mengizinkan akses ke seluruh Outlet dalam Organization.
3. WHEN pengguna ber-peran Outlet_Manager mengakses data Transaction, Menu_Item, Raw_Material, atau Report, THE Authorization_System SHALL mengizinkan akses pada Outlet manapun yang termasuk dalam daftar penugasan pengguna tersebut.
4. WHEN pengguna ber-peran Cashier mengakses POS_Module, THE Authorization_System SHALL mengizinkan akses pada Outlet manapun yang termasuk dalam daftar penugasan pengguna tersebut.
5. IF pengguna ber-peran Cashier mencoba mengakses Management_Console, THEN THE Authorization_System SHALL menolak akses dalam waktu paling lama 1 detik dan mengarahkan pengguna ke POS_Module.
6. IF pengguna ber-peran Outlet_Manager atau Cashier login tanpa memiliki Outlet penugasan aktif, THEN THE Authorization_System SHALL menolak akses fitur Outlet dan mengarahkan pengguna ke halaman pemberitahuan "Belum ada Outlet penugasan".
7. THE Authorization_System SHALL menerapkan RLS pada database sehingga query dari klien hanya mengembalikan baris yang sesuai dengan organization_id dan outlet_id yang diizinkan untuk Session aktif.
8. IF klien mengirim query untuk Outlet yang tidak diizinkan bagi Session aktif, THEN THE Authorization_System SHALL mengembalikan hasil kosong, menolak operasi dalam waktu paling lama 1 detik, dan mencatat audit log berisi timestamp ISO 8601, user_id, attempted_outlet_id, dan action.
9. WHEN Owner mengubah peran atau daftar Outlet penugasan pengguna, THE Authorization_System SHALL menerapkan perubahan pada Session berikutnya yang dibuat pengguna tersebut, dan SHALL menjamin perubahan terpropagasi ke evaluasi akses pada Session baru dalam waktu paling lama 60 detik setelah penyimpanan perubahan.

### Requirement 3: Manajemen Gerai (Outlet)

**User Story:** Sebagai Owner, saya ingin mengelola daftar gerai Yuzztea, sehingga setiap gerai memiliki identitas, alamat, jam operasional, dan staff yang jelas.

#### Acceptance Criteria

1. THE Management_Console SHALL menyediakan antarmuka bagi Owner untuk membuat, mengubah, menonaktifkan, dan mengaktifkan kembali Outlet dengan waktu respons paling lama 3 detik per operasi.
2. WHEN Owner menyimpan Outlet baru atau perubahan Outlet, THE Management_Console SHALL memvalidasi field dengan batasan: nama 1-100 karakter, kode_outlet 3-20 karakter alfanumerik unik dalam Organization, alamat 1-255 karakter, kota 1-50 karakter, jam_buka dan jam_tutup berformat HH:MM dengan jam_tutup lebih besar dari jam_buka.
3. IF salah satu field tidak memenuhi batasan validasi atau kode_outlet duplikat dengan Outlet lain dalam Organization, THEN THE Management_Console SHALL menolak penyimpanan, menampilkan pesan error per field yang gagal, dan tidak mengubah data Outlet sebelumnya.
4. WHILE sebuah Outlet berstatus non-aktif, THE POS_Module SHALL menolak pembuatan Transaction baru pada Outlet tersebut dan menampilkan pesan "Outlet non-aktif" kepada Cashier.
5. WHEN Owner mengubah jam operasional Outlet, THE Management_Console SHALL menyimpan riwayat perubahan beserta user_id pengubah dan timestamp dengan presisi detik dalam format ISO 8601, dengan retensi minimal 365 hari.
6. THE Management_Console SHALL menampilkan minimal 4 Outlet pada konfigurasi awal, SHALL mendukung penambahan Outlet hingga 50 tanpa perubahan skema, dan SHALL memuat daftar Outlet dalam waktu paling lama 2 detik.

### Requirement 4: Manajemen Pengguna dan Penugasan Gerai

**User Story:** Sebagai Owner atau Outlet_Manager, saya ingin mengelola staf dan menugaskan mereka ke gerai tertentu, sehingga akses POS dan data dibatasi sesuai gerai tugasnya.

#### Acceptance Criteria

1. THE Management_Console SHALL mengizinkan Owner untuk membuat, mengubah, dan menonaktifkan akun pengguna dengan peran Owner, Outlet_Manager, atau Cashier, dengan validasi username dan email unik dalam Organization serta panjang username dan email masing-masing 3-64 karakter.
2. THE Management_Console SHALL mengizinkan Outlet_Manager untuk membuat, mengubah, dan menonaktifkan akun pengguna dengan peran Cashier hanya pada Outlet yang termasuk daftar penugasan Outlet_Manager tersebut.
3. WHEN Owner atau Outlet_Manager menyimpan pengguna ber-peran Outlet_Manager atau Cashier, THE Management_Console SHALL mewajibkan minimal 1 outlet_id pada penugasan, dan SHALL membatasi jumlah maksimum outlet_id pada penugasan sama dengan jumlah Outlet aktif pada Organization.
4. IF Owner atau Outlet_Manager menyimpan pengguna ber-peran Outlet_Manager atau Cashier tanpa outlet_id atau dengan outlet_id yang tidak terdaftar dalam Organization, THEN THE Management_Console SHALL menolak penyimpanan dan menampilkan pesan validasi yang menunjuk field outlet.
5. IF Outlet_Manager mencoba membuat, mengubah, atau menonaktifkan pengguna pada Outlet yang tidak termasuk daftar penugasan Outlet_Manager tersebut, THEN THE Authorization_System SHALL menolak operasi dan menampilkan pesan akses ditolak.
6. WHEN Owner atau Outlet_Manager mengubah daftar Outlet penugasan pengguna, THE Authorization_System SHALL menerapkan perubahan pada Session berikutnya yang dibuat pengguna tersebut tanpa mengubah daftar Outlet pada Session yang sedang aktif.
7. WHEN sebuah akun pengguna dinonaktifkan, THE Auth_System SHALL meng-invalidasi seluruh Session aktif milik pengguna tersebut dalam waktu paling lama 60 detik.

### Requirement 5: Manajemen Menu dan Produk

**User Story:** Sebagai Owner atau Outlet_Manager, saya ingin mengelola Menu_Item beserta harga dan ketersediaannya per gerai, sehingga POS_Module menampilkan menu yang akurat untuk pelanggan.

#### Acceptance Criteria

1. THE Management_Console SHALL menyediakan antarmuka untuk membuat, mengubah, dan menghapus Menu_Item dengan validasi field: nama 1-100 karakter, kategori 1-50 karakter, harga_dasar berupa bilangan bulat 0 hingga 10.000.000, deskripsi 0-500 karakter, satuan dipilih dari daftar yang ditentukan, status_aktif boolean, dan gambar opsional berformat JPEG, PNG, atau WebP dengan ukuran maksimum 2 MB.
2. IF salah satu field Menu_Item tidak memenuhi batasan validasi, THEN THE Management_Console SHALL menolak penyimpanan dan menampilkan pesan error yang merujuk pada field yang gagal.
3. WHEN Owner membuat Menu_Item baru, THE Management_Console SHALL menjadikan Menu_Item tersebut tersedia di seluruh Outlet aktif kecuali Owner menentukan daftar Outlet tertentu.
4. WHEN Outlet_Manager mengubah harga atau status_aktif Menu_Item, THE Management_Console SHALL menerapkan perubahan hanya pada Outlet yang termasuk daftar penugasan Outlet_Manager tersebut.
5. WHILE sebuah Menu_Item berstatus non-aktif pada sebuah Outlet, THE POS_Module SHALL menyembunyikan Menu_Item tersebut dari daftar pemilihan kasir di Outlet itu.
6. WHEN harga atau status_aktif Menu_Item diubah, THE Management_Console SHALL memperbarui tampilan Menu_Item pada POS_Module untuk Outlet terdampak dalam waktu paling lama 5 detik.
7. WHEN harga Menu_Item diubah, THE Management_Console SHALL menyimpan riwayat harga beserta tanggal berlaku, user_id pengubah, dan harga lama, dengan retensi minimal 24 bulan.
8. IF Outlet_Manager mencoba menghapus Menu_Item yang masih memiliki Transaction historis, THEN THE Management_Console SHALL menolak penghapusan dan menyarankan menonaktifkan Menu_Item.

### Requirement 6: Manajemen Stok Bahan Baku dan Produk

**User Story:** Sebagai Outlet_Manager, saya ingin melacak stok Raw_Material dan ketersediaan Menu_Item per gerai, sehingga saya dapat mencegah kehabisan stok dan menjaga akurasi penjualan.

#### Acceptance Criteria

1. THE Inventory_System SHALL melacak kuantitas Raw_Material per Outlet dengan field: raw_material_id, outlet_id, kuantitas_saat_ini berupa angka 0 hingga 999.999,99, satuan dipilih dari himpunan tertutup (gram, ml, pcs, liter, kg), kuantitas_minimum berupa angka 0 hingga 999.999,99, dan timestamp_update_terakhir dalam format ISO 8601.
2. THE Inventory_System SHALL mengizinkan Outlet_Manager mendefinisikan Recipe yang memetakan satu Menu_Item ke 1 hingga 50 pasangan (raw_material_id, kuantitas_per_unit) dengan kuantitas_per_unit lebih besar dari 0 dan tidak melebihi 999.999,99.
3. IF Outlet_Manager menyimpan Recipe yang merujuk pada raw_material_id yang tidak terdaftar pada Inventory_System untuk Outlet terkait, THEN THE Inventory_System SHALL menolak penyimpanan Recipe dan menampilkan pesan error yang merujuk pada raw_material_id yang invalid.
4. WHEN sebuah Transaction yang berisi Menu_Item dengan Recipe terdefinisi diselesaikan, THE Inventory_System SHALL mengurangi kuantitas Raw_Material pada Outlet sesuai Recipe dan jumlah unit terjual secara atomic dalam waktu paling lama 5 detik dan SHALL memperbarui timestamp_update_terakhir.
5. WHEN kuantitas_saat_ini sebuah Raw_Material turun sama dengan atau di bawah kuantitas_minimum, THE Inventory_System SHALL menampilkan notifikasi stok rendah pada dashboard Outlet_Manager dan Owner untuk Outlet tersebut dalam waktu paling lama 10 detik, dan notifikasi SHALL tetap tampil hingga dibaca atau hingga kuantitas_saat_ini kembali di atas kuantitas_minimum.
6. WHEN Outlet_Manager mencatat penerimaan stok, THE Inventory_System SHALL memvalidasi kuantitas dalam rentang 0 hingga 999.999,99, panjang nama supplier 1-100 karakter bila diisi, dan harga_satuan dalam rentang 0 hingga 1.000.000 bila diisi, kemudian menambah kuantitas_saat_ini sesuai jumlah yang diterima dan menyimpan record penerimaan dengan field: tanggal, supplier opsional, kuantitas, harga_satuan opsional, dan user_id pencatat.
7. WHEN Outlet_Manager melakukan penyesuaian stok manual (stock opname), THE Inventory_System SHALL memvalidasi kuantitas_sesudah dalam rentang 0 hingga 999.999,99 dan alasan sepanjang 1-500 karakter, menghitung selisih secara otomatis, dan menyimpan kuantitas sebelum, kuantitas sesudah, selisih, alasan, user_id pencatat, dan timestamp dalam format ISO 8601.
8. IF input penerimaan stok atau penyesuaian stok tidak memenuhi batasan validasi, THEN THE Inventory_System SHALL menolak operasi, melakukan rollback, dan menampilkan pesan error yang merujuk pada field yang gagal.
9. IF Recipe membutuhkan Raw_Material yang kuantitas_saat_ini-nya kurang dari kebutuhan Transaction, THEN THE POS_Module SHALL menampilkan peringatan visual berisi nama Raw_Material dan jumlah kekurangan kepada Cashier sebelum konfirmasi, dan tetap mengizinkan Cashier melanjutkan Transaction dengan menandai Raw_Material tersebut sebagai stok minus.

### Requirement 7: Transaksi POS

**User Story:** Sebagai Cashier, saya ingin mencatat penjualan dengan cepat di gerai, sehingga pelanggan dapat dilayani dengan ringkas dan total transaksi terhitung akurat.

#### Acceptance Criteria

1. THE POS_Module SHALL menampilkan daftar Menu_Item aktif untuk Outlet Session aktif, dikelompokkan per kategori, dengan harga dan gambar bila tersedia, dan SHALL memuat daftar hingga 500 Menu_Item dalam waktu paling lama 2 detik.
2. WHEN Cashier menambah, mengurangi, atau menghapus Menu_Item pada keranjang, THE POS_Module SHALL menghitung ulang subtotal, diskon, pajak (bila aktif), dan total dalam waktu paling lama 200 ms per perubahan, dan SHALL membatasi jumlah line item pada keranjang maksimum 100.
3. THE POS_Module SHALL mendukung minimal metode pembayaran berikut: tunai, QRIS, dan transfer bank.
4. WHEN Cashier mengonfirmasi pembayaran, THE POS_Module SHALL membuat Transaction dengan field: id, outlet_id, cashier_user_id, daftar_item, subtotal, diskon, pajak, total, metode_bayar, jumlah_bayar, kembalian, status dipilih dari himpunan {pending, confirmed, cancelled, refunded, pending_reconciliation}, dan timestamp dalam format ISO 8601 dengan timezone Asia/Jakarta.
5. IF metode pembayaran adalah tunai dan jumlah_bayar lebih kecil dari total, THEN THE POS_Module SHALL menolak konfirmasi dan menampilkan pesan kekurangan pembayaran.
6. IF metode pembayaran adalah QRIS atau transfer bank dan jumlah_bayar tidak sama persis dengan total, THEN THE POS_Module SHALL menolak konfirmasi dan menampilkan pesan ketidaksesuaian jumlah pembayaran.
7. WHEN Transaction berstatus confirmed berhasil dibuat, THE POS_Module SHALL meng-trigger Inventory_System untuk pengurangan stok sesuai Requirement 6.
8. IF Inventory_System gagal mengurangi stok setelah Transaction berstatus confirmed, THEN THE POS_Module SHALL mengubah status Transaction menjadi pending_reconciliation tanpa melakukan rollback Transaction dan SHALL mencatat kegagalan untuk peninjauan Outlet_Manager.
9. WHEN Cashier membatalkan Transaction yang belum dikonfirmasi, THE POS_Module SHALL membuang keranjang tanpa membuat record Transaction.
10. WHERE Transaction berstatus confirmed dan dibuat dalam 24 jam terakhir dan belum pernah di-refund, THE POS_Module SHALL mengizinkan Outlet_Manager atau Owner melakukan satu kali refund yang membuat record refund yang merujuk ke Transaction asal, mengubah status Transaction menjadi refunded, mengembalikan stok Raw_Material sesuai Recipe, dan mencatat user_id penerbit refund.
11. IF Outlet_Manager atau Owner mencoba refund pada Transaction yang berstatus selain confirmed, atau dibuat lebih dari 24 jam yang lalu, atau sudah pernah di-refund, THEN THE POS_Module SHALL menolak refund dan menampilkan pesan alasan penolakan.

### Requirement 8: Pencetakan dan Format Struk

**User Story:** Sebagai Cashier, saya ingin mencetak atau mengirim struk kepada pelanggan setelah pembayaran, sehingga pelanggan menerima bukti transaksi yang jelas.

#### Acceptance Criteria

1. WHEN sebuah Transaction berhasil dikonfirmasi, THE Receipt_Formatter SHALL menghasilkan teks Receipt yang berisi nama Outlet, alamat Outlet, nomor transaksi, tanggal dan jam dalam format DD/MM/YYYY HH:mm:ss timezone Asia/Jakarta, daftar item dengan nama, kuantitas, harga, subtotal, diskon, pajak, total, metode bayar, jumlah bayar, kembalian, dan nama Cashier dalam waktu paling lama 2 detik, untuk Receipt yang memuat hingga 100 item.
2. THE Receipt_Formatter SHALL memformat Receipt untuk lebar thermal paper 58 mm dan 80 mm.
3. THE Receipt_Formatter SHALL memformat angka mata uang menggunakan locale id-ID dengan simbol "Rp" dan tanpa desimal.
4. THE POS_Module SHALL menyediakan opsi mencetak Receipt ke printer thermal yang terhubung melalui browser print dialog dengan timeout 5 detik dan menyimpan Receipt sebagai PDF.
5. IF printer thermal tidak tersedia atau gagal merespon dalam 5 detik, THEN THE POS_Module SHALL menampilkan opsi simpan PDF kepada Cashier dan SHALL tidak mengubah status Transaction.
6. WHERE pelanggan memberikan nomor WhatsApp sepanjang 10-15 digit atau email yang mengandung "@" diikuti domain dengan ".", THE POS_Module SHALL menyediakan opsi mengirim Receipt digital melalui tautan share atau salinan teks.
7. IF nomor WhatsApp atau email yang dimasukkan tidak memenuhi format yang ditentukan, THEN THE POS_Module SHALL menolak pengiriman Receipt dan menampilkan pesan format kontak invalid tanpa mengubah status Transaction.
8. WHEN Receipt dihasilkan ulang untuk Transaction yang sama, THE Receipt_Formatter SHALL menghasilkan output yang identik secara konten dengan menambahkan label "REPRINT" beserta timestamp pencetakan ulang dalam format DD/MM/YYYY HH:mm:ss timezone Asia/Jakarta.

### Requirement 9: Laporan dan Statistik Penjualan

**User Story:** Sebagai Owner atau Outlet_Manager, saya ingin melihat ringkasan dan statistik penjualan per gerai maupun gabungan, sehingga saya dapat memantau performa bisnis dan mengambil keputusan.

#### Acceptance Criteria

1. THE Report_System SHALL menyediakan ringkasan harian, mingguan, dan bulanan dengan metrik: total penjualan dalam rentang Rupiah 0 hingga 9.999.999.999, jumlah transaksi dalam rentang 0 hingga 1.000.000, rata-rata nilai transaksi dengan presisi 2 desimal, jumlah item terjual, dan rincian per metode bayar.
2. THE Report_System SHALL menyediakan filter rentang tanggal kustom dengan batas paling lama 12 bulan ke belakang dari tanggal saat ini.
3. IF pengguna memilih rentang tanggal dengan tanggal mulai lebih besar dari tanggal akhir atau tanggal mulai lebih dari 12 bulan ke belakang, THEN THE Report_System SHALL menolak filter, menampilkan pesan rentang tanggal invalid, dan tetap menampilkan filter terakhir yang valid.
4. WHEN Owner mengakses laporan tanpa memilih Outlet, THE Report_System SHALL menampilkan agregat lintas seluruh Outlet aktif dan rincian per Outlet pada tabel pendamping.
5. WHEN Outlet_Manager mengakses laporan, THE Report_System SHALL menampilkan data hanya untuk Outlet yang termasuk daftar penugasan Outlet_Manager tersebut dan SHALL menyembunyikan opsi pemilihan Outlet di luar daftar penugasan tersebut.
6. THE Report_System SHALL menyediakan grafik tren penjualan harian untuk rentang yang dipilih dan grafik 5 Menu_Item terlaris berdasarkan jumlah unit terjual dengan tie-breaker berdasarkan urutan abjad nama Menu_Item A-Z.
7. WHEN rentang tanggal yang dipilih tidak memiliki Transaction, THE Report_System SHALL menampilkan pesan "Tidak ada data" dan grafik kosong tanpa error.
8. WHEN pengguna memilih ekspor laporan, THE Report_System SHALL menghasilkan file CSV dengan kolom yang konsisten antar ekspor untuk rentang dan filter yang sama.
9. IF proses ekspor CSV gagal, THEN THE Report_System SHALL menampilkan pesan error kepada pengguna dan SHALL tidak mengunduh file parsial.
10. THE Report_System SHALL menampilkan hasil laporan untuk rentang 1 bulan dalam waktu paling lama 3 detik dari pengguna submit filter hingga grafik dan tabel ter-render penuh pada koneksi 4 Mbps.

### Requirement 10: Realtime Sinkronisasi Data Antar Klien

**User Story:** Sebagai Outlet_Manager, saya ingin perubahan stok dan transaksi tampak di dashboard saya tanpa refresh manual, sehingga keputusan operasional berdasarkan data terbaru.

#### Acceptance Criteria

1. WHEN sebuah Transaction baru dibuat pada Outlet, THE Yuzztea_App SHALL memperbarui dashboard Owner dan Outlet_Manager yang berhak melihat Outlet tersebut dalam waktu paling lama 5 detik tanpa refresh halaman.
2. WHEN kuantitas Raw_Material berubah, THE Yuzztea_App SHALL memperbarui tampilan stok pada Management_Console pengguna yang berhak melihat Outlet tersebut dalam waktu paling lama 5 detik.
3. WHEN koneksi realtime terputus, THE Yuzztea_App SHALL menampilkan indikator status offline kepada pengguna dalam waktu paling lama 3 detik.
4. WHILE koneksi realtime terputus, THE Yuzztea_App SHALL mencoba menyambung ulang dengan jadwal backoff 1 detik, 2 detik, 4 detik, 8 detik, 16 detik, kemudian 30 detik untuk percobaan berikutnya hingga maksimum 10 percobaan.
5. IF 10 percobaan menyambung ulang berturut-turut gagal, THEN THE Yuzztea_App SHALL berhenti mencoba otomatis, menampilkan state "disconnected_terminal", dan menampilkan tombol "Coba Lagi" untuk percobaan manual.
6. WHEN koneksi realtime tersambung kembali, THE Yuzztea_App SHALL melakukan refresh data tampil saat ini agar konsisten dengan database dalam waktu paling lama 5 detik dan SHALL menyembunyikan indikator offline.
7. IF payload realtime yang diterima invalid atau tidak lengkap, THEN THE Yuzztea_App SHALL mengabaikan payload, mencatat error pada log klien, dan tidak memperbarui tampilan.

### Requirement 11: Ketahanan Jaringan pada POS

**User Story:** Sebagai Cashier, saya ingin tetap dapat melayani pelanggan saat koneksi internet sementara terputus, sehingga operasional gerai tidak berhenti.

#### Acceptance Criteria

1. WHILE koneksi internet terputus, THE POS_Module SHALL tetap menampilkan daftar Menu_Item dari cache lokal yang berasal dari sinkronisasi terakhir berhasil.
2. WHILE koneksi internet terputus, THE POS_Module SHALL mengizinkan pembuatan Transaction dengan status "pending_sync" hingga jumlah maksimum 500 Transaction tertunda per perangkat.
3. WHEN koneksi internet tersambung kembali, THE POS_Module SHALL men-sinkronkan seluruh Transaction dengan status "pending_sync" ke Supabase secara berurutan menurut timestamp pembuatan dengan batas waktu 60 detik per Transaction.
4. IF sinkronisasi sebuah Transaction "pending_sync" gagal, THEN THE POS_Module SHALL mempertahankan Transaction tersebut sebagai "pending_sync", melakukan retry hingga 5 kali dengan jeda 30 detik antar percobaan, dan menampilkan indikator gagal sinkronisasi setelah percobaan terakhir.
5. IF saat sinkronisasi terjadi konflik harga Menu_Item antara harga di cache lokal dan harga di Supabase, THEN THE POS_Module SHALL menyimpan Transaction dengan harga yang berlaku saat Transaction dibuat di gerai, menandai Transaction dengan status conflict_review, dan menampilkan Transaction tersebut ke Outlet_Manager untuk peninjauan.
6. IF jumlah Transaction "pending_sync" pada perangkat mencapai 500, THEN THE POS_Module SHALL menolak pembuatan Transaction baru dan menampilkan pesan kepada Cashier bahwa antrian sinkronisasi penuh.
7. WHILE terdapat Transaction "pending_sync" yang belum tersinkron, THE POS_Module SHALL menampilkan badge jumlah Transaction tertunda kepada Cashier dengan angka 1 hingga 500.

### Requirement 12: Antarmuka Responsif Multi-Perangkat

**User Story:** Sebagai pengguna pada perangkat apapun (HP, tablet, laptop, desktop), saya ingin antarmuka Yuzztea_App nyaman digunakan tanpa scroll horizontal atau elemen terpotong, sehingga saya bekerja efisien di gerai maupun kantor.

#### Acceptance Criteria

1. THE Yuzztea_App SHALL menampilkan area konten utama (area yang memuat data primer dan kontrol interaktif untuk tugas aktif) tanpa scroll horizontal dan tanpa elemen terpotong pada lebar viewport mulai dari 360 px hingga 1920 px.
2. THE Yuzztea_App SHALL menyediakan layout single-column pada lebar viewport mobile (< 768 px), layout two-column berdampingan pada lebar viewport tablet (768 px hingga 1023 px), dan layout three-pane atau widescreen pada lebar viewport desktop (>= 1024 px).
3. WHILE POS_Module digunakan pada lebar viewport tablet, THE POS_Module SHALL menampilkan grid Menu_Item dan panel keranjang secara berdampingan.
4. WHILE POS_Module digunakan pada lebar viewport mobile, THE POS_Module SHALL menampilkan keranjang sebagai panel collapsible dengan tombol primer "Bayar" pada posisi fixed bottom layar.
5. THE Yuzztea_App SHALL menjamin target sentuh pada tombol, link navigasi, dan ikon yang dapat diklik berukuran minimal 44 x 44 px pada lebar viewport mobile dan tablet.
6. THE Yuzztea_App SHALL menampilkan body text berukuran minimal 14 px dengan rasio kontras terhadap latar minimum 4.5:1 sesuai WCAG AA pada mode terang dan mode gelap.
7. WHEN viewport berpindah breakpoint selama session aktif, THE Yuzztea_App SHALL mempertahankan input form yang belum disimpan tanpa kehilangan nilai yang sudah diisi pengguna.

### Requirement 13: Gaya Visual Glassmorphism

**User Story:** Sebagai pengguna, saya ingin tampilan aplikasi modern dengan gaya glassmorphism yang khas Yuzztea, sehingga aplikasi terasa premium dan konsisten dengan brand.

#### Acceptance Criteria

1. THE Yuzztea_App SHALL menerapkan permukaan kartu utama dengan latar semi-transparan, blur background minimal 12 px, dan tepi border bercahaya dengan ketebalan 1 px pada Management_Console dan POS_Module di mode terang dan mode gelap.
2. WHILE mode terang aktif, THE Yuzztea_App SHALL menggunakan opasitas latar kartu paling rendah 0.7 dan SHALL menjamin rasio kontras teks terhadap latar kartu minimum 4.5:1 untuk teks berukuran lebih kecil dari 18 px dan minimum 3:1 untuk teks berukuran 18 px atau lebih besar.
3. WHILE mode gelap aktif, THE Yuzztea_App SHALL menggunakan opasitas latar kartu paling rendah 0.4 dengan blur background minimal 12 px dan SHALL menjamin rasio kontras teks terhadap latar kartu minimum 4.5:1 untuk teks berukuran lebih kecil dari 18 px dan minimum 3:1 untuk teks berukuran 18 px atau lebih besar.
4. THE Yuzztea_App SHALL menggunakan satu palet warna brand Yuzztea yang konsisten antar halaman dan komponen, terdiri dari warna primary, secondary, accent, neutral, dan warna status untuk success, warning, error, dan info.
5. WHEN pengguna memicu interaksi hover, focus, atau click, THE Yuzztea_App SHALL menampilkan transisi fungsional dengan durasi paling lama 200 ms.
6. IF pengguna mengaktifkan preferensi sistem prefers-reduced-motion, THEN THE Yuzztea_App SHALL menonaktifkan animasi dekoratif (parallax, blur transition) dan mempertahankan transisi fungsional dengan durasi paling lama 200 ms.
7. IF rasio kontras teks terhadap latar kartu pada kombinasi warna tertentu turun di bawah 4.5:1 untuk teks lebih kecil dari 18 px atau di bawah 3:1 untuk teks 18 px atau lebih besar, THEN THE Yuzztea_App SHALL mengganti latar kartu dengan latar solid sebagai fallback.

### Requirement 14: Audit dan Riwayat Aksi

**User Story:** Sebagai Owner, saya ingin melihat riwayat aksi penting yang dilakukan staff, sehingga saya dapat mengaudit perubahan harga, stok, dan pembatalan transaksi.

#### Acceptance Criteria

1. WHEN aksi berikut terjadi: perubahan harga Menu_Item, penghapusan atau penonaktifan Menu_Item, penyesuaian stok manual berupa penambahan atau pengurangan, refund Transaction, perubahan peran pengguna, atau perubahan penugasan Outlet, THE Yuzztea_App SHALL mencatat entri audit log dalam waktu paling lama 5 detik setelah aksi terjadi.
2. THE Yuzztea_App SHALL menyimpan setiap entri audit dengan field: id, timestamp dalam format ISO 8601 dengan timezone Asia/Jakarta, user_id, peran, outlet_id terkait (opsional untuk aksi level Organization), jenis aksi, entitas, id entitas, nilai sebelum sepanjang maksimum 2000 karakter, dan nilai sesudah sepanjang maksimum 2000 karakter.
3. WHEN Owner mengakses halaman audit log, THE Yuzztea_App SHALL menyediakan filter berdasarkan rentang tanggal dengan default 30 hari terakhir dan rentang maksimum 24 bulan, jenis aksi, Outlet, dan pengguna, dengan urutan terbaru lebih dulu dan paginasi 50 entri per halaman.
4. IF rentang tanggal filter audit log invalid (tanggal mulai lebih besar dari tanggal akhir atau rentang melebihi 24 bulan), THEN THE Yuzztea_App SHALL menolak filter, menampilkan pesan rentang invalid, dan menggunakan rentang default 30 hari terakhir.
5. IF pengguna ber-peran Outlet_Manager atau Cashier mencoba mengakses halaman audit log, THEN THE Authorization_System SHALL menolak akses dan mengarahkan pengguna ke halaman utama sesuai perannya.
6. THE Yuzztea_App SHALL menjamin entri audit log tidak dapat diubah atau dihapus oleh pengguna manapun, dan SHALL mengubah entri yang sudah berusia lebih dari 24 bulan menjadi read-only archive.

### Requirement 15: Privasi Kredensial dan Keamanan Klien

**User Story:** Sebagai Owner, saya ingin memastikan kredensial Supabase dan data sensitif aman meskipun aplikasi di-deploy sebagai SPA statis di GitHub Pages, sehingga risiko kebocoran terkendali.

#### Acceptance Criteria

1. THE Yuzztea_App SHALL hanya menyertakan Supabase anon key pada bundel klien dan SHALL tidak menyertakan service_role key pada source code, file konfigurasi, atau production build artifacts.
2. THE Authorization_System SHALL menerapkan RLS sebagai mekanisme isolasi pada seluruh query yang menggunakan anon key, dengan kebijakan yang terikat pada organization_id dan outlet_id pengguna pada Session aktif.
3. WHEN pengguna mengirim password melalui form login atau form ubah password, THE Yuzztea_App SHALL mengirim data tersebut hanya melalui koneksi HTTPS.
4. THE Yuzztea_App SHALL tidak menyimpan password pengguna pada localStorage, sessionStorage, IndexedDB, atau parameter URL.
5. THE Yuzztea_App SHALL menyimpan token Session pada sessionStorage atau IndexedDB yang dapat dibersihkan saat logout, dan SHALL tidak menempatkan token Session pada parameter URL.
6. WHEN pengguna memilih aksi logout, THE Yuzztea_App SHALL menghapus seluruh token Session dari storage klien dalam waktu paling lama 2 detik.
7. IF percobaan login gagal lebih dari 5 kali berturut-turut dalam 10 menit dari satu email, THEN THE Auth_System SHALL memberlakukan jeda mulai 1 detik dan digandakan setiap kegagalan berikutnya hingga batas maksimum 5 menit sebelum percobaan berikutnya diterima.
8. WHILE jeda throttling aktif untuk satu email, THE Auth_System SHALL menampilkan countdown sisa waktu jeda kepada pengguna pada halaman login.
