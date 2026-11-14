import { compactWhitespace } from '@/lib/utils';

export type AiVisionProvider = 'gemini' | 'openai';

export interface AiVisionConfig {
  enabled: boolean;
  provider: AiVisionProvider;
  apiKey: string;
  model?: string;
}

export type OcrDomain = 'purchase' | 'order' | 'withdrawal' | 'general';

export interface SmartReadImageOptions {
  domain?: OcrDomain;
  catalogHints?: string[];
  brandHints?: string[];
  supplierHints?: string[];
  signal?: AbortSignal;
  onProgress?: (statusText: string, progressPct: number) => void;
}

export interface SmartReadImageResult {
  text: string;
  engine: 'ai-vision' | 'enhanced-ocr';
  confidence?: number;
}

const AI_VISION_STORAGE_KEY = 'cloud_kitchen_ai_vision_config_v1';

export function loadAiVisionConfig(): AiVisionConfig {
  const envGeminiKey =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY
      ? String(import.meta.env.VITE_GEMINI_API_KEY).trim()
      : '';
  const envOpenAiKey =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY
      ? String(import.meta.env.VITE_OPENAI_API_KEY).trim()
      : '';

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(AI_VISION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AiVisionConfig>;
        if (parsed.apiKey && parsed.apiKey.trim()) {
          return {
            enabled: parsed.enabled !== false,
            provider: parsed.provider === 'openai' ? 'openai' : 'gemini',
            apiKey: parsed.apiKey.trim(),
            model: parsed.model?.trim() || undefined,
          };
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }

  if (envGeminiKey) {
    return { enabled: true, provider: 'gemini', apiKey: envGeminiKey };
  }
  if (envOpenAiKey) {
    return { enabled: true, provider: 'openai', apiKey: envOpenAiKey };
  }

  return { enabled: false, provider: 'gemini', apiKey: '' };
}

export function saveAiVisionConfig(config: AiVisionConfig) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AI_VISION_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore quota errors
  }
}

export function hasActiveAiVision(): boolean {
  const cfg = loadAiVisionConfig();
  return cfg.enabled && Boolean(cfg.apiKey.trim());
}

// Downscales large photos before OCR so tesseract stays responsive in the browser.
export async function downscaleImage(file: File, maxDimension: number): Promise<Blob | File> {
  try {
    if (typeof createImageBitmap !== 'function') return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Enhances camera photos of handwritten/printed invoices & withdrawal sheets:
 * 1. Upscales small screenshots (<1400px) so tiny Arabic glyphs & digits become crisp.
 * 2. Downscales huge >2200px photos to prevent browser worker memory spikes.
 * 3. Normalizes uneven shadow illumination across paper, stretches contrast, and sharpens ink.
 */
export async function preprocessImageForOcr(file: File): Promise<Blob | File> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
      return file;
    }

    const bitmap = await createImageBitmap(file);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    let scale = 1;
    if (maxSide < 1300 && maxSide > 0) {
      scale = Math.min(2.2, 1600 / maxSide);
    } else if (maxSide > 2200) {
      scale = 2200 / maxSide;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const pixelCount = width * height;
    const gray = new Uint8Array(pixelCount);

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // Coarse grid background estimation (32x32 tiles) to flatten uneven phone lighting/shadows
    const tileSize = 32;
    const gridW = Math.ceil(width / tileSize);
    const gridH = Math.ceil(height / tileSize);
    const tileBg = new Uint8Array(gridW * gridH);

    for (let ty = 0; ty < gridH; ty += 1) {
      const y0 = ty * tileSize;
      const y1 = Math.min(height, y0 + tileSize);
      for (let tx = 0; tx < gridW; tx += 1) {
        const x0 = tx * tileSize;
        const x1 = Math.min(width, x0 + tileSize);
        let maxLum = 160;
        for (let y = y0; y < y1; y += 2) {
          const rowOffset = y * width;
          for (let x = x0; x < x1; x += 2) {
            const v = gray[rowOffset + x];
            if (v > maxLum) maxLum = v;
          }
        }
        tileBg[ty * gridW + tx] = maxLum;
      }
    }

    // Normalize against local background + S-curve contrast boost for crisp dark text on clean white background
    const normalized = new Uint8Array(pixelCount);
    for (let y = 0; y < height; y += 1) {
      const ty = Math.min(gridH - 1, Math.floor(y / tileSize));
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        const tx = Math.min(gridW - 1, Math.floor(x / tileSize));
        const bg = Math.max(120, tileBg[ty * gridW + tx]);
        const ratio = Math.min(1, gray[rowOffset + x] / bg);
        // Push near-background paper grain (>= 0.86) to pure white, darken ink strokes
        let val: number;
        if (ratio >= 0.86) {
          val = 255;
        } else if (ratio <= 0.45) {
          val = Math.max(0, Math.round(ratio * 160));
        } else {
          val = Math.min(255, Math.max(0, Math.round(((ratio - 0.45) / 0.41) * 183 + 72)));
        }
        normalized[rowOffset + x] = val;
      }
    }

    // Light 3x3 unsharp mask on interior pixels to sharpen Arabic dots & numerals
    for (let y = 1; y < height - 1; y += 1) {
      const row = y * width;
      for (let x = 1; x < width - 1; x += 1) {
        const idx = row + x;
        const center = normalized[idx];
        const neighbors =
          normalized[idx - 1] +
          normalized[idx + 1] +
          normalized[idx - width] +
          normalized[idx + width];
        const sharpened = Math.min(255, Math.max(0, Math.round(center * 2 - neighbors * 0.25)));
        const outIdx = idx * 4;
        data[outIdx] = sharpened;
        data[outIdx + 1] = sharpened;
        data[outIdx + 2] = sharpened;
        data[outIdx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Post-processes raw OCR output to remove table border noise, dotted form leaders,
 * and common digit/letter confusions in Arabic/English receipts and sheets.
 */
export function cleanOcrExtractedText(rawText: string): string {
  if (!rawText) return '';

  return rawText
    .split(/\r?\n/u)
    .map((rawLine) => {
      let line = rawLine
        // Replace vertical table border bars with clean pipe delimiter
        .replace(/[¦│┃▏▎▍▌▋▊▉║]/gu, ' | ')
        // Strip long dotted/dashed form lines ("..............." / "________")
        .replace(/[._…\-–—═─]{4,}/gu, ' ')
        // Fix common OCR confusion: letter O/o right next to digits -> 0
        .replace(/(?<=\d)[Oo](?=\d|\s|$)/gu, '0')
        .replace(/(?:^|(?<=\s))[Oo](?=\d{2,})/gu, '0')
        // Fix common OCR confusion in Egyptian mobile prefixes: "0l0" / "0I1" -> "010" / "011"
        .replace(/\b0[lI|]([0125]\d{8})\b/gu, '01$1')
        .replace(/\s*\|\s*\|\s*/gu, ' | ')
        .trim();

      // Strip leading/trailing orphan pipes
      line = line.replace(/^\|\s*|\s*\|$/gu, '').trim();
      return compactWhitespace(line);
    })
    .filter((line) => {
      if (!line) return false;
      // Drop pure noise lines containing no letters or digits
      if (!/[\p{L}\p{N}]/u.test(line)) return false;
      return true;
    })
    .join('\n');
}

async function blobToBase64DataUrl(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('تعذر تحويل الصورة إلى Base64'));
        return;
      }
      const header = result.slice(0, commaIdx);
      const mimeMatch = header.match(/data:([^;]+)/);
      resolve({
        base64: result.slice(commaIdx + 1),
        mimeType: mimeMatch?.[1] || blob.type || 'image/jpeg',
      });
    };
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.readAsDataURL(blob);
  });
}

function buildDomainVisionPrompt(options: SmartReadImageOptions): string {
  const catalogList = (options.catalogHints ?? []).slice(0, 120).join('، ');
  const brandsList = (options.brandHints ?? []).slice(0, 20).join('، ');
  const suppliersList = (options.supplierHints ?? []).slice(0, 40).join('، ');

  if (options.domain === 'purchase') {
    return [
      'أنت خبير محاسبة ومشتريات مطابخ سحابية في مصر، متخصص في قراءة الفواتير المطبوعة والمكتوبة بخط اليد (عربي وإنجليزي).',
      'استخرج كل بيانات الفاتورة من الصورة بدقة تامة وحوّلها إلى نص منظم جداً سطراً بسطر بالتنسيق التالي فقط بدون أي شرح إضافي:',
      '- إذا وُجد اسم مورد اكتب في أول سطر: المورد: <اسم المورد>',
      '- إذا وُجد رقم فاتورة اكتب: رقم الفاتورة: <الرقم>',
      '- إذا وُجد تاريخ اكتب: التاريخ: <YYYY-MM-DD>',
      '- إذا وُجد خصم اكتب: الخصم: <المبلغ>',
      '- إذا وُجدت ضريبة اكتب: الضريبة: <المبلغ>',
      '- لكل صنف مشترى اكتب سطراً مستقلاً بالصيغة الدقيقة: <اسم الصنف> | <الكمية بالأرقام> | <الوحدة مثل كجم أو جرام أو لتر أو قطعة أو كرتونة أو كيس أو علبة> | <سعر الوحدة بالأرقام>',
      'مهم جداً: إذا كان المكتوب في الفاتورة هو الإجمالي فقط للصنف والكمية، اقسم الإجمالي على الكمية واكتب سعر الوحدة الصحيح.',
      catalogList ? `الأصناف المسجلة لدينا في المخزن للمطابقة عند تشابه الاسم أو خط اليد: (${catalogList}).` : '',
      suppliersList ? `الموردون المسجلون لدينا: (${suppliersList}).` : '',
      'اكتب الأرقام بالإنجليزية (0-9) فقط ولا تضف أي علامات markdown أو شرح.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (options.domain === 'withdrawal') {
    return [
      'أنت خبير مخازن مطابخ سحابية، متخصص في قراءة "ورقة مسحوبات المخزن" سواء مطبوعة أو مكتوبة بخط اليد في جداول.',
      'استخرج فقط الصفوف المعبأة فعلياً (تجاهل الصفوف الفارغة والتوقيعات والعناوين).',
      'لكل صنف مسحوب اكتب سطراً واحداً فقط بالصيغة الدقيقة التالية:',
      '<اسم الصنف> <الكمية المسحوبة بالأرقام> <الوحدة مثل كجم أو قطعة أو لتر> متبقي <الرصيد الفعلي المتبقي إن وُجد>',
      'إذا لم يُكتب رصيد متبقي في الصف اكتب فقط: <اسم الصنف> <الكمية المسحوبة> <الوحدة>',
      catalogList ? `أصناف المخزن المسجلة لدينا للمطابقة الدقيقة لخط اليد: (${catalogList}).` : '',
      'استخدم الأرقام الإنجليزية (0-9) فقط ولا تضف أي كلام خارج الأسطر المستخرجة.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (options.domain === 'order') {
    return [
      'أنت خبير تسجيل طلبات مطاعم ووجبات صحية في مصر، متخصص في قراءة صور محادثات الواتساب والفواتير والطلبات المكتوبة بخط اليد.',
      'استخرج بيانات الطلب بدقة تامة واكتبها بهذا التنسيق الواضح فقط بدون أي شرح إضافي:',
      'اسم العميل: <الاسم>',
      'الهاتف: <رقم الموبايل المصري>',
      'هاتف بديل: <إن وُجد>',
      'البراند: <اسم الشركة إن وُجد>',
      'المنطقة: <المنطقة>',
      'العنوان: <العنوان التفصيلي>',
      'تاريخ التنفيذ: <YYYY-MM-DD إن وُجد>',
      'الباقة: <اسم الباقة إن كان اشتراك/باكدج>',
      'التفاصيل: <الوجبات مفصولة بفاصلة عربية "، " مع تكرار الوجبة حسب عددها وإرفاق ملاحظة الوجبة بعدها بعلامة " — " مثل: Beef Shawarma — بدون ارز>',
      'المبلغ: <قيمة الطلب بدون التوصيل بالأرقام>',
      'التوصيل: <رسوم التوصيل بالأرقام أو 0>',
      'ملاحظات: <أي ملاحظات عامة أخرى>',
      brandsList ? `الشركات المتاحة لدينا: (${brandsList}).` : '',
      catalogList ? `قائمة الوجبات والباقات لدينا للمطابقة الدقيقة: (${catalogList}).` : '',
      'استخدم الأرقام الإنجليزية (0-9) فقط ولا تكتب الحقول الفارغة.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return 'اقرأ كل النصوص العربية والإنجليزية والأرقام الموجودة في الصورة (بما فيها خط اليد) بدقة سطراً بسطر بدون أي تعليق إضافي.';
}

async function readImageWithAiVision(
  file: File,
  config: AiVisionConfig,
  options: SmartReadImageOptions,
): Promise<string> {
  options.onProgress?.('تحليل الصورة وخط اليد بالذكاء الاصطناعي...', 35);
  const compressed = await downscaleImage(file, 1800);
  const { base64, mimeType } = await blobToBase64DataUrl(compressed);
  const prompt = buildDomainVisionPrompt(options);

  if (config.provider === 'gemini') {
    const model = config.model || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Gemini Vision HTTP ${response.status}: ${errBody.slice(0, 160)}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const extracted =
      payload.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('\n')
        .replace(/^```[a-z]*\s*|\s*```$/giu, '')
        .trim() ?? '';

    if (!extracted) {
      throw new Error('لم يُرجع نموذج الرؤية نصاً من الصورة');
    }
    return extracted;
  }

  // OpenAI-compatible Vision API
  const model = config.model || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    signal: options.signal,
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`OpenAI Vision HTTP ${response.status}: ${errBody.slice(0, 160)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const extracted =
    payload.choices?.[0]?.message?.content
      ?.replace(/^```[a-z]*\s*|\s*```$/giu, '')
      .trim() ?? '';

  if (!extracted) {
    throw new Error('لم يُرجع نموذج الرؤية نصاً من الصورة');
  }
  return extracted;
}

/**
 * Unified smart image reader used across Purchases, Orders, and Withdrawals:
 * - Uses Multimodal AI Vision automatically when configured (excels at Arabic handwriting & skewed receipts).
 * - Falls back seamlessly to shadow-normalized, contrast-enhanced, sharpened Tesseract OCR (`ara+eng`).
 */
export async function smartReadImage(
  file: File,
  options: SmartReadImageOptions = {},
): Promise<SmartReadImageResult> {
  const visionConfig = loadAiVisionConfig();

  if (visionConfig.enabled && visionConfig.apiKey) {
    try {
      const visionText = await readImageWithAiVision(file, visionConfig, options);
      options.onProgress?.('اكتمل التحليل الذكي للصورة', 100);
      return {
        text: visionText,
        engine: 'ai-vision',
        confidence: 98,
      };
    } catch (visionError) {
      if (options.signal?.aborted) {
        throw visionError;
      }
      console.warn('AI Vision fallback to enhanced local OCR:', visionError);
    }
  }

  options.onProgress?.('تحسين إضاءة وتباين الصورة وتوضيح الخط...', 15);
  const enhancedSource = await preprocessImageForOcr(file);

  if (options.signal?.aborted) {
    throw new Error('تم إلغاء قراءة الصورة');
  }

  options.onProgress?.('تحميل محرك القراءة الضوئية (عربي + إنجليزي)...', 30);
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker('ara+eng', 1, {
    cacheMethod: 'write',
    logger: (msg: { status?: string; progress?: number }) => {
      if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
        const pct = Math.min(95, Math.round(35 + msg.progress * 60));
        options.onProgress?.(`قراءة النصوص والأرقام (${pct}%)...`, pct);
      }
    },
  });

  try {
    const abortPromise = new Promise<never>((_, reject) => {
      if (!options.signal) return;
      if (options.signal.aborted) {
        reject(new Error('تم إلغاء قراءة الصورة'));
        return;
      }
      options.signal.addEventListener(
        'abort',
        () => reject(new Error('تم إلغاء قراءة الصورة')),
        { once: true },
      );
    });

    // Pass 1: Enhanced contrast-normalized image with layout block preservation
    if (typeof worker.setParameters === 'function') {
      await worker.setParameters({
        preserve_interword_spaces: '1',
      });
    }

    const pass1 = await Promise.race([worker.recognize(enhancedSource), abortPromise]);
    let bestText = cleanOcrExtractedText(pass1.data.text ?? '');
    let bestConfidence = pass1.data.confidence ?? 0;

    // Pass 2 fallback: If preprocessed image yielded very sparse text or low confidence, also run on downscaled original
    if (bestText.length < 10 || bestConfidence < 48) {
      options.onProgress?.('تدقيق إضافي للصورة لتحسين الدقة...', 90);
      const rawScaled = await downscaleImage(file, 1800);
      const pass2 = await Promise.race([worker.recognize(rawScaled), abortPromise]);
      const cleaned2 = cleanOcrExtractedText(pass2.data.text ?? '');
      if (
        cleaned2.length > bestText.length * 1.25 ||
        ((pass2.data.confidence ?? 0) > bestConfidence + 8 && cleaned2.length >= bestText.length * 0.8)
      ) {
        bestText = cleaned2;
        bestConfidence = pass2.data.confidence ?? bestConfidence;
      }
    }

    options.onProgress?.('اكتملت القراءة بنجاح', 100);
    return {
      text: bestText,
      engine: 'enhanced-ocr',
      confidence: bestConfidence,
    };
  } finally {
    await worker.terminate();
  }
}

export async function testAiVisionConnection(config: AiVisionConfig): Promise<{ ok: boolean; message: string }> {
  const cleanKey = config.apiKey.trim();
  if (!cleanKey) {
    return { ok: false, message: 'أدخل مفتاح API أولاً' };
  }

  try {
    if (config.provider === 'gemini') {
      const model = config.model?.trim() || 'gemini-2.5-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model,
        )}:generateContent?key=${encodeURIComponent(cleanKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'أجب بكلمة: جاهز' }] }],
          }),
        },
      );
      if (!res.ok) {
        return { ok: false, message: `تعذر الاتصال بـ Gemini (كود ${res.status}) — تأكد من صحة المفتاح` };
      }
      return { ok: true, message: 'تم الاتصال بنجاح بمحرك Gemini Vision لقراءة خط اليد والفواتير' };
    }

    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${cleanKey}` },
    });
    if (!res.ok) {
      return { ok: false, message: `تعذر الاتصال بـ OpenAI (كود ${res.status}) — تأكد من صحة المفتاح` };
    }
    return { ok: true, message: 'تم الاتصال بنجاح بمحرك OpenAI Vision لقراءة خط اليد والفواتير' };
  } catch {
    return { ok: false, message: 'تعذر الوصول إلى الخدمة — تحقق من اتصال الإنترنت' };
  }
}

export function extractImageFromClipboardEvent(
  event: React.ClipboardEvent<HTMLElement>,
): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

