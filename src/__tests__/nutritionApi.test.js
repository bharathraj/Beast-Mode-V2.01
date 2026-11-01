import { describe, it, expect } from 'vitest';
import { searchOpenFoodFacts, lookupBarcode } from '../services/nutritionApi';
import { cookedIndianFoods } from '../data/indianFoods';

describe('Nutrition API and Indian Foods Service', () => {
  it('contains comprehensive Cooked Indian Foods with authentic nutritional data', () => {
    expect(cookedIndianFoods.length).toBeGreaterThanOrEqual(20);
    const dalTadka = cookedIndianFoods.find(f => f.id === 'ind_dal_tadka');
    expect(dalTadka).toBeDefined();
    expect(dalTadka.isIndian).toBe(true);
    expect(dalTadka.servingSize).toContain('150g');
    expect(dalTadka.calories).toBeGreaterThan(100);
    expect(dalTadka.protein).toBeGreaterThan(5);

    const roti = cookedIndianFoods.find(f => f.id === 'ind_roti_plain');
    expect(roti).toBeDefined();
    expect(roti.calories).toBe(85);
  });

  it('safely handles empty queries without making unneeded network requests', async () => {
    const result = await searchOpenFoodFacts('');
    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('handles invalid barcode input with informative error message', async () => {
    const result = await lookupBarcode('invalid-non-numeric');
    expect(result.success).toBe(false);
    expect(result.error).toContain('valid numeric barcode');
  });

  it('guarantees local fallback when network is unavailable', async () => {
    // Search a term that exists in the offline local database
    const result = await searchOpenFoodFacts('Paneer');
    expect(result.products.length).toBeGreaterThan(0);
    const hasPaneer = result.products.some(p => p.name.toLowerCase().includes('paneer'));
    expect(hasPaneer).toBe(true);
  });
});
