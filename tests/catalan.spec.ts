import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import nspell from 'nspell';
import { CA } from '../src/i18n/ca';
import { translate } from '../src/i18n';
import { formatChartMonth, formatLongDate, formatMonth, formatMonthRange, formatOfMonth } from '../src/utils/dateLabels';

// Area de cliente en catalan (de momento solo demo1). Todo con datos inventados de la prueba.

// El diccionario catalan entero tarda minutos en cargarse: se carga solo con las raices que empiezan
// como las palabras que hay que revisar (las formas de cada palabra comparten el principio).
const plain = (word: string) => word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const loadCatalan = (words: string[]) => {
  const folder = path.join(process.cwd(), 'node_modules', 'dictionary-ca');
  const starts = new Set(words.map((word) => plain(word).slice(0, 3)));
  const stems = fs.readFileSync(path.join(folder, 'index.dic'), 'utf8').split('\n').slice(1).filter((line) => {
    const stem = plain(line.split('/')[0]);
    return stem.length <= 3 || starts.has(stem.slice(0, 3));
  });
  return nspell(fs.readFileSync(path.join(folder, 'index.aff')), `${stems.length}\n${stems.join('\n')}`);
};

// Nombres propios, siglas y abreviaturas de los graficos que el diccionario no trae.
const ALLOWED = new Set([
  'TWR', 'EUR', 'PDF', 'ESC', 'GPS', 'JIGSA', 'FZCO', 'Brokering', 'Portfolio', 'Manager', 'Investment', 'Report',
  'Building', 'Dubai', 'Digital', 'Park', 'Silicon', 'Oasis', 'United', 'Arab', 'Emirates', 'Capital', 'CAPITAL',
  'BROKERING', 'demo1', 'Demo', 'Febr', 'Ag', 'Abr', 'Gen', 'Jul', 'Oct', 'Nov', 'Des', 'Set', 'intramensual', 'vs',
  // "k" de los ejes (50k €) y pronombres sueltos de formas como "veure'n".
  'k', 'n', 'l', 'ls', 'ns', 'm', 't', 's'
]);

const misspelled = (text: string) => {
  // Palabras con l·l, con pronombres (desar-ho, enviar-lo) y con articulo apostrofado (l'aportació).
  const tokens = [...new Set(text.match(/(?:[\p{L}]['’])?\p{L}(?:[\p{L}\d]|·\p{L})*(?:-\p{L}+)*/gu) ?? [])];
  const isAllowed = (word: string) => ALLOWED.has(word) || [...ALLOWED].some((item) => item.toUpperCase() === word);
  const pairs = tokens
    .filter((raw) => !/\d/.test(raw) && !isAllowed(raw))
    .map((raw) => ({ raw, word: raw.replace(/^[ldsnmtLDSNMT]['’]/, '') }))
    .filter(({ word }) => word && !isAllowed(word));
  const catalan = loadCatalan(pairs.map(({ word }) => word));
  return pairs
    .filter(({ word }) => !catalan.correct(word) && !catalan.correct(word.toLowerCase()))
    .map(({ raw }) => raw);
};

test('every Catalan translation is spelled correctly and keeps its variables', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'No depende de la pantalla.');
  const problems: string[] = [];
  for (const [spanish, text] of Object.entries(CA)) {
    const wrong = misspelled(text.replace(/\{\w+\}/g, ' '));
    if (wrong.length) problems.push(`${wrong.join(', ')}  →  ${text}`);
    const vars = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort().join();
    if (vars(spanish) !== vars(text)) problems.push(`variables distintas: ${spanish}`);
  }
  expect(problems).toEqual([]);
});

test('Catalan dates and apostrophes', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'No depende de la pantalla.');
  expect(formatChartMonth('Dic 2025', 'ca')).toBe('Des 2025');
  expect(formatChartMonth('Mar 2026', 'ca')).toBe('Març 2026');
  expect(formatChartMonth('Mar 2026', 'es')).toBe('Mar 2026');
  expect(formatMonth('Abr 2026', 'ca')).toBe('Abril 2026');
  expect(formatMonth('Abr 2026', 'es')).toBe('Abril 2026');
  expect(formatMonthRange('Oct 2025', 'Feb 2026', 'ca')).toBe('Octubre 2025 – Febrer 2026');
  expect(formatOfMonth('2026-04', 'ca')).toBe("d'abril de 2026");
  expect(formatOfMonth('2026-03', 'ca')).toBe('de març de 2026');
  expect(formatLongDate(new Date(2026, 7, 1), 'ca')).toBe("1 d'agost de 2026");
  expect(formatLongDate(new Date(2026, 10, 10), 'es')).toBe('10 de noviembre de 2026');
  expect(translate('ca', 'Desde {mes}', { mes: 'Abr 2026' })).toBe("Des d'Abr 2026");
  expect(translate('ca', 'Desde {mes}', { mes: 'Març 2026' })).toBe('Des de Març 2026');
  expect(translate('ca', 'Rentabilidad {mes}', { mes: 'abril de 2026' })).toBe("Rendibilitat d'abril de 2026");
  expect(translate('es', 'Rentabilidad {mes}', { mes: 'abril de 2026' })).toBe('Rentabilidad abril de 2026');
  expect(translate('ca', 'Texto sin traducir')).toBe('Texto sin traducir');
});

const mount = async (page: Page, lang: 'es' | 'ca') => {
  await page.goto('/');
  await page.evaluate(async ({ harnessPath, language }) => {
    const harness = await import(/* @vite-ignore */ harnessPath);
    harness.mountReportViewInLang(language);
  }, { harnessPath: '/tests/fixtures/report-view-harness.tsx', language: lang });
  await expect(page.locator('.report-pro-wide-sheet')).toBeVisible();
  await page.waitForTimeout(300);
};

// Todo el texto que ve o escucha el cliente: lo visible, aria-label, title, data-tooltip y placeholder.
const pageTexts = (page: Page) => page.evaluate(() => {
  const root = document.getElementById('root');
  if (!root) return [];
  const texts = [root.innerText];
  root.querySelectorAll('[aria-label], [title], [data-tooltip], [placeholder]').forEach((element) => {
    ['aria-label', 'title', 'data-tooltip', 'placeholder'].forEach((name) => {
      const value = element.getAttribute(name);
      if (value) texts.push(value);
    });
  });
  root.querySelectorAll('option').forEach((option) => texts.push(option.textContent ?? ''));
  return texts;
});

test('demo1 report in Catalan: no Spanish left and no spelling mistakes', async ({ page }, testInfo) => {
  test.skip(!['ipad-mini', 'iphone-13'].includes(testInfo.project.name), 'Comprobado en tablet y movil.');
  await page.setViewportSize(testInfo.project.name === 'ipad-mini' ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  await mount(page, 'ca');

  // Abre los detalles para revisar tambien su texto.
  const detailButtons = page.locator('.report-pro-detail-button[aria-expanded="false"]');
  for (let index = 0; index < Math.min(await detailButtons.count(), 3); index += 1) {
    await detailButtons.first().click();
  }
  const texts = (await pageTexts(page)).join('\n');
  expect(misspelled(texts)).toEqual([]);

  // Palabras que delatan castellano sin traducir.
  const spanishWords = texts.match(/(?<![\p{L}])(Rentabilidad|rentabilidad|Beneficio|beneficio|Aportación|aportación|Aportaciones|aportaciones|Retiradas|retiradas|Cierre|cierre|cierres|Periodo|periodo|Detalle|Ver|Ocultar|Pulsa|Desde|Hasta|Desliza|todos|los|meses|del año|Dic|Ene|Ago|Saldo al cierre|está|también|qué|cómo|según)(?![\p{L}])/gu) ?? [];
  expect(spanishWords).toEqual([]);

  await expect(page.getByText('Capital aportat').first()).toBeVisible();
  await expect(page.locator('.pm-trend-month').last()).toHaveText('Març 2026');
});

test('Spanish report is unchanged', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-mini', 'Comprobado en escritorio.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mount(page, 'es');
  await expect(page.getByText('Capital aportado').first()).toBeVisible();
  await expect(page.locator('.pm-trend-month').last()).toHaveText('Mar 2026');
  await expect(page.locator('.report-pro-bar-label').last()).toHaveText('Mar 2026');
  const texts = (await pageTexts(page)).join('\n');
  expect(texts).not.toMatch(/Rendibilitat|Aportació(?!n)|Tancament|Des 2025|Març/);
});

// Mide los textos que no deben crecer: si en catalan algo ocupa mas lineas o se sale, falla.
const measure = (page: Page) => page.evaluate(() => {
  const root = document.getElementById('root');
  if (!root) return { overflow: true, boxes: [] as Array<{ text: string; height: number; clipped: boolean }> };
  const selector = [
    'button', 'th', 'label', 'select', 'h3', 'h4', '.report-pro-info-card p', '.report-pro-info-card span',
    '.report-pro-kpi span', '.report-pro-bar-label', '.pm-trend-month', '.pm-trend-stat span', '.pm-trend-stat small',
    '.report-pro-closing-movement', '.report-pro-waterfall span', '.report-pro-waterfall strong'
  ].join(', ');
  const boxes = [...root.querySelectorAll<HTMLElement>(selector)]
    .filter((element) => element.offsetParent !== null)
    .map((element) => ({
      text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 60),
      height: Math.round(element.getBoundingClientRect().height),
      clipped: element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== 'visible'
    }));
  return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, boxes };
});

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 1000 },
  { name: 'portatil', width: 1180, height: 820 },
  { name: 'movil', width: 390, height: 844 }
]) {
  test(`Catalan keeps the Spanish layout (${viewport.name})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'ipad-mini', 'Tamaños elegidos abajo.');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mount(page, 'es');
    const spanish = await measure(page);
    await mount(page, 'ca');
    const catalanLayout = await measure(page);

    expect(catalanLayout.overflow).toBe(false);
    expect(catalanLayout.boxes.length).toBe(spanish.boxes.length);
    const grown = catalanLayout.boxes
      .map((box, index) => ({ ...box, before: spanish.boxes[index] }))
      .filter((box) => box.height > box.before.height + 2 || (box.clipped && !box.before.clipped))
      .map((box) => `${box.before.text} → ${box.text} (${box.before.height}px → ${box.height}px${box.clipped ? ', cortado' : ''})`);
    expect(grown).toEqual([]);
  });
}

test('language button asks before changing and the first visit asks once', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-13', 'Comprobado en movil.');
  await page.goto('/');
  await page.evaluate(async (harnessPath) => {
    const harness = await import(/* @vite-ignore */ harnessPath);
    harness.mountLanguageChoice(true);
  }, '/tests/fixtures/report-view-harness.tsx');

  // Primera vez: elige idioma.
  const gate = page.getByRole('dialog', { name: /En quin idioma vols veure la teva àrea/ });
  await expect(gate).toBeVisible();
  await gate.getByRole('button', { name: 'Català' }).click();
  await expect(gate).toHaveCount(0);
  await expect(page.locator('#lang-sample')).toHaveText('Capital aportat');

  // Cambiar a castellano solo esta vez: la pregunta sale en castellano (el idioma pulsado).
  await page.getByRole('button', { name: 'Castellano' }).click();
  const ask = page.getByRole('dialog', { name: '¿Ver tu área en castellano?' });
  await expect(ask.getByRole('button')).toHaveText(['Sí, y guardarlo para las próximas veces', 'Solo esta vez', 'Cancelar']);
  await ask.getByRole('button', { name: 'Solo esta vez' }).click();
  await expect(page.locator('#lang-sample')).toHaveText('Capital aportado');

  // Volver a catalan: la pregunta sale en catalan.
  await page.getByRole('button', { name: 'Català' }).click();
  const back = page.getByRole('dialog', { name: 'Vols veure la teva àrea en català?' });
  await expect(back.getByRole('button')).toHaveText(['Sí, i desar-ho per a les properes vegades', 'Només aquesta vegada', 'Cancel·lar']);
  await back.getByRole('button', { name: 'Cancel·lar' }).click();
  await expect(page.locator('#lang-sample')).toHaveText('Capital aportado');
  await page.getByRole('button', { name: 'Català' }).click();
  await page.getByRole('button', { name: 'Sí, i desar-ho per a les properes vegades' }).click();
  await expect(page.locator('#lang-sample')).toHaveText('Capital aportat');

  const log = await page.evaluate(() => (window as unknown as { langLog: string[] }).langLog);
  expect(log).toEqual(['save:ca', 'once:es', 'save:ca']);
  await expect(page.locator('.lc-switch .is-active')).toContainText('CA');
});
