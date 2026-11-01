/**
 * wger REST API Client for Exercises, Muscles, Equipment and Metadata.
 * Complying with Creative Commons (CC-BY-SA) licensing and attribution requirements.
 *
 * Attribution: Exercise metadata and images courtesy of wger Workout Manager (wger.de).
 */

import { defaultExercises } from '../data/defaults.js';

const WGER_BASE = 'https://wger.de/api/v2';
const CACHE_KEY_PREFIX = 'bm90_wger_cache_v2_';
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours cache to respect rate limits
const memoryCache = new Map();

export const WGER_CATEGORIES = [
  { id: '', name: 'All Categories' },
  { id: 11, name: 'Chest' },
  { id: 12, name: 'Back' },
  { id: 13, name: 'Shoulders' },
  { id: 8, name: 'Arms' },
  { id: 9, name: 'Legs' },
  { id: 10, name: 'Core / Abs' },
  { id: 14, name: 'Calves' },
  { id: 15, name: 'Cardio' },
];

export const WGER_EQUIPMENT = [
  { id: '', name: 'All Equipment' },
  { id: 1, name: 'Barbell' },
  { id: 3, name: 'Dumbbell' },
  { id: 7, name: 'Bodyweight' },
  { id: 6, name: 'Pull-up bar' },
  { id: 8, name: 'Bench' },
  { id: 9, name: 'Incline bench' },
  { id: 10, name: 'Kettlebell' },
  { id: 12, name: 'Cable machine' },
];

export const WGER_MUSCLES = [
  { id: '', name: 'All Muscles' },
  { id: 4, name: 'Chest (Pectoralis)' },
  { id: 12, name: 'Back (Latissimus dorsi)' },
  { id: 9, name: 'Upper Back / Trapezius' },
  { id: 2, name: 'Shoulders (Deltoids)' },
  { id: 1, name: 'Biceps' },
  { id: 5, name: 'Triceps' },
  { id: 10, name: 'Quadriceps' },
  { id: 11, name: 'Hamstrings' },
  { id: 8, name: 'Glutes' },
  { id: 6, name: 'Abs / Core' },
  { id: 7, name: 'Calves' },
];

function getCached(key) {
  if (memoryCache.has(key)) {
    const entry = memoryCache.get(key);
    if (Date.now() - entry.time < CACHE_TTL_MS) return entry.data;
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.time < CACHE_TTL_MS) {
        memoryCache.set(key, parsed);
        return parsed.data;
      }
    }
  } catch {
    // Ignore storage issues
  }
  return null;
}

function setCached(key, data) {
  const entry = { time: Date.now(), data };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore storage overflow
  }
}

/**
 * Strips HTML tags safely while preserving spacing and list formats.
 */
export function cleanHtmlText(htmlStr) {
  if (!htmlStr || typeof htmlStr !== 'string') return '';
  return htmlStr
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Normalizes wger exercise item to the Beastmode 90 exercise model.
 * Handles nested translations, resolved taxonomy names, and licensing metadata.
 */
export function normalizeWgerExercise(item) {
  if (!item || typeof item !== 'object') return null;

  const stableId = item.id != null ? item.id : 'unknown';

  // 1. Resolve exercise name and description from translations array
  // wger /exerciseinfo/ nests localized names & descriptions under translations.
  // Language ID 2 is English.
  let resolvedName = '';
  let resolvedDesc = '';

  if (Array.isArray(item.translations) && item.translations.length > 0) {
    // Prefer English translation (language === 2)
    const enTrans = item.translations.find(t => t.language === 2 && t.name && t.name.trim());
    if (enTrans) {
      resolvedName = enTrans.name.trim();
      resolvedDesc = enTrans.description || enTrans.description_source || '';
    } else {
      // Fallback to any available translation with a non-empty name
      const anyTrans = item.translations.find(t => t.name && t.name.trim());
      if (anyTrans) {
        resolvedName = anyTrans.name.trim();
        resolvedDesc = anyTrans.description || anyTrans.description_source || '';
      }
    }

    // If name was resolved but description is still empty, look across other translations for description
    if (!resolvedDesc) {
      const descTrans = item.translations.find(t => (t.description && t.description.trim()) || (t.description_source && t.description_source.trim()));
      if (descTrans) {
        resolvedDesc = descTrans.description || descTrans.description_source || '';
      }
    }
  }

  // Fallback to direct properties if translations were empty
  if (!resolvedName && item.name && typeof item.name === 'string' && item.name.trim()) {
    resolvedName = item.name.trim();
  }
  if (!resolvedDesc && item.description && typeof item.description === 'string') {
    resolvedDesc = item.description;
  }

  // Genuinely missing name fallback uses stable exercise ID, never "Unnamed Exercise"
  const displayName = resolvedName || `Exercise #${stableId}`;

  // Clean instructions or show standard fallback (never fake generic sentences)
  const cleanedInstructions = cleanHtmlText(resolvedDesc);
  const instructions = cleanedInstructions || 'Instructions not available';

  // 2. Resolve equipment names
  let equipNames = [];
  if (Array.isArray(item.equipment)) {
    equipNames = item.equipment
      .map(e => {
        if (typeof e === 'object' && e !== null && e.name) return e.name;
        if (typeof e === 'number' || typeof e === 'string') {
          const match = WGER_EQUIPMENT.find(eq => String(eq.id) === String(e));
          return match?.name || String(e);
        }
        return '';
      })
      .filter(Boolean);
  }
  const primaryEquipment = equipNames.length > 0 ? equipNames[0] : 'Gym equipment';

  // 3. Resolve Category name
  let categoryName = 'General';
  if (item.category) {
    if (typeof item.category === 'object' && item.category !== null && item.category.name) {
      categoryName = item.category.name;
    } else if (typeof item.category === 'number' || typeof item.category === 'string') {
      const match = WGER_CATEGORIES.find(c => String(c.id) === String(item.category));
      if (match?.name) categoryName = match.name;
    }
  }

  // 4. Resolve Muscles (primary and secondary)
  const mapMuscle = (m) => {
    if (typeof m === 'object' && m !== null) {
      return m.name_en || m.name || '';
    }
    if (typeof m === 'number' || typeof m === 'string') {
      const match = WGER_MUSCLES.find(mu => String(mu.id) === String(m));
      return match?.name?.split(' (')[0] || String(m);
    }
    return '';
  };

  const primaryMuscles = Array.isArray(item.muscles) ? item.muscles.map(mapMuscle).filter(Boolean) : [];
  const secondaryMuscles = Array.isArray(item.muscles_secondary) ? item.muscles_secondary.map(mapMuscle).filter(Boolean) : [];
  const allMuscles = [...new Set([...primaryMuscles, ...secondaryMuscles])];

  // 5. Images and demonstration thumbnails
  let imageUrl = null;
  let thumbnailUrl = null;
  let imageLicense = null;
  let imageAuthor = null;
  if (Array.isArray(item.images) && item.images.length > 0) {
    const mainImg = item.images.find(img => img.is_main) || item.images[0];
    if (mainImg) {
      imageUrl = mainImg.image || null;
      thumbnailUrl = mainImg.thumbnails?.small || mainImg.thumbnails?.medium || mainImg.image || null;
      imageLicense = mainImg.license_title || (item.license && (item.license.full_name || item.license.short_name)) || 'Creative Commons (CC-BY-SA)';
      imageAuthor = mainImg.license_author || item.license_author || 'wger contributor';
    }
  }

  return {
    id: `wger_${stableId}`,
    wgerId: stableId,
    uuid: item.uuid || null,
    name: displayName,
    category: categoryName.toLowerCase(),
    categoryName,
    equipment: primaryEquipment.toLowerCase(),
    equipmentList: equipNames,
    muscles: allMuscles,
    instructions,
    hasImage: Boolean(imageUrl),
    imageUrl,
    thumbnailUrl: thumbnailUrl || imageUrl,
    imageLicense,
    imageAuthor,
    license: item.license?.full_name || 'Creative Commons Attribution Share Alike (CC-BY-SA 4.0)',
    licenseShort: item.license?.short_name || 'CC-BY-SA 4.0',
    licenseUrl: item.license?.url || 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Exercise data & demonstration provided by wger.de under Creative Commons (CC-BY-SA)',
    isCustom: false,
    source: 'wger REST API',
  };
}

/**
 * Fetches exercises from wger REST API with category, muscle, equipment, and pagination filters.
 */
export async function fetchWgerExercises({
  search = '',
  category = '',
  muscle = '',
  equipment = '',
  page = 1,
  limit = 16,
} = {}) {
  const offset = (page - 1) * limit;
  const cacheKey = `ex_list_v2_${search.trim()}_${category}_${muscle}_${equipment}_${page}_${limit}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, isFromCache: true };
  }

  const queryParams = new URLSearchParams({
    language: '2', // English
    limit: String(limit),
    offset: String(offset),
  });

  if (category) queryParams.set('category', String(category));
  if (muscle) queryParams.set('muscles', String(muscle));
  if (equipment) queryParams.set('equipment', String(equipment));

  // wger /exerciseinfo/ searches exercise names via the name__search parameter
  if (search && search.trim()) {
    queryParams.set('name__search', search.trim());
  }

  const url = `${WGER_BASE}/exerciseinfo/?${queryParams.toString()}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (res.status === 429) {
    const error = new Error('wger.de API rate limit exceeded. Please wait a moment before trying again.');
    error.status = 429;
    error.isRateLimit = true;
    throw error;
  }

  if (!res.ok) {
    const error = new Error(`wger.de API error: HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const rawResults = data.results || [];
  const exercises = rawResults.map(normalizeWgerExercise).filter(Boolean);

  const result = {
    exercises,
    total: data.count || exercises.length,
    page,
    limit,
    hasNext: Boolean(data.next),
    hasPrev: Boolean(data.previous),
    totalPages: Math.ceil((data.count || exercises.length) / limit),
    source: 'wger.de REST API',
    licenseAttribution: 'Exercise data & imagery provided by wger Workout Manager (wger.de) under CC-BY-SA 4.0',
    attributionUrl: 'https://wger.de',
  };

  setCached(cacheKey, result);
  return result;
}

/**
 * Fallback to local default exercise library with filtering when network/rate limits occur.
 */
export function fallbackToLocalExercises({ search = '', category = '', muscle = '', equipment = '' } = {}) {
  let list = [...defaultExercises].map(ex => ({
    ...ex,
    source: 'Local Beastmode Library',
    hasImage: false,
    attributionText: 'Beastmode 90 Local Exercise Database',
  }));

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.muscles && e.muscles.some(m => m.toLowerCase().includes(q)))
    );
  }

  if (category) {
    const catObj = WGER_CATEGORIES.find(c => String(c.id) === String(category));
    if (catObj && catObj.name) {
      const catKey = catObj.name.toLowerCase();
      list = list.filter(e => e.category.toLowerCase().includes(catKey));
    }
  }

  return {
    exercises: list,
    total: list.length,
    page: 1,
    limit: 20,
    hasNext: false,
    hasPrev: false,
    totalPages: 1,
    source: 'Local Fallback Library (Offline / Rate-limited)',
    isFallback: true,
  };
}
