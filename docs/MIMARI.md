# 3Saat · Mimari ve güvenlik

Kurulum adımları için bkz. [KURULUM.md](../KURULUM.md).

## Bileşenler

Tüm sistem tek bir Cloudflare Worker'dır. Ayrı bir sunucu, ayrı bir kimlik servisi yoktur.

| Katman | Teknoloji | Görev |
| --- | --- | --- |
| Arayüz | React + Vite (`src/`) | Tüm ekranlar; Worker statik dosya olarak sunar |
| API | Cloudflare Worker + Hono (`worker/`) | Giriş, kayıt, dosya kayıtları, öğrenci erişimi, yönetici işlemleri |
| Veritabanı | Cloudflare D1 (SQLite) | Kullanıcılar, ders kodları, dosya kayıtları, oturumlar, deneme sayaçları |
| Dosya deposu | Cloudflare R2 (kapalı depo) | Dosyaların kendisi; dışarıya hiçbir zaman açık değil |
| Zamanlanmış iş | Worker cron (her gece) | Yarım yüklemeler, eski oturumlar ve deneme kayıtları, isteğe bağlı eski arşiv temizliği |

Ortak sabitler (3 saat, 500 MB, unvanlar, deneme sınırları, e-posta alan adı kontrolü) `shared/constants.ts` içindedir ve hem arayüz hem sunucu aynı dosyayı kullanır.

Arayüz iki arka uçla derlenebilir: `src/lib/backend/http.ts` gerçek API'ye bağlanır, `src/lib/backend/demo.ts` her şeyi tarayıcıda tutar. `VITE_DEMO=1` ile derlenen sürüm (GitHub Pages'teki demo) hiçbir sunucuya istek atmaz.

## Veritabanı

Şema: [`migrations/0001_init.sql`](../migrations/0001_init.sql)

| Tablo | İçerik |
| --- | --- |
| `users` | E-posta, şifre özeti, rol (`admin` / `academic`), durum (`pending` / `active` / `disabled`), unvan, ad soyad, fakülte, bölüm |
| `course_codes` | Akademisyen başına bir adet benzersiz 6 haneli kod |
| `files` | Dosya adı, R2 anahtarı, boyut, tür, durum (`pending` / `ready`), `shared_at` |
| `sessions` | Oturum belirtecinin SHA-256 özeti, kullanıcı, bitiş zamanı |
| `attempts` | Ders kodu ve giriş denemeleri (IP adresi tuzlu özet olarak) |

Bir dosya `shared_at + 3 saat` geçmediyse öğrenciye görünür. "Durdur" `shared_at` alanını boşaltır, "Tekrar paylaş" şimdiki zamana çeker. Süre dolunca hiçbir şey silinmez; dosya sadece öğrenci sorgusuna artık girmez, akademisyenin arşivinde kalır.

## Akışlar

**Yükleme**

1. Arayüz `POST /api/me/files/upload-init` ile dosya adı, boyut ve türü bildirir. Sunucu boyutu (≤ 500 MB) kontrol eder, `pending` bir kayıt açar ve 15 dakika geçerli, **boyutu imzaya dahil edilmiş** bir R2 yükleme bağlantısı döner.
2. Tarayıcı dosyayı doğrudan R2'ye yükler (Worker'dan geçmez, ilerleme çubuğu buradan gelir).
3. `POST /api/me/files/:id/complete` ile sunucu R2'de nesnenin gerçekten var olduğunu ve boyutunun bildirilenle aynı olduğunu kontrol eder, kaydı `ready` yapar ve 3 saatlik paylaşımı başlatır.

**Öğrenci**

1. `POST /api/student/files { code }`: kod yanlışsa deneme sayılır; doğruysa sadece akademisyenin unvan+adı, bölümü ve şu an paylaşılan dosyaların adı, boyutu ve türü döner.
2. `POST /api/student/download { code, fileId }`: dosya hâlâ 3 saat içindeyse 2 dakika geçerli bir indirme bağlantısı döner. Süresi geçmişse `expired` hatası döner.

**Kayıt ve onay**

Akademisyen kurum e-postasıyla kayıt olur, hesap `pending` durumunda açılır ve giriş yapamaz. Yönetici panelinde "Onayla" deyince hesap `active` olur ve ders kodu atanır. Yöneticinin eklediği hesaplar doğrudan `active` açılır; yönetici geçici şifreyi ekranda görür ve akademisyene kendisi iletir.

## Güvenlik

- **Dosyalar kapalı:** R2 deposunun herkese açık adresi yoktur. Her erişim, sunucunun yetki kontrolünden sonra ürettiği kısa ömürlü imzalı bağlantıyla olur (öğrenci 2 dk, akademisyen 5 dk, yükleme 15 dk).
- **Veri sızıntısı yok:** Öğrenciye dönen yanıtlarda e-posta, kullanıcı kimliği, R2 anahtarı, arşiv ya da başka akademisyen bilgisi bulunmaz. Akademisyen sadece kendi dosyalarını görebilir; her sorgu `owner_id` ile süzülür.
- **Şifreler:** PBKDF2-SHA256, 100.000 tur, kullanıcıya özel tuz. Var olmayan e-postalarda da aynı hesaplama yapılır, böylece cevap süresinden hesap olup olmadığı anlaşılmaz.
- **Oturum:** 7 gün geçerli, `__Host-` önekli, `HttpOnly`, `Secure`, `SameSite=Lax` çerez. Veritabanında belirtecin kendisi değil SHA-256 özeti tutulur. Şifre değişince ve yönetici şifre sıfırlayınca tüm oturumlar kapanır.
- **CSRF:** Veri değiştiren her istekte `Origin` başlığının sitenin kendisi olduğu kontrol edilir.
- **Kaba kuvvet:** Ders kodunda IP başına 15 dakikada 10 hatalı deneme, girişte IP + e-posta başına 15 dakikada 8 hatalı deneme sonrası geçici kilit. Kayıt da sınırlıdır. IP adresleri düz değil, gizli bir tuzla özetlenerek saklanır.
- **Ders kodu:** Kriptografik rastgele, sapmasız üretilir, benzersizdir. Yenilenince eski kod anında geçersiz olur.
- **Girdi doğrulama:** Tüm istek gövdeleri sunucuda `zod` şemalarıyla doğrulanır.
- **İndirme adı:** `Content-Disposition` RFC 6266'ya göre üretilir; Türkçe karakterli dosya adları doğru iner, başlık enjeksiyonu yapılamaz.
- **Gizli değerler:** R2 anahtarları ve IP tuzu sadece `wrangler secret` ile Cloudflare'de tutulur, depoda yoktur. Yerel deneme modu (`DEV_MODE`) sadece `.dev.vars` ile açılır ve bu dosya git'e girmez.

## API özeti

| Uç nokta | Kim | Açıklama |
| --- | --- | --- |
| `GET /api/config` | herkes | Kayıt alan adı, depo hazır mı |
| `POST /api/auth/register` · `login` · `logout`, `GET /api/auth/me` | herkes | Hesap işlemleri |
| `PATCH /api/me/profile`, `POST /api/me/password`, `POST /api/me/code/regenerate` | akademisyen | Hesap ve ders kodu |
| `GET /api/me/files`, `POST …/upload-init`, `POST …/:id/complete` · `reshare` · `stop`, `DELETE …/:id`, `GET …/:id/download` | akademisyen | Dosyalar |
| `POST /api/student/files` · `download` | herkes (kodla) | Öğrenci erişimi |
| `GET /api/admin/academics` · `stats`, `POST /api/admin/academics`, `…/:id/approve` · `status` · `reset-password`, `DELETE …/:id` | yönetici | Yönetim |

## Ücretsiz plan sınırları

R2'de 10 GB depolama, ayda 1 milyon yükleme ve 10 milyon indirme işlemi ücretsizdir; indirme trafiği hiç ücretlendirilmez. Worker'da günde 100.000 API isteği ücretsizdir (arayüz dosyaları buna dahil değil). D1'de günde 5 milyon okuma ve 100.000 yazma ücretsizdir. Dosyalar Worker'dan geçmediği için 500 MB'lık bir dosya da tek bir API isteği kadar yük oluşturur. Sınır aşılırsa Workers Paid planı aylık 5 dolardır.
