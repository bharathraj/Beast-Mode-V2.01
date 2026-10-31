import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveBasePath } from '../../vite.config.js';

describe('Deployment Routing and Base Configuration (Bug 2)', () => {
  it('resolves base to root "/" on Vercel deployments', () => {
    const base = resolveBasePath({ VERCEL: '1' });
    expect(base).toBe('/');
  });

  it('resolves base to root "/" on Vercel even if GITHUB_ACTIONS is coincidentally present', () => {
    const base = resolveBasePath({ VERCEL: '1', GITHUB_ACTIONS: 'true' });
    expect(base).toBe('/');
  });

  it('resolves base to repository subpath on GitHub Pages workflows', () => {
    const base = resolveBasePath({ GITHUB_ACTIONS: 'true' });
    expect(base).toBe('/Beast-Mode-V2.01/');
  });

  it('derives subpath from GITHUB_REPOSITORY on GitHub Pages', () => {
    const base = resolveBasePath({
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'testuser/my-custom-beastmode',
    });
    expect(base).toBe('/my-custom-beastmode/');
  });

  it('honors explicit VITE_BASE_PATH override and normalizes slashes', () => {
    expect(resolveBasePath({ VITE_BASE_PATH: '/app/' })).toBe('/app/');
    expect(resolveBasePath({ VITE_BASE_PATH: 'custom-sub' })).toBe('/custom-sub/');
    expect(resolveBasePath({ VITE_BASE_PATH: '/root-override' })).toBe('/root-override/');
  });

  it('defaults to root "/" for local development, preview, and standard domain hosting', () => {
    const base = resolveBasePath({});
    expect(base).toBe('/');
  });

  it('verifies vercel.json exists and contains SPA catch-all rewrite rule', () => {
    const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');
    expect(fs.existsSync(vercelConfigPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
    expect(config.rewrites).toBeDefined();
    expect(Array.isArray(config.rewrites)).toBe(true);

    const hasCatchAll = config.rewrites.some(
      (r) => r.source === '/(.*)' && r.destination === '/index.html'
    );
    expect(hasCatchAll).toBe(true);
  });

  it('verifies public/404.html exists for GitHub Pages SPA navigation', () => {
    const notFoundPath = path.resolve(process.cwd(), 'public/404.html');
    expect(fs.existsSync(notFoundPath)).toBe(true);
    const content = fs.readFileSync(notFoundPath, 'utf-8');
    expect(content).toContain('Single Page Apps for GitHub Pages');
  });

  it('verifies index.html links to valid /favicon.svg instead of missing /vite.svg', () => {
    const indexPath = path.resolve(process.cwd(), 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain('href="/favicon.svg"');
    expect(content).not.toContain('href="/vite.svg"');
  });
});

