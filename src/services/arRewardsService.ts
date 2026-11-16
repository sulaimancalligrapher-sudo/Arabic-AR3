import { formatDirectImageUrl } from '../utils/urlHelper';

export interface ARRewardTier {
  id: string;
  title: string;
  minScore: number;
  maxScore: number;
  presetId?: string;
  imageUrl: string;
  scaleRatio: number;
  offsetYRatio: number;
  enabled: boolean;
}

export interface ARRewardPreset {
  id: string;
  name: string;
  defaultTitle: string;
  imageUrl: string;
  defaultScaleRatio: number;
  defaultOffsetYRatio: number;
}

const AR_REWARDS_STORAGE_KEY = 'arabic_calligraphy_ar_rewards_v1';
const AR_INTRO_STORAGE_KEY = 'arabic_calligraphy_ar_intro_v1';
export const AR_INTRO_ID = '__ar_intro__';

const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;

export const AR_REWARD_PRESETS: ARRewardPreset[] = [
  {
    id: 'royal_crown',
    name: 'التاج الملكي الذهبي 👑',
    defaultTitle: '👑 بطل الخط العربي 🌟',
    defaultScaleRatio: 1.35,
    defaultOffsetYRatio: -0.45,
    imageUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 155" width="240" height="155">
        <defs>
          <linearGradient id="crownGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fef08a"/>
            <stop offset="35%" stop-color="#f59e0b"/>
            <stop offset="65%" stop-color="#fef3c7"/>
            <stop offset="100%" stop-color="#d97706"/>
          </linearGradient>
        </defs>
        <path d="M 32 122 L 24 44 L 62 84 L 82 28 L 106 78 L 120 12 L 134 78 L 158 28 L 178 84 L 216 44 L 208 122 Z" fill="url(#crownGold)" stroke="#78350f" stroke-width="4" stroke-linejoin="round"/>
        <path d="M 32 124 Q 120 144 208 124" fill="none" stroke="#d97706" stroke-width="14" stroke-linecap="round"/>
        <path d="M 32 124 Q 120 144 208 124" fill="none" stroke="#fef08a" stroke-width="8" stroke-linecap="round"/>
        <circle cx="120" cy="14" r="10" fill="#10b981" stroke="#fef08a" stroke-width="2.5"/>
        <circle cx="82" cy="29" r="7.5" fill="#3b82f6" stroke="#fef08a" stroke-width="2"/>
        <circle cx="158" cy="29" r="7.5" fill="#3b82f6" stroke="#fef08a" stroke-width="2"/>
        <circle cx="25" cy="45" r="6.5" fill="#ef4444" stroke="#fef08a" stroke-width="2"/>
        <circle cx="215" cy="45" r="6.5" fill="#ef4444" stroke="#fef08a" stroke-width="2"/>
        <circle cx="70" cy="127" r="4.5" fill="#ffffff"/>
        <circle cx="120" cy="133" r="5" fill="#dc2626"/>
        <circle cx="170" cy="127" r="4.5" fill="#ffffff"/>
      </svg>
    `),
  },
  {
    id: 'calligrapher_turban',
    name: 'عمامة ووسام الخطاط ⭐',
    defaultTitle: '⭐ خطاط متميز ✨',
    defaultScaleRatio: 1.45,
    defaultOffsetYRatio: -0.35,
    imageUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150" width="240" height="150">
        <defs>
          <linearGradient id="turbanSilk" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f8fafc"/>
            <stop offset="50%" stop-color="#e2e8f0"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
          <linearGradient id="emeraldBand" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#059669"/>
            <stop offset="50%" stop-color="#10b981"/>
            <stop offset="100%" stop-color="#047857"/>
          </linearGradient>
        </defs>
        <ellipse cx="120" cy="82" rx="88" ry="52" fill="url(#turbanSilk)" stroke="#64748b" stroke-width="3.5"/>
        <path d="M 38 78 Q 120 44 202 78" fill="none" stroke="#94a3b8" stroke-width="3.5"/>
        <path d="M 46 60 Q 120 28 194 60" fill="none" stroke="#94a3b8" stroke-width="3"/>
        <path d="M 35 104 Q 120 128 205 104 L 198 124 Q 120 144 42 124 Z" fill="url(#emeraldBand)" stroke="#fef08a" stroke-width="2.5"/>
        <polygon points="120,26 128,46 149,47 133,60 139,80 120,68 101,80 107,60 91,47 112,46" fill="#fbbf24" stroke="#78350f" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="120" cy="54" r="7" fill="#dc2626" stroke="#fef08a" stroke-width="2"/>
      </svg>
    `),
  },
  {
    id: 'excellence_laurel',
    name: 'إكليل التميز التشجيعي 🎖️',
    defaultTitle: '🎖️ مثابرة رائعة 👏',
    defaultScaleRatio: 1.4,
    defaultOffsetYRatio: -0.4,
    imageUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150" width="240" height="150">
        <defs>
          <linearGradient id="laurelGold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#fde047"/>
            <stop offset="100%" stop-color="#d97706"/>
          </linearGradient>
        </defs>
        <path d="M 110 122 C 60 116 32 82 38 40 C 56 54 64 78 60 94 C 52 84 44 74 42 62" fill="none" stroke="url(#laurelGold)" stroke-width="8" stroke-linecap="round"/>
        <path d="M 130 122 C 180 116 208 82 202 40 C 184 54 176 78 180 94 C 188 84 196 74 198 62" fill="none" stroke="url(#laurelGold)" stroke-width="8" stroke-linecap="round"/>
        <ellipse cx="48" cy="58" rx="14" ry="7" transform="rotate(-35 48 58)" fill="#facc15" stroke="#78350f" stroke-width="2"/>
        <ellipse cx="58" cy="84" rx="15" ry="7" transform="rotate(-20 58 84)" fill="#fbbf24" stroke="#78350f" stroke-width="2"/>
        <ellipse cx="78" cy="108" rx="14" ry="7" transform="rotate(-8 78 108)" fill="#f59e0b" stroke="#78350f" stroke-width="2"/>
        <ellipse cx="192" cy="58" rx="14" ry="7" transform="rotate(35 192 58)" fill="#facc15" stroke="#78350f" stroke-width="2"/>
        <ellipse cx="182" cy="84" rx="15" ry="7" transform="rotate(20 182 84)" fill="#fbbf24" stroke="#78350f" stroke-width="2"/>
        <ellipse cx="162" cy="108" rx="14" ry="7" transform="rotate(8 162 108)" fill="#f59e0b" stroke="#78350f" stroke-width="2"/>
        <circle cx="120" cy="64" r="30" fill="#0ea5e9" stroke="#fef08a" stroke-width="4"/>
        <polygon points="120,42 126,56 141,57 129,67 133,82 120,73 107,82 111,67 99,57 114,56" fill="#fef08a"/>
      </svg>
    `),
  },
  {
    id: 'graduation_cap',
    name: 'قبعة الإبداع والتميز 🎓',
    defaultTitle: '🎓 مبدع المستقبل ✨',
    defaultScaleRatio: 1.45,
    defaultOffsetYRatio: -0.4,
    imageUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150" width="240" height="150">
        <polygon points="120,18 226,56 120,94 14,56" fill="#1e293b" stroke="#f59e0b" stroke-width="4" stroke-linejoin="round"/>
        <path d="M 56 72 L 56 112 Q 120 136 184 112 L 184 72 L 120 94 Z" fill="#0f172a" stroke="#f59e0b" stroke-width="3.5" stroke-linejoin="round"/>
        <line x1="204" y1="64" x2="204" y2="112" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>
        <circle cx="204" cy="116" r="7" fill="#f59e0b"/>
        <circle cx="120" cy="56" r="6" fill="#fbbf24"/>
      </svg>
    `),
  },
  {
    id: 'golden_star_emblem',
    name: 'وسام نجم الخط الذهبي 🌟',
    defaultTitle: '🌟 نجم الخط العربي 🌟',
    defaultScaleRatio: 1.15,
    defaultOffsetYRatio: -0.5,
    imageUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" width="200" height="160">
        <defs>
          <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#fef9c3"/>
            <stop offset="60%" stop-color="#fbbf24"/>
            <stop offset="100%" stop-color="#d97706"/>
          </radialGradient>
        </defs>
        <polygon points="100,12 123,60 176,66 136,102 147,154 100,128 53,154 64,102 24,66 77,60" fill="url(#starGlow)" stroke="#78350f" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="100" cy="90" r="20" fill="#fef08a" opacity="0.55"/>
      </svg>
    `),
  },
];

export const getDefaultARRewards = (): ARRewardTier[] => [
  {
    id: 'tier_gold_crown',
    title: AR_REWARD_PRESETS[0].defaultTitle,
    minScore: 90,
    maxScore: 100,
    presetId: AR_REWARD_PRESETS[0].id,
    imageUrl: AR_REWARD_PRESETS[0].imageUrl,
    scaleRatio: AR_REWARD_PRESETS[0].defaultScaleRatio,
    offsetYRatio: AR_REWARD_PRESETS[0].defaultOffsetYRatio,
    enabled: true,
  },
  {
    id: 'tier_silver_turban',
    title: AR_REWARD_PRESETS[1].defaultTitle,
    minScore: 75,
    maxScore: 89,
    presetId: AR_REWARD_PRESETS[1].id,
    imageUrl: AR_REWARD_PRESETS[1].imageUrl,
    scaleRatio: AR_REWARD_PRESETS[1].defaultScaleRatio,
    offsetYRatio: AR_REWARD_PRESETS[1].defaultOffsetYRatio,
    enabled: true,
  },
  {
    id: 'tier_bronze_laurel',
    title: AR_REWARD_PRESETS[2].defaultTitle,
    minScore: 60,
    maxScore: 74,
    presetId: AR_REWARD_PRESETS[2].id,
    imageUrl: AR_REWARD_PRESETS[2].imageUrl,
    scaleRatio: AR_REWARD_PRESETS[2].defaultScaleRatio,
    offsetYRatio: AR_REWARD_PRESETS[2].defaultOffsetYRatio,
    enabled: true,
  },
];

export const getDefaultARIntroReward = (): ARRewardTier => {
  const preset = AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0];
  return {
    id: AR_INTRO_ID,
    title: '🌟 مستعد للكتابة بالواقع المعزز ✨',
    minScore: 0,
    maxScore: 0,
    presetId: preset.id,
    imageUrl: preset.imageUrl,
    scaleRatio: preset.defaultScaleRatio,
    offsetYRatio: preset.defaultOffsetYRatio,
    enabled: true,
  };
};

export const normalizeSingleARReward = (
  item: any,
  idx = 0,
  fallbackPreset: ARRewardPreset = AR_REWARD_PRESETS[0]
): ARRewardTier => {
  const presetId = typeof item?.presetId === 'string' && item.presetId.trim()
    ? item.presetId.trim()
    : undefined;
  const matchedPreset = presetId ? AR_REWARD_PRESETS.find(p => p.id === presetId) : undefined;
  const rawUrl = typeof item?.imageUrl === 'string' ? item.imageUrl.trim() : '';

  let resolvedImageUrl = '';
  if (matchedPreset && (!rawUrl || rawUrl.startsWith('preset:'))) {
    resolvedImageUrl = matchedPreset.imageUrl;
  } else if (rawUrl.startsWith('data:image/')) {
    resolvedImageUrl = rawUrl;
  } else if (rawUrl) {
    resolvedImageUrl = formatDirectImageUrl(rawUrl) || rawUrl;
  } else {
    resolvedImageUrl = fallbackPreset.imageUrl;
  }

  const rawMin = Number(item?.minScore);
  const rawMax = Number(item?.maxScore);
  const a = Number.isFinite(rawMin) ? Math.max(0, Math.min(100, Math.round(rawMin))) : 0;
  const b = Number.isFinite(rawMax) ? Math.max(0, Math.min(100, Math.round(rawMax))) : 100;

  const rawScale = Number(item?.scaleRatio);
  const scaleRatio = Number.isFinite(rawScale)
    ? Math.max(0.7, Math.min(2.2, Number(rawScale.toFixed(2))))
    : (matchedPreset?.defaultScaleRatio ?? fallbackPreset.defaultScaleRatio);

  const rawOffset = Number(item?.offsetYRatio);
  const offsetYRatio = Number.isFinite(rawOffset)
    ? Math.max(-0.95, Math.min(0.45, Number(rawOffset.toFixed(2))))
    : (matchedPreset?.defaultOffsetYRatio ?? fallbackPreset.defaultOffsetYRatio);

  const enabledVal = item?.enabled;
  const enabled =
    typeof enabledVal === 'boolean'
      ? enabledVal
      : !['false', '0', 'لا', 'معطل'].includes(String(enabledVal ?? 'true').trim().toLowerCase());

  const itemId = String(item?.id || `tier_${idx}_${Date.now()}`);
  const isIntro = itemId === AR_INTRO_ID;

  return {
    id: itemId,
    title: item?.title !== undefined
      ? String(item.title)
      : (matchedPreset?.defaultTitle ?? fallbackPreset.defaultTitle),
    minScore: isIntro ? 0 : Math.min(a, b),
    maxScore: isIntro ? 0 : Math.max(a, b),
    presetId: matchedPreset ? matchedPreset.id : undefined,
    imageUrl: resolvedImageUrl,
    scaleRatio,
    offsetYRatio,
    enabled,
  };
};

export const normalizeARRewardTiers = (rawList: any[]): ARRewardTier[] => {
  if (!Array.isArray(rawList)) return getDefaultARRewards();

  const normalized = rawList
    .filter(item => item && typeof item === 'object' && String(item.id || '') !== AR_INTRO_ID)
    .map((item, idx) => normalizeSingleARReward(item, idx, AR_REWARD_PRESETS[0]));

  return normalized.length > 0 ? normalized : getDefaultARRewards();
};

export const splitARRewardsPayload = (
  rawList: any[]
): { intro: ARRewardTier | null; tiers: ARRewardTier[] } => {
  if (!Array.isArray(rawList)) {
    return { intro: null, tiers: getDefaultARRewards() };
  }

  const validItems = rawList.filter(item => item && typeof item === 'object');
  const rawIntro = validItems.find(item => String(item.id || '').trim() === AR_INTRO_ID);
  const intro = rawIntro
    ? normalizeSingleARReward(rawIntro, 0, AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0])
    : null;

  const rawTiers = validItems.filter(item => String(item.id || '').trim() !== AR_INTRO_ID);
  const tiers = rawTiers.length > 0
    ? rawTiers.map((item, idx) => normalizeSingleARReward(item, idx, AR_REWARD_PRESETS[0]))
    : getDefaultARRewards();

  return { intro, tiers };
};

export const getStoredARRewards = (): ARRewardTier[] => {
  try {
    const raw = localStorage.getItem(AR_REWARDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeARRewardTiers(parsed);
      }
    }
  } catch {}
  return getDefaultARRewards();
};

export const saveStoredARRewards = (tiers: ARRewardTier[]): boolean => {
  try {
    const clean = tiers.filter(t => t.id !== AR_INTRO_ID);
    localStorage.setItem(AR_REWARDS_STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch (err) {
    console.warn('Could not save AR rewards to localStorage:', err);
    return false;
  }
};

export const getStoredARIntroReward = (): ARRewardTier => {
  try {
    const raw = localStorage.getItem(AR_INTRO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizeSingleARReward({ ...parsed, id: AR_INTRO_ID }, 0, AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0]);
      }
    }
  } catch {}
  return getDefaultARIntroReward();
};

export const saveStoredARIntroReward = (intro: ARRewardTier): boolean => {
  try {
    const normalized = normalizeSingleARReward({ ...intro, id: AR_INTRO_ID }, 0, AR_REWARD_PRESETS[4] || AR_REWARD_PRESETS[0]);
    localStorage.setItem(AR_INTRO_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch (err) {
    console.warn('Could not save AR intro reward to localStorage:', err);
    return false;
  }
};

export const findARRewardForScore = (
  score: number | null,
  tiers: ARRewardTier[]
): ARRewardTier | null => {
  const enabledTiers = tiers.filter(t => t.enabled && t.id !== AR_INTRO_ID);
  if (enabledTiers.length === 0) return null;

  if (score === null || score === undefined) {
    // Manual crown toggle preview: return highest maxScore tier
    return [...enabledTiers].sort((a, b) => Math.max(b.minScore, b.maxScore) - Math.max(a.minScore, a.maxScore))[0] || null;
  }

  const rounded = Math.round(score);
  const matching = enabledTiers
    .filter(t => {
      const low = Math.min(t.minScore, t.maxScore);
      const high = Math.max(t.minScore, t.maxScore);
      return rounded >= low && rounded <= high;
    })
    .sort((a, b) => Math.min(b.minScore, b.maxScore) - Math.min(a.minScore, a.maxScore));
  return matching[0] || null;
};

// Compact UTF-8 safe URL share encoding/decoding for instant cross-device sharing
export const encodeARRewardsShareParam = (
  tiers: ARRewardTier[],
  intro?: ARRewardTier | null
): { token: string; skippedLocalImages: boolean } => {
  let skippedLocalImages = false;
  const allItems = intro ? [{ ...intro, id: AR_INTRO_ID }, ...tiers.filter(t => t.id !== AR_INTRO_ID)] : tiers;
  const compact = allItems.map(t => {
    let img = '';
    if (!t.presetId && t.imageUrl) {
      if (t.imageUrl.startsWith('http://') || t.imageUrl.startsWith('https://')) {
        img = t.imageUrl;
      } else {
        skippedLocalImages = true;
      }
    }
    return {
      i: t.id,
      t: t.title,
      n: t.minScore,
      x: t.maxScore,
      p: t.presetId || '',
      u: img,
      s: t.scaleRatio,
      y: t.offsetYRatio,
      e: t.enabled ? 1 : 0,
    };
  });

  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { token: base64, skippedLocalImages };
};

export const decodeARRewardsShareBundle = (
  token: string
): { tiers: ARRewardTier[]; intro: ARRewardTier | null } | null => {
  try {
    if (!token || !token.trim()) return null;
    let b64 = token.trim().replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const expanded = parsed.map((c: any) => ({
      id: c.i,
      title: c.t,
      minScore: c.n,
      maxScore: c.x,
      presetId: c.p || undefined,
      imageUrl: c.u || '',
      scaleRatio: c.s,
      offsetYRatio: c.y,
      enabled: c.e !== 0,
    }));
    return splitARRewardsPayload(expanded);
  } catch {
    return null;
  }
};

export const decodeARRewardsShareParam = (token: string): ARRewardTier[] | null => {
  const bundle = decodeARRewardsShareBundle(token);
  return bundle ? bundle.tiers : null;
};
