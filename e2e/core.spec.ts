import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const testPhoto = resolve('public/pwa-192x192.png')

test.beforeEach(async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('./favicon.svg')
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('food-life-archive')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB cleanup was blocked'))
  }))
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.goto('./#/record')
})

test('mobile core flow: photo, editable mock suggestion, comparisons, ranking', async ({ page }) => {
  await page.getByTestId('load-demo').click()
  await expect(page.getByTestId('start-record')).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles(testPhoto)
  await expect(page.getByTestId('suggestion-form')).toBeVisible()
  await expect(page.getByText(/验证版模拟识别/)).toBeVisible()
  await page.getByTestId('food-name').fill('雨夜的煲仔饭')
  await page.getByTestId('confirm-entry').click()
  await expect(page.getByTestId('comparison-view')).toBeVisible()
  for (let count = 0; count < 4; count += 1) {
    if (await page.getByTestId('completion-card').isVisible().catch(() => false)) break
    if (!await page.getByTestId('choose-new').isVisible().catch(() => false)) break
    await expect(page.getByTestId('choose-new')).toBeEnabled()
    await page.getByTestId('choose-new').click()
    await page.waitForFunction(() => {
      if (document.querySelector('[data-testid="completion-card"]')) return true
      const choice = document.querySelector<HTMLButtonElement>('[data-testid="choose-new"]')
      return Boolean(choice && !choice.disabled)
    })
  }
  await expect(page.getByTestId('completion-card')).toContainText('人生榜第 1 位')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('ranking-page')).toContainText('雨夜的煲仔饭')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  const navButtons = await page.locator('.bottom-nav button').all()
  for (const button of navButtons) expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
})

test('defer keeps the entry locally in pending', async ({ page }) => {
  await page.getByTestId('load-demo').click()
  await page.locator('input[type="file"]').setInputFiles(testPhoto)
  await page.getByTestId('food-name').fill('以后再决定的味道')
  await page.getByTestId('confirm-entry').click()
  await page.getByTestId('choose-later').click()
  await expect(page.getByTestId('completion-card')).toContainText('先留住')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('pending-list')).toContainText('以后再决定的味道')
  await page.reload()
  await expect(page.getByTestId('pending-list')).toContainText('以后再决定的味道')
})

test('camera-first flow opens a live viewfinder and captures into ranking', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium uses a deterministic fake camera device in CI; Safari camera remains a real-device smoke test.')
  await page.getByTestId('load-demo').click()
  await page.getByTestId('start-record').click()
  await expect(page.getByTestId('camera-screen')).toBeVisible()
  await expect(page.getByTestId('camera-viewfinder')).toBeVisible()
  await expect(page.getByTestId('camera-shutter')).toBeEnabled()
  await page.getByTestId('camera-shutter').click()
  await expect(page.getByTestId('suggestion-form')).toBeVisible()
  await page.getByTestId('food-name').fill('摄像头拍下的味道')
  await page.getByTestId('confirm-entry').click()
  await page.getByTestId('choose-later').click()
  await expect(page.getByTestId('completion-card')).toContainText('先留住')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('pending-list')).toContainText('摄像头拍下的味道')
})

test('manifest, static base and offline app shell', async ({ page, context, browserName }) => {
  await page.getByText('空白开始').click()
  const manifest = await page.request.get('./manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  expect((await manifest.json()).name).toContain('我的味觉档案')
  await page.waitForFunction(() => 'serviceWorker' in navigator)
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (browserName === 'webkit') {
    test.info().annotations.push({ type: 'offline-check', description: 'WebKit verified manifest and active service worker; Playwright WebKit offline reload is not stable on Windows.' })
    return
  }
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('留下一餐，留下当时的你')).toBeVisible()
  await context.setOffline(false)
  test.info().annotations.push({ type: 'browser', description: browserName })
})
