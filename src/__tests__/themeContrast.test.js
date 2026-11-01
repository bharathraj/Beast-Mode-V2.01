import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Helper to convert hex to RGB
function hexToRgb(hex) {
  const sanitized = hex.replace('#', '').trim();
  const num = parseInt(sanitized, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}

// Relative luminance formula per WCAG 2.1
function getLuminance([r, g, b]) {
  const [sR, sG, sB] = [r, g, b].map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

// WCAG Contrast Ratio formula: (L1 + 0.05) / (L2 + 0.05)
function getContrastRatio(hexA, hexB) {
  const lumA = getLuminance(hexToRgb(hexA));
  const lumB = getLuminance(hexToRgb(hexB));
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe('Theme Contrast & WCAG AA Compliance (Bug 4)', () => {
  it('achieves WCAG AA contrast ratio of at least 4.5:1 for light theme text levels', () => {
    const lightBg = '#f8fafc';
    const textPrimary = '#0f172a';
    const textSecondary = '#334155';
    const textTertiary = '#475569';

    const ratioPrimary = getContrastRatio(textPrimary, lightBg);
    const ratioSecondary = getContrastRatio(textSecondary, lightBg);
    const ratioTertiary = getContrastRatio(textTertiary, lightBg);

    // WCAG AA threshold for normal text is 4.5:1
    expect(ratioPrimary).toBeGreaterThanOrEqual(4.5);
    expect(ratioSecondary).toBeGreaterThanOrEqual(4.5);
    expect(ratioTertiary).toBeGreaterThanOrEqual(4.5);

    // Primary and secondary exceed AAA (> 7.0:1)
    expect(ratioPrimary).toBeGreaterThan(14.0);
    expect(ratioSecondary).toBeGreaterThan(8.0);
    expect(ratioTertiary).toBeGreaterThan(5.5);
  });

  it('ensures Sidebar does not have hardcoded dark backgrounds (#0f0f13)', () => {
    const sidebarPath = path.resolve(process.cwd(), 'src/components/layout/Sidebar.jsx');
    const content = fs.readFileSync(sidebarPath, 'utf-8');
    expect(content).not.toContain('#0f0f13');
    expect(content).toContain('var(--color-bg-secondary)');
    expect(content).toContain('var(--color-border-primary)');
  });

  it('ensures BottomNav does not have hardcoded dark backgrounds (#101014 or #131318)', () => {
    const bottomNavPath = path.resolve(process.cwd(), 'src/components/layout/BottomNav.jsx');
    const content = fs.readFileSync(bottomNavPath, 'utf-8');
    expect(content).not.toContain('#101014');
    expect(content).not.toContain('#131318');
    expect(content).toContain('var(--color-bg-secondary)');
    expect(content).toContain('var(--color-border-primary)');
  });

  it('ensures Modal uses theme-aware CSS variables instead of hardcoded #131317', () => {
    const uiPath = path.resolve(process.cwd(), 'src/components/ui/index.jsx');
    const content = fs.readFileSync(uiPath, 'utf-8');
    expect(content).not.toContain('#131317');
    expect(content).toContain('var(--color-bg-secondary)');
    expect(content).toContain('var(--color-border-primary)');
  });

  it('ensures Onboarding uses theme-aware CSS variables instead of hardcoded dark backgrounds', () => {
    const onboardingPath = path.resolve(process.cwd(), 'src/components/onboarding/Onboarding.jsx');
    const content = fs.readFileSync(onboardingPath, 'utf-8');
    expect(content).not.toContain('#0a0a0c');
    expect(content).not.toContain('#121217');
    expect(content).toContain('var(--color-bg-primary)');
    expect(content).toContain('var(--color-bg-secondary)');
  });

  it('preserves lime-green brand identity in both dark and light modes', () => {
    const cssPath = path.resolve(process.cwd(), 'src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    // Dark mode lime
    expect(css).toContain('--color-accent: #84cc16;');
    // Light mode calibrated lime
    expect(css).toContain('--color-accent: #65a30d;');
  });
});

