# 3Saat

Akademisyenlerin ders materyallerini 6 haneli bir **ders kodu** ile öğrencileriyle paylaştığı platform. Her dosya paylaşıldığı andan itibaren **3 saat** boyunca öğrencilere görünür, sonra akademisyenin arşivine geçer.

> **Durum:** Bu depo şu an **arayüz prototipidir**. Tüm ekranlar ve akışlar çalışır, ancak veriler sadece tarayıcıda (localStorage) tutulur. Gerçek veritabanı (Supabase) ve dosya deposu (Cloudflare R2) bir sonraki aşamada bağlanacak. Plan: [docs/MIMARI.md](docs/MIMARI.md)

## Özellikler

**Öğrenci (hesapsız)**
- Ana sayfada 6 haneli ders kodunu girer (“Ders Koduyla Katıl”).
- Öğretim üyesinin şu anda paylaşılan dosyalarını görür, tek tek ya da topluca indirir.
- Kalan süreyi görmez; süresi dolan dosya listeden kendiliğinden düşer.

**Akademisyen**
- İki yolla hesap: kendi kaydı ya da yöneticinin eklemesi.
- Kayıt bilgileri: unvan (Prof. Dr., Doç. Dr., Dr. Öğr. Üyesi, Öğr. Gör. …), ad soyad, kurumsal e-posta, fakülte/yüksekokul, bölüm, şifre.
- Kendi kaydı sadece kurumun e-posta alan adıyla yapılabilir (e-posta doğrulamalı). Alan adı `.env` dosyasındaki `VITE_ALLOWED_EMAIL_DOMAIN` ile ayarlanır (bkz. `.env.example`).
- Kendine ait sabit, benzersiz 6 haneli ders kodu; tek tıkla kopyalama ve yenileme (eski kod anında geçersiz olur).
- Her tür dosya (Word, Excel, PowerPoint, PDF, görsel, zip, video…), sürükle-bırak, çoklu yükleme, ilerleme çubuğu, dosya başına 500 MB sınır.
- Aktif dosyalarda canlı geri sayım, süre dolmadan “Durdur”.
- Arşiv: süresi dolan dosyalar silinmez; “Tekrar paylaş” (3 saat yeniden başlar), indir ya da kalıcı sil.
- Hesap ayarları: unvan, ad, fakülte, bölüm ve şifre değişikliği.

**Yönetici**
- Akademisyen ekleme (geçici şifreyle), dondurma/aktifleştirme, şifre sıfırlama, silme.
- Akademisyen sayısı, aktif dosya ve toplam depolama istatistikleri.

**Güvenlik (hedef mimari)**
- Kapalı dosya deposu, 2 dakika geçerli indirme bağlantıları.
- Ders kodu tahminine karşı: 15 dakikada 10 hatalı denemede geçici kilit (prototipte de çalışır).
- Öğrenciye sadece dosya adı ve boyutu döner; e-posta, arşiv, diğer akademisyenler asla görünmez.
- Satır bazlı güvenlik (RLS), roller ayrı tabloda, tüm yazma işlemleri sunucuda yetki kontrolüyle.

## Prototipi deneme

| Rol | E-posta | Şifre |
| --- | --- | --- |
| Akademisyen | `ayse@3saat.demo` | `demo1234` |
| Yönetici | `admin@3saat.demo` | `demo1234` |

Öğrenci olarak denemek için ana sayfada **482791** kodunu girin. Yeni kayıt denemek için `@universite.edu.tr` ile biten bir e-posta kullanın.

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ klasörüne üretim çıktısı
```

Teknolojiler: React 18, TypeScript, Vite, Tailwind CSS, React Router, lucide-react.

## Klasör yapısı

```
src/
  pages/        Ekranlar (Home, Course, Auth, Panel, Admin)
  components/   Ortak bileşenler (OtpInput, Modal, Toast, ui)
  lib/store.ts  Prototip veri katmanı (backend bağlanınca değişecek tek dosya)
  lib/format.ts Biçimlendirme ve sabitler (3 saat, 500 MB)
  lib/config.ts Kurum ayarları (e-posta alan adı, unvanlar, fakülte önerileri)
docs/MIMARI.md  Backend ve güvenlik planı
```
