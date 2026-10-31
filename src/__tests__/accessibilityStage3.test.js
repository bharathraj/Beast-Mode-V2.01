import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Stage 3 - Accessibility Implementation Verification', () => {
  it('Modal component implements Escape-key dismissal, focus trapping, and focus restoration', () => {
    const modalPath = path.resolve(__dirname, '../components/ui/index.jsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    // 1. Escape key handler
    expect(content).toMatch(/e\.key\s*===\s*['"]Escape['"]/);
    expect(content).toMatch(/onClose\(\)/);

    // 2. Tab focus trap
    expect(content).toMatch(/e\.key\s*===\s*['"]Tab['"]/);
    expect(content).toMatch(/e\.shiftKey/);
    expect(content).toMatch(/focus\(\)/);

    // 3. Focus restoration
    expect(content).toMatch(/previousActiveElementRef/);
    expect(content).toMatch(/document\.activeElement/);

    // 4. Accessibility dialog semantics
    expect(content).toMatch(/role=["']dialog["']/);
    expect(content).toMatch(/aria-modal=["']true["']/);
    expect(content).toMatch(/aria-labelledby=/);
    expect(content).toMatch(/aria-label=["']Close dialog["']/);
  });

  it('SettingsPage form labels have matching htmlFor and input ids', () => {
    const settingsPath = path.resolve(__dirname, '../pages/SettingsPage.jsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Verify profile inputs
    expect(content).toMatch(/htmlFor=["']settings-profile-name["']/);
    expect(content).toMatch(/id=["']settings-profile-name["']/);

    expect(content).toMatch(/htmlFor=["']settings-profile-height["']/);
    expect(content).toMatch(/id=["']settings-profile-height["']/);

    expect(content).toMatch(/htmlFor=["']settings-profile-height-unit["']/);
    expect(content).toMatch(/id=["']settings-profile-height-unit["']/);

    // Verify preference inputs
    expect(content).toMatch(/htmlFor=["']settings-pref-units["']/);
    expect(content).toMatch(/id=["']settings-pref-units["']/);

    expect(content).toMatch(/htmlFor=["']settings-pref-weekstart["']/);
    expect(content).toMatch(/id=["']settings-pref-weekstart["']/);
  });

  it('NutritionPage form labels have matching htmlFor and input ids', () => {
    const nutritionPath = path.resolve(__dirname, '../pages/NutritionPage.jsx');
    const content = fs.readFileSync(nutritionPath, 'utf8');

    // Water tracking input
    expect(content).toMatch(/htmlFor=["']custom-water-input["']/);
    expect(content).toMatch(/id=["']custom-water-input["']/);

    // Target modal inputs
    expect(content).toMatch(/htmlFor=["']target-calories-input["']/);
    expect(content).toMatch(/id=["']target-calories-input["']/);
    expect(content).toMatch(/htmlFor=["']target-protein-input["']/);
    expect(content).toMatch(/id=["']target-protein-input["']/);

    // Meal entry overrides
    expect(content).toMatch(/htmlFor=["']log-meal-servings["']/);
    expect(content).toMatch(/id=["']log-meal-servings["']/);
    expect(content).toMatch(/htmlFor=["']override-calories["']/);
    expect(content).toMatch(/id=["']override-calories["']/);

    // Custom food inputs
    expect(content).toMatch(/htmlFor=["']custom-food-name["']/);
    expect(content).toMatch(/id=["']custom-food-name["']/);
  });

  it('TrainPage and MoneyPage modals have matching htmlFor and input ids', () => {
    const trainPath = path.resolve(__dirname, '../pages/TrainPage.jsx');
    const trainContent = fs.readFileSync(trainPath, 'utf8');

    // Body measurements modal
    expect(trainContent).toMatch(/htmlFor=["']body-measurement-date["']/);
    expect(trainContent).toMatch(/id=["']body-measurement-date["']/);
    expect(trainContent).toMatch(/htmlFor=["']body-measurement-weight["']/);
    expect(trainContent).toMatch(/id=["']body-measurement-weight["']/);
    expect(trainContent).toMatch(/htmlFor=["']body-measurement-waist["']/);
    expect(trainContent).toMatch(/id=["']body-measurement-waist["']/);

    // Routine modal
    expect(trainContent).toMatch(/htmlFor=["']routine-name-input["']/);
    expect(trainContent).toMatch(/id=["']routine-name-input["']/);

    const moneyPath = path.resolve(__dirname, '../pages/MoneyPage.jsx');
    const moneyContent = fs.readFileSync(moneyPath, 'utf8');

    // Savings goals modal
    expect(moneyContent).toMatch(/htmlFor=["']savings-goal-name["']/);
    expect(moneyContent).toMatch(/id=["']savings-goal-name["']/);
    expect(moneyContent).toMatch(/htmlFor=["']savings-goal-target["']/);
    expect(moneyContent).toMatch(/id=["']savings-goal-target["']/);
  });

  it('index.css provides visible keyboard focus indicators with focus-visible', () => {
    const cssPath = path.resolve(__dirname, '../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    expect(cssContent).toMatch(/button:focus-visible/);
    expect(cssContent).toMatch(/a:focus-visible/);
    expect(cssContent).toMatch(/input:focus-visible/);
    expect(cssContent).toMatch(/outline:\s*2px\s+solid\s+var\(--color-accent\)/);
  });
});

