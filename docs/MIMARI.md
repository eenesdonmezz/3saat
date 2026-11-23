# 3Saat · Mimari ve güvenlik planı

Bu belge, prototipin gerçek altyapıya bağlanması için planı anlatır. `src/lib/store.ts` içindeki her fonksiyon aşağıdaki uç noktalardan birine karşılık gelir.

## Bileşenler

| Katman | Teknoloji | Görev |
| --- | --- | --- |
| Arayüz | React + Vite (bu depo) | Tüm ekranlar |
| Kimlik doğrulama | Supabase Auth | Akademisyen ve yönetici girişi, e-posta doğrulama, şifre sıfırlama |
| Veritabanı | Supabase Postgres + RLS | Profiller, roller, ders kodları, dosya kayıtları |
| Sunucu mantığı | Supabase Edge Functions | Yükleme/indirme bağlantıları, öğrenci erişimi, yönetici işlemleri |
| Dosya deposu | Cloudflare R2 (kapalı bucket) | Dosyaların kendisi (10 GB ücretsiz, çıkış trafiği ücretsiz) |

## Veritabanı

```sql
create type app_role as enum ('admin', 'academic');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  title text not null check (title in ('Prof. Dr.','Doç. Dr.','Dr. Öğr. Üyesi','Öğr. Gör.','Öğr. Gör. Dr.','Arş. Gör.','Arş. Gör. Dr.')),
  full_name text not null,
  email text not null,
  faculty text not null,
  department text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Roller profilde DEĞİL, ayrı tabloda tutulur (yetki yükseltme saldırılarını önler)
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role app_role not null,
  unique (user_id, role)
);

create table course_codes (
  owner_id uuid primary key references profiles on delete cascade,
  code char(6) not null unique check (code ~ '^\d{6}$'),
  updated_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  original_name text not null,
  r2_key text not null unique,
  size_bytes bigint not null check (size_bytes <= 524288000),
  mime_type text not null,
  status text not null default 'pending' check (status in ('pending','ready')),
  shared_at timestamptz,          -- null: paylaşım durdurulmuş
  created_at timestamptz not null default now()
);

create table code_attempts (       -- hız sınırlama, istemci erişimi yok
  id bigserial primary key,
  ip_hash text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
```

Kural: bir dosya `shared_at > now() - interval '3 hours'` ise aktiftir.

`has_role(_user_id, _role)` fonksiyonu `security definer` olarak tanımlanır; RLS politikaları bunu kullanır.

### RLS politikaları

- **profiles:** kullanıcı yalnızca kendi satırını görür; yönetici hepsini görür.
- **course_codes, files:** akademisyen yalnızca kendi satırlarını **okur**. İstemciden INSERT/UPDATE/DELETE yoktur.
- **user_roles, code_attempts:** istemciye tamamen kapalı.
- **Anonim kullanıcı (öğrenci):** hiçbir tabloya erişimi yoktur; sadece edge function'ları çağırır.

## Akademisyen hesabı ve kayıt

Akademisyen için tutulan bilgiler: **unvan, ad soyad, kurumsal e-posta, fakülte/yüksekokul, bölüm** ve şifre (şifre Supabase Auth'ta hash'li tutulur, `profiles` tablosunda yer almaz). Sistem sadece kurum içi kullanım içindir; ek onay/izin adımı yoktur.

- **Kendi kaydı:** Sadece kurum e-posta alan adı (`ALLOWED_EMAIL_DOMAIN`, ör. `ornek.edu.tr`) kabul edilir. Alt alan adları (ör. öğrenci adresleri `ogrenci.ornek.edu.tr`) reddedilir. Kontrol hem arayüzde hem sunucuda yapılır: Supabase **"Before User Created" auth hook**'u alan adı dışındaki kayıtları reddeder, böylece API doğrudan çağrılsa bile atlatılamaz. E-posta doğrulaması zorunludur.
- **Yönetici ekleme:** Alan adı sınırı yoktur (ör. misafir öğretim üyeleri). Hesap e-posta doğrulaması olmadan aktif olur.
- Kayıt bilgileri `raw_user_meta_data` ile gelir; `on auth.users insert` tetikleyicisi `profiles`, `user_roles` ('academic') ve `course_codes` satırlarını oluşturur.
- Akademisyen unvan, ad, fakülte ve bölümünü hesap ayarlarından değiştirebilir; e-posta değişikliği yöneticiden istenir.

## Edge Functions

| Fonksiyon | Kim | Ne yapar |
| --- | --- | --- |
| `upload-init` | Akademisyen | Boyutu (≤ 500 MB) ve adı doğrular, `pending` kayıt açar, 15 dk geçerli R2 PUT bağlantısı döner |
| `upload-complete` | Akademisyen | R2'de dosyanın varlığını ve boyutunu doğrular, `ready` yapar, `shared_at = now()` |
| `file-action` | Akademisyen | `reshare` / `stop` / `delete` / `download` (sahiplik kontrolüyle) |
| `regenerate-code` | Akademisyen | Kriptografik rastgele, benzersiz yeni kod |
| `student-files` | Herkes | Kodu doğrular, hız sınırı uygular; akademisyenin unvan + adı, bölümü ve sadece aktif dosyaların ad/boyut/türünü döner |
| `student-download` | Herkes | Kodu ve dosyanın hâlâ aktif olduğunu yeniden doğrular, 2 dk geçerli GET bağlantısı döner |
| `admin-academics` | Yönetici | Listele, ekle (`auth.admin.createUser`), dondur, şifre sıfırla, sil (R2 dosyalarıyla birlikte) |

Tüm girdiler zod ile doğrulanır. Hata mesajları geneldir (iç ayrıntı sızdırmaz). Service role anahtarı yalnızca edge function ortamında bulunur.

## Güvenlik önlemleri

1. **Kapalı depo:** R2 bucket herkese kapalıdır; dosyalar sadece kısa ömürlü imzalı bağlantılarla indirilir (öğrenci 2 dk, akademisyen 5 dk).
2. **Kod tahmini:** 6 hane = 1.000.000 olasılık. IP adresi tuzlu SHA-256 ile saklanır; 15 dakikada 10 hatalı denemede kilit. Bu sınırla bir saldırganın rastgele bir kodu bulması pratikte imkânsızdır.
3. **Veri minimizasyonu:** Öğrenciye dönen yanıtta `r2_key`, sahip kimliği, e-posta veya bitiş zamanı yoktur.
4. **Kod URL'de yok:** Ders kodu adres çubuğuna, geçmişe veya paylaşılan bağlantılara yazılmaz.
5. **Dondurulmuş hesap:** Girişi ve ders kodu anında devre dışı kalır.
6. **Şifreler:** En az 8 karakter; Supabase Auth tarafından hash'lenir; sıfırlama e-postayla.
7. **İlk yönetici:** Otomatik atanmaz; kurulumda SQL ile elle verilir.

## Kurulum adımları (sonraki aşama)

1. Supabase projesi + yukarıdaki şema ve RLS.
2. Cloudflare hesabı, kapalı R2 bucket, API anahtarı; bucket CORS'una sitenin adresi (PUT/GET).
3. Kurum e-posta alan adı: arayüz için `VITE_ALLOWED_EMAIL_DOMAIN`, sunucu için auth hook'ta aynı değer.
4. Edge function gizli değişkenleri: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `IP_HASH_SALT`. **Anahtarlar asla bu depoya yazılmaz.**
5. `src/lib/store.ts` fonksiyonlarının gerçek çağrılarla değiştirilmesi.
6. Güvenlik testleri: başka akademisyenin dosyasına erişim, süresi dolmuş dosya, hız sınırı, rol yükseltme.

## Açık kararlar

- Kurum e-posta alan adı nedir? (Şu an yer tutucu: `universite.edu.tr`)
- Öğrenci kalan süreyi görsün mü? (Şu an: hayır)
- Dosya sınırı 500 MB mı, 1 GB mı? (Şu an: 500 MB)
