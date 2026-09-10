import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from '../server.mjs';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('lost response retry is idempotent and stale writer keeps its draft', { timeout: 60_000 }, async t => {
  assert.ok(existsSync(CHROME), 'Google Chrome required for headless e2e');
  const directory = mkdtempSync(join(tmpdir(), 'jett-learning-browser-'));
  const server = await startServer({ databasePath: join(directory, 'lab.sqlite') });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  t.after(async () => { await browser.close(); await server.close(); rmSync(directory, { recursive: true, force: true }); });

  const alexContext = await browser.createBrowserContext();
  const samContext = await browser.createBrowserContext();
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();
  await Promise.all([alex.goto(server.url), sam.goto(server.url)]);
  await alex.click('[data-persona="alex"]');
  await sam.click('[data-persona="sam"]');
  await Promise.all([alex.waitForSelector('.workspace:not([hidden])'), sam.waitForSelector('.workspace:not([hidden])')]);

  await alex.type('#draft', 'One durable operation');
  await alex.click('#lose-response');
  await alex.click('#send');
  await alex.waitForFunction(() => !document.querySelector('#retry').hidden);
  assert.match(await alex.$eval('#delivery-state', node => node.textContent), /No confirmation received/);
  await alex.click('#retry');
  await alex.waitForFunction(() => document.querySelector('#delivery-state').dataset.kind === 'saved');
  assert.equal(await alex.$$eval('#entries li', nodes => nodes.length), 1);
  assert.match(await alex.$eval('#delivery-state', node => node.textContent), /no duplicate/i);

  await sam.type('#draft', 'Sam keeps this conflicting draft');
  await sam.click('#send');
  await sam.waitForFunction(() => document.querySelector('#delivery-state').dataset.kind === 'conflict');
  assert.equal(await sam.$eval('#draft', node => node.value), 'Sam keeps this conflicting draft');
  assert.equal(await sam.$eval('#retry', node => node.hidden), true);
  await sam.reload({ waitUntil: 'load' });
  await sam.click('[data-persona="sam"]');
  await sam.waitForFunction(() => document.querySelector('#draft').value.length > 0);
  assert.equal(await sam.$eval('#draft', node => node.value), 'Sam keeps this conflicting draft');
});

test('desktop and narrow UI have no automated axe violations', { timeout: 60_000 }, async t => {
  assert.ok(existsSync(CHROME), 'Google Chrome required for headless e2e');
  const directory = mkdtempSync(join(tmpdir(), 'jett-learning-a11y-'));
  const server = await startServer({ databasePath: join(directory, 'lab.sqlite') });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  t.after(async () => { await browser.close(); await server.close(); rmSync(directory, { recursive: true, force: true }); });
  const axe = readFileSync(new URL('../../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 760 }]) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(server.url);
    await page.evaluate(axe);
    const result = await page.evaluate(() => window.axe.run(document));
    assert.deepEqual(result.violations.map(item => ({ id: item.id, nodes: item.nodes.length })), [], JSON.stringify(result.violations, null, 2));
    await page.close();
  }
});
