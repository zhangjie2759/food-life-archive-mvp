import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const testPhoto = resolve('public/pwa-192x192.png')

async function chooseNewUntilCeremony(page: Page) {
  for (let count = 0; count < 4; count += 1) {
    if (await page.getByTestId('ranking-ceremony').isVisible().catch(() => false)) return
    const choice = page.getByTestId('choose-new')
    await expect(choice).toBeEnabled()
    await choice.click()
    await page.waitForFunction(() => {
      if (document.querySelector('[data-testid="ranking-ceremony"]')) return true
      const button = document.querySelector<HTMLButtonElement>('[data-testid="choose-new"]')
      return Boolean(button && !button.disabled)
    })
  }
}

async function confirmCrop(page: Page) {
  await expect(page.getByTestId('image-cropper')).toBeVisible()
  await expect(page.getByTestId('crop-confirm')).toBeEnabled()
  await page.getByTestId('crop-confirm').click()
}

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
  await confirmCrop(page)
  await expect(page.getByTestId('suggestion-form')).toBeVisible()
  await expect(page.getByText(/AI 未连接/)).toBeVisible()
  await page.getByTestId('food-name').fill('雨夜的煲仔饭')
  await page.getByTestId('confirm-entry').click()
  await expect(page.getByTestId('completion-card')).toContainText('记录在册')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('pending-list')).toContainText('雨夜的煲仔饭')
  await page.getByRole('button', { name: '列入红榜雨夜的煲仔饭' }).click()
  await expect(page.getByTestId('comparison-view')).toBeVisible()
  await chooseNewUntilCeremony(page)
  await expect(page.getByTestId('ranking-ceremony')).toContainText('榜首易主')
  await page.getByTestId('ranking-ceremony').getByRole('button', { name: '查看最新榜单' }).click()
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
  await confirmCrop(page)
  await page.getByTestId('food-name').fill('以后再决定的味道')
  await page.getByTestId('confirm-entry').click()
  await page.getByTestId('view-ranking').click()
  await page.getByRole('button', { name: '列入红榜以后再决定的味道' }).click()
  await page.getByTestId('choose-later').click()
  await expect(page.getByTestId('completion-card')).toContainText('记录在册')
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
  await confirmCrop(page)
  await expect(page.getByTestId('suggestion-form')).toBeVisible()
  await page.getByTestId('food-name').fill('摄像头拍下的味道')
  await page.getByTestId('confirm-entry').click()
  await expect(page.getByTestId('completion-card')).toContainText('记录在册')
  await page.getByTestId('view-ranking').click()
  await expect(page.getByTestId('pending-list')).toContainText('摄像头拍下的味道')
})

test('manifest, static base and offline app shell', async ({ page, context, browserName }) => {
  await page.getByText('空白开始').click()
  await expect(page.getByTestId('ranking-page')).toBeVisible()
  const manifest = await page.request.get('./manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  expect((await manifest.json()).name).toContain('私人美食评审局')
  await page.waitForFunction(() => 'serviceWorker' in navigator)
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (browserName === 'webkit') {
    test.info().annotations.push({ type: 'offline-check', description: 'WebKit verified manifest and active service worker; Playwright WebKit offline reload is not stable on Windows.' })
    return
  }
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(/PERSONAL FOOD AUTHORITY/)).toBeVisible()
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
  await expect(page.getByTestId('rank-motion')).toContainText('顺位已正式改写')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '生成榜单图' }).click()
  expect((await download).suggestedFilename()).toMatch(/我的红榜年度总榜.*\.png$/)
})

test('pending food can enter the private blacklist, reorder and export', async ({ page }) => {
  await page.getByTestId('load-demo').click()
  await page.getByRole('button', { name: '记录' }).click()
  await page.getByTestId('camera-import-input').setInputFiles(testPhoto)
  await confirmCrop(page)
  await page.getByTestId('food-name').fill('这次真的踩雷了')
  await page.getByTestId('confirm-entry').click()
  await page.getByTestId('view-ranking').click()
  await page.getByRole('button', { name: '列入黑榜这次真的踩雷了' }).click()
  await chooseNewUntilCeremony(page)
  await expect(page.getByTestId('ranking-ceremony')).toContainText('最差纪录刷新')
  await page.getByTestId('ranking-ceremony').getByRole('button', { name: '查看最新榜单' }).click()
  await page.getByTestId('board-black').click()
  await expect(page.getByTestId('period-ranking')).toContainText('这次真的踩雷了')
  await expect(page.getByTestId('ranking-page')).toContainText('越靠前，越难吃')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '生成榜单图' }).click()
  expect((await download).suggestedFilename()).toMatch(/我的黑榜月榜.*\.png$/)
})

test('Top 10 entry receives a ceremonial personal name while retaining official context', async ({ page }) => {
  await page.getByTestId('load-demo').click()
  await page.getByRole('button', { name: '重新定名' }).first().click()
  await expect(page.getByTestId('bestow-screen')).toContainText('AI STANDARD NAME')
  await page.getByLabel('正式赐名').fill('凌晨两点救命红烧肉')
  await page.getByRole('button', { name: '确认定名' }).click()
  await expect(page.getByTestId('period-ranking')).toContainText('凌晨两点救命红烧肉')
  await expect(page.getByTestId('period-ranking')).toContainText('AI标准名：红烧肉')
})

test('manual promotion to first place triggers the highest ceremony', async ({ page }) => {
  await page.getByTestId('load-demo').click()
  const promotedName = await page.locator('.rank-row strong').nth(1).textContent()
  await page.locator('.rank-adjust button[aria-label^="上移"]').nth(1).click()
  const ceremony = page.getByTestId('ranking-ceremony')
  await expect(ceremony).toContainText('榜首易主')
  await expect(ceremony).toContainText('OFFICIAL CHANGE OF NO.01')
  await expect(ceremony).toHaveClass(/apex/)
  await ceremony.getByRole('button', { name: '查看最新榜单' }).click()
  await expect(page.getByTestId('rank-motion')).toContainText('新任榜首已经裁定')
  await expect(page.locator('.rank-row strong').first()).toHaveText(promotedName ?? '')
})
