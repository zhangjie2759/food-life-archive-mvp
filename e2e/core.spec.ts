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
  await expect(page.getByTestId('ranking-page')).toBeVisible()
  await page.getByRole('button', { name: '记录' }).click()
  await page.getByTestId('camera-import-input').setInputFiles(testPhoto)
  await expect(page.getByTestId('suggestion-form')).toBeVisible()
  await expect(page.getByText(/验证版 AI 建议/)).toBeVisible()
  await page.getByTestId('food-name').fill('雨夜的煲仔饭')
  await page.getByTestId('food-note').fill('吃完以后再认真决定它的位置')
  await page.getByTestId('confirm-entry').click()
  await expect(page.getByTestId('completion-card')).toContainText('先记录')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('pending-list')).toContainText('雨夜的煲仔饭')
  await page.getByRole('button', { name: '开始复判雨夜的煲仔饭' }).click()
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
  await expect(page.getByTestId('completion-card')).toContainText('排在第 1 位')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('ranking-page')).toContainText('雨夜的煲仔饭')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  const navButtons = await page.locator('.bottom-nav button').all()
  for (const button of navButtons) expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
})

test('defer keeps the entry locally in pending', async ({ page }) => {
  await page.getByTestId('load-demo').click()
  await page.getByRole('button', { name: '记录' }).click()
  await page.getByTestId('camera-import-input').setInputFiles(testPhoto)
  await page.getByTestId('food-name').fill('以后再决定的味道')
  await page.getByTestId('confirm-entry').click()
  await page.getByTestId('view-ranking').click()
  await page.getByRole('button', { name: '开始复判以后再决定的味道' }).click()
  await page.getByTestId('choose-later').click()
  await expect(page.getByTestId('completion-card')).toContainText('先记录')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('pending-list')).toContainText('以后再决定的味道')
  await page.reload()
  await expect(page.getByTestId('pending-list')).toContainText('以后再决定的味道')
})

test('camera-first flow opens a live viewfinder and captures into ranking', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium uses a deterministic fake camera device in CI; Safari camera remains a real-device smoke test.')
  await page.getByTestId('load-demo').click()
  await page.getByRole('button', { name: '记录' }).click()
  await expect(page.getByTestId('camera-screen')).toBeVisible()
  await expect(page.getByTestId('camera-viewfinder')).toBeVisible()
  await expect(page.getByTestId('camera-shutter')).toBeEnabled()
  await page.getByTestId('camera-shutter').click()
  await expect(page.getByTestId('suggestion-form')).toBeVisible()
  await page.getByTestId('food-name').fill('摄像头拍下的味道')
  await page.getByTestId('confirm-entry').click()
  await expect(page.getByTestId('completion-card')).toContainText('先记录')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('pending-list')).toContainText('摄像头拍下的味道')
})

test('manifest, static base and offline app shell', async ({ page, context, browserName }) => {
  await page.getByText('空白开始').click()
  await expect(page.getByTestId('ranking-page')).toBeVisible()
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
  await expect(page.getByText(/不是最好吃/)).toBeVisible()
  await context.setOffline(false)
  test.info().annotations.push({ type: 'browser', description: browserName })
})

test('month/year switch, manual reorder and ranking image export', async ({ page }) => {
  await page.getByTestId('load-demo').click()
  await expect(page.getByTestId('period-month')).toHaveClass(/active/)
  await page.getByTestId('period-year').click()
  await expect(page.getByTestId('period-year')).toHaveClass(/active/)
  const firstName = await page.locator('.rank-row strong').first().textContent()
  await page.locator('.rank-adjust button[aria-label^="下移"]').first().click()
  await expect(page.locator('.rank-row strong').nth(1)).toHaveText(firstName ?? '')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '生成分享图' }).click()
  expect((await download).suggestedFilename()).toMatch(/我的年榜.*\.png$/)
})

test('pending food can enter the private blacklist, reorder and export', async ({ page }) => {
  await page.getByTestId('load-demo').click()
  await page.getByRole('button', { name: '记录' }).click()
  await page.getByTestId('camera-import-input').setInputFiles(testPhoto)
  await page.getByTestId('food-name').fill('这次真的踩雷了')
  await page.getByTestId('food-note').fill('太咸，而且已经凉了')
  await page.getByTestId('confirm-entry').click()
  await page.getByTestId('view-ranking').click()
  await page.getByRole('button', { name: '送进黑榜这次真的踩雷了' }).click()
  await page.getByTestId('period-blacklist').click()
  await expect(page.getByTestId('blacklist-ranking')).toContainText('这次真的踩雷了')
  await expect(page.getByTestId('ranking-page')).toContainText('不是公开餐厅评分')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '生成分享图' }).click()
  expect((await download).suggestedFilename()).toMatch(/我的黑榜-人生避雷\.png$/)
})
