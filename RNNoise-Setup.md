# RNNoise Audio Processing - Kurulum ve Kullanım

## 📋 Genel Bakış

Ses işleme mimariniz artık 3 seviyeli gelişmiş filtreleme ile çalışmaktadır:

1. **RNNoise (WASM)** - GPU benzeri açık yazılım desteğine sahip makine öğrenimi tabanlı gürültü baskılama
2. **DynamicsCompressor** - Ses seviyesini normalleştiren dinamik aralık sıkıştırması
3. **NoiseGate** - Eşik altındaki sesin tamamen sessiz hale getirilmesi

## 🎯 Ses Pipeline Mimarisi

```
Mikrofon Input
    ↓
RNNoise AudioWorklet (WASM)  ← ML-tabanlı gürültü baskılama
    ↓
DynamicsCompressor          ← Ses seviyesini normalleştirir
    ↓
Analyser                    ← Ses analizi
    ↓
NoiseGate                   ← Eşik altı sesleri keser
    ↓
ManualGain                  ← Manuel ses kontrolü
    ↓
Peer Connections → Diğer Kullanıcılara
```

## 🔧 RNNoise (WASM) Detayları

### Nedir?
- Jitsi tarafından desteklenen açık kaynaklı makine öğrenimi modeli
- WebAssembly (WASM) ile tarayıcıda doğrudan çalışır
- CPU verimli - minimum gecikme (3-5ms)

### Katkı Sağladığı Şeyler
- Fare tıklaması sesleri
- Klavye tıklama sesleri
- Arka plan gürültüsü (HVAC, fans, traffic)
- Elektrik gürültüsü

### İlişkili Dosyalar
- `/src/utils/rnnoise-processor.js` - AudioWorklet Processor
- Paket: `@jitsi/rnnoise-wasm@^0.2.1`

## 🎚️ DynamicsCompressor Ayarları

```javascript
// Varsayılan ayarlar (balanced):
threshold: -50    // Sıkıştırma başlama seviyesi
knee: 40         // Geçiş eğrisi (yumuşak geçiş)
ratio: 12        // Sıkıştırma oranı (12:1)
attack: 0.003    // 3ms - hızlı tepki
release: 0.25    // 250ms - orta derece çıkış
```

### Hazır Ayarlar
- **Aggressive**: Ses varyasyonlarını tamamen düzeye getir
- **Balanced**: Varsayılan - netlik ve normalizasyon dengesi
- **Gentle**: Ses karakterini korur, hafif sıkıştırma

## 📊 NoiseGate Ayarları

```javascript
noiseThreshold: -50  // dB altında ses kapatılır
```

Slider ile kontrol edilebilir ve gerçek zamanda ayarlanabilir.

## 🎛️ VoiceContext'te Kullanım

### Ayarları Değiştirme

```javascript
const { deviceSettings, changeAudioSettings } = useVoice();

// RNNoise'ı aç/kapat
changeAudioSettings('useRNNoise', true);

// Ses kapısı eşiğini ayarla
changeAudioSettings('noiseThreshold', -45);

// Manuel ses kontrolü
changeAudioSettings('manualGain', 1.5);
```

## 🧪 Test Etme

### Fare/Klavye Gürültüsü
1. Mikrofon açık, RNNoise etkin
2. Farenizi hızlı hareket ettirin / Klavyede yazın
3. Alınan ses fazla gürültü içermemeli

### Arka Plan Gürültüsü
1. Arka planda müzik veya ses aç
2. Discord gibi ayarları test et
3. RNNoise etkin iken farkı gözlemle

## ⚙️ Troubleshooting

### RNNoise çalışmıyor
- Browser konsolunda hata kontrolü yapın
- `AudioWorklet` desteğinin kontrol edin (tüm modern tarayıcılar destekler)
- `/src/utils/rnnoise-processor.js` dosyasının varlığını doğrulayın

### Ses çok sessiz
- `manualGain` artırın
- Compressor `ratio` değerini azaltın

### Ses kesintili geliyor
- `noiseThreshold` değerini düşürün (-60'a yaklaş)
- RNNoise'ı kapat ve tekrar aç

## 📝 İlgili Kodu Güncelleme

Settings/Admin panelinde yeni ayarları göstermek isterseniz:

```jsx
// SettingsModal.jsx veya benzeri yerlerde
<label>
  <input
    type="checkbox"
    checked={deviceSettings.useRNNoise}
    onChange={(e) => changeAudioSettings('useRNNoise', e.target.checked)}
  />
  RNNoise ML Noise Suppression
</label>
```

## 📚 Kaynaklar

- [RNNoise Paper](https://arxiv.org/abs/1811.09477)
- [Web Audio API - AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Web Audio API - DynamicsCompressor](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressor)

---

**Kurulum Tarihi**: 2026-03-23  
**Paket Versiyonu**: @jitsi/rnnoise-wasm@0.2.1
