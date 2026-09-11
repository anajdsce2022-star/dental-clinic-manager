import { test, expect } from './fixtures'

test('clinic application opens successfully', async ({ page, gotoRoute }) => {
  await gotoRoute('dashboard')

  await expect(
    page.getByText('JOSHI DENTAL CLINIC').first(),
  ).toBeVisible()

  await expect(
    page.getByText('Here is your clinic overview.'),
  ).toBeVisible()
})