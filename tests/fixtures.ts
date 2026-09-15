import { test as base, expect } from '@playwright/test'

const appBasePath = '/dental-clinic-manager/'

type AppFixtures = {
  gotoRoute: (route: string) => Promise<void>
  resetClinicData: () => Promise<void>
}

export const test = base.extend<AppFixtures>({
  gotoRoute: async ({ page }, register) => {
    await register(async (route: string) => {
      const normalizedRoute = route.replace(/^\/+/, '')
      await page.goto(`${appBasePath}#/${normalizedRoute}`)
    })
  },

  resetClinicData: async ({ page }, register) => {
    await register(async () => {
      await page.goto(`${appBasePath}#/patients`)
      await page.evaluate(() => localStorage.clear())
      await page.reload()
    })
  },
})

export { expect }