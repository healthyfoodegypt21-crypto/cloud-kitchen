import { describe, expect, it } from 'vitest';
import { buildDemoMealsForBrand, buildDemoPackagesForBrand, isBrandCatalogComplete } from '@/store/menuCatalog';

const BRAND_NAMES = ['Healthy Food', 'Healthy Station', 'Protein Box'];

describe('menu catalog demo builders', () => {
  it('builds core meals plus salad and snacks categories for every company', () => {
    for (const brandName of BRAND_NAMES) {
      const meals = buildDemoMealsForBrand(brandName);
      const packages = buildDemoPackagesForBrand(brandName);

      expect(meals).toHaveLength(44);
      expect(packages).toHaveLength(5);
      expect(meals.filter((meal) => meal.category === 'meat')).toHaveLength(10);
      expect(meals.filter((meal) => meal.category === 'chicken')).toHaveLength(10);
      expect(meals.filter((meal) => meal.category === 'fish')).toHaveLength(10);
      expect(meals.filter((meal) => meal.category === 'mix')).toHaveLength(10);
      expect(meals.filter((meal) => meal.category === 'salad')).toHaveLength(2);
      expect(meals.filter((meal) => meal.category === 'snacks')).toHaveLength(2);
    }
  });

  it('builds distinct meal names for each company', () => {
    const healthyFoodNames = new Set(buildDemoMealsForBrand('Healthy Food').map((meal) => meal.name));
    const healthyStationNames = new Set(buildDemoMealsForBrand('Healthy Station').map((meal) => meal.name));
    const proteinBoxNames = new Set(buildDemoMealsForBrand('Protein Box').map((meal) => meal.name));

    const commonFoodAndStation = [...healthyFoodNames].filter((name) => healthyStationNames.has(name));
    const commonFoodAndProtein = [...healthyFoodNames].filter((name) => proteinBoxNames.has(name));
    const commonStationAndProtein = [...healthyStationNames].filter((name) => proteinBoxNames.has(name));

    expect(commonFoodAndStation).toHaveLength(0);
    expect(commonFoodAndProtein).toHaveLength(0);
    expect(commonStationAndProtein).toHaveLength(0);
  });

  it('detects incomplete catalogs correctly', () => {
    const meals = buildDemoMealsForBrand('Healthy Food');
    const packages = buildDemoPackagesForBrand('Healthy Food').map((pkg) => ({
      id: pkg.name,
      brand_id: 'brand-1',
      name: pkg.name,
      days_count: pkg.days_count,
      price: pkg.price,
      created_at: '2026-03-22T00:00:00.000Z',
      updated_at: '2026-03-22T00:00:00.000Z',
      items: [],
    }));

    expect(isBrandCatalogComplete([], [])).toBe(false);
    expect(isBrandCatalogComplete(meals.slice(0, 4).map((meal, index) => ({
      id: `meal-${index}`,
      brand_id: 'brand-1',
      created_at: '2026-03-22T00:00:00.000Z',
      updated_at: '2026-03-22T00:00:00.000Z',
      ...meal,
    })), packages.slice(0, 1))).toBe(false);
    expect(isBrandCatalogComplete(meals.map((meal, index) => ({
      id: `meal-full-${index}`,
      brand_id: 'brand-1',
      created_at: '2026-03-22T00:00:00.000Z',
      updated_at: '2026-03-22T00:00:00.000Z',
      ...meal,
    })), packages)).toBe(true);
  });
});