# 3Saat

Akademisyenlerin ders materyallerini 6 haneli bir **ders kodu** ile öğrencileriyle paylaştığı açık kaynak platform. Her dosya paylaşıldığı andan itibaren **3 saat** boyunca öğrencilere görünür, sonra akademisyenin arşivine geçer.

- **Demo:** GitHub Pages'teki sürüm tarayıcı içi örnek verilerle çalışır, hiçbir sunucuya bağlanmaz. Bilgiler aşağıda.
- **Kendi kurumunuzda kurmak için:** [KURULUM.md](KURULUM.md). Cloudflare'in ücretsiz planında çalışır (Workers + D1 + R2).
- **Mimari ve güvenlik:** [docs/MIMARI.md](docs/MIMARI.md)

## Özellikler

**Öğrenci (hesapsız)**
- Ana sayfada 6 haneli ders kodunu girer ("Ders Koduyla Katıl").
- Akademisyenin şu anda paylaştığı dosyaları görür, tek tek ya da topluca indirir.
- Kalan süreyi görmez; süresi dolan dosya listeden kendiliğinden düşer.

**Akademisyen**
- İki yolla hesap: kurum e-postasıyla kendi kaydı (yönetici onayından sonra açılır) ya da yöneticinin eklemesi.
- Kayıt bilgileri: unvan (Prof. Dr., Doç. Dr., Dr. Öğr. Üyesi, Öğr. Gör., Öğr. Gör. Dr., Arş. Gör., Arş. Gör. Dr.), ad soyad, kurumsal e-posta, fakülte/yüksekokul, bölüm, şifre.
- Kendine ait sabit, benzersiz 6 haneli ders kodu; tek tıkla kopyalama ve yenileme (eski kod anında geçersiz olur).
- Her tür dosya (Word, Excel, PowerPoint, PDF, görsel, zip, video…), sürükle-bırak, çoklu yükleme, ilerleme çubuğu, dosya başına 500 MB sınır.
- Aktif dosyalarda canlı geri sayım, süre dolmadan "Durdur".
- Arşiv: süresi dolan dosyalar silinmez; "Tekrar paylaş" (3 saat yeniden başlar), indir ya da kalıcı sil.
- Hesap ayarları: unvan, ad, fakülte, bölüm ve şifre değişikliği.

**Yönetici**
- Bekleyen kayıtları onaylama ya da reddetme.
- Akademisyen ekleme (geçici şifreyle), dondurma/aktifleştirme, şifre sıfırlama, silme.
- Akademisyen sayısı, aktif dosya ve toplam depolama istatistikleri; depolama dolmaya yaklaşınca uyarı.

**Güvenlik**
- Dosya deposu kapalıdır; her indirme sunucunun ürettiği 2 dakika geçerli imzalı bağlantıyla olur.
- Öğrenciye sadece dosya adı, boyutu ve akademisyenin unvanı/adı/bölümü döner; e-posta, arşiv, diğer akademisyenler asla görünmez.
- Ders kodu ve giriş denemelerine sınır, PBKDF2 şifre özeti, HttpOnly oturum çerezi, CSRF koruması. Ayrıntılar: [docs/MIMARI.md](docs/MIMARI.md#güvenlik).

## Demoyu deneme

| Rol | E-posta | Şifre |
| --- | --- | --- |
| Akademisyen | `ayse@3saat.demo` | `demo1234` |
| Yönetici | `admin@3saat.demo` | `demo1234` |

Öğrenci olarak denemek için ana sayfada **482791** kodunu girin. Yeni kayıt denemek için `@universite.edu.tr` ile biten bir e-posta kullanın; kayıt yönetici panelinde onay bekler.

## Geliştirme

```bash
npm install
npm run dev:demo     # sadece arayüz, tarayıcı içi örnek verilerle: http://localhost:5173
npm run worker:dev   # gerçek sunucuyla yerelde (önce KURULUM.md → "Kendi bilgisayarınızda deneme")
npm run build        # arayüz + sunucu tip kontrolü ve üretim derlemesi
npm run build:demo   # GitHub Pages demosu
```

Teknolojiler: React 18, TypeScript, Vite, Tailwind CSS, React Router · Cloudflare Workers, Hono, D1, R2, zod.

## Klasör yapısı

```
src/                 Arayüz
  pages/             Ekranlar (Home, Course, Auth, Panel, Admin)
  components/        Ortak bileşenler
  lib/backend/       http.ts (gerçek API) · demo.ts (tarayıcı içi demo)
worker/              Cloudflare Worker: API, kimlik, depolama, zamanlanmış temizlik
shared/constants.ts  Arayüz ve sunucunun ortak kuralları (3 saat, 500 MB, unvanlar…)
migrations/          D1 veritabanı şeması
scripts/             İlk yönetici hesabını oluşturma
```

## Lisans

[MIT](LICENSE). Dilediğiniz gibi kullanabilir, değiştirebilir ve kendi kurumunuzda kurabilirsiniz.
