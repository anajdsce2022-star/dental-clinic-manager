import { test, expect } from './fixtures'

const routes = [
  ['dashboard', /Good morning\.|Good afternoon\.|Good evening\.|Welcome back\./],
  ['patients', 'Patients'],
  ['appointments', 'Appointments'],
  ['treatments', 'Treatments'],
  ['billing', 'Billing'],
  ['inventory', 'Inventory'],
  ['reports', 'Reports'],
] as const

test('every clinic route supports direct navigation and browser history', async ({
  page,
  gotoRoute,
}) => {
  for (const [route, heading] of routes) {
    await gotoRoute(route)

    await expect(page.locator('h1').first()).toContainText(heading)
  }

  await gotoRoute('patients')
  await gotoRoute('appointments')

  await page.goBack()
  await expect(page.locator('h1').first()).toHaveText('Patients')

  await page.goForward()
  await expect(page.locator('h1').first()).toHaveText('Appointments')

  await gotoRoute('does-not-exist')

  await expect(page.locator('h1').first()).toContainText(
    /Good morning\.|Good afternoon\.|Good evening\.|Welcome back\./,
  )
})

test('clinic navigation remains usable on a narrow mobile viewport', async ({
  page,
  gotoRoute,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await gotoRoute('patients')

  await expect(
    page.getByRole('heading', { name: 'Patients' }),
  ).toBeVisible()

  await expect(
    page.getByRole('button', { name: '+ New patient' }),
  ).toBeVisible()

  await expect(
    page.getByPlaceholder(
      'Search by name, mobile number or email...',
    ),
  ).toBeVisible()

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))

  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 1)
})