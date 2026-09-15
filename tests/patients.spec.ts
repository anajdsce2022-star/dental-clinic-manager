import { test, expect } from './fixtures'

test.beforeEach(async ({ gotoRoute }) => {
  await gotoRoute('patients')
})

test('patients page opens', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Patients' })).toBeVisible()

  await expect(
    page.getByPlaceholder(
      'Search by name, mobile number or email...',
    ),
  ).toBeVisible()

  await expect(
    page.getByRole('button', { name: '+ New patient' }),
  ).toBeVisible()
})

test('new patient form opens', async ({ page }) => {
  await page.getByRole('button', { name: '+ New patient' }).click()

  await expect(
    page.getByRole('heading', { name: 'Add patient' }),
  ).toBeVisible()

  await expect(
    page.getByText('Full name'),
  ).toBeVisible()

  await expect(
    page.getByText('Mobile number'),
  ).toBeVisible()

  await expect(
    page.getByText('Email'),
  ).toBeVisible()

  await expect(
    page.getByText('Date of birth'),
  ).toBeVisible()

  await expect(
    page.getByText('Gender'),
  ).toBeVisible()
})