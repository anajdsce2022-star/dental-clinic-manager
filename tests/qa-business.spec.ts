import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const patientData = {
  name: 'Asha Rao',
  phone: '9876543210',
  email: 'asha@example.com',
  dateOfBirth: '1990-05-12',
}

async function openPatientForm(page: Page) {
  await page.getByRole('button', { name: '+ New patient' }).click()
  return page.locator('form').last()
}

async function fillPatientForm(
  page: Page,
  overrides: Partial<typeof patientData> = {},
) {
  const form = await openPatientForm(page)
  const data = { ...patientData, ...overrides }
  const inputs = form.locator('input')

  await inputs.nth(0).fill(data.name)
  await inputs.nth(1).fill(data.phone)
  await inputs.nth(2).fill(data.email)
  await inputs.nth(3).fill(data.dateOfBirth)
  await form.locator('select').nth(0).selectOption('Female')

  return form
}

test.beforeEach(async ({ resetClinicData, gotoRoute }) => {
  await gotoRoute('patients')
  await resetClinicData()
  await gotoRoute('patients')
})

test('patient identity fields reject malformed contact data', async ({ page }) => {
  const form = await fillPatientForm(page, {
    phone: '123',
    email: 'not-an-email',
  })

  await form.getByRole('button', { name: 'Add patient', exact: true }).click()

  await expect(page.getByText(/valid mobile number/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add patient' })).toBeVisible()

  await form.locator('input').nth(1).fill('9876543210')
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()

  await expect(page.getByText(/valid email/i)).toBeVisible()
})

test('patient duplicates are rejected and valid records persist', async ({ page, gotoRoute }) => {
  let form = await fillPatientForm(page)
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()
  await page.getByRole('button', { name: 'Done' }).click()

  await expect(page.getByText('Asha Rao')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Asha Rao')).toBeVisible()

  form = await fillPatientForm(page, { email: 'another@example.com' })
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()

  await expect(page.getByText(/already exists|duplicate/i)).toBeVisible()
  await page.getByRole('button', { name: 'Close patient form' }).click()

  await gotoRoute('patients')
  await page.getByRole('button', { name: 'Edit' }).click()
  const editForm = page.locator('form').last()
  await editForm.locator('input').nth(0).fill('Asha Rao Updated')
  await editForm.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Asha Rao Updated')).toBeVisible()
})

test('future patient dates of birth are rejected', async ({ page }) => {
  const form = await fillPatientForm(page, {
    dateOfBirth: '2099-01-01',
  })

  await form.getByRole('button', { name: 'Add patient', exact: true }).click()

  await expect(page.getByText(/date of birth.*future|valid date of birth/i)).toBeVisible()
})

test('editing a patient keeps linked records on the same identity', async ({ page, gotoRoute }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'joshi-dental-clinic-patients',
      JSON.stringify([{
        id: 'p1', name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com',
        dateOfBirth: '1990-05-12', gender: 'Female', address: '', emergencyContact: '',
        bloodGroup: '', allergies: '', medicalNotes: '', createdAt: new Date().toISOString(),
      }]),
    )
    localStorage.setItem(
      'joshi-dental-clinic-appointments',
      JSON.stringify([{ id: 'a1', patientId: 'p1', patientName: 'Asha Rao', date: '2099-01-02', time: '10:00', reason: 'Cleaning', status: 'Scheduled', notes: '' }]),
    )
    localStorage.setItem(
      'joshi-dental-clinic-treatments',
      JSON.stringify([{ id: 't1', patientId: 'p1', patientName: 'Asha Rao', treatmentName: 'Cleaning', cost: 500, status: 'Planned', plannedVisits: 1, completedVisits: 0 }]),
    )
    localStorage.setItem(
      'joshi-dental-clinic-invoices',
      JSON.stringify([{ id: 'i1', invoiceNumber: 'INV-0001', patientId: 'p1', patientName: 'Asha Rao', total: 500, amountPaid: 0, paymentStatus: 'Unpaid' }]),
    )
  })

  await page.reload()
  await gotoRoute('patients')
  await page.getByRole('button', { name: 'Edit' }).click()
  const form = page.locator('form').last()
  await form.locator('input').nth(0).fill('Asha Rao Updated')
  await form.getByRole('button', { name: 'Save changes', exact: true }).click()

  const linkedNames = await page.evaluate(() => [
    JSON.parse(localStorage.getItem('joshi-dental-clinic-appointments') || '[]')[0].patientName,
    JSON.parse(localStorage.getItem('joshi-dental-clinic-treatments') || '[]')[0].patientName,
    JSON.parse(localStorage.getItem('joshi-dental-clinic-invoices') || '[]')[0].patientName,
  ])

  expect(linkedNames).toEqual(['Asha Rao Updated', 'Asha Rao Updated', 'Asha Rao Updated'])
})

test('patient deletion is blocked when linked records exist', async ({ page, gotoRoute }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'joshi-dental-clinic-patients',
      JSON.stringify([{
        id: 'p1',
        name: 'Asha Rao',
        phone: '9876543210',
        email: 'asha@example.com',
        dateOfBirth: '1990-05-12',
        gender: 'Female',
        address: '',
        emergencyContact: '',
        bloodGroup: '',
        allergies: '',
        medicalNotes: '',
        createdAt: new Date().toISOString(),
      }]),
    )
    localStorage.setItem(
      'joshi-dental-clinic-appointments',
      JSON.stringify([{ id: 'a1', patientId: 'p1', patientName: 'Asha Rao' }]),
    )
  })

  await page.reload()
  await gotoRoute('patients')

  let alertMessage = ''
  page.once('dialog', async (dialog) => {
    alertMessage = dialog.message()
    await dialog.accept()
  })

  await page.getByRole('button', { name: 'Delete' }).click()

  expect(alertMessage).toMatch(/cannot be deleted|linked/i)
  await expect(page.getByText('Asha Rao')).toBeVisible()
})

test('appointment expected visits must be an integer from one to fifty', async ({ page, gotoRoute }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'joshi-dental-clinic-patients',
      JSON.stringify([{ id: 'p1', name: 'Asha Rao', phone: '9876543210' }]),
    )
  })

  await gotoRoute('appointments')
  await page.getByRole('button', { name: '+ New appointment' }).click()

  const form = page.locator('form').last()
  const patientBox = page.getByRole('combobox', { name: 'Search patients by name or mobile number' })
  await patientBox.fill('Asha')
  await page.getByRole('option', { name: 'Asha Rao 9876543210' }).click()
  await form.getByRole('textbox', { name: 'Date *' }).fill('2099-01-02')
  await form.getByRole('button', { name: '10:00 AM', exact: true }).click()
  await form.getByRole('textbox', { name: 'Reason for visit *' }).fill('Consultation')

  const visits = form.getByRole('textbox', { name: 'Expected visits' })
  await visits.fill('0')
  await form.getByRole('button', { name: 'Book appointment' }).click()
  await expect(page.getByText(/expected visits.*1|between 1 and 50/i)).toBeVisible()

  await visits.fill('1.5')
  await form.getByRole('button', { name: 'Book appointment' }).click()
  await expect(page.getByText(/whole number|integer/i)).toBeVisible()
})

test('treatment dates must form a valid clinical sequence', async ({ page, gotoRoute }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'joshi-dental-clinic-patients',
      JSON.stringify([{ id: 'p1', name: 'Asha Rao' }]),
    )
  })

  await gotoRoute('treatments')
  await page.getByRole('button', { name: '+ New Treatment' }).click()

  const form = page.locator('form').last()
  await form.locator('select').first().selectOption('p1')
  await form.getByRole('textbox', { name: 'Treatment name' }).fill('Root canal')
  await form.getByRole('textbox', { name: 'Start date' }).fill('2026-09-10')
  await form.getByRole('textbox', { name: 'Next visit' }).fill('2026-09-05')
  await form.getByRole('button', { name: 'Create Treatment' }).click()

  await expect(page.getByText(/next visit.*start date|valid date sequence/i)).toBeVisible()
})

test('dashboard and reports agree on zero-stock alerts', async ({ page, gotoRoute }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'joshi-dental-clinic-inventory',
      JSON.stringify([{
        id: 'i1', name: 'Gloves', category: 'PPE', quantity: 0, unit: 'boxes',
        minimumStock: 5, purchasePricePaise: 1000, supplier: 'Clinic Supply',
        expiryDate: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }]),
    )
  })

  await gotoRoute('dashboard')
  const dashboardCard = page.getByText('Low stock items').locator('..')
  await expect(dashboardCard).toContainText('1')

  await gotoRoute('reports')
  const lowStock = page.getByText('Low stock', { exact: true }).locator('..')
  await expect(lowStock).toContainText('1')
})

test('inventory prevents negative stock and preserves transaction history', async ({ page, gotoRoute }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'joshi-dental-clinic-inventory',
      JSON.stringify([{
        id: 'i1', name: 'Gloves', category: 'PPE', quantity: 5, unit: 'boxes',
        minimumStock: 2, purchasePricePaise: 1000, supplier: 'Clinic Supply',
        expiryDate: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }]),
    )
    localStorage.setItem('joshi-dental-clinic-inventory-history', '[]')
  })

  await gotoRoute('inventory')
  const row = page.getByText('Gloves').locator('..').locator('..')
  await row.getByRole('button', { name: /Use stock/ }).click()

  const form = page.locator('form').last()
  await form.locator('input').first().fill('6')
  await form.locator('textarea').first().fill('Attempted overuse')
  await form.getByRole('button', { name: 'Record usage' }).click()
  await expect(page.getByRole('status')).toContainText(/available|negative/i)

  await form.locator('input').first().fill('3')
  await form.locator('textarea').first().fill('Used for procedure')
  await form.getByRole('button', { name: 'Record usage' }).click()

  await expect(page.getByRole('cell', { name: '2 boxes', exact: true })).toBeVisible()
  const stored = await page.evaluate(() => ({
    items: JSON.parse(localStorage.getItem('joshi-dental-clinic-inventory') || '[]'),
    history: JSON.parse(localStorage.getItem('joshi-dental-clinic-inventory-history') || '[]'),
  }))
  expect(stored.items[0].quantity).toBe(2)
  expect(stored.history[0]).toMatchObject({
    type: 'Stock used',
    previousQuantity: 5,
    newQuantity: 2,
  })
})

test('billing totals and payment status remain mathematically consistent', async ({ page, gotoRoute }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'joshi-dental-clinic-patients',
      JSON.stringify([{ id: 'p1', name: 'Asha Rao' }]),
    )
  })

  await gotoRoute('billing')
  await page.getByRole('button', { name: '+ New Invoice' }).click()
  let form = page.locator('form').last()
  await form.locator('select').first().selectOption('p1')
  const inputs = form.locator('input')
  await inputs.nth(0).fill('Cleaning')
  await inputs.nth(1).fill('1')
  await inputs.nth(2).fill('1000')
  await inputs.nth(3).fill('100')
  await inputs.nth(4).fill('450')
  await form.getByRole('button', { name: /Create Invoice|Save Invoice/i }).click()

  await expect(page.getByRole('cell', { name: '₹900' })).toBeVisible()
  await expect(page.getByText('Partially paid')).toBeVisible()

  await page.getByRole('button', { name: 'Record Payment' }).click()
  form = page.locator('form').last()
  const paymentInput = form.locator('input').last()
  await paymentInput.fill('900')
  await form.getByRole('button', { name: /Save Payment|Update Payment|Record Payment/i }).click()

  await expect(page.getByText('Paid', { exact: true }).last()).toBeVisible()
  const invoice = await page.evaluate(() => JSON.parse(localStorage.getItem('joshi-dental-clinic-invoices') || '[]')[0])
  expect(invoice).toMatchObject({ total: 900, amountPaid: 900, paymentStatus: 'Paid' })
})
