# 3Saat kurulum rehberi (Cloudflare)

Bu rehber 3Saat'i kendi Cloudflare hesabınızda **ücretsiz planla** çalıştırmanız içindir. Yaklaşık 20–30 dakika sürer. Kod tarafında hiçbir şeyi değiştirmeniz gerekmez; sadece `wrangler.jsonc` içindeki iki değeri doldurursunuz.

Sistem tek bir Cloudflare Worker'dan oluşur: arayüzü sunar, API'yi çalıştırır, veritabanı olarak **D1**'i, dosya deposu olarak **R2**'yi kullanır. Dosyalar tarayıcıdan doğrudan R2'ye yüklenir ve oradan indirilir, Worker'dan geçmez.

## Ücretsiz plan neyi karşılar?

| Kaynak | Ücretsiz sınır | 3Saat için anlamı |
| --- | --- | --- |
| R2 depolama | 10 GB | Arşiv dahil toplam dosya boyutu |
| R2 işlem | Ayda 1 milyon yükleme, 10 milyon indirme | Bir okul için fazlasıyla yeterli |
| R2 trafik | Ücretsiz | İndirme sayısından para çıkmaz |
| Worker istekleri | Günde 100.000 | Arayüz dosyaları bu sayıya dahil değil |
| D1 | Günde 5 milyon okuma, 100.000 yazma | Yeterli |

10 GB dolmaya yaklaşınca yönetici panelinde uyarı çıkar. Eski arşivlerin otomatik silinmesi için bkz. [Ayarlar](#ayarlar).

## Gerekenler

- Ücretsiz bir Cloudflare hesabı (<https://dash.cloudflare.com/sign-up>)
- Bilgisayarınızda Node.js 20 veya üstü ve git
- Bu deponun bir kopyası

```bash
git clone https://github.com/eenesdonmezz/3saat.git
cd 3saat
npm install
```

## 1. Cloudflare'e giriş

```bash
npx wrangler login
```

Tarayıcı açılır, Cloudflare hesabınızla izin verirsiniz. Şifreniz bu bilgisayarda kalır, depoya yazılmaz.

## 2. R2'yi açma

Cloudflare panelinde **R2 Object Storage** sayfasına girip R2'yi bir kez etkinleştirin. Ücretsiz planda kalsanız bile Cloudflare bu adımda bir ödeme yöntemi isteyebilir; 10 GB'ı geçmediğiniz sürece ücret alınmaz.

## 3. Veritabanı ve dosya deposu

```bash
npx wrangler d1 create 3saat
npx wrangler r2 bucket create 3saat-dosyalar
```

İlk komut bir `database_id` yazar. Bu değeri `wrangler.jsonc` içinde `d1_databases` altındaki `database_id` alanına yapıştırın (şu an `00000000-...` yazıyor). Bu bir gizli bilgi değildir, depoya yazılabilir.

## 4. Kurum e-posta alan adı

`wrangler.jsonc` içinde `vars` altındaki `ALLOWED_EMAIL_DOMAIN` değerini kurumunuzun alan adıyla değiştirin (ör. `ornek.edu.tr`). Akademisyenler sadece bu alan adıyla biten e-postayla kendi kaydını yapabilir. Alt alan adları (`ogr.ornek.edu.tr` gibi) kabul edilmez. Yöneticinin eklediği hesaplarda bu sınır yoktur.

## 5. Yayına alma

```bash
npm run deploy
```

Bu komut arayüzü derler, veritabanı tablolarını oluşturur ve Worker'ı yayına alır. İlk seferde wrangler sizden bir `workers.dev` alt alan adı seçmenizi isteyebilir. Sonunda sitenin adresini yazar; bu adresi not edin. Site açılır ama dosya yükleme bir sonraki iki adım bitene kadar çalışmaz.

## 6. R2 erişim anahtarı ve gizli değerler

Worker'ın R2 için kısa süreli, imzalı yükleme/indirme bağlantıları üretebilmesi için bir anahtar gerekir.

1. **R2 → Manage R2 API Tokens → Create API token**
2. İzin: **Object Read & Write**, sadece **3saat-dosyalar** deposu
3. Oluşturunca çıkan **Access Key ID** ve **Secret Access Key** değerlerini bir sonraki adımda kullanın. Bu sayfa kapanınca gizli anahtar bir daha gösterilmez.
4. **Account ID** değerini R2 ana sayfasının sağ tarafında bulabilirsiniz.

Bu değerleri **kimseyle paylaşmayın ve hiçbir dosyaya yazmayın.** Sadece aşağıdaki komutlarla Cloudflare'e kaydedin; her komut değeri sizden gizli olarak ister:

```bash
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put IP_HASH_SALT
```

Değerler kaydedildiği anda yayındaki Worker'a uygulanır, yeniden yayınlamanız gerekmez.

`IP_HASH_SALT` için uzun, rastgele bir metin girin. Üretmek için: `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`. Bu değer, deneme sınırı için tutulan IP adreslerini geri çevrilemez biçimde saklamaya yarar; sistemde düz IP adresi tutulmaz.

## 7. R2 için CORS

Tarayıcının dosyayı doğrudan R2'ye yükleyebilmesi için deponun sitenizi tanıması gerekir. Sitenizin adresi 5. adımın sonunda yazdı (`https://3saat.<hesap-adınız>.workers.dev` biçiminde).

Cloudflare panelinde **R2 → 3saat-dosyalar → Settings → CORS Policy → Add CORS policy** bölümüne şunu yapıştırın, adresi kendinizinkiyle değiştirin:

```json
[
  {
    "AllowedOrigins": ["https://3saat.HESAP-ADINIZ.workers.dev"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Kendi alan adınızı bağlarsanız onu da `AllowedOrigins` listesine ekleyin.

## 8. İlk yönetici hesabı

```bash
npm run admin:create -- --email siz@ornek.edu.tr --name "Ad Soyad"
```

Komut güçlü bir geçici şifre üretip **sadece terminale** yazar. Bununla giriş yapın, sonra **Hesap** penceresinden şifrenizi değiştirin.

Kurulum tamam. Siteye girip yönetici panelinden akademisyen ekleyebilir veya gelen kayıtları onaylayabilirsiniz.

## Ayarlar

`wrangler.jsonc` → `vars`:

| Ayar | Varsayılan | Açıklama |
| --- | --- | --- |
| `ALLOWED_EMAIL_DOMAIN` | `universite.edu.tr` | Kendi kaydına izin verilen e-posta alan adı |
| `R2_BUCKET_NAME` | `3saat-dosyalar` | R2 deposunun adı (3. adımdakiyle aynı olmalı) |
| `ARCHIVE_RETENTION_DAYS` | `0` | Arşivdeki dosyaları kaç gün sonra kalıcı silsin. `0` = hiç silme |

Değiştirdikten sonra `npm run deploy` ile yeniden yayınlayın. Her gece 03:17'de (UTC) bir temizlik işi çalışır: yarım kalmış yüklemeleri, süresi geçmiş oturumları ve eski deneme kayıtlarını siler; `ARCHIVE_RETENTION_DAYS` verilmişse eski arşiv dosyalarını da.

## Güncelleme

```bash
git pull
npm install
npm run deploy
```

## Kendi bilgisayarınızda deneme

Cloudflare hesabı gerekmez, her şey yerelde çalışır:

```bash
printf 'DEV_MODE=1\nIP_HASH_SALT=yerel-test\n' > .dev.vars
npm run db:migrate:local
npm run admin:create -- --email admin@universite.edu.tr --name "Yönetici" --local
npm run worker:dev        # http://localhost:8787
```

`.dev.vars` dosyası git'e eklenmez. `DEV_MODE=1` sadece yerel deneme içindir, yayındaki Worker'da **asla** tanımlamayın.

Sadece arayüzü tarayıcı içi örnek verilerle görmek için: `npm run dev:demo`.

## Sorun giderme

- **Dosya yüklenmiyor, tarayıcı konsolunda CORS hatası var:** 7. adımdaki `AllowedOrigins` adresi sitenin adresiyle birebir aynı olmalı (sonunda `/` olmadan).
- **"Dosya deposu henüz yapılandırılmadı" uyarısı:** 6. adımdaki R2 gizli değerlerinden biri eksik. `npx wrangler secret list` ile kontrol edin.
- **Kayıt olurken "Sadece @... uzantılı kurumsal e-posta ile kayıt olunabilir":** 4. adımdaki alan adını kontrol edin.
- **Yönetici şifresini unuttum:** 8. adımdaki komutu aynı e-postayla tekrar çalıştırın, yeni şifre üretir.
