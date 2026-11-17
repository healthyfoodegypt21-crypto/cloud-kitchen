export type CategoryOptionLike = {
  code: string;
  name?: string;
  name_ar?: string;
  name_en?: string;
};

function normalizeForCategory(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u0640/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

type SemanticBucket =
  | 'nuts'
  | 'spices'
  | 'sauces'
  | 'cleaning'
  | 'proteins'
  | 'dairy'
  | 'oils'
  | 'vegetables'
  | 'fruits'
  | 'carbohydrates'
  | 'beverages'
  | 'dry_goods'
  | 'packaging'
  | 'finished_products'
  | 'other';

const BUCKET_CANONICAL_CODES: Record<SemanticBucket, string[]> = {
  nuts: ['nuts', 'dry_goods'],
  spices: ['spices'],
  sauces: ['sauces', 'sauce'],
  cleaning: ['cleaning'],
  proteins: ['proteins', 'protein'],
  dairy: ['dairy'],
  oils: ['oils'],
  vegetables: ['vegetables', 'vegetable'],
  fruits: ['fruits', 'vegetables'],
  carbohydrates: ['carbohydrates', 'carbohydrate'],
  beverages: ['beverages', 'beverage'],
  dry_goods: ['dry_goods'],
  packaging: ['packaging'],
  finished_products: ['finished_products', 'finished_product'],
  other: ['other'],
};

const BUCKET_ARABIC_HINTS: Record<SemanticBucket, RegExp | null> = {
  nuts: /(مكسرات|nuts?)/iu,
  spices: /(بهار|توابل|spices?)/iu,
  sauces: /(صوص|صلص|sauces?)/iu,
  cleaning: /(منظف|نظافه|تنظيف|cleaning)/iu,
  proteins: /(بروتين|لحوم|دواجن|proteins?)/iu,
  dairy: /(البان|اجبان|جبن|dairy)/iu,
  oils: /(زيوت|دهون|oils?)/iu,
  vegetables: /(خضروات|خضراوات|خضار|vegetables?)/iu,
  fruits: /(فواكه|فاكهه|fruits?)/iu,
  carbohydrates: /(كربوهيدرات|نشويات|مخبوزات|carbohydrates?)/iu,
  beverages: /(مشروبات|عصائر|beverages?)/iu,
  dry_goods: /(جافه|بقوليات|علافه|dry\s*goods)/iu,
  packaging: /(تغليف|تعبئه|عبوات|packaging)/iu,
  finished_products: /(جاهزه|تامه|finished)/iu,
  other: /(اخري|other)/iu,
};

function detectSemanticBucket(norm: string): SemanticBucket {
  if (!norm) return 'other';
  const padded = ` ${norm} `;
  const hasWord = (pattern: RegExp) => pattern.test(padded);

  // 1. Unmistakable non-food cleaning & sanitation supplies first
  if (
    hasWord(
      /(?:^|\s)(?:فلاش|كلور|كلوركس|ديتول|بريل|فيري|داوني|اريال|برسيل|صابون|منظف|منظفات|مطهر|معقم|مذيب\s+دهون|باور|سلك\s+مواعين|سلك\s+موعين|ليفه\s+مواعين|ليفه\s+موعين|اسبونج|سفنجه|شرشوبه|ممسحه|مقشه|جردل|مساحه|اكياس\s+قمامه|اكياس\s+زباله|فنيك|جلانس|ملمع|معطر|مبيد|bleach|chlorine|detergent|dishwash|sponge|scrubber|degreaser|sanitizer|disinfectant)(?=\s|$)/u,
    )
  ) {
    return 'cleaning';
  }

  // 2. Unmistakable packaging & disposables (checked before food only for non-ambiguous packaging terms)
  if (
    hasWord(
      /(?:^|\s)(?:فويل|ورق\s+فويل|الومنيوم\s+فويل|استرتش|سترتش|بلاستيك\s+راب|ورق\s+زبده|علب\s+وجبات|علب\s+ميكروويف|علب\s+بلاستيك|علب\s+سلطه|علب\s+صوص|اطباق\s+فوم|اطباق\s+فويل|شوك\s+بلاستيك|معالق\s+بلاستيك|ملاعق\s+بلاستيك|سكاكين\s+بلاستيك|شاليموه|اكواب\s+ورق|كوبايات\s+بلاستيك|اكياس\s+تغليف|اكياس\s+ثلاجه|شنط\s+مطبوعه|استيكر|ستيكر|بكر\s+كاشير|بكر\s+استيكر|جوانتي|قفازات|كاب\s+شعر|كمامه|foil|cling\s+film|stretch\s+wrap|meal\s+box|cutlery|napkin|gloves)(?=\s|$)/u,
    )
  ) {
    return 'packaging';
  }

  // 3. Spices & dry seasonings (checked BEFORE vegetables so "فلفل اسود" / "ثوم بودر" / "بصل بودر" -> spices!)
  if (
    hasWord(
      /(?:^|\s)(?:ملح|فلفل\s+اسود|فلفل\s+ابيض|فلفل\s+احمر\s+مطحون|ثوم\s+بودر|ثوم\s+مطحون|توم\s+بودر|بصل\s+بودر|بصل\s+مطحون|جنزبيل\s+بودر|زنجبيل\s+بودر|زنجبيل\s+مطحون|كزبره\s+ناشفه|كسبره\s+ناشفه|كمون|كركم|كاري|بابريكا|شطه|قرفه|بهار|بهارات|سبع\s+بهارات|توابل|حبهان|هيل|ورق\s+لورا|ورق\s+غار|قرنفل|جوزه\s+الطيب|زعتر|اوريجانو|روزماري|اكليل\s+الجبل|سماق|سمسم|حبه\s+البركه|مرقه|ماجي|بيكنج\s+بودر|بيكربونات|خميره|فانيليا|زعفران|ينسون\s+حصي|salt|black\s+pepper|white\s+pepper|cumin|turmeric|curry|paprika|chili\s+powder|cinnamon|garlic\s+powder|onion\s+powder|spice|spices|seasoning|cardamom|bay\s+leaf|cloves|nutmeg|thyme|oregano|rosemary|sumac|sesame|yeast|vanilla)(?=\s|$)/u,
    )
  ) {
    return 'spices';
  }

  // 4. Sauces, dressings & condiments (checked BEFORE vegetables so "كاتشب" / "صلصه طماطم" / "دبس رمان" -> sauces!)
  if (
    hasWord(
      /(?:^|\s)(?:صوص|صوصات|صلصه|معجون\s+طماطم|كاتشب|مايونيز|مسطرده|مسترده|خردل|باربكيو|صويا|ترياكي|سويت\s+تشيلي|سيراتشا|هوت\s+صوص|رانش|سيزر|ثاوزند\s+ايلاند|الف\s+جزيره|ديمي\s+جلاس|ورشستر|تباسكو|خل|بلسميك|بلسمك|دبس\s+رمان|دبس|طحينه|بيستو|دريسنج|مخلل|طرشي|زيتون\s+شرائح|زيتون\s+مخلي|sauce|sauces|ketchup|mayo|mayonnaise|mustard|bbq|soy|teriyaki|sriracha|ranch|dressing|vinegar|balsamic|tahini|pesto|paste|pickles)(?=\s|$)/u,
    )
  ) {
    return 'sauces';
  }

  // 5. Nuts & dried fruits (resolves to custom "مكسرات" category if present, else dry_goods)
  if (
    hasWord(
      /(?:^|\s)(?:مكسرات|كاجو|لوز|بندق|فستق|عين\s+جمل|جوز\s+هند|صنوبر|فول\s+سوداني|سوداني|زبيب|قراصيا|مشمشيه|تين\s+مجفف|تمر|بلح|بذور\s+شيا|شيا|بذور\s+كتان|سمسم\s+محمص|cashew|almond|hazelnut|pistachio|walnut|pecan|peanut|nuts|raisins|dates|chia)(?=\s|$)/u,
    )
  ) {
    return 'nuts';
  }

  // 6. Proteins (meats, poultry, seafood, eggs)
  if (
    hasWord(
      /(?:^|\s)(?:صدور|وراك|اوراك|دبابيس|بانيه|شيش|طاووق|فراخ|فرخه|دجاج|دجاجه|بط|رومي|سمان|حمام|لحم|لحمه|لحوم|بيف|عجالي|كندوز|ضاني|بتلو|مفروم|كفته|برجر|ستيك|استيك|ريش|فلتو|عرق\s+فلتو|تربيانكو|موزه|كبده|كلاوي|سجق|بسطرمه|لانشون|روزبيف|سلامي|تركي\s+مدخن|سوسيس|هوت\s+دوج|سمك|فيليه|سالمون|سلمون|تونه|جمبري|روبيان|كاليماري|كالماري|سبيط|بلطي|بوري|قاروص|دنيس|كابوريا|سي\s+فود|بيض|chicken|beef|meat|veal|lamb|turkey|duck|steak|minced|kofta|burger|sausage|liver|fish|salmon|tuna|shrimp|prawn|calamari|seafood|egg|eggs)(?=\s|$)/u,
    )
  ) {
    return 'proteins';
  }

  // 7. Dairy & cheeses
  if (
    hasWord(
      /(?:^|\s)(?:لبن|حليب|جبن|جبنه|اجبان|قريش|فيتا|فيتاه|موتزاريلا|موزاريلا|شيدر|بارميزان|حلوم|ريكوتا|جبنه\s+رومي|جبنه\s+كريمي|كيري|زبادي|يوناني|لبنه|قشطه|كريمه|كريمه\s+طهي|كريمه\s+خفق|رايب|milk|cheese|cottage|feta|mozzarella|cheddar|parmesan|halloumi|ricotta|yogurt|labneh|cream|dairy)(?=\s|$)/u,
    )
  ) {
    return 'dairy';
  }

  // 8. Oils & cooking fats
  if (
    hasWord(
      /(?:^|\s)(?:زيت|زيت\s+زيتون|زيت\s+ذره|زيت\s+عباد|زيت\s+قلي|زيت\s+سمسم|زيت\s+جوز\s+هند|سمن|سمنه|زبده|مارجرين|oil|olive\s+oil|sunflower\s+oil|corn\s+oil|ghee|butter|margarine)(?=\s|$)/u,
    )
  ) {
    return 'oils';
  }

  // 9. Fresh vegetables, leafy greens & herbs (including كابوتشا, خضره, مشروم, etc.)
  if (
    hasWord(
      /(?:^|\s)(?:كابوتشا|كابوتشي|كابوتشه|خس|جرجير|بقدونس|مقدونس|كزبره|كسبره|شبت|نعناع|ريحان|خضره|خضار|خضروات|خضراوات|طماطم|قوطه|بندوره|خيار|جزر|فلفل|بصل|ثوم|توم|مشروم|ماشروم|عيش\s+غراب|بروكلي|قرنبيط|كوسه|باذنجان|بتنجان|سبانخ|ملوخيه|باميه|بسله|فاصوليا\s+خضراء|كرنب|ملفوف|بنجر|شمندر|فجل|كرفس|كرات|ليمون|زنجبيل|جنزبيل|افوكادو|ذره\s+حلوه|خرشوف|قلقاس|ورق\s+عنب|vegetable|vegetables|lettuce|iceberg|arugula|rocca|parsley|coriander|cilantro|dill|mint|basil|tomato|tomatoes|cucumber|carrot|pepper|capsicum|onion|garlic|mushroom|mushrooms|broccoli|cauliflower|zucchini|eggplant|spinach|cabbage|beetroot|celery|leek|lemon|avocado|sweet\s+corn)(?=\s|$)/u,
    )
  ) {
    return 'vegetables';
  }

  // 10. Fresh fruits (routes to custom fruits category if configured, else vegetables)
  if (
    hasWord(
      /(?:^|\s)(?:تفاح|موز|برتقال|يوسفي|فراوله|مانجو|مانجه|جوافه|عنب|رمان|كيوي|اناناس|بطيخ|كانتلوب|شمام|خوخ|مشمش|برقوق|كمثري|توت|بلوبيري|جريب\s+فروت|فواكه|فاكهه|apple|banana|orange|strawberry|mango|guava|grape|pomegranate|kiwi|pineapple|watermelon|peach|berry|berries|fruit|fruits)(?=\s|$)/u,
    )
  ) {
    return 'fruits';
  }

  // 11. Carbohydrates, grains, starches & bakery
  if (
    hasWord(
      /(?:^|\s)(?:ارز|رز|بسمتي|مكرونه|معكرونه|باستا|اسباجتي|بينا|فيتوتشيني|لازانيا|شعريه|لسان\s+عصفور|نودلز|بطاطس|بطاطا|توست|عيش|خبز|رده|تورتيلا|تورتيا|كايزر|فينو|بيتي\s+بان|بقسماط|شوفان|كينوا|برغل|فريك|كسكسي|دقيق|نشا|كورن\s+فليكس|رايس\s+كيك|كرواسون|باتيه|مخبوزات|rice|basmati|pasta|spaghetti|penne|noodles|potato|potatoes|sweet\s+potato|bread|toast|tortilla|wrap|bun|oats|oatmeal|quinoa|bulgur|flour|cornstarch)(?=\s|$)/u,
    )
  ) {
    return 'carbohydrates';
  }

  // 12. Beverages
  if (
    hasWord(
      /(?:^|\s)(?:ماء|مياه|ميه\s+معدنيه|عصير|شاي|قهوه|نسكافيه|اسبريسو|كابتشينو|كركديه|ينسون|حلبة|بيبسي|كوكاكولا|سبرايت|صودا|مشروب|water|juice|tea|coffee|nescafe|espresso|soda|beverage|drink)(?=\s|$)/u,
    )
  ) {
    return 'beverages';
  }

  // 13. Dry goods, legumes & sweeteners
  if (
    hasWord(
      /(?:^|\s)(?:عدس|حمص|فول|لوبيا|فاصوليا\s+بيضاء|فاصوليا\s+حمراء|ترمس|ذره\s+فشار|عسل|سكر|ستيفيا|كاكاو|شوكولاته|شيكولاته|مربي|حلاوه|جيلاتين|lentils|chickpeas|beans|honey|sugar|stevia|cocoa|chocolate|jam)(?=\s|$)/u,
    )
  ) {
    return 'dry_goods';
  }

  // 14. Generic packaging fallback when NO food/cleaning keyword matched above
  if (
    hasWord(
      /(?:^|\s)(?:علب|علبه|اكياس|كيس|كرتون|كرتونه|كراتين|شنط|شنطه|تغليف|تعبئه|عبوات|عبوه|اكواب|اغطيه|غطاء|مناديل|رول|packaging|container|containers|boxes|bags)(?=\s|$)/u,
    )
  ) {
    return 'packaging';
  }

  return 'other';
}

/**
 * Infers the most accurate inventory category code for a given item name.
 * Dynamically resolves against `availableCategories` when provided (including
 * user-defined custom categories like "مكسرات" -> "01" or "المنظفات" -> "cleaning"),
 * and falls back cleanly to standard `inventory_categories` plural codes.
 */
const DEFAULT_FALLBACK_CODE: Record<SemanticBucket, string> = {
  nuts: 'dry_goods',
  spices: 'spices',
  sauces: 'sauces',
  cleaning: 'cleaning',
  proteins: 'proteins',
  dairy: 'dairy',
  oils: 'oils',
  vegetables: 'vegetables',
  fruits: 'vegetables',
  carbohydrates: 'carbohydrates',
  beverages: 'beverages',
  dry_goods: 'dry_goods',
  packaging: 'packaging',
  finished_products: 'finished_products',
  other: 'other',
};

export function inferSmartItemCategory(
  itemName: string,
  availableCategories?: CategoryOptionLike[],
): string {
  const norm = normalizeForCategory(itemName);
  if (!norm) return 'other';

  const bucket = detectSemanticBucket(norm);
  if (!availableCategories || availableCategories.length === 0) {
    return DEFAULT_FALLBACK_CODE[bucket];
  }

  const byCode = new Map(
    availableCategories.map((cat) => [cat.code.trim().toLowerCase(), cat.code]),
  );

  // 1. For semantic buckets that may map to custom user-created categories (e.g. "مكسرات" with code "01"),
  //    check Arabic/English category labels first if the exact canonical code isn't directly registered!
  const candidateCodes = BUCKET_CANONICAL_CODES[bucket] ?? ['other'];
  const primaryCode = candidateCodes[0];
  if (primaryCode && byCode.has(primaryCode.toLowerCase())) {
    return byCode.get(primaryCode.toLowerCase())!;
  }

  const hintPattern = BUCKET_ARABIC_HINTS[bucket];
  if (hintPattern) {
    const matchedByLabel = availableCategories.find((cat) => {
      const labelBlob = normalizeForCategory(
        `${cat.name ?? ''} ${cat.name_ar ?? ''} ${cat.name_en ?? ''} ${cat.code}`,
      );
      return hintPattern.test(labelBlob);
    });
    if (matchedByLabel) {
      return matchedByLabel.code;
    }
  }

  for (const fallbackCode of candidateCodes.slice(1)) {
    if (byCode.has(fallbackCode.toLowerCase())) {
      return byCode.get(fallbackCode.toLowerCase())!;
    }
  }

  return byCode.get('other') ?? primaryCode ?? 'other';
}
