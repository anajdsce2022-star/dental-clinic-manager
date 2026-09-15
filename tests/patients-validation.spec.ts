import { test, expect } from './fixtures'

const validPatient = {
  name: 'Validation Test Patient',
  phone: '9876543210',
  email: 'validation@example.com',
  dateOfBirth: '1990-05-12',
}

async function openPatientForm(page: any) {
  await page.getByRole('button', { name: '+ New patient' }).click()
  return page.locator('form').last()
}

async function fillValidPatient(page: any) {
  const form = await openPatientForm(page)
  const inputs = form.locator('input')

  await inputs.nth(0).fill(validPatient.name)
  await inputs.nth(1).fill(validPatient.phone)
  await inputs.nth(2).fill(validPatient.email)
  await inputs.nth(3).fill(validPatient.dateOfBirth)
  await form.locator('select').first().selectOption('Female')

  return form
}

test.beforeEach(async ({ resetClinicData, gotoRoute }) => {
  await resetClinicData()
  await gotoRoute('patients')
})

test('mobile number rejects invalid lengths', async ({ page }) => {
  const form = await fillValidPatient(page)
  const mobile = form.locator('input').nth(1)

  await mobile.fill('987654321')
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()

  await expect(page.getByText(/valid mobile number/i)).toBeVisible()

  await mobile.fill('98765432101')
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()

  await expect(page.getByText(/valid mobile number/i)).toBeVisible()
})

test('mobile number rejects letters, e, symbols and decimal values', async ({ page }) => {
  const invalidValues = [
    '98765abc10',
    '98765e3210',
    '98765@3210',
    '98765.43210',
    '-9876543210',
  ]

  for (const value of invalidValues) {
    const form = await fillValidPatient(page)
    const mobile = form.locator('input').nth(1)

    await mobile.fill(value)
    await form.getByRole('button', { name: 'Add patient', exact: true }).click()

    await expect(page.getByText(/valid mobile number/i)).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
  }
})

test('valid mobile number can be saved', async ({ page }) => {
  const form = await fillValidPatient(page)

  await form.getByRole('button', { name: 'Add patient', exact: true }).click()

  await expect(page.getByText(/patient added successfully/i)).toBeVisible()
})

test('email rejects malformed values', async ({ page }) => {
  const invalidEmails = [
    'not-an-email',
    'test@',
    '@gmail.com',
    'testgmail.com',
    'test@@gmail.com',
    'test @gmail.com',
  ]

  for (const email of invalidEmails) {
    const form = await fillValidPatient(page)
    const emailInput = form.locator('input').nth(2)

    await emailInput.fill(email)
    await form.getByRole('button', { name: 'Add patient', exact: true }).click()

    await expect(page.getByText(/valid email/i)).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
  }
})

test('valid non-Gmail email can be saved', async ({ page }) => {
  const form = await fillValidPatient(page)

  await form.locator('input').nth(2).fill('patient@clinic.org')

  await form.getByRole('button', { name: 'Add patient', exact: true }).click()

  await expect(page.getByText(/patient added successfully/i)).toBeVisible()
})

test('date of birth rejects future and unrealistic dates', async ({ page }) => {
  const invalidDates = [
    '2099-01-01',
    '0001-01-01',
  ]

  for (const date of invalidDates) {
    const form = await fillValidPatient(page)
    const dob = form.locator('input').nth(3)

    await dob.fill(date)
    await form.getByRole('button', { name: 'Add patient', exact: true }).click()

    await expect(
      page.getByText(/valid date of birth|future/i),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
  }
})