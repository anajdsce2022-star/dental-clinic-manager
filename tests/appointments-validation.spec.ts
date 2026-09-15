import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

const PATIENT = {
  id: 'appointment-test-patient',
  name: 'Appointment Test Patient',
  phone: '9876543210',
}

const MONDAY = '2099-01-05'
const SUNDAY = '2099-01-04'
const PATIENTS_KEY = 'joshi-dental-clinic-patients'
const APPOINTMENTS_KEY = 'joshi-dental-clinic-appointments'

async function seedPatient(page: Page) {
  await page.evaluate((patient) => {
    localStorage.setItem(
      'joshi-dental-clinic-patients',
      JSON.stringify([patient]),
    )
    localStorage.removeItem('joshi-dental-clinic-appointments')
  }, PATIENT)

  // AppointmentsPage reads patients during initial state creation.
  await page.reload()
}

async function seedAppointments(
  page: Page,
  appointments: unknown[],
) {
  await page.evaluate(
    ({ patientsKey, appointmentsKey, patient, appointments }) => {
      localStorage.setItem(patientsKey, JSON.stringify([patient]))
      localStorage.setItem(appointmentsKey, JSON.stringify(appointments))
    },
    {
      patientsKey: PATIENTS_KEY,
      appointmentsKey: APPOINTMENTS_KEY,
      patient: PATIENT,
      appointments,
    },
  )

  await page.reload()
}

async function showAllAppointments(page: Page) {
  await page.getByRole('button', { name: 'All appointments', exact: true }).click()
}
async function openAppointmentForm(page: any) {
  await page.getByRole('button', { name: '+ New appointment' }).click()

  const heading = page.getByRole('heading', {
    name: 'New appointment',
    level: 2,
  })

  await expect(heading).toBeVisible()

  // In the actual UI the heading is outside the <form>.
  const modal = heading.locator('xpath=ancestor::div[contains(@class, "max-w-2xl")]')
  const form = modal.locator('form')

  await expect(form).toBeVisible()
  return form
}

async function selectPatient(page: any, form: any) {
  const search = form.locator('#patient-search')
  await search.fill(PATIENT.name)

  const option = page
    .getByRole('option')
    .filter({ hasText: PATIENT.name })

  await expect(option).toHaveCount(1)
  await option.click()

  await expect(search).toHaveValue(`${PATIENT.name} — ${PATIENT.phone}`)
}

async function chooseDate(form: any, date: string) {
  const dateInput = form.locator('#appointment-form-date')
  await dateInput.fill(date)
  await expect(dateInput).toHaveValue(date)
}

async function chooseFirstAvailableSlot(form: any) {
  const morning = form
    .getByText('Morning · 10:00 AM - 3:00 PM', { exact: true })
    .locator('..')

  const slot = morning.locator('button:not([disabled])').first()
  await expect(slot).toBeVisible()
  await expect(slot).toBeEnabled()
  await slot.click()

  return slot
}

async function fillRegularAppointment(
  page: any,
  values: { date?: string; visits?: string; reason?: string } = {},
) {
  const form = await openAppointmentForm(page)

  await selectPatient(page, form)
  await chooseDate(form, values.date ?? MONDAY)
  await chooseFirstAvailableSlot(form)

  await form
    .locator('#appointment-reason')
    .fill(values.reason ?? 'Consultation')

  if (values.visits !== undefined) {
    await form.locator('#appointment-visits').fill(values.visits)
  }

  return form
}

async function book(form: any) {
  await form.getByRole('button', { name: 'Book appointment' }).click()
}

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appointment-1',
    patientId: PATIENT.id,
    patientName: PATIENT.name,
    date: MONDAY,
    time: '10:00',
    reason: 'Existing consultation',
    status: 'Scheduled',
    notes: '',
    disease: '',
    requiredVisits: '1',
    plannedTreatments: '',
    ...overrides,
  }
}

test('appointments page opens correctly', async ({ page, gotoRoute }) => {
  await gotoRoute('/appointments')

  await expect(
    page.getByRole('heading', { name: 'Appointments', level: 1 }),
  ).toBeVisible()

  await expect(
    page.getByRole('button', { name: '+ New appointment' }),
  ).toBeVisible()
})

test('new appointment form matches the real modal structure', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await openAppointmentForm(page)

  await expect(form.locator('#patient-search')).toBeVisible()
  await expect(form.locator('#appointment-form-date')).toBeVisible()
  await expect(form.locator('#appointment-visits')).toBeVisible()
  await expect(form.locator('#planned-treatments')).toBeVisible()
  await expect(form.locator('#appointment-notes')).toBeVisible()
  await expect(form.locator('#appointment-reason')).toBeVisible()
  await expect(
    form.getByRole('button', { name: 'Book appointment' }),
  ).toBeEnabled()
})

test('patient search selects an existing patient', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await openAppointmentForm(page)
  await selectPatient(page, form)
})

test('booking a valid regular appointment creates a confirmation', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await fillRegularAppointment(page, {
    visits: '2',
    reason: 'Root canal consultation',
  })

  await book(form)

  await expect(
    page.getByRole('heading', { name: 'Appointment booked', level: 2 }),
  ).toBeVisible()

  await expect(
    page.getByRole('heading', { name: 'Appointment booked', level: 2 }).locator('xpath=ancestor::div[contains(@class, "max-w-md")]').getByText(PATIENT.name, { exact: true }),
  ).toBeVisible()

  const saved = await page.evaluate((key) => {
    return JSON.parse(localStorage.getItem(key) || '[]')
  }, APPOINTMENTS_KEY)

  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({
    patientId: PATIENT.id,
    patientName: PATIENT.name,
    date: MONDAY,
    reason: 'Root canal consultation',
    status: 'Scheduled',
    requiredVisits: '2',
  })
})

test('expected visits accepts a whole number from 1 to 50', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await fillRegularAppointment(page, { visits: '50' })
  await book(form)

  await expect(
    page.getByRole('heading', { name: 'Appointment booked', level: 2 }),
  ).toBeVisible()
})

test('expected visits rejects zero', async ({ page, gotoRoute }) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await fillRegularAppointment(page, { visits: '0' })
  await book(form)

  await expect(page.getByRole('alert')).toHaveText(
    'Expected visits must be a whole number between 1 and 50.',
  )
})

test('expected visits rejects decimal values', async ({ page, gotoRoute }) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await fillRegularAppointment(page, { visits: '1.5' })
  await book(form)

  await expect(page.getByRole('alert')).toHaveText(
    'Expected visits must be a whole number between 1 and 50.',
  )
})

test('expected visits rejects values above 50', async ({ page, gotoRoute }) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await fillRegularAppointment(page, { visits: '51' })
  await book(form)

  await expect(page.getByRole('alert')).toHaveText(
    'Expected visits must be a whole number between 1 and 50.',
  )
})

test('booking requires a patient selection', async ({ page, gotoRoute }) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await openAppointmentForm(page)
  await chooseDate(form, MONDAY)
  await chooseFirstAvailableSlot(form)
  await form.locator('#appointment-reason').fill('Consultation')

  await book(form)

  await expect(page.getByRole('alert')).toHaveText('Please select a patient.')
})

test('booking requires a reason', async ({ page, gotoRoute }) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await openAppointmentForm(page)
  await selectPatient(page, form)
  await chooseDate(form, MONDAY)
  await chooseFirstAvailableSlot(form)

  await book(form)

  await expect(page.getByRole('alert')).toHaveText(
    'Please enter the reason for the appointment.',
  )
})

test('occupied slot is disabled', async ({ page, gotoRoute }) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [appointment()])
  await showAllAppointments(page)

  const form = await openAppointmentForm(page)
  await chooseDate(form, MONDAY)

  const occupied = form.getByRole('button', {
    name: '10:00 AM, already unavailable',
  })

  await expect(occupied).toBeVisible()
  await expect(occupied).toBeDisabled()
  await expect(occupied).toHaveAttribute('aria-disabled', 'true')
})

test('cancelled and no-show appointments do not occupy their slots', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [
    appointment({
      id: 'cancelled',
      time: '10:00',
      status: 'Cancelled',
    }),
    appointment({
      id: 'no-show',
      time: '10:30',
      status: 'No show',
    }),
  ])

  const form = await openAppointmentForm(page)
  await chooseDate(form, MONDAY)

  await expect(form.getByRole('button', { name: '10:00 AM' })).toBeEnabled()
  await expect(form.getByRole('button', { name: '10:30 AM' })).toBeEnabled()
})

test('Sunday switches to urgent-care flow', async ({ page, gotoRoute }) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await openAppointmentForm(page)
  await selectPatient(page, form)
  await chooseDate(form, SUNDAY)

  await expect(form.getByText('Urgent care only', { exact: true })).toBeVisible()
  await expect(form.locator('#appointment-form-time')).toBeVisible()
  await expect(form.locator('#appointment-urgent-reason')).toBeVisible()

  await expect(
    form.getByText(
      'Regular appointments are unavailable on Sunday. For urgent dental treatment, a flexible time can be arranged.',
    ),
  ).toBeVisible()

  await expect(
    form.getByText('Morning · 10:00 AM - 3:00 PM', { exact: true }),
  ).toHaveCount(0)
})

test('Sunday appointment requires an urgency reason', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await openAppointmentForm(page)
  await selectPatient(page, form)
  await chooseDate(form, SUNDAY)
  await form.locator('#appointment-form-time').fill('11:00')

  await book(form)

  await expect(page.getByRole('alert')).toHaveText(
    'Please enter the urgency reason.',
  )
})

test('Sunday urgent appointment can be booked with a flexible time', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedPatient(page)

  const form = await openAppointmentForm(page)
  await selectPatient(page, form)
  await chooseDate(form, SUNDAY)
  await form.locator('#appointment-form-time').fill('11:00')
  await form.locator('#appointment-urgent-reason').fill('Severe tooth pain')

  await book(form)

  await expect(
    page.getByRole('heading', { name: 'Appointment booked', level: 2 }),
  ).toBeVisible()
})

test('Under treatment requires treatment details', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [appointment()])
  await showAllAppointments(page)

  const statusButton = page.getByRole('button', {
    name: `Change status for ${PATIENT.name}`,
  }).first()
  await statusButton.click()

  const option = page.getByRole('option', { name: 'Under treatment' }).first()
  await option.click()

  await expect(
    page.getByRole('heading', { name: 'Mark as Under treatment', level: 2 }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Confirm action' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Please describe the treatment or care provided.',
  )
})

test('Completed requires both a reason and treatment details', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [appointment()])
  await showAllAppointments(page)

  await page
    .getByRole('button', { name: `Change status for ${PATIENT.name}` })
    .first()
    .click()
  await page.getByRole('option', { name: 'Completed' }).first().click()

  await page.getByRole('button', { name: 'Confirm action' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Please explain why this status is being recorded.',
  )

  await page
    .locator('#status-action-reason')
    .fill('Patient attended scheduled visit')
  await page.getByRole('button', { name: 'Confirm action' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Please describe the treatment or care provided.',
  )
})

test('Completed records treatment details and opens completion confirmation', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [appointment()])
  await showAllAppointments(page)

  await page
    .getByRole('button', { name: `Change status for ${PATIENT.name}` })
    .first()
    .click()
  await page.getByRole('option', { name: 'Completed' }).first().click()

  await page
    .locator('#status-action-reason')
    .fill('Patient attended scheduled visit')
  await page
    .locator('#treatment-details')
    .fill('Clinical examination completed')
  await page.locator('#revisit-date').fill('2099-01-19')

  await page.getByRole('button', { name: 'Confirm action' }).click()

  await expect(
    page.getByRole('heading', { name: 'Appointment completed', level: 2 }),
  ).toBeVisible()

  const saved = await page.evaluate((key) => {
    return JSON.parse(localStorage.getItem(key) || '[]')
  }, APPOINTMENTS_KEY)

  expect(saved[0]).toMatchObject({
    status: 'Completed',
    actionReason: 'Patient attended scheduled visit',
    treatmentDetails: 'Clinical examination completed',
    revisitDate: '2099-01-19',
  })
})

test('Cancelled requires a reason and can optionally carry a reschedule', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [appointment()])
  await showAllAppointments(page)

  await page
    .getByRole('button', { name: `Change status for ${PATIENT.name}` })
    .first()
    .click()
  await page.getByRole('option', { name: 'Cancelled' }).first().click()

  await expect(page.getByText('Rescheduling is optional')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm action' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'Please explain why this status is being recorded.',
  )

  await page
    .locator('#status-action-reason')
    .fill('Patient requested cancellation')
  await page.getByRole('button', { name: 'Confirm action' }).click()

  await expect(
    page.getByRole('button', { name: `Change status for ${PATIENT.name}` }).first(),
  ).toHaveText('Cancelled')
})

test('No show can be recorded with a rescheduled date and time', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [appointment()])
  await showAllAppointments(page)

  await page
    .getByRole('button', { name: `Change status for ${PATIENT.name}` })
    .first()
    .click()
  await page.getByRole('option', { name: 'No show' }).first().click()

  await page
    .locator('#status-action-reason')
    .fill('Patient did not attend')
  await page.getByLabel('Rescheduled date').fill('2099-01-12')
  await page.getByLabel('Rescheduled time').fill('10:30')

  await page.getByRole('button', { name: 'Confirm action' }).click()

  await expect(
    page.getByRole('button', { name: `Change status for ${PATIENT.name}` }).first(),
  ).toHaveText('No show')

  await expect(
    page.getByRole('table').getByText('Rescheduled: 12 Jan 2099 at 10:30'),
  ).toBeVisible()
})

test('changing status to a slot-occupying status detects a conflict', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [
    appointment({ id: 'first', time: '10:00', status: 'Scheduled' }),
    appointment({
      id: 'second',
      time: '10:00',
      status: 'Cancelled',
      reason: 'Cancelled appointment',
    }),
  ])
  await showAllAppointments(page)

  // Open the second appointment's status menu. Desktop and mobile copies exist,
  // so use the first matching visible control.
  const secondRow = page.locator('[data-appointment-id="second"]').first()
  await secondRow
    .getByRole('button', { name: `Change status for ${PATIENT.name}` })
    .click()
  await page.getByRole('option', { name: 'Scheduled' }).first().click()

  await page
    .locator('#status-action-reason')
    .fill('Patient has confirmed the visit')
  await page.getByRole('button', { name: 'Confirm action' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'This time slot is already occupied. Please choose another time.',
  )
})

test('edit appointment preserves its own occupied slot', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [appointment()])
  await showAllAppointments(page)

  await page.getByRole('button', { name: 'Edit' }).first().click()

  await expect(
    page.getByRole('heading', { name: 'Edit appointment', level: 2 }),
  ).toBeVisible()

  const form = page.getByRole('heading', {
    name: 'Edit appointment',
    level: 2,
  }).locator('xpath=ancestor::div[contains(@class, "max-w-2xl")]').locator('form')

  await expect(form.locator('#appointment-form-date')).toHaveValue(MONDAY)
  await expect(form.locator('#patient-search')).toHaveValue(PATIENT.name)

  const ownSlot = form.getByRole('button', { name: '10:00 AM' })
  await expect(ownSlot).toBeEnabled()
})

test('delete appointment removes it after confirmation', async ({
  page,
  gotoRoute,
}) => {
  await gotoRoute('/appointments')
  await seedAppointments(page, [appointment()])
  await showAllAppointments(page)

  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain(PATIENT.name)
    await dialog.accept()
  })

  await page.getByRole('button', { name: 'Delete' }).first().click()

  await expect(page.getByText('No appointments found')).toBeVisible()

  const saved = await page.evaluate((key) => {
    return JSON.parse(localStorage.getItem(key) || '[]')
  }, APPOINTMENTS_KEY)

  expect(saved).toHaveLength(0)
})
