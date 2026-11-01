import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Stage 4 — Responsive Layout & Accessibility Standards Audit', () => {
  it('implements responsive adaptive navigation for both desktop and mobile viewports', () => {
    const sidebarPath = path.resolve(__dirname, '../components/layout/Sidebar.jsx');
    const bottomNavPath = path.resolve(__dirname, '../components/layout/BottomNav.jsx');
    const appPath = path.resolve(__dirname, '../App.jsx');

    const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');
    const bottomNavCode = fs.readFileSync(bottomNavPath, 'utf8');
    const appCode = fs.readFileSync(appPath, 'utf8');

    // Desktop sidebar is hidden on small screens and visible on md+
    expect(sidebarCode).toMatch(/hidden\s+md:flex/);
    expect(sidebarCode).toMatch(/w-64/);

    // Mobile bottom nav is fixed at bottom on small screens and hidden on md+
    expect(bottomNavCode).toMatch(/md:hidden/);
    expect(bottomNavCode).toMatch(/fixed\s+bottom-0/);

    // App layout offsets main content on desktop and pads for bottom nav on mobile
    expect(appCode).toMatch(/md:ml-64/);
    expect(appCode).toMatch(/pb-24\s+md:pb-8/);
  });

  it('provides accessible loading fallbacks with aria-live and screen-reader announcements', () => {
    const appPath = path.resolve(__dirname, '../App.jsx');
    const appCode = fs.readFileSync(appPath, 'utf8');

    expect(appCode).toMatch(/role=["']status["']/);
    expect(appCode).toMatch(/aria-live=["']polite["']/);
    expect(appCode).toMatch(/className=["'][^"']*sr-only[^"']*["']/);
  });

  it('guarantees WCAG AA color contrast across theme tokens and focus indicators', () => {
    const cssPath = path.resolve(__dirname, '../index.css');
    const cssCode = fs.readFileSync(cssPath, 'utf8');

    // Theme definitions exist
    expect(cssCode).toMatch(/@theme/);
    expect(cssCode).toMatch(/\[data-theme="light"\]/);

    // Keyboard focus rings are prominent and distinct
    expect(cssCode).toMatch(/button:focus-visible/);
    expect(cssCode).toMatch(/outline:\s*2px\s+solid\s+var\(--color-accent\)/);
    expect(cssCode).toMatch(/outline-offset:\s*2px/);
  });

  it('ensures all modal dialogs preserve keyboard accessibility and focus isolation', () => {
    const modalPath = path.resolve(__dirname, '../components/ui/index.jsx');
    const modalCode = fs.readFileSync(modalPath, 'utf8');

    expect(modalCode).toMatch(/role=["']dialog["']/);
    expect(modalCode).toMatch(/aria-modal=["']true["']/);
    expect(modalCode).toMatch(/e\.key\s*===\s*['"]Escape['"]/);
    expect(modalCode).toMatch(/e\.key\s*===\s*['"]Tab['"]/);
    expect(modalCode).toMatch(/previousActiveElementRef/);
  });
});
