import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
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

async function loadDemo(page: Page) {
  await expect(page.getByTestId('camera-screen')).toBeVisible()
  await page.getByLabel('关闭摄像头').click()
  await expect(page.getByTestId('ranking-page')).toBeVisible()
  await page.locator('.bottom-nav').getByRole('button', { name: '我的', exact: true }).click()
  await expect(page.getByText('我的味觉研究')).toBeVisible()
  await page.getByTestId('load-demo').click()
  await page.locator('.bottom-nav').getByRole('button', { name: '榜单', exact: true }).click()
  await expect(page.getByTestId('ranking-page')).toBeVisible()
}

async function rankingState(page: Page) {
  return page.evaluate(() => new Promise<{ groups: unknown[]; comparisons: unknown[] }>((resolveState, reject) => {
    const request = indexedDB.open('food-life-archive')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(['rankGroups', 'comparisons'], 'readonly')
      const groupsRequest = transaction.objectStore('rankGroups').getAll()
      const comparisonsRequest = transaction.objectStore('comparisons').getAll()
      transaction.oncomplete = () => {
        database.close()
        resolveState({ groups: groupsRequest.result, comparisons: comparisonsRequest.result })
      }
      transaction.onerror = () => reject(transaction.error)
    }
  }))
}

test.beforeEach(async ({ page, context }, testInfo) => {
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
  if (testInfo.title !== 'explicit ranking and archive deep links do not reopen the camera') {
    await page.goto('./#/record')
  }
})

test('mobile core flow: photo, editable mock suggestion, comparisons, ranking', async ({ page }) => {
  await loadDemo(page)
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

test('explicit ranking and archive deep links do not reopen the camera', async ({ page }) => {
  await page.goto('./#/ranking')
  await expect(page.getByTestId('ranking-page')).toBeVisible()
  await expect(page.getByTestId('camera-screen')).toHaveCount(0)
  await page.goto('./#/archive')
  await expect(page.getByText('我的食物档案')).toBeVisible()
  await expect(page.getByTestId('camera-screen')).toHaveCount(0)
})

test('crop/form drafts survive reload and quick save returns to camera', async ({ page }) => {
  await expect(page.getByTestId('camera-screen')).toBeVisible()
  await page.getByTestId('camera-import-input').setInputFiles(testPhoto)
  await expect(page.getByTestId('image-cropper')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('image-cropper')).toBeVisible()
  await confirmCrop(page)
  await expect(page.getByTestId('suggestion-form')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('suggestion-form')).toBeVisible()
  await page.getByTestId('food-name').fill('连续记录测试菜')
  await page.getByTestId('confirm-entry').click()
  await expect(page.getByTestId('completion-card')).toBeVisible()
  await expect(page.getByTestId('camera-screen')).toBeVisible({ timeout: 4000 })
})

test('an unfinished comparison resumes after reload', async ({ page }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: '记录', exact: true }).click()
  await page.getByTestId('camera-import-input').setInputFiles(testPhoto)
  await confirmCrop(page)
  await page.getByTestId('food-name').fill('等待继续复判的菜')
  await page.getByTestId('confirm-entry').click()
  await page.getByTestId('view-ranking').click()
  await page.getByRole('button', { name: '列入红榜等待继续复判的菜' }).click()
  await expect(page.getByTestId('comparison-view')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('comparison-view')).toBeVisible()
  await expect(page.getByText('等待继续复判的菜')).toBeVisible()
})

test('defer keeps the entry locally in pending', async ({ page }) => {
  await loadDemo(page)
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
  await loadDemo(page)
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
  await expect(page.getByTestId('camera-screen')).toBeVisible()
  await page.getByLabel('关闭摄像头').click()
  await expect(page.getByTestId('ranking-page')).toBeVisible()
  const manifest = await page.request.get('./manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const manifestBody = await manifest.json()
  expect(manifestBody.name).toContain('私人美食评审局')
  expect(manifestBody.start_url).toContain('#/record')
  await page.waitForFunction(() => 'serviceWorker' in navigator)
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (browserName === 'webkit') {
    test.info().annotations.push({ type: 'offline-check', description: 'WebKit verified manifest and active service worker; Playwright WebKit offline reload is not stable on Windows.' })
    return
  }
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('ranking-page')).toBeVisible()
  await context.setOffline(false)
  test.info().annotations.push({ type: 'browser', description: browserName })
})

test('month/year switch, manual reorder and ranking image export', async ({ page }) => {
  await loadDemo(page)
  await expect(page.getByTestId('period-life')).toHaveClass(/active/)
  await page.getByTestId('period-month').click()
  await expect(page.getByTestId('period-month')).toHaveClass(/active/)
  await page.getByTestId('period-year').click()
  await expect(page.getByTestId('period-year')).toHaveClass(/active/)
  const firstName = await page.locator('.rank-row strong').first().textContent()
  await page.locator('.rank-adjust button[aria-label^="下移"]').first().click()
  await expect(page.locator('.rank-row strong').nth(1)).toHaveText(firstName ?? '')
  await expect(page.getByTestId('rank-motion')).toContainText('顺位已正式改写')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '生成榜单图' }).click()
  const exported = await download
  expect(exported.suggestedFilename()).toMatch(/我的红榜年度总榜.*\.png$/)
  const png = await readFile((await exported.path())!)
  expect(png.readUInt32BE(16)).toBe(1080)
  expect(png.readUInt32BE(20)).toBe(1440)
})

test('pending food can enter the private blacklist, reorder and export', async ({ page }) => {
  await loadDemo(page)
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
  await page.getByTestId('period-month').click()
  await expect(page.getByTestId('period-ranking')).toContainText('这次真的踩雷了')
  await expect(page.getByTestId('ranking-page')).toContainText('越靠前，越不想再吃')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '生成榜单图' }).click()
  expect((await download).suggestedFilename()).toMatch(/我的黑榜月榜.*\.png$/)
})

test('Top 10 entry receives a ceremonial personal name while retaining official context', async ({ page }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: '重新赐名' }).first().click()
  await expect(page.getByTestId('bestow-screen')).toContainText('STANDARD NAME')
  await page.getByLabel('正式赐名').fill('凌晨两点救命红烧肉')
  await page.getByRole('button', { name: '确认定名' }).click()
  await expect(page.getByTestId('period-ranking')).toContainText('凌晨两点救命红烧肉')
  await expect(page.getByTestId('period-ranking')).toContainText('标准名称：红烧肉')
})

test('food detail zooms, edits metadata and replaces a photo without AI', async ({ page }) => {
  const aiRequests: string[] = []
  page.on('request', (request) => { if (request.url().includes('/api/analyze')) aiRequests.push(request.url()) })
  await loadDemo(page)
  await page.locator('.rank-photo-button').first().click()
  await expect(page.getByTestId('photo-viewer')).toBeVisible()
  await page.getByLabel('放大图片').click()
  await expect(page.getByText('150%')).toBeVisible()
  await page.getByLabel('关闭大图').click()
  await page.locator('.rank-entry-button').first().click()
  await expect(page.getByTestId('entry-detail')).toBeVisible()
  const beforeReplacement = await rankingState(page)
  await page.getByLabel('编辑食物档案').click()
  await page.getByTestId('edit-name').fill('重新核准的红烧肉')
  await page.getByTestId('edit-tags').fill('家宴、招牌')
  await page.getByTestId('save-entry-edit').click()
  await expect(page.getByTestId('entry-detail')).toContainText('重新核准的红烧肉')
  await page.getByLabel('编辑食物档案').click()
  await page.getByTestId('replace-image-input').setInputFiles(testPhoto)
  await confirmCrop(page)
  await expect(page.getByTestId('entry-detail')).toBeVisible()
  await expect(page.getByText(/照片已替换 · 未调用 AI/)).toBeVisible()
  expect(await rankingState(page)).toEqual(beforeReplacement)
  await page.getByLabel('关闭食物档案').click()
  await expect(page.getByTestId('period-ranking')).toContainText('重新核准的红烧肉')
  expect(aiRequests).toHaveLength(0)
})

test('manual promotion to first place triggers the highest ceremony', async ({ page }) => {
  await loadDemo(page)
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
