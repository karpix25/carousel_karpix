/**
 * Минимальная Canvas Carousel API 
 * Убрали 60% избыточного кода, оставили только необходимое
 */
console.log('🎯 МИНИМАЛЬНАЯ ПРОДАКШН ВЕРСИЯ - Canvas API');

const express = require('express');
const { marked } = require('marked');
const { createCanvas, loadImage } = require('canvas');

// ================== CONFIG ==================
const CONFIG = {
  CANVAS: {
    WIDTH: 1600,
    HEIGHT: 2000,
    PADDING: 144,
    BORDER_RADIUS: 64,
    HEADER_FOOTER_PADDING: 192,
    CONTENT_START_Y: 420
  },
  FONTS: {
    TITLE_INTRO: { size: 128, weight: 'bold', lineHeightRatio: 1.1, minSize: 80 },
    SUBTITLE_INTRO: { size: 64, weight: 'normal', lineHeightRatio: 1.25, minSize: 40 },
    TITLE_TEXT: { size: 96, weight: 'bold', lineHeightRatio: 1.2, minSize: 60 },
    TEXT: { size: 64, weight: 'normal', lineHeightRatio: 1.4, minSize: 40 },
    QUOTE: { size: 96, weight: 'bold', lineHeightRatio: 1.2, minSize: 60 },
    HEADER_FOOTER: { size: 48, weight: 'normal', lineHeightRatio: 1.4 }
  },
  SPACING: {
    H2_TO_P: 80,
    P_TO_P: 24
  },
  COLORS: {
    DEFAULT_BG: '#ffffff',
    DEFAULT_TEXT: '#000000',
    ACCENT_FALLBACK: '#6366F1'
  }
};

// ================== FONT CACHE ==================
const fontCache = new Map();
function getFont(weight, size) {
  const key = `${weight}-${size}`;
  if (!fontCache.has(key)) {
    fontCache.set(key, `${weight} ${size}px Arial`);
  }
  return fontCache.get(key);
}

// ================== COLOR HELPERS ==================
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return {
    r: parseInt(hex.substr(0, 2), 16),
    g: parseInt(hex.substr(2, 2), 16),
    b: parseInt(hex.substr(4, 2), 16)
  };
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastColor(backgroundColor) {
  try {
    const { r, g, b } = hexToRgb(backgroundColor);
    const luminance = getLuminance(r, g, b);
    return luminance > 0.5 ? CONFIG.COLORS.DEFAULT_TEXT : '#ffffff';
  } catch (error) {
    return CONFIG.COLORS.DEFAULT_TEXT;
  }
}

// ================== SMART TEXT WRAPPING ==================
function getOptimalFontSize(ctx, text, maxWidth, maxHeight, baseFontSize, minFontSize) {
  let fontSize = baseFontSize;
  
  while (fontSize >= minFontSize) {
    ctx.font = getFont('normal', fontSize);
    const words = text.split(' ');
    let lines = 1;
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines++;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    const estimatedHeight = lines * fontSize * 1.4;
    if (estimatedHeight <= maxHeight) {
      return fontSize;
    }
    fontSize -= 4;
  }
  
  return minFontSize;
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const width = ctx.measureText(testLine).width;
    
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      // Если одно слово больше maxWidth - принудительно разбиваем
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const char of word) {
          const testChunk = chunk + char;
          if (ctx.measureText(testChunk).width > maxWidth && chunk) {
            lines.push(chunk + '-');
            chunk = char;
          } else {
            chunk = testChunk;
          }
        }
        currentLine = chunk;
      } else {
        currentLine = word;
      }
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

// ================== INLINE PARSING ==================
function parseInline(text) {
  if (!text) return [];
  const segments = [];
  const regex = /(__\*\*.+?\*\*__|__.+?__|\*\*.+?\*\*|[^*_]+)/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    let chunk = match[0];
    let bold = false;
    let underline = false;
    let content = chunk;

    if (chunk.startsWith('__') && chunk.endsWith('__')) {
      underline = true;
      content = content.slice(2, -2);
      if (content.startsWith('**') && content.endsWith('**')) {
        bold = true;
        content = content.slice(2, -2);
      }
    } else if (chunk.startsWith('**') && chunk.endsWith('**')) {
      bold = true;
      content = content.slice(2, -2);
    }

    if (content) {
      segments.push({ text: content, bold, underline });
    }
  }
  return segments;
}

function renderRichText(ctx, text, x, y, maxWidth, fontSize, baseColor, accentColor, slideIsAccent) {
  const segments = parseInline(text);
  const lineHeight = Math.round(fontSize * 1.4);
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  // Группируем сегменты по строкам
  for (const seg of segments) {
    const words = seg.text.split(' ');
    for (const word of words) {
      if (!word) continue;
      
      ctx.font = getFont(seg.bold ? 'bold' : 'normal', fontSize);
      const wordWidth = ctx.measureText(word + ' ').width;

      if (currentWidth + wordWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [{ ...seg, text: word + ' ' }];
        currentWidth = wordWidth;
      } else {
        currentLine.push({ ...seg, text: word + ' ' });
        currentWidth += wordWidth;
      }
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  // Рендерим строки
  let currentY = y;
  const underlines = [];

  for (const line of lines) {
    let currentX = x;
    
    for (const seg of line) {
      ctx.font = getFont(seg.bold ? 'bold' : 'normal', fontSize);
      
      // Акцентный цвет только для __**текста**__ на белых слайдах
      const useAccent = seg.underline && seg.bold && !slideIsAccent;
      ctx.fillStyle = useAccent ? accentColor : baseColor;
      
      ctx.fillText(seg.text, currentX, currentY);
      
      if (seg.underline) {
        const width = ctx.measureText(seg.text).width;
        underlines.push({
          x: currentX,
          y: currentY + fontSize * 0.1,
          width,
          color: ctx.fillStyle
        });
      }
      
      currentX += ctx.measureText(seg.text).width;
    }
    currentY += lineHeight;
  }

  // Рисуем подчеркивания
  ctx.lineWidth = Math.max(2, fontSize * 0.03);
  for (const u of underlines) {
    ctx.strokeStyle = u.color;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.x + u.width, u.y);
    ctx.stroke();
  }

  return Math.max(1, lines.length);
}

// ================== AVATAR ==================
async function loadAvatar(url) {
  try {
    return await loadImage(url);
  } catch (e) {
    console.warn('Не удалось загрузить аватарку:', e.message);
    return null;
  }
}

function renderAvatar(ctx, avatarImage, x, y, size) {
  if (!avatarImage) return;
  try {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImage, x, y, size, size);
    ctx.restore();
  } catch (error) {
    ctx.restore();
  }
}

// ================== MARKDOWN PARSING ==================
function parseMarkdownToSlides(text) {
  const tokens = marked.lexer(text);
  const slides = [];
  let currentSlide = null;

  tokens.forEach((token, index) => {
    if (token.type === 'heading' && token.depth === 1) {
      const nextToken = tokens[index + 1];
      const subtitle = (nextToken && nextToken.type === 'paragraph') ? nextToken.text : '';
      slides.push({
        type: 'intro',
        title: token.text,
        text: subtitle,
        color: 'accent'
      });
    } else if (token.type === 'heading' && token.depth === 2) {
      currentSlide = {
        type: 'text',
        title: token.text,
        text: '',
        color: 'default',
        content: []
      };
      slides.push(currentSlide);
    } else if (token.type === 'blockquote') {
      const quoteText = token.tokens?.[0]?.text || '';
      slides.push({
        type: 'quote',
        text: quoteText,
        color: 'accent',
        size: quoteText.length > 100 ? 'small' : 'large'
      });
    } else if (currentSlide && (token.type === 'paragraph' || token.type === 'list')) {
      if (token.type === 'paragraph') {
        currentSlide.content.push({ type: 'paragraph', text: token.text });
      } else if (token.type === 'list') {
        currentSlide.content.push({
          type: 'list',
          items: token.items.map(item => item.text)
        });
      }
    }
  });

  // Объединяем контент
  slides.forEach(slide => {
    if (slide.content) {
      const paragraphs = slide.content.filter(c => c.type === 'paragraph').map(c => c.text);
      const lists = slide.content.filter(c => c.type === 'list');

      let fullText = '';
      if (paragraphs.length) {
        fullText += paragraphs.join('\n\n');
      }
      if (lists.length) {
        if (fullText) fullText += '\n\n';
        lists.forEach(list => {
          fullText += list.items.map(item => `• ${item}`).join('\n');
        });
      }
      slide.text = fullText;
      delete slide.content;
    }
  });

  return slides;
}

// ================== FINAL SLIDE ==================
function addFinalSlide(slides, settings) {
  const finalSlideConfig = settings.finalSlide;
  if (!finalSlideConfig?.enabled) return slides;

  const templates = {
    cta: { title: 'Подписывайтесь!', text: 'Больше контента в профиле', color: 'accent' },
    contact: { title: 'Связаться:', text: 'email@example.com\n\nTelegram: @username', color: 'default' },
    brand: { title: 'Спасибо за внимание!', text: 'Помогаю бизнесу расти', color: 'accent' }
  };

  const template = templates[finalSlideConfig.type] || templates.cta;
  const finalSlide = {
    type: 'text',
    ...template,
    title: finalSlideConfig.title || template.title,
    text: finalSlideConfig.text || template.text,
    color: finalSlideConfig.color || template.color
  };

  return [...slides, finalSlide];
}

// ================== SLIDE RENDERING ==================
function renderIntroSlide(ctx, slide, contentY, contentWidth, maxHeight) {
  const titleFont = CONFIG.FONTS.TITLE_INTRO;
  const subtitleFont = CONFIG.FONTS.SUBTITLE_INTRO;
  
  // Адаптивный размер заголовка
  const titleSize = getOptimalFontSize(ctx, slide.title || '', contentWidth, maxHeight * 0.6, titleFont.size, titleFont.minSize);
  ctx.font = getFont(titleFont.weight, titleSize);
  ctx.textAlign = 'left';
  
  const titleLines = wrapText(ctx, slide.title || '', contentWidth);
  let y = contentY;

  // Рендерим заголовок
  titleLines.forEach(line => {
    ctx.fillText(line, CONFIG.CANVAS.PADDING, y);
    y += Math.round(titleSize * titleFont.lineHeightRatio);
  });

  // Подзаголовок
  if (slide.text) {
    y += CONFIG.SPACING.H2_TO_P;
    const subtitleSize = getOptimalFontSize(ctx, slide.text, contentWidth, maxHeight - (y - contentY), subtitleFont.size, subtitleFont.minSize);
    ctx.font = getFont(subtitleFont.weight, subtitleSize);
    ctx.globalAlpha = 0.9;
    
    const subtitleLines = wrapText(ctx, slide.text, contentWidth);
    subtitleLines.forEach(line => {
      ctx.fillText(line, CONFIG.CANVAS.PADDING, y);
      y += Math.round(subtitleSize * subtitleFont.lineHeightRatio);
    });
    ctx.globalAlpha = 1;
  }
}

function renderTextSlide(ctx, slide, contentY, contentWidth, brandColor, maxHeight) {
  let y = contentY;
  
  // Заголовок
  if (slide.title) {
    const titleFont = CONFIG.FONTS.TITLE_TEXT;
    const titleSize = getOptimalFontSize(ctx, slide.title, contentWidth, maxHeight * 0.3, titleFont.size, titleFont.minSize);
    ctx.font = getFont(titleFont.weight, titleSize);
    ctx.textAlign = 'left';
    
    const titleLines = wrapText(ctx, slide.title, contentWidth);
    titleLines.forEach(line => {
      ctx.fillText(line, CONFIG.CANVAS.PADDING, y);
      y += Math.round(titleSize * titleFont.lineHeightRatio);
    });
    y += CONFIG.SPACING.H2_TO_P;
  }

  // Контент
  if (slide.text) {
    const textFont = CONFIG.FONTS.TEXT;
    const remainingHeight = maxHeight - (y - contentY);
    const textSize = getOptimalFontSize(ctx, slide.text, contentWidth, remainingHeight, textFont.size, textFont.minSize);
    
    const paragraphs = slide.text.split('\n').filter(l => l.trim());

    paragraphs.forEach((line, idx) => {
      const isBullet = line.trim().startsWith('•');
      let text = line.trim();
      let x = CONFIG.CANVAS.PADDING;
      let maxW = contentWidth;

      if (isBullet) {
        ctx.font = getFont('bold', textSize);
        ctx.fillText('→', x, y);
        const markerWidth = ctx.measureText('→ ').width;
        x += markerWidth + 32;
        maxW -= (markerWidth + 32);
        text = text.replace(/^•\s*/, '');
      }

      const linesUsed = renderRichText(ctx, text, x, y, maxW, textSize, ctx.fillStyle, brandColor, slide.color === 'accent');
      y += linesUsed * Math.round(textSize * textFont.lineHeightRatio);
      
      if (idx < paragraphs.length - 1) {
        y += CONFIG.SPACING.P_TO_P;
      }
    });
  }
}

function renderQuoteSlide(ctx, slide, contentY, contentHeight, contentWidth) {
  const quoteFont = CONFIG.FONTS.QUOTE;
  const isSmall = slide.size === 'small';
  const baseSize = isSmall ? quoteFont.size * 0.7 : quoteFont.size;
  
  const quoteSize = getOptimalFontSize(ctx, slide.text || '', contentWidth, contentHeight, baseSize, quoteFont.minSize);
  ctx.font = getFont(quoteFont.weight, quoteSize);
  ctx.textAlign = 'left';
  
  const lines = wrapText(ctx, slide.text || '', contentWidth);
  const lineHeight = Math.round(quoteSize * quoteFont.lineHeightRatio);
  let y = contentY + (contentHeight - lines.length * lineHeight) / 2;
  
  lines.forEach(line => {
    ctx.fillText(line, CONFIG.CANVAS.PADDING, y);
    y += lineHeight;
  });
}

// ================== MAIN RENDER ==================
async function renderSlide(slide, slideNumber, totalSlides, settings, avatarImage = null) {
  const { brandColor = CONFIG.COLORS.ACCENT_FALLBACK, authorUsername = '@username', authorFullName = 'Your Name' } = settings;

  const canvas = createCanvas(CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  const isAccent = slide.color === 'accent';
  const bgColor = isAccent ? brandColor : CONFIG.COLORS.DEFAULT_BG;
  const textColor = isAccent ? getContrastColor(brandColor) : CONFIG.COLORS.DEFAULT_TEXT;
  const accentColor = isAccent ? textColor : brandColor;

  ctx.fillStyle = bgColor;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT, CONFIG.CANVAS.BORDER_RADIUS);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT);
  }

  ctx.fillStyle = textColor;

  // Header
  const headerFont = CONFIG.FONTS.HEADER_FOOTER;
  ctx.font = getFont(headerFont.weight, headerFont.size);
  ctx.globalAlpha = 0.7;
  ctx.textAlign = 'left';

  const avatarSize = 100;
  if (avatarImage) {
    const avatarY = CONFIG.CANVAS.HEADER_FOOTER_PADDING - avatarSize / 2 - 9;
    renderAvatar(ctx, avatarImage, CONFIG.CANVAS.PADDING, avatarY, avatarSize);
    ctx.fillText(authorUsername, CONFIG.CANVAS.PADDING + avatarSize + 16, CONFIG.CANVAS.HEADER_FOOTER_PADDING);
  } else {
    ctx.fillText(authorUsername, CONFIG.CANVAS.PADDING, CONFIG.CANVAS.HEADER_FOOTER_PADDING);
  }

  ctx.textAlign = 'right';
  ctx.fillText(`${slideNumber}/${totalSlides}`, CONFIG.CANVAS.WIDTH - CONFIG.CANVAS.PADDING, CONFIG.CANVAS.HEADER_FOOTER_PADDING);
  ctx.globalAlpha = 1;

  // Content
  const contentY = CONFIG.CANVAS.CONTENT_START_Y;
  const contentHeight = CONFIG.CANVAS.HEIGHT - contentY - CONFIG.CANVAS.HEADER_FOOTER_PADDING;
  const contentWidth = CONFIG.CANVAS.WIDTH - (CONFIG.CANVAS.PADDING * 2);

  if (slide.type === 'intro') {
    renderIntroSlide(ctx, slide, contentY, contentWidth, contentHeight);
  } else if (slide.type === 'text') {
    renderTextSlide(ctx, slide, contentY, contentWidth, accentColor, contentHeight);
  } else if (slide.type === 'quote') {
    renderQuoteSlide(ctx, slide, contentY, contentHeight, contentWidth);
  }

  // Footer
  ctx.font = getFont(headerFont.weight, headerFont.size);
  ctx.globalAlpha = 0.7;
  ctx.textAlign = 'left';
  ctx.fillText(authorFullName, CONFIG.CANVAS.PADDING, CONFIG.CANVAS.HEIGHT - CONFIG.CANVAS.HEADER_FOOTER_PADDING);
  ctx.textAlign = 'right';
  if (slideNumber < totalSlides) {
    ctx.fillText('→', CONFIG.CANVAS.WIDTH - CONFIG.CANVAS.PADDING, CONFIG.CANVAS.HEIGHT - CONFIG.CANVAS.HEADER_FOOTER_PADDING);
  }
  ctx.globalAlpha = 1;

  return canvas;
}

// ================== EXPRESS APP ==================
const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', engine: 'canvas-api-minimal' });
});

app.post('/api/generate-carousel', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { text, settings = {} } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Требуется валидный text' });
    }

    console.log(`🎯 Генерация карусели (${text.length} символов)`);

    // Загрузка аватарки
    const avatarImage = settings.avatarUrl ? await loadAvatar(settings.avatarUrl) : null;

    // Парсинг слайдов
    let slides = parseMarkdownToSlides(text);
    slides = addFinalSlide(slides, settings);

    if (!slides.length) {
      slides = [{ type: 'text', title: 'Ваш контент', text: text.substring(0, 200), color: 'default' }];
    }

    // Генерация изображений
    const images = [];
    for (let i = 0; i < slides.length; i++) {
      const canvas = await renderSlide(slides[i], i + 1, slides.length, settings, avatarImage);
      const base64 = canvas.toBuffer('image/png').toString('base64');
      images.push(base64);
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ Готово за ${processingTime}ms (${slides.length} слайдов)`);

    res.json({
      slides,
      images,
      metadata: {
        totalSlides: slides.length,
        generatedAt: new Date().toISOString(),
        processingTime,
        settings,
        engine: 'canvas-api-minimal'
      }
    });

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    res.status(500).json({ error: error.message });
  }
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutdown');
  process.exit(0);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Canvas API запущен на порту ${PORT}`);
});
