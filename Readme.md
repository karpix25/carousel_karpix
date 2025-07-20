# 🎨 Carousel API

**Сервис для генерации красивых карточек из markdown текста**

Создавайте профессиональные карусели с умными переносами строк, адаптивной типографикой и красивыми SVG паттернами.

## ✨ Возможности

- 🧠 **Умные переносы строк** - сохраняет смысловые группы слов
- 🎨 **3 стиля дизайна** - default, bright, elegant  
- 📱 **Адаптивная типографика** - автоматические размеры
- 🎯 **Цветовые акценты** - выделение чисел и ключевых слов
- 📐 **Высокое качество** - PNG 1600x2000px (4x scale)
- ⚡ **Быстрая генерация** - Puppeteer rendering

## 🚀 Быстрый старт

### Локальная установка:
```bash
npm install
node corrected-server.js
```

### Docker:
```bash
docker build -t carousel-api .
docker run -p 3001:3001 carousel-api
```

## 📡 API

### `POST /api/generate-carousel`

```json
{
  "text": "# Заголовок\n\n## Секция\nТекст...",
  "settings": {
    "style": "default",
    "brandColor": "#6366F1", 
    "authorUsername": "@username",
    "authorFullName": "Полное имя"
  }
}
```

### Ответ:
```json
{
  "slides": [...],
  "images": ["base64_png_data..."],
  "metadata": {
    "totalSlides": 3,
    "fixes": ["intelligent-text-wrapping"]
  }
}
```

## 🎨 Стили

- **`default`** - Классический минимализм
- **`bright`** - Яркий и энергичный  
- **`elegant`** - Утонченный премиум

## 📝 Markdown поддержка

```markdown
# Intro слайд (H1)
Подзаголовок

## Текстовый слайд (H2)  
Контент с **автоматическими** акцентами

• Списки с буллетами
• Умные переносы строк

> Цитаты с адаптивным размером
```

## 🔧 Переменные окружения

```bash
PORT=3001
NODE_ENV=production
LOG_LEVEL=info
```

## 📦 Зависимости

- **Express** - веб-сервер
- **Puppeteer** - рендеринг в PNG
- **Marked** - парсинг Markdown

## 📄 Лицензия

MIT License
