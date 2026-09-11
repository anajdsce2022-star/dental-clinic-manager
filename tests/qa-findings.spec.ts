import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * These tests were written after a source-code audit against the QA brief's
 * business-behavior expectations. Several are EXPECTED TO FAIL against the
 * current implementation — that is intentional. They document real gaps
 * found in src/features/*, not assumptions about what the code happens to
 * do today. Do not "fix" these tests to match current behavior; fix the
 * application, then these should pass.
 */

const PATIENTS_KEY = 'joshi-dental-clinic-patients'
const APPOINTMENTS_KEY = 'joshi-dental-clinic-appointments'

// ---------------------------------------------------------------------
// PATIENTS: stored values are not trimmed/normalized even though the
// duplicate-check logic normalizes them before comparing.
// (src/features/patients/PatientsPage.tsx handleSubmit: normalizedPhone /
// normalizedEmail are computed only for the duplicate check; the record
// actually written to localStorage is `{ ...form }`, untrimmed.)
// ---------------------------------------------------------------------
test.describe('Patients — data normalization on save', () => {
  test.beforeEach(async ({ resetClinicData, gotoRoute }) => {
    await resetClinicData()
    await gotoRoute('patients')
  })

  test('leading/trailing spaces in name and phone are trimmed before saving', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '+ New patient' }).click()
    const form = page.locator('form').last()
    const inputs = form.locator('input')

    await inputs.nth(0).fill('  Spacey Patient  ')
    await inputs.nth(1).fill('9876543210')
    await inputs.nth(3).fill('1990-01-01')
    await form.locator('select').first().selectOption('Female')

    await form.getByRole('button', { name: 'Add patient', exact: true }).click()
    await expect(page.getByText(/patient added successfully/i)).toBeVisible()

    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key)
      const list = raw ? JSON.parse(raw) : []
      return list[0]
    }, PATIENTS_KEY)

    expect(stored.name).toBe('Spacey Patient')
  })

  test('email is normalized to lowercase and trimmed before saving', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '+ New patient' }).click()
    const form = page.locator('form').last()
    const inputs = form.locator('input')

    await inputs.nth(0).fill('Case Test Patient')
    await inputs.nth(1).fill('9876543211')
    await inputs.nth(2).fill('  Mixed.Case@Example.COM  ')
    await inputs.nth(3).fill('1990-01-01')
    await form.locator('select').first().selectOption('Male')

    await form.getByRole('button', { name: 'Add patient', exact: true }).click()
    await expect(page.getByText(/patient added successfully/i)).toBeVisible()

    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key)
      const list = raw ? JSON.parse(raw) : []
      return list[0]
    }, PATIENTS_KEY)

    expect(stored.email).toBe('mixed.case@example.com')
  })
})

// ---------------------------------------------------------------------
// PATIENTS: no maximum length enforced on free-text fields, unlike
// Appointments (reason ≤500, notes ≤5000) and Billing (description
// ≤500, notes ≤2000). A pasted 20,000-character name is accepted as-is.
// ---------------------------------------------------------------------
test.describe('Patients — excessively long input', () => {
  test.beforeEach(async ({ resetClinicData, gotoRoute }) => {
    await resetClinicData()
    await gotoRoute('patients')
  })

  test('an unreasonably long full name is rejected with a validation message', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '+ New patient' }).click()
    const form = page.locator('form').last()
    const inputs = form.locator('input')

    const longName = 'A'.repeat(5000)

    await inputs.nth(0).fill(longName)
    await inputs.nth(1).fill('9876543212')
    await inputs.nth(3).fill('1990-01-01')
    await form.locator('select').first().selectOption('Male')

    await form.getByRole('button', { name: 'Add patient', exact: true }).click()

    // Intended behavior: the app should reject unreasonably long free-text
    // input, the same way it caps appointment reason/notes length.
    await expect(page.getByText(/name.*(characters|length|long)/i)).toBeVisible()
  })
})

// ---------------------------------------------------------------------
// APPOINTMENTS: recording a "reschedule" date/time alongside a
// Cancelled/No-show status only stores it as display metadata — it does
// NOT reserve the slot. A second, unrelated patient can be booked into
// that exact date/time immediately afterward, producing a silent
// double-booking of the slot the front desk believes is already spoken
// for. (src/features/appointment/appointment.tsx: occupiesTimeSlot()
// only returns true for Scheduled/Under treatment/Completed, so a
// Cancelled/No-show appointment's rescheduleDate/rescheduleTime never
// appears in getDaySlots' occupiedTimes set.)
// ---------------------------------------------------------------------
test.describe('Appointments — reschedule does not reserve the new slot (bug)', () => {
  const PATIENT_A = {
    id: 'reschedule-patient-a',
    name: 'Reschedule Patient A',
    phone: '9876500001',
  }

  const PATIENT_B = {
    id: 'reschedule-patient-b',
    name: 'Reschedule Patient B',
    phone: '9876500002',
  }

  const MONDAY = '2099-02-02'
  const RESCHEDULE_DATE = '2099-02-09'
  const RESCHEDULE_TIME = '11:00'

  async function seed(page: Page) {
    await page.evaluate(
      ({ patientsKey, appointmentsKey, patients, appointments }) => {
        localStorage.setItem(patientsKey, JSON.stringify(patients))
        localStorage.setItem(appointmentsKey, JSON.stringify(appointments))
      },
      {
        patientsKey: PATIENTS_KEY,
        appointmentsKey: APPOINTMENTS_KEY,
        patients: [PATIENT_A, PATIENT_B],
        appointments: [
          {
            id: 'reschedule-appt-1',
            patientId: PATIENT_A.id,
            patientName: PATIENT_A.name,
            date: MONDAY,
            time: '10:00',
            reason: 'Original booking',
            status: 'Scheduled',
            notes: '',
            disease: '',
            requiredVisits: '1',
            plannedTreatments: '',
          },
        ],
      },
    )

    await page.reload()
  }

  test('a slot recorded as "rescheduled to" cannot be double-booked by another patient', async ({
    page,
    gotoRoute,
  }) => {
    await gotoRoute('/appointments')
    await seed(page)

    await page
      .getByRole('button', { name: 'All appointments', exact: true })
      .click()

    // Mark the existing appointment as No show, with an explicit reschedule
    // date/time — this is the clinic's record that the patient is expected
    // at RESCHEDULE_DATE/RESCHEDULE_TIME instead.
    await page
      .getByRole('button', { name: `Change status for ${PATIENT_A.name}` })
      .first()
      .click()

    await page.getByRole('option', { name: 'No show' }).first().click()

    await page
      .locator('#status-action-reason')
      .fill('Patient did not attend')

    await page
      .getByLabel('Rescheduled date')
      .fill(RESCHEDULE_DATE)

    await page
      .getByLabel('Rescheduled time')
      .fill(RESCHEDULE_TIME)

    await page
      .getByRole('button', { name: 'Confirm action' })
      .click()

    await expect(
      page
        .getByRole('table')
        .getByText(
          `Rescheduled: 09 Feb 2099 at ${RESCHEDULE_TIME}`,
        ),
    ).toBeVisible()

    // Now try to book Patient B into that exact date/time. The clinic
    // already "promised" that slot to Patient A's rescheduled visit, so
    // this should be blocked as a conflict.
    await page
      .getByRole('button', { name: '+ New appointment' })
      .click()

    const heading = page.getByRole('heading', {
      name: 'New appointment',
      level: 2,
    })

    await expect(heading).toBeVisible()

    const modal = heading.locator(
      'xpath=ancestor::div[contains(@class, "max-w-2xl")]',
    )

    const form = modal.locator('form')

    const search = form.locator('#patient-search')

    await search.fill(PATIENT_B.name)

    await page
      .getByRole('option')
      .filter({ hasText: PATIENT_B.name })
      .click()

    await form
      .locator('#appointment-form-date')
      .fill(RESCHEDULE_DATE)

    const targetSlot = form.getByRole('button', {
      name: /11:00 AM/,
    })

    // Intended behavior: the slot the clinic promised to Patient A's
    // rescheduled visit should not be offered as available to Patient B.
    await expect(targetSlot).toBeDisabled()
  })
})

// ---------------------------------------------------------------------
// BILLING: an invoice fully covered by a discount (total = 0) is
// labeled "Unpaid" even though nothing is outstanding, because
// getPaymentStatus() only returns "Paid" when total > 0.
//
// The application has now been corrected so:
// total = 0 + amountPaid = 0 => Paid
//
// IMPORTANT:
// The Billing form currently places each form control inside its
// corresponding <label> wrapper. Therefore the test deliberately locates
// the control inside the matching label instead of relying on
// getByLabel().locator('input'), which would incorrectly search for an
// input inside an input.
// ---------------------------------------------------------------------
test.describe('Billing — zero-total invoice status', () => {
  test.beforeEach(async ({ resetClinicData, gotoRoute }) => {
    await resetClinicData()
    await gotoRoute('billing')
  })

  test('an invoice fully offset by discount is not shown as Unpaid', async ({
    page,
  }) => {
    // Seed a patient directly so the invoice form has someone to bill.
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            id: 'billing-zero-total-patient',
            name: 'Zero Total Patient',
            phone: '9876500099',
          },
        ]),
      )
    }, PATIENTS_KEY)

    await page.reload()

    await page
      .getByRole('button', { name: '+ New Invoice' })
      .click()

    const form = page.locator('form').last()

    // The Patient <select> is nested inside the <label> generated by Field.
    const patientField = form
      .locator('label')
      .filter({ hasText: /^Patient/ })

    await patientField
      .locator('select')
      .selectOption({ label: 'Zero Total Patient' })

    // Description is also a Field. Locate its textarea/input inside the
    // corresponding label rather than using getByLabel().
    const descriptionField = form
      .locator('label')
      .filter({ hasText: /^Description/ })

    await descriptionField
      .locator('textarea, input')
      .fill('Fully waived consultation')

    // Amount is an input directly inside the Amount Field.
    const amountField = form
      .locator('label')
      .filter({ hasText: /^Amount$/ })

    await amountField
      .locator('input')
      .fill('500')

    // Discount is an input directly inside the Discount Field.
    const discountField = form
      .locator('label')
      .filter({ hasText: /^Discount/ })

    await discountField
      .locator('input')
      .fill('500')

    await form
      .getByRole('button', { name: 'Create Invoice' })
      .click()

    // Intended behavior: an invoice with nothing outstanding should never
    // display as "Unpaid" to front-desk staff.
    await expect(
      page.getByText('Unpaid'),
    ).not.toBeVisible()
  })
})