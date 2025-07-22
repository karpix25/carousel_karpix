/**
 * Canvas Carousel API с улучшенным логированием и обработкой ошибок
 */
console.log('🎯 ПРОДАКШН ВЕРСИЯ - Canvas API v2.0');

const express = require('express');
const { marked } = require('marked');
const { createCanvas, loadImage } = require('canvas');

// ================== ЛОГИРОВАНИЕ ==================
class Logger {
  static info(message, data = null) {
    const timestamp = new Date().toISOString();
    const logData = data ? ` | ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] ℹ️  ${message}${logData}`);
  }

  static warn(message, data = null) {
    const timestamp = new Date().toISOString();
    const logData = data ? ` | ${JSON.stringify(data)}` : '';
    console.warn(`[${timestamp}] ⚠️  ${message}${logData}`);
  }

  static error(message, error = null, data = null) {
    const timestamp = new Date().toISOString();
    const errorMsg = error ? ` | Error: ${error.message}` : '';
    const logData = data ? ` | Data: ${JSON.stringify(data)}` : '';
    console.error(`[${timestamp}] ❌ ${message}${errorMsg}${logData}`);
    
    if (error && error.stack) {
      console.error(`[${timestamp}] 📋 Stack:`, error.stack);
    }
  }

  static success(message, data = null) {
    const timestamp = new Date().toISOString();
    const logData = data ? ` | ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] ✅ ${message}${logData}`);
  }

  static performance(message, startTime, data = null) {
    const duration = Date.now() - startTime;
    const timestamp = new Date().toISOString();
    const logData = data ? ` | ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] ⚡ ${message} (${duration}ms)${logData}`);
  }
}

// ================== ОБРАБОТКА ОШИБОК ==================
class CarouselError extends Error {
  constructor(message, code, statusCode = 500, details = null) {
    super(message);
    this.name = 'CarouselError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Типы ошибок
const ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  TEXT_TOO_LONG: 'TEXT_TOO_LONG',
  AVATAR_LOAD_FAILED: 'AVATAR_LOAD_FAILED',
  RENDER_FAILED: 'RENDER_FAILED',
  CANVAS_ERROR: 'CANVAS_ERROR',
  MEMORY_ERROR: 'MEMORY_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR'
};

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
  },
  LIMITS: {
    MAX_TEXT_LENGTH: 50000,
    MAX_SLIDES: 25,
    REQUEST_TIMEOUT: 30000,
    MAX_AVATAR_SIZE: 5 * 1024 * 1024 // 5MB
  }
};

// ================== FONT CACHE ==================
const fontCache = new Map();
function getFont(weight, size) {
  try {
    const key = `${weight}-${size}`;
    if (!fontCache.has(key)) {
      fontCache.set(key, `${weight} ${size}px Arial`);
    }
    return fontCache.get(key);
  } catch (error) {
    Logger.error('Font cache error', error, { weight, size });
    return 'normal 64px Arial'; // fallback
  }
}

// ================== COLOR HELPERS ==================
function hexToRgb(hex) {
  try {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) {
      throw new Error('Invalid hex color format');
    }
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16)
    };
  } catch (error) {
    Logger.warn('Invalid color format, using fallback', null, { hex });
    return { r: 99, g: 102, b: 241 }; // fallback color
  }
}

function getLuminance(r, g, b) {
  try {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  } catch (error) {
    Logger.error('Luminance calculation error', error, { r, g, b });
    return 0.5; // neutral luminance
  }
}

function getContrastColor(backgroundColor) {
  try {
    const { r, g, b } = hexToRgb(backgroundColor);
    const luminance = getLuminance(r, g, b);
    return luminance > 0.5 ? CONFIG.COLORS.DEFAULT_TEXT : '#ffffff';
  } catch (error) {
    Logger.warn('Contrast color calculation failed, using default', error, { backgroundColor });
    return CONFIG.COLORS.DEFAULT_TEXT;
  }
}

// ================== ВАЛИДАЦИЯ ==================
function validateInput(text, settings = {}) {
  const errors = [];

  // Проверка текста
  if (!text || typeof text !== 'string') {
    errors.push('Текст обязателен и должен быть строкой');
  } else if (text.length === 0) {
    errors.push('Текст не может быть пустым');
  } else if (text.length > CONFIG.LIMITS.MAX_TEXT_LENGTH) {
    errors.push(`Текст слишком длинный (максимум ${CONFIG.LIMITS.MAX_TEXT_LENGTH} символов)`);
  }

  // Проверка настроек
  if (settings.brandColor && !/^#[0-9A-F]{6}$/i.test(settings.brandColor)) {
    errors.push('brandColor должен быть в формате #RRGGBB');
  }

  if (settings.authorUsername && (typeof settings.authorUsername !== 'string' || settings.authorUsername.length > 50)) {
    errors.push('authorUsername должен быть строкой до 50 символов');
  }

  if (settings.authorFullName && (typeof settings.authorFullName !== 'string' || settings.authorFullName.length > 100)) {
    errors.push('authorFullName должен быть строкой до 100 символов');
  }

  if (settings.avatarUrl && !/^https?:\/\/.+/.test(settings.avatarUrl)) {
    errors.push('avatarUrl должен быть валидным URL');
  }

  return errors;
}

// ================== SMART TEXT WRAPPING ==================
function getOptimalFontSize(ctx, text, maxWidth, maxHeight, baseFontSize, minFontSize) {
  try {
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
  } catch (error) {
    Logger.error('Font size calculation error', error, { text: text.substring(0, 100), maxWidth, maxHeight });
    return minFontSize || 40;
  }
}

function wrapText(ctx, text, maxWidth) {
  try {
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
  } catch (error) {
    Logger.error('Text wrapping error', error, { text: text.substring(0, 100) });
    return [text]; // fallback
  }
}

// ================== INLINE PARSING ==================
function parseInline(text) {
  try {
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
  } catch (error) {
    Logger.error('Inline parsing error', error, { text: text.substring(0, 100) });
    return [{ text, bold: false, underline: false }];
  }
}

function renderRichText(ctx, text, x, y, maxWidth, fontSize, baseColor, accentColor, slideIsAccent) {
  try {
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
  } catch (error) {
    Logger.error('Rich text rendering error', error, { text: text.substring(0, 100) });
    // Fallback - простой текст
    ctx.fillStyle = baseColor;
    ctx.fillText(text, x, y);
    return 1;
  }
}

// ================== AVATAR ==================
async function loadAvatar(url) {
  const startTime = Date.now();
  try {
    Logger.info('Loading avatar', { url });
    const image = await loadImage(url);
    Logger.performance('Avatar loaded', startTime, { 
      url, 
      width: image.width, 
      height: image.height 
    });
    return image;
  } catch (error) {
    Logger.warn('Avatar loading failed', error, { url });
    return null;
  }
}

function renderAvatar(ctx, avatarImage, x, y, size) {
  try {
    if (!avatarImage) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImage, x, y, size, size);
    ctx.restore();
  } catch (error) {
    Logger.error('Avatar rendering error', error, { x, y, size });
    ctx.restore();
  }
}

// ================== MARKDOWN PARSING ==================
function parseMarkdownToSlides(text) {
  const startTime = Date.now();
  try {
    Logger.info('Parsing markdown to slides', { textLength: text.length });
    
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

    Logger.performance('Markdown parsing completed', startTime, { 
      slidesCount: slides.length,
      tokensCount: tokens.length
    });

    return slides;
  } catch (error) {
    Logger.error('Markdown parsing failed', error, { textLength: text.length });
    throw new CarouselError(
      'Не удалось обработать markdown текст',
      ERROR_CODES.INVALID_INPUT,
      400,
      { originalError: error.message }
    );
  }
}

// ================== FINAL SLIDE ==================
function addFinalSlide(slides, settings) {
  try {
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

    Logger.info('Final slide added', { type: finalSlideConfig.type });
    return [...slides, finalSlide];
  } catch (error) {
    Logger.error('Final slide creation error', error);
    return slides; // return slides without final slide
  }
}

// ================== SLIDE RENDERING ==================
function renderIntroSlide(ctx, slide, contentY, contentWidth, maxHeight) {
  try {
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
  } catch (error) {
    Logger.error('Intro slide rendering error', error);
    throw new CarouselError(
      'Ошибка рендеринга титульного слайда',
      ERROR_CODES.RENDER_FAILED,
      500,
      { slideType: 'intro' }
    );
  }
}

function renderTextSlide(ctx, slide, contentY, contentWidth, brandColor, maxHeight) {
  try {
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
  } catch (error) {
    Logger.error('Text slide rendering error', error);
    throw new CarouselError(
      'Ошибка рендеринга текстового слайда',
      ERROR_CODES.RENDER_FAILED,
      500,
      { slideType: 'text' }
    );
  }
}

function renderQuoteSlide(ctx, slide, contentY, contentHeight, contentWidth) {
  try {
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
  } catch (error) {
    Logger.error('Quote slide rendering error', error);
    throw new CarouselError(
      'Ошибка рендеринга слайда с цитатой',
      ERROR_CODES.RENDER_FAILED,
      500,
      { slideType: 'quote' }
    );
  }
}

// ================== MAIN RENDER ==================
async function renderSlide(slide, slideNumber, totalSlides, settings, avatarImage = null) {
  const slideStartTime = Date.now();
  let canvas, ctx;

  try {
    const { brandColor = CONFIG.COLORS.ACCENT_FALLBACK, authorUsername = '@username', authorFullName = 'Your Name' } = settings;

    Logger.info('Rendering slide', { slideNumber, type: slide.type });

    canvas = createCanvas(CONFIG.CANVAS.WIDTH, CONFIG.CANVAS.HEIGHT);
    ctx = canvas.getContext('2d');

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
    } else {
      throw new CarouselError(
        `Неподдерживаемый тип слайда: ${slide.type}`,
        ERROR_CODES.RENDER_FAILED,
        400
      );
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

    Logger.performance('Slide rendered', slideStartTime, { 
      slideNumber, 
      type: slide.type,
      hasAvatar: !!avatarImage 
    });

    return canvas;

  } catch (error) {
    if (canvas && ctx) {
      try {
        // Очистка canvas при ошибке
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch (cleanupError) {
        Logger.warn('Canvas cleanup failed', cleanupError);
      }
    }

    Logger.error('Slide rendering failed', error, { 
      slideNumber, 
      slideType: slide.type,
      processingTime: Date.now() - slideStartTime
    });

    throw new CarouselError(
      `Ошибка рендеринга слайда ${slideNumber}`,
      ERROR_CODES.CANVAS_ERROR,
      500,
      { slideNumber, slideType: slide.type, originalError: error.message }
    );
  }
}

// ================== MIDDLEWARE ==================
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  req.requestId = requestId;
  req.startTime = startTime;

  Logger.info('Request received', {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'error' : res.statusCode >= 300 ? 'warn' : 'info';
    
    Logger[level]('Request completed', {
      requestId,
      status: res.statusCode,
      duration,
      contentLength: res.get('Content-Length')
    });
  });

  next();
};

const errorHandler = (error, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  
  if (error instanceof CarouselError) {
    Logger.warn('Application error', error, { 
      requestId, 
      code: error.code,
      details: error.details 
    });
    
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      requestId,
      details: error.details
    });
  }

  // Неожиданная ошибка
  Logger.error('Unexpected error', error, { requestId });
  
  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    code: 'INTERNAL_SERVER_ERROR',
    requestId
  });
};

const timeoutHandler = (req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      Logger.error('Request timeout', null, { 
        requestId: req.requestId,
        url: req.url,
        timeout: CONFIG.LIMITS.REQUEST_TIMEOUT
      });
      
      res.status(408).json({
        error: 'Превышено время ожидания запроса',
        code: ERROR_CODES.TIMEOUT_ERROR,
        requestId: req.requestId
      });
    }
  }, CONFIG.LIMITS.REQUEST_TIMEOUT);

  res.on('finish', () => {
    clearTimeout(timeout);
  });

  next();
};

// ================== EXPRESS APP ==================
const app = express();

// Middleware
app.use(express.json({ 
  limit: '10mb',
  type: 'application/json',
  verify: (req, res, buf) => {
    if (buf.length === 0) {
      throw new CarouselError(
        'Пустое тело запроса',
        ERROR_CODES.INVALID_INPUT,
        400
      );
    }
  }
}));

app.use(requestLogger);
app.use(timeoutHandler);

// Routes
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  res.json({ 
    status: 'healthy', 
    engine: 'canvas-api-enhanced',
    version: '2.0.0',
    uptime: Math.floor(uptime),
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024)
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/api/generate-carousel', async (req, res, next) => {
  const requestStartTime = Date.now();
  let slides = [];
  
  try {
    const { text, settings = {} } = req.body;
    const requestId = req.requestId;
    
    Logger.info('Carousel generation started', {
      requestId,
      textLength: text ? text.length : 0,
      settings: {
        hasBrandColor: !!settings.brandColor,
        hasAvatar: !!settings.avatarUrl,
        hasAuthor: !!settings.authorUsername
      }
    });

    // Валидация входных данных
    const validationErrors = validateInput(text, settings);
    if (validationErrors.length > 0) {
      throw new CarouselError(
        `Ошибки валидации: ${validationErrors.join(', ')}`,
        ERROR_CODES.INVALID_INPUT,
        400,
        { errors: validationErrors }
      );
    }

    // Проверка памяти
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
      Logger.warn('High memory usage detected', { 
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        requestId 
      });
    }

    // Загрузка аватарки
    let avatarImage = null;
    if (settings.avatarUrl) {
      const avatarStartTime = Date.now();
      try {
        avatarImage = await loadAvatar(settings.avatarUrl);
        if (!avatarImage) {
          Logger.warn('Avatar loading failed but continuing', { 
            requestId, 
            avatarUrl: settings.avatarUrl 
          });
        }
      } catch (avatarError) {
        Logger.warn('Avatar loading error, continuing without avatar', avatarError, { 
          requestId,
          avatarUrl: settings.avatarUrl
        });
        // Продолжаем без аватарки
      }
    }

    // Парсинг слайдов
    const parseStartTime = Date.now();
    slides = parseMarkdownToSlides(text);
    slides = addFinalSlide(slides, settings);

    if (!slides.length) {
      Logger.warn('No slides generated, creating fallback slide', { requestId });
      slides = [{ 
        type: 'text', 
        title: 'Ваш контент', 
        text: text.substring(0, 200), 
        color: 'default' 
      }];
    }

    // Проверка лимита слайдов
    if (slides.length > CONFIG.LIMITS.MAX_SLIDES) {
      throw new CarouselError(
        `Слишком много слайдов (${slides.length}). Максимум: ${CONFIG.LIMITS.MAX_SLIDES}`,
        ERROR_CODES.TEXT_TOO_LONG,
        400,
        { slidesGenerated: slides.length, maxAllowed: CONFIG.LIMITS.MAX_SLIDES }
      );
    }

    Logger.info('Slides parsed successfully', {
      requestId,
      slidesCount: slides.length,
      slideTypes: slides.reduce((acc, slide) => {
        acc[slide.type] = (acc[slide.type] || 0) + 1;
        return acc;
      }, {}),
      parseTime: Date.now() - parseStartTime
    });

    // Генерация изображений
    const renderStartTime = Date.now();
    const images = [];
    
    for (let i = 0; i < slides.length; i++) {
      try {
        const canvas = await renderSlide(slides[i], i + 1, slides.length, settings, avatarImage);
        const base64 = canvas.toBuffer('image/png').toString('base64');
        images.push(base64);
        
        // Логирование прогресса для долгих операций
        if (slides.length > 10 && (i + 1) % 5 === 0) {
          Logger.info('Rendering progress', {
            requestId,
            completed: i + 1,
            total: slides.length,
            progress: Math.round(((i + 1) / slides.length) * 100)
          });
        }
        
      } catch (slideError) {
        Logger.error(`Failed to render slide ${i + 1}`, slideError, { requestId });
        throw slideError;
      }
    }

    const totalProcessingTime = Date.now() - requestStartTime;
    const renderTime = Date.now() - renderStartTime;

    // Итоговая статистика
    const avgSlideSize = images.reduce((sum, img) => sum + img.length, 0) / images.length / 1024; // KB
    const slidesPerSecond = slides.length / (totalProcessingTime / 1000);

    Logger.success('Carousel generation completed', {
      requestId,
      slidesCount: slides.length,
      totalTime: totalProcessingTime,
      parseTime: Date.now() - parseStartTime - renderTime,
      renderTime,
      avgSlideSize: Math.round(avgSlideSize),
      slidesPerSecond: Math.round(slidesPerSecond * 100) / 100,
      memoryAfter: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    });

    res.json({
      slides,
      images,
      metadata: {
        totalSlides: slides.length,
        generatedAt: new Date().toISOString(),
        processingTime: totalProcessingTime,
        performance: {
          parseTime: Date.now() - parseStartTime - renderTime,
          renderTime,
          avgSlideSize: Math.round(avgSlideSize),
          slidesPerSecond: Math.round(slidesPerSecond * 100) / 100
        },
        settings: {
          ...settings,
          avatarUrl: settings.avatarUrl ? '[PROVIDED]' : undefined // не логируем URL
        },
        engine: 'canvas-api-enhanced',
        version: '2.0.0',
        requestId
      }
    });

  } catch (error) {
    // Передаем ошибку в error handler
    next(error);
  } finally {
    // Финальная очистка
    try {
      if (global.gc) {
        global.gc();
      }
    } catch (gcError) {
      Logger.warn('Garbage collection failed', gcError);
    }
  }
});

// 404 handler
app.use('*', (req, res) => {
  Logger.warn('Route not found', null, { 
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({
    error: 'Маршрут не найден',
    code: 'NOT_FOUND',
    availableEndpoints: [
      'GET /health',
      'POST /api/generate-carousel'
    ]
  });
});

// Error handler (должен быть последним)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = (signal) => {
  Logger.info(`Received ${signal}, shutting down gracefully`);
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Promise Rejection', reason, { promise: promise.toString() });
});

process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception', error);
  process.exit(1);
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  Logger.success('Canvas API started successfully', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid
  });
});
