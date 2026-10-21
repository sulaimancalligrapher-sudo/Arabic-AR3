import { DrawingTemplate, GuideColor } from '../types/drawing';

export const DRAWING_TEMPLATES: DrawingTemplate[] = [
  // ==================== الحروف العربية بالخط العربي الأصيل ====================
  {
    id: 'letter_alif',
    title: 'حرف الألف (أ)',
    titleEn: 'Letter Alif',
    category: 'letters',
    description: 'يبدأ من الأعلى بانسيابية عمودية مستقيمة ثم همزة رشيقة بالأعلى',
    arabicAudioText: 'أَلِف، حَرْفُ الأَلِف',
    difficulty: 'easy',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
      <!-- Hamza -->
      <path d="M 180 85 C 205 60, 240 65, 235 95 C 230 115, 195 125, 175 140 L 235 140" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Alif Stem -->
      <path d="M 205 180 C 206 250, 204 380, 202 440" fill="none" stroke="currentColor" stroke-width="26" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ', 'مبتدئ']
  },
  {
    id: 'letter_baa',
    title: 'حرف الباء (ب)',
    titleEn: 'Letter Baa',
    category: 'letters',
    description: 'ارسم سن البداية، ثم انزلق أفقياً مع انحناء الصحن، ثم ضع النقطة بالأسفل',
    arabicAudioText: 'بَاء، حَرْفُ البَاء',
    difficulty: 'easy',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
      <!-- Baa Body -->
      <path d="M 400 190 C 390 260, 360 290, 250 290 C 140 290, 110 260, 100 190" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Dot -->
      <circle cx="250" cy="350" r="14" fill="currentColor"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_taa',
    title: 'حرف التاء (ت)',
    titleEn: 'Letter Taa',
    category: 'letters',
    description: 'صحن الباء المتناسق مع نقطتين متجاورتين في الأعلى',
    arabicAudioText: 'تَاء، حَرْفُ التَّاء',
    difficulty: 'easy',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
      <!-- Two Dots -->
      <circle cx="225" cy="140" r="13" fill="currentColor"/>
      <circle cx="275" cy="140" r="13" fill="currentColor"/>
      <!-- Taa Body -->
      <path d="M 400 210 C 390 280, 360 310, 250 310 C 140 310, 110 280, 100 210" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_thaa',
    title: 'حرف الثاء (ث)',
    titleEn: 'Letter Thaa',
    category: 'letters',
    description: 'صحن الحرف مع ثلاثة نقاط على شكل مثلث هرمي في الأعلى',
    arabicAudioText: 'ثَاء، حَرْفُ الثَّاء',
    difficulty: 'easy',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
      <!-- 3 Dots -->
      <circle cx="250" cy="115" r="12" fill="currentColor"/>
      <circle cx="225" cy="145" r="12" fill="currentColor"/>
      <circle cx="275" cy="145" r="12" fill="currentColor"/>
      <!-- Thaa Body -->
      <path d="M 400 210 C 390 280, 360 310, 250 310 C 140 310, 110 280, 100 210" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_jeem',
    title: 'حرف الجيم (ج)',
    titleEn: 'Letter Jeem',
    category: 'letters',
    description: 'رأس الجيم الأفقي المموج، ثم بطنه المستدير الواسع مع نقطة في جوفه',
    arabicAudioText: 'جِيم، حَرْفُ الجِيم',
    difficulty: 'normal',
    targetAccuracy: 78,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <!-- Head -->
      <path d="M 180 150 C 240 125, 340 125, 380 150 C 350 170, 300 185, 260 210" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
      <!-- Belly -->
      <path d="M 260 210 C 400 250, 410 420, 240 430 C 130 430, 95 340, 110 270" fill="none" stroke="currentColor" stroke-width="26" stroke-linecap="round"/>
      <!-- Center Dot -->
      <circle cx="240" cy="320" r="16" fill="currentColor"/>
    </svg>`,
    tags: ['حروف', 'خط الثلث والنسخ']
  },
  {
    id: 'letter_haa',
    title: 'حرف الحاء (ح)',
    titleEn: 'Letter Haa',
    category: 'letters',
    description: 'حرف الحاء النقي بلا نقاط، برأسه الممشوق وبطنه الهلالي البديع',
    arabicAudioText: 'حَاء، حَرْفُ الحَاء',
    difficulty: 'normal',
    targetAccuracy: 78,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <!-- Head -->
      <path d="M 180 150 C 240 125, 340 125, 380 150 C 350 170, 300 185, 260 210" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
      <!-- Belly -->
      <path d="M 260 210 C 400 250, 410 420, 240 430 C 130 430, 95 340, 110 270" fill="none" stroke="currentColor" stroke-width="26" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط الثلث والنسخ']
  },
  {
    id: 'letter_khaa',
    title: 'حرف الخاء (خ)',
    titleEn: 'Letter Khaa',
    category: 'letters',
    description: 'نفس مسار الجيم والحاء مع تتويج الرأس بنقطة علوية واضحة',
    arabicAudioText: 'خَاء، حَرْفُ الخَاء',
    difficulty: 'normal',
    targetAccuracy: 78,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <!-- Top Dot -->
      <circle cx="280" cy="80" r="16" fill="currentColor"/>
      <!-- Head -->
      <path d="M 180 160 C 240 135, 340 135, 380 160 C 350 180, 300 195, 260 220" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
      <!-- Belly -->
      <path d="M 260 220 C 400 260, 410 430, 240 440 C 130 440, 95 350, 110 280" fill="none" stroke="currentColor" stroke-width="26" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط الثلث والنسخ']
  },
  {
    id: 'letter_dal',
    title: 'حرف الدال (د)',
    titleEn: 'Letter Dal',
    category: 'letters',
    description: 'انحدار مائل مائل من الأعلى لسطر القاعدة ثم استقرار أفقي رشيق',
    arabicAudioText: 'دَال، حَرْفُ الدَّال',
    difficulty: 'easy',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="450" height="450">
      <path d="M 290 140 C 275 220, 240 260, 210 270 C 210 270, 270 280, 320 280 L 150 280" fill="none" stroke="currentColor" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_raa',
    title: 'حرف الراء (ر)',
    titleEn: 'Letter Raa',
    category: 'letters',
    description: 'انزلاق هلالي مقوس يبدأ فوق السطر وينساب برقة تحت السطر',
    arabicAudioText: 'رَاء، حَرْفُ الرَّاء',
    difficulty: 'easy',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="450" height="450">
      <path d="M 280 160 C 270 200, 255 240, 220 285 C 180 330, 140 345, 110 345" fill="none" stroke="currentColor" stroke-width="25" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_seen',
    title: 'حرف السين (س)',
    titleEn: 'Letter Seen',
    category: 'letters',
    description: 'ثلاث أسنان متدرجة النسبة، تنتهي بكاسة عميقة تحت السطر',
    arabicAudioText: 'سِين، حَرْفُ السِّين',
    difficulty: 'normal',
    targetAccuracy: 80,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 450" width="500" height="450">
      <!-- 3 Teeth -->
      <path d="M 430 180 C 420 220, 395 220, 385 180 C 375 220, 345 220, 335 180 C 325 240, 320 250, 300 250" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round"/>
      <!-- Bowl -->
      <path d="M 300 250 C 290 350, 180 365, 140 285 C 130 260, 130 220, 140 190" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_saad',
    title: 'حرف الصاد (ص)',
    titleEn: 'Letter Saad',
    category: 'letters',
    description: 'رأس الصاد البيضاوي المنتفخ مع سنته المجاورة وكاسته الرائعة',
    arabicAudioText: 'صَاد، حَرْفُ الصَّاد',
    difficulty: 'advanced',
    targetAccuracy: 80,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 450" width="500" height="450">
      <!-- Saad Eye & Head -->
      <path d="M 310 240 C 340 180, 420 180, 440 220 C 445 240, 420 250, 270 250" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Tooth & Bowl -->
      <path d="M 270 250 L 260 215 C 255 240, 255 250, 240 250 C 230 350, 140 365, 110 285 C 100 255, 105 220, 115 190" fill="none" stroke="currentColor" stroke-width="23" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط الثلث والنسخ']
  },
  {
    id: 'letter_taa_heavy',
    title: 'حرف الطاء (ط)',
    titleEn: 'Letter Taa (Emphatic)',
    category: 'letters',
    description: 'رأس بيضاوي مستقر على السطر وقائمة عمودية تعلوه بحلية أنيقة',
    arabicAudioText: 'طَاء، حَرْفُ الطَّاء',
    difficulty: 'normal',
    targetAccuracy: 80,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 450" width="500" height="450">
      <!-- Body -->
      <path d="M 250 280 C 270 220, 360 220, 380 255 C 385 275, 360 285, 170 285" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Mast / Stick -->
      <path d="M 275 80 C 270 120, 275 220, 275 280" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_ayn',
    title: 'حرف العين (ع)',
    titleEn: 'Letter Ayn',
    category: 'letters',
    description: 'حاجب العين العلوي المنحني ثم بطنها المقوس الضخم المفتوح لليسار',
    arabicAudioText: 'عَيْن، حَرْفُ العَيْن',
    difficulty: 'advanced',
    targetAccuracy: 80,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <!-- Eyebrow -->
      <path d="M 240 180 C 260 145, 320 140, 335 170 C 315 185, 280 195, 255 220" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round"/>
      <!-- Big Arch Body -->
      <path d="M 255 220 C 400 270, 400 430, 230 440 C 130 440, 90 350, 110 270" fill="none" stroke="currentColor" stroke-width="25" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط الثلث والنسخ']
  },
  {
    id: 'letter_faa',
    title: 'حرف الفاء (ف)',
    titleEn: 'Letter Faa',
    category: 'letters',
    description: 'رأس مستدير وعنق رشيق مع صحن الباء ونقطة مفردة فوق الرأس',
    arabicAudioText: 'فَاء، حَرْفُ الفَاء',
    difficulty: 'normal',
    targetAccuracy: 78,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
      <!-- Dot -->
      <circle cx="360" cy="110" r="14" fill="currentColor"/>
      <!-- Head & Body -->
      <path d="M 330 180 C 330 150, 390 150, 390 180 C 390 210, 350 230, 340 240 C 310 290, 220 295, 140 295 C 100 295, 80 260, 80 220" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_meem',
    title: 'حرف الميم (م)',
    titleEn: 'Letter Meem',
    category: 'letters',
    description: 'رأس الميم المثلث المائل ثم الخنجر الهابط للأسفل باستقامة وقوة',
    arabicAudioText: 'مِيم، حَرْفُ المِيم',
    difficulty: 'easy',
    targetAccuracy: 78,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 500" width="450" height="500">
      <!-- Head -->
      <path d="M 280 180 C 310 160, 320 200, 270 210 C 230 220, 230 185, 280 180 Z" fill="none" stroke="currentColor" stroke-width="22" stroke-linejoin="round"/>
      <!-- Tail / Dagger -->
      <path d="M 250 210 L 250 430" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_noon',
    title: 'حرف النون (ن)',
    titleEn: 'Letter Noon',
    category: 'letters',
    description: 'كاسة نصف دائرية عميقة تتوسطها نقطة مشرقة في قلب التجويف',
    arabicAudioText: 'نُون، حَرْفُ النُّون',
    difficulty: 'easy',
    targetAccuracy: 78,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="450" height="450">
      <!-- Dot -->
      <circle cx="230" cy="210" r="15" fill="currentColor"/>
      <!-- Bowl -->
      <path d="M 330 190 C 335 340, 125 340, 130 190" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },
  {
    id: 'letter_waaw',
    title: 'حرف الواو (و)',
    titleEn: 'Letter Waaw',
    category: 'letters',
    description: 'رأس دائري يستقر فوق السطر، ثم جسم مقوس يشبه الراء ينساب للأسفل',
    arabicAudioText: 'وَاو، حَرْفُ الوَاو',
    difficulty: 'easy',
    targetAccuracy: 78,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 450" width="450" height="450">
      <!-- Head -->
      <path d="M 270 170 C 260 140, 320 135, 325 170 C 330 200, 290 215, 270 215 C 250 215, 240 200, 270 170 Z" fill="none" stroke="currentColor" stroke-width="20" stroke-linejoin="round"/>
      <!-- Tail -->
      <path d="M 270 215 C 260 270, 220 320, 160 340" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/>
    </svg>`,
    tags: ['حروف', 'خط النسخ']
  },

  // ==================== عبارات وكلمات الخط العربي ====================
  {
    id: 'word_allah',
    title: 'لفظ الجلالة (الله)',
    titleEn: 'Allah (Calligraphy)',
    category: 'words',
    description: 'كتابة لفظ الجلالة المبارك بخط الثلث الرصين وألفاته ولاماته المتعانقة',
    arabicAudioText: 'الله، لَفْظُ الجَلَالَةِ جَلَّ جَلَالُه',
    difficulty: 'advanced',
    targetAccuracy: 80,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 450" width="500" height="450">
      <!-- First Alif -->
      <path d="M 400 100 L 400 320" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <!-- First Lam -->
      <path d="M 330 90 L 330 320" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <!-- Second Lam -->
      <path d="M 265 110 L 265 320" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <!-- Interconnection Base -->
      <path d="M 330 320 C 300 340, 220 340, 190 310" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round"/>
      <!-- Haa Arch -->
      <path d="M 190 310 C 170 240, 130 250, 140 310 C 145 335, 170 340, 190 310 Z" fill="none" stroke="currentColor" stroke-width="18" stroke-linejoin="round"/>
      <!-- Small dagger alif / tashkeel -->
      <path d="M 298 160 L 298 210" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"/>
    </svg>`,
    tags: ['كلمات', 'خط الثلث', 'إسلامي']
  },
  {
    id: 'word_iqra',
    title: 'كلمة (اقرأ)',
    titleEn: 'Iqra (Read)',
    category: 'words',
    description: 'أول كلمة نزلت من القرآن الكريم، رمز العلم والمعرفة والقراءة',
    arabicAudioText: 'اقْرَأْ، بِاسْمِ رَبِّكَ الَّذِي خَلَق',
    difficulty: 'normal',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
      <!-- Alif -->
      <path d="M 420 100 L 420 280" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round"/>
      <!-- Qaf Head & Dot -->
      <circle cx="340" cy="140" r="10" fill="currentColor"/>
      <circle cx="365" cy="140" r="10" fill="currentColor"/>
      <path d="M 330 190 C 320 170, 370 170, 370 200 C 370 230, 320 250, 300 250" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <!-- Raa -->
      <path d="M 300 250 C 285 290, 255 330, 205 340" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round"/>
      <!-- Alif with Hamza -->
      <path d="M 140 100 L 140 280" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round"/>
      <path d="M 130 60 C 145 45, 165 48, 160 68 L 130 68" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"/>
    </svg>`,
    tags: ['كلمات', 'خط النسخ', 'علم']
  },
  {
    id: 'word_salam',
    title: 'كلمة (سلام)',
    titleEn: 'Salam (Peace)',
    category: 'words',
    description: 'تحية الإسلام الخالدة ورمز الأمان والسلام والمحبة',
    arabicAudioText: 'سَلَام، السَّلَامُ عَلَيْكُم',
    difficulty: 'normal',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
      <!-- Seen Teeth -->
      <path d="M 450 190 C 440 220, 420 220, 410 190 C 400 220, 380 220, 370 190 L 330 250" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <!-- Lam-Alif -->
      <path d="M 330 250 L 260 100" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <path d="M 230 100 L 290 250" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <!-- Meem -->
      <path d="M 230 250 C 210 230, 160 230, 160 260 C 160 290, 210 280, 200 260 L 140 340" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
    </svg>`,
    tags: ['كلمات', 'سلام']
  },

  // ==================== أشكال ورسومات تعليمية وتلوين ====================
  {
    id: 'shape_hilal',
    title: 'هلال وقمر (🌙)',
    titleEn: 'Crescent Moon',
    category: 'shapes',
    description: 'تتبع قوس الهلال الخارجي الرشيق ثم القوس الداخلي الناعم',
    arabicAudioText: 'هِلَال، هِلَالُ القَمَرِ المُنِير',
    difficulty: 'easy',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <path d="M 280 80 C 380 140, 390 330, 250 410 C 130 480, 50 350, 110 230 C 150 150, 230 100, 280 80 C 210 125, 175 220, 205 310 C 235 390, 335 390, 370 330 C 335 365, 245 105, 280 80 Z" fill="none" stroke="currentColor" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`,
    tags: ['أشكال', 'تلوين', 'رمضان']
  },
  {
    id: 'shape_najma',
    title: 'نجمة ساطعة (⭐)',
    titleEn: 'Golden Star',
    category: 'shapes',
    description: 'تتبع أضلاع النجمة الخماسية بزواياها الهندسية المتقاطعة',
    arabicAudioText: 'نَجْمَة، نَجْمَةٌ سَاطِعَةٌ فِي السَّمَاء',
    difficulty: 'easy',
    targetAccuracy: 70,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <polygon points="250,50 315,185 460,195 350,290 385,435 250,355 115,435 150,290 40,195 185,185" fill="none" stroke="currentColor" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`,
    tags: ['أشكال', 'نجوم']
  },
  {
    id: 'shape_shams',
    title: 'شمس مشرقة (☀️)',
    titleEn: 'Shining Sun',
    category: 'shapes',
    description: 'تتبع قرص الشمس الدائري في المركز ثم انطلق برسم أشعتها الذهبية',
    arabicAudioText: 'شَمْس، شَمْسٌ مُشْرِقَةٌ دَافِئَة',
    difficulty: 'easy',
    targetAccuracy: 70,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <circle cx="250" cy="250" r="90" fill="none" stroke="currentColor" stroke-width="22"/>
      <!-- Cardinal Rays -->
      <line x1="250" y1="90" x2="250" y2="35" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <line x1="250" y1="410" x2="250" y2="465" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <line x1="90" y1="250" x2="35" y2="250" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <line x1="410" y1="250" x2="465" y2="250" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <!-- Diagonal Rays -->
      <line x1="135" y1="135" x2="95" y2="95" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <line x1="365" y1="365" x2="405" y2="405" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <line x1="365" y1="135" x2="405" y2="95" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
      <line x1="135" y1="365" x2="95" y2="405" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
    </svg>`,
    tags: ['أشكال', 'شمس', 'طبيعة']
  },
  {
    id: 'shape_tuffaha',
    title: 'تفاحة حمراء (🍎)',
    titleEn: 'Red Apple',
    category: 'shapes',
    description: 'تتبع غصن التفاحة وورقتها الخضراء، ثم تجويف جسم التفاحة الجميل',
    arabicAudioText: 'تُفَّاحَة، تُفَّاحَةٌ حَمْرَاءُ لَذِيذَة',
    difficulty: 'easy',
    targetAccuracy: 70,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <!-- Apple Stem & Leaf -->
      <path d="M 250 120 C 255 70, 280 50, 295 40" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round"/>
      <path d="M 265 80 C 310 70, 330 90, 340 100 C 330 120, 290 120, 265 80 Z" fill="none" stroke="currentColor" stroke-width="14" stroke-linejoin="round"/>
      <!-- Apple Body -->
      <path d="M 250 140 C 210 100, 110 110, 100 210 C 90 320, 180 430, 250 430 C 320 430, 410 320, 400 210 C 390 110, 290 100, 250 140 Z" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    tags: ['أشكال', 'فواكه', 'تلوين']
  },
  {
    id: 'shape_kitab',
    title: 'كتاب مفتوح (📖)',
    titleEn: 'Open Book',
    category: 'shapes',
    description: 'تتبع صفحات الكتاب المفتوح من اليمين إلى اليسار والعمود الفقري',
    arabicAudioText: 'كِتَاب، كِتَابٌ مَفْتُوحٌ لِلعِلْمِ وَالمَعْرِفَة',
    difficulty: 'normal',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 450" width="500" height="450">
      <!-- Right Page -->
      <path d="M 250 150 C 290 120, 370 120, 430 140 L 430 330 C 370 310, 290 310, 250 340 L 250 150 Z" fill="none" stroke="currentColor" stroke-width="20" stroke-linejoin="round"/>
      <!-- Left Page -->
      <path d="M 250 150 C 210 120, 130 120, 70 140 L 70 330 C 130 310, 210 310, 250 340 L 250 150 Z" fill="none" stroke="currentColor" stroke-width="20" stroke-linejoin="round"/>
    </svg>`,
    tags: ['أشكال', 'مدرسة', 'تعليم']
  },
  {
    id: 'shape_qaarib',
    title: 'قارب في البحر (⛵)',
    titleEn: 'Sailboat in Waves',
    category: 'shapes',
    description: 'تتبع أشرعة القارب وسارية السفينة وهيكلها وأمواج البحر المتدفقة',
    arabicAudioText: 'قَارِب، قَارِبٌ شِرَاعِيٌّ فِي البَحْر',
    difficulty: 'normal',
    targetAccuracy: 70,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <!-- Mast -->
      <line x1="230" y1="80" x2="230" y2="340" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>
      <!-- Big Sail -->
      <polygon points="245,100 370,310 245,310" fill="none" stroke="currentColor" stroke-width="20" stroke-linejoin="round"/>
      <!-- Small Sail -->
      <polygon points="215,140 120,310 215,310" fill="none" stroke="currentColor" stroke-width="18" stroke-linejoin="round"/>
      <!-- Boat Hull -->
      <path d="M 90 350 L 410 350 L 360 420 L 150 420 Z" fill="none" stroke="currentColor" stroke-width="20" stroke-linejoin="round"/>
      <!-- Waves -->
      <path d="M 70 450 C 110 470, 150 440, 190 460 C 230 480, 270 450, 310 470 C 350 490, 390 460, 430 470" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round"/>
    </svg>`,
    tags: ['أشكال', 'بحر', 'طبيعة']
  },
  {
    id: 'shape_fanoos',
    title: 'فانوس تراثي (🏮)',
    titleEn: 'Traditional Lantern',
    category: 'shapes',
    description: 'تتبع قبة الفانوس وزجاجه الهندسي وقاعدته التراثية المضيئة',
    arabicAudioText: 'فَانُوس، فَانُوسٌ تُرَاثِيٌّ مُضِيء',
    difficulty: 'normal',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <!-- Top Ring -->
      <circle cx="250" cy="70" r="25" fill="none" stroke="currentColor" stroke-width="16"/>
      <!-- Dome -->
      <path d="M 210 100 L 290 100 L 330 170 L 170 170 Z" fill="none" stroke="currentColor" stroke-width="18" stroke-linejoin="round"/>
      <!-- Glass Chamber -->
      <path d="M 170 170 L 200 340 L 300 340 L 330 170" fill="none" stroke="currentColor" stroke-width="18" stroke-linejoin="round"/>
      <!-- Base -->
      <path d="M 180 340 L 150 420 L 350 420 L 320 340 Z" fill="none" stroke="currentColor" stroke-width="18" stroke-linejoin="round"/>
    </svg>`,
    tags: ['أشكال', 'تراث', 'رمضان']
  },
  {
    id: 'shape_nakhla',
    title: 'نخلة عربية (🌴)',
    titleEn: 'Arabian Date Palm',
    category: 'shapes',
    description: 'تتبع سعف النخلة الخضراء المتدلية وجذعها القوي الشامخ',
    arabicAudioText: 'نَخْلَة، نَخْلَةٌ عَرَبِيَّةٌ بَاسِقَة',
    difficulty: 'normal',
    targetAccuracy: 75,
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <!-- Palm Trunk -->
      <path d="M 230 450 C 235 340, 245 280, 240 210 C 255 210, 265 280, 270 450 Z" fill="none" stroke="currentColor" stroke-width="18" stroke-linejoin="round"/>
      <!-- Palm Fronds / Leaves -->
      <path d="M 245 210 C 220 120, 140 100, 80 140" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>
      <path d="M 245 210 C 270 120, 350 100, 410 140" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>
      <path d="M 245 210 C 210 160, 110 180, 70 240" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>
      <path d="M 245 210 C 280 160, 380 180, 420 240" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>
      <path d="M 245 210 C 240 100, 250 80, 250 60" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/>
    </svg>`,
    tags: ['أشكال', 'طبيعة', 'تراث']
  },

  // ==================== سبورة حرة خالية ====================
  {
    id: 'freehand_board',
    title: 'سبورة حرة خالية 🎨',
    titleEn: 'Blank Creative Whiteboard',
    category: 'freehand',
    description: 'مساحة رسم حرة بدون نموذج، أطلق العنان لإبداعك بالخط العربي والرسم المبتكر',
    arabicAudioText: 'سَبُّورَةٌ حُرَّة، أَطْلِقْ عِنَانَ إِبْدَاعِك',
    difficulty: 'easy',
    targetAccuracy: 0,
    svgData: '',
    tags: ['حر', 'سبورة', 'تدريب']
  }
];

export const CALLIGRAPHY_COLORS = [
  { name: 'حبر أسود فحمي', hex: '#0f172a', class: 'bg-slate-900' },
  { name: 'ذهب عيار 24', hex: '#f59e0b', class: 'bg-amber-500' },
  { name: 'أزرق ملكي', hex: '#2563eb', class: 'bg-blue-600' },
  { name: 'أخضر زمردي', hex: '#059669', class: 'bg-emerald-600' },
  { name: 'أحمر قاني', hex: '#dc2626', class: 'bg-red-600' },
  { name: 'بنفسجي أندلسي', hex: '#7c3aed', class: 'bg-purple-600' },
  { name: 'أبيض طباشيري', hex: '#ffffff', class: 'bg-white' },
  { name: 'سماوي نيون', hex: '#06b6d4', class: 'bg-cyan-500' }
];

export const GUIDE_COLORS: { id: GuideColor; name: string; hex: string }[] = [
  { id: 'yellow', name: 'أصفر متوهج', hex: '#facc15' },
  { id: 'green', name: 'أخضر فسفوري', hex: '#4ade80' },
  { id: 'white', name: 'أبيض ناصع', hex: '#ffffff' },
  { id: 'cyan', name: 'سماوي مشرق', hex: '#38bdf8' },
  { id: 'black', name: 'أسود كلاسيكي', hex: '#0f172a' }
];
