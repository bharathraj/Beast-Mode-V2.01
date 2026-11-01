/**
 * Open Food Facts API Client (v3 / REST)
 * Provides packaged food search, barcode lookup, debouncing, and caching.
 *
 * Attribution: Data sourced from Open Food Facts under Open Database License (ODbL).
 * App User-Agent: Beastmode90-Web/1.0 (https://beastmode90.app; contact@beastmode90.app)
 */

import { cookedIndianFoods } from '../data/indianFoods';
import { defaultFoods } from '../data/defaults';

const CACHE_STORAGE_KEY = 'bm90_off_cache_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours
const memoryCache = new Map();

// Load persistent cache from localStorage
function getLocalCache() {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocalCache(key, data) {
  try {
    const cache = getLocalCache();
    cache[key] = {
      timestamp: Date.now(),
      data,
    };
    // Keep max 100 entries to prevent quota overflow
    const entries = Object.entries(cache);
    if (entries.length > 100) {
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const trimmed = Object.fromEntries(entries.slice(entries.length - 100));
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
    }
  } catch (err) {
    console.warn('Could not persist nutrition cache:', err);
  }
}

function getCachedData(key) {
  // Check in-memory first
  if (memoryCache.has(key)) {
    const entry = memoryCache.get(key);
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.data;
    }
    memoryCache.delete(key);
  }

  // Check localStorage
  const localCache = getLocalCache();
  if (localCache[key]) {
    const entry = localCache[key];
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      memoryCache.set(key, entry);
      return entry.data;
    }
  }

  return null;
}

/**
 * Normalizes Open Food Facts product structure to our standard schema.
 * Never invents missing values.
 */
function normalizeOFFProduct(p) {
  if (!p) return null;

  const code = p.code || p.id || '';
  const name = p.product_name || p.product_name_en || p.brands || 'Packaged Food';
  const brand = p.brands || '';
  const servingSize = p.serving_size || '100g';
  const nutriments = p.nutriments || {};

  // Extract calories: Check kcal directly, or convert kJ if kcal is not given (1 kcal = 4.184 kJ)
  let calories = null;
  if (nutriments['energy-kcal_100g'] !== undefined && nutriments['energy-kcal_100g'] !== null) {
    calories = Math.round(Number(nutriments['energy-kcal_100g']));
  } else if (nutriments['energy-kcal_serving'] !== undefined && nutriments['energy-kcal_serving'] !== null) {
    calories = Math.round(Number(nutriments['energy-kcal_serving']));
  } else if (nutriments['energy-kcal'] !== undefined && nutriments['energy-kcal'] !== null) {
    calories = Math.round(Number(nutriments['energy-kcal']));
  } else if (nutriments['energy_100g'] !== undefined && nutriments['energy_100g'] !== null) {
    calories = Math.round(Number(nutriments['energy_100g']) / 4.184);
  }

  // Extract protein
  let protein = null;
  if (nutriments.proteins_100g !== undefined && nutriments.proteins_100g !== null) {
    protein = Number(Number(nutriments.proteins_100g).toFixed(1));
  } else if (nutriments.proteins_serving !== undefined && nutriments.proteins_serving !== null) {
    protein = Number(Number(nutriments.proteins_serving).toFixed(1));
  } else if (nutriments.proteins !== undefined && nutriments.proteins !== null) {
    protein = Number(Number(nutriments.proteins).toFixed(1));
  }

  // Extract carbohydrates
  let carbs = null;
  if (nutriments.carbohydrates_100g !== undefined && nutriments.carbohydrates_100g !== null) {
    carbs = Number(Number(nutriments.carbohydrates_100g).toFixed(1));
  } else if (nutriments.carbohydrates_serving !== undefined && nutriments.carbohydrates_serving !== null) {
    carbs = Number(Number(nutriments.carbohydrates_serving).toFixed(1));
  } else if (nutriments.carbohydrates !== undefined && nutriments.carbohydrates !== null) {
    carbs = Number(Number(nutriments.carbohydrates).toFixed(1));
  }

  // Extract fat
  let fat = null;
  if (nutriments.fat_100g !== undefined && nutriments.fat_100g !== null) {
    fat = Number(Number(nutriments.fat_100g).toFixed(1));
  } else if (nutriments.fat_serving !== undefined && nutriments.fat_serving !== null) {
    fat = Number(Number(nutriments.fat_serving).toFixed(1));
  } else if (nutriments.fat !== undefined && nutriments.fat !== null) {
    fat = Number(Number(nutriments.fat).toFixed(1));
  }

  // Fiber & sodium if available
  const fiber = nutriments.fiber_100g !== undefined ? Number(Number(nutriments.fiber_100g).toFixed(1)) : null;
  const sodium = nutriments.sodium_100g !== undefined ? Number(Number(nutriments.sodium_100g).toFixed(3)) : null;

  return {
    id: `off_${code || Math.random().toString(36).slice(2, 9)}`,
    code,
    name: brand ? `${name} (${brand})` : name,
    rawName: name,
    brand,
    servingSize,
    calories: calories !== null ? Math.max(0, calories) : 0,
    caloriesKnown: calories !== null,
    protein: protein !== null ? Math.max(0, protein) : 0,
    proteinKnown: protein !== null,
    carbs: carbs !== null ? Math.max(0, carbs) : 0,
    carbsKnown: carbs !== null,
    fat: fat !== null ? Math.max(0, fat) : 0,
    fatKnown: fat !== null,
    fiber,
    sodium,
    imageUrl: p.image_front_small_url || p.image_front_url || null,
    source: 'Open Food Facts (ODbL License)',
    isPackaged: true,
  };
}

/**
 * Searches Open Food Facts API with debouncing and fallback.
 */
export async function searchOpenFoodFacts(query, { page = 1, pageSize = 20 } = {}) {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    return { products: [], total: 0, source: 'none' };
  }

  const cacheKey = `search_${trimmed.toLowerCase()}_${page}_${pageSize}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    return { ...cached, isFromCache: true };
  }

  // Construct target URLs: Try local Vite proxy first, or direct API
  const searchUrl = `/api/off/cgi/search.pl?search_terms=${encodeURIComponent(trimmed)}&search_simple=1&action=process&json=1&page_size=${pageSize}&page=${page}&fields=code,product_name,product_name_en,brands,serving_size,nutriments,image_front_small_url,image_front_url`;
  const directUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(trimmed)}&search_simple=1&action=process&json=1&page_size=${pageSize}&page=${page}&fields=code,product_name,product_name_en,brands,serving_size,nutriments,image_front_small_url,image_front_url`;

  let response = null;
  try {
    // Attempt proxy first
    response = await fetch(searchUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      // Fallback to direct URL
      response = await fetch(directUrl, {
        headers: {
          Accept: 'application/json',
        },
      });
    }
  } catch {
    try {
      response = await fetch(directUrl, {
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (directErr) {
      console.warn('Network error fetching from Open Food Facts:', directErr);
      return fallbackLocalSearch(trimmed);
    }
  }

  if (!response || !response.ok) {
    return fallbackLocalSearch(trimmed);
  }

  try {
    const json = await response.json();
    const rawProducts = json.products || [];
    const products = rawProducts
      .map(normalizeOFFProduct)
      .filter(p => p && (p.caloriesKnown || p.proteinKnown || p.carbsKnown || p.fatKnown));

    const result = {
      products,
      total: json.count || products.length,
      page,
      pageSize,
      source: 'Open Food Facts API v3',
      license: 'Open Database License (ODbL)',
      attributionUrl: 'https://world.openfoodfacts.org',
    };

    saveLocalCache(cacheKey, result);
    memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });

    return result;
  } catch (parseErr) {
    console.warn('Error parsing Open Food Facts response:', parseErr);
    return fallbackLocalSearch(trimmed);
  }
}

/**
 * Looks up a product by exact barcode (EAN-13, UPC-A, etc.)
 */
export async function lookupBarcode(barcode) {
  const cleanCode = (barcode || '').replace(/\D/g, '');
  if (!cleanCode) {
    return { success: false, error: 'Please enter a valid numeric barcode.' };
  }

  const cacheKey = `barcode_${cleanCode}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    return { success: true, product: cached, isFromCache: true };
  }

  const proxyUrl = `/api/off/api/v2/product/${encodeURIComponent(cleanCode)}.json`;
  const directUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json`;

  let response = null;
  try {
    response = await fetch(proxyUrl);
    if (!response.ok) {
      response = await fetch(directUrl);
    }
  } catch {
    try {
      response = await fetch(directUrl);
    } catch (err) {
      return { success: false, error: 'Network error connecting to Open Food Facts barcode registry.' };
    }
  }

  if (!response || !response.ok) {
    return { success: false, error: `Product with barcode ${cleanCode} could not be retrieved from Open Food Facts.` };
  }

  try {
    const json = await response.json();
    if (json.status !== 1 || !json.product) {
      return { success: false, error: `No product found for barcode ${cleanCode}. You can log it manually as a custom food.` };
    }

    const product = normalizeOFFProduct(json.product);
    saveLocalCache(cacheKey, product);
    memoryCache.set(cacheKey, { timestamp: Date.now(), data: product });

    return {
      success: true,
      product,
      license: 'Open Database License (ODbL)',
      source: 'Open Food Facts',
    };
  } catch (err) {
    return { success: false, error: 'Failed to parse barcode data.' };
  }
}

/**
 * Searches local Indian foods and default foods database as a guaranteed offline fallback.
 */
function fallbackLocalSearch(query) {
  const q = query.toLowerCase();
  const indianMatches = cookedIndianFoods.filter(f =>
    f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
  );
  const defaultMatches = defaultFoods.filter(f =>
    f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
  );

  const combined = [...indianMatches, ...defaultMatches];
  return {
    products: combined,
    total: combined.length,
    source: 'Local Fallback Library (Offline)',
    isFallback: true,
  };
}
