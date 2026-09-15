import { test, expect } from './fixtures'

const STORAGE_KEYS = [
  'joshi-dental-clinic-patients',
  'joshi-dental-clinic-appointments',
  'joshi-dental-clinic-treatments',
  'joshi-dental-clinic-invoices',
  'joshi-dental-clinic-inventory',
]

const ROUTES = [
  { path: 'dashboard', heading: 'Dashboard' },
  { path: 'patients', heading: 'Patients' },
  { path: 'appointments', heading: 'Appointments' },
  { path: 'treatments', heading: 'Treatments' },
  { path: 'billing', heading: 'Billing' },
  { path: 'inventory', heading: 'Inventory' },
  { path: 'reports', heading: 'Reports' },
]

async function corruptAllStorage(page: any) {
  await page.evaluate((keys: string[]) => {
    for (const key of keys) {
      localStorage.setItem(key, '{this is not valid JSON')
    }
  }, STORAGE_KEYS)
}

async function seedStorage(
  page: any,
  data: Record<string, unknown>,
) {
  await page.evaluate((records: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(records)) {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }, data)
}

test.beforeEach(async ({ resetClinicData, gotoRoute }) => {
  await gotoRoute('dashboard')
  await resetClinicData()
  await gotoRoute('dashboard')
})

test('all clinic routes survive malformed stored JSON', async ({
  page,
  gotoRoute,
}) => {
  await corruptAllStorage(page)

  for (const route of ROUTES) {
    await gotoRoute(route.path)

    if (route.path === 'dashboard') {
      await expect(
        page.getByRole('heading', {
          name: /Good morning\.|Good afternoon\.|Good evening\.|Welcome back\./,
          level: 1,
        }),
      ).toBeVisible()
    } else {
      await expect(
        page.getByRole('heading', {
          name: route.heading,
          level: 1,
        }),
      ).toBeVisible()
    }
  }
})

test('patients page ignores malformed stored records instead of crashing', async ({
  page,
  gotoRoute,
}) => {
  await seedStorage(page, {
    'joshi-dental-clinic-patients': [
      null,
      42,
      'not-a-patient',
      {
        id: 'valid-patient',
        name: 'Valid Patient',
        phone: '9876543210',
        email: 'valid@example.com',
        dateOfBirth: '1990-01-01',
        gender: 'Female',
        address: '',
        emergencyContact: '',
        bloodGroup: '',
        allergies: '',
        medicalNotes: '',
        createdAt: new Date().toISOString(),
      },
    ],
  })

  await gotoRoute('patients')

  await expect(
    page.getByRole('heading', {
      name: 'Patients',
      level: 1,
    }),
  ).toBeVisible()

  await expect(
    page.getByText('Valid Patient', {
      exact: true,
    }),
  ).toBeVisible()
})

test('appointments page ignores malformed stored appointment records', async ({
  page,
  gotoRoute,
}) => {
  await seedStorage(page, {
    'joshi-dental-clinic-patients': [
      {
        id: 'test-patient',
        name: 'Test Patient',
        phone: '9876543210',
      },
    ],

    'joshi-dental-clinic-appointments': [
      null,
      123,
      {
        id: 'broken-appointment',
        patientId: 'test-patient',
        patientName: 'Test Patient',
        date: 'not-a-date',
        time: '99:99',
        reason: 'Broken',
        status: 'INVALID STATUS',
      },
    ],
  })

  await gotoRoute('appointments')

  await expect(
    page.getByRole('heading', {
      name: 'Appointments',
      level: 1,
    }),
  ).toBeVisible()

  await expect(
    page.getByText(/No appointments found/i),
  ).toBeVisible()
})

test('duplicate patient IDs do not produce duplicate patient rows', async ({
  page,
  gotoRoute,
}) => {
  await seedStorage(page, {
    'joshi-dental-clinic-patients': [
      {
        id: 'same-id',
        name: 'First Patient',
        phone: '9876543210',
        email: 'first@example.com',
        dateOfBirth: '1990-01-01',
        gender: 'Female',
        address: '',
        emergencyContact: '',
        bloodGroup: '',
        allergies: '',
        medicalNotes: '',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'same-id',
        name: 'Second Patient',
        phone: '9876543211',
        email: 'second@example.com',
        dateOfBirth: '1991-01-01',
        gender: 'Male',
        address: '',
        emergencyContact: '',
        bloodGroup: '',
        allergies: '',
        medicalNotes: '',
        createdAt: new Date().toISOString(),
      },
    ],
  })

  await gotoRoute('patients')

  await expect(
    page.getByText('First Patient', {
      exact: true,
    }),
  ).toHaveCount(1)

  await expect(
    page.getByText('Second Patient', {
      exact: true,
    }),
  ).toHaveCount(0)
})

test('valid stored data survives a browser refresh across the main modules', async ({
  page,
  gotoRoute,
}) => {
  await seedStorage(page, {
    'joshi-dental-clinic-patients': [
      {
        id: 'refresh-patient',
        name: 'Refresh Test Patient',
        phone: '9876543210',
        email: 'refresh@example.com',
        dateOfBirth: '1990-01-01',
        gender: 'Female',
        address: '',
        emergencyContact: '',
        bloodGroup: '',
        allergies: '',
        medicalNotes: '',
        createdAt: new Date().toISOString(),
      },
    ],
  })

  await gotoRoute('patients')

  await expect(
    page.getByText('Refresh Test Patient', {
      exact: true,
    }),
  ).toBeVisible()

  await page.reload()

  await expect(
    page.getByText('Refresh Test Patient', {
      exact: true,
    }),
  ).toBeVisible()

  await gotoRoute('dashboard')

  await expect(
    page.getByRole('heading', {
      name: /Good morning\.|Good afternoon\.|Good evening\.|Welcome back\./,
      level: 1,
    }),
  ).toBeVisible()

  await page.reload()

  await expect(
    page.getByRole('heading', {
      name: /Good morning\.|Good afternoon\.|Good evening\.|Welcome back\./,
      level: 1,
    }),
  ).toBeVisible()
})