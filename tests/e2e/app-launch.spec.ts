import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type LaunchedApp } from './helpers/launchApp'

let launched: LaunchedApp

test.beforeEach(async () => {
  launched = await launchApp()
})

test.afterEach(async () => {
  await closeApp(launched)
})

test('shows the Add Account dialog on first launch', async () => {
  const { window } = launched
  await expect(window.getByRole('heading', { name: 'Add Account' })).toBeVisible()
  await expect(window.getByPlaceholder('you@example.com')).toBeVisible()
})

test('toolbar renders with traffic lights and primary actions', async () => {
  const { window } = launched
  await expect(window.getByTitle('Get Mail')).toBeVisible()
  await expect(window.getByTitle('New Message')).toBeVisible()
  await expect(window.getByPlaceholder('Search')).toBeVisible()
})

test('Add Account submit is disabled until required fields are filled', async () => {
  const { window } = launched
  const submit = window.getByRole('button', { name: 'Add Account', exact: true })
  await expect(submit).toBeDisabled()

  await window.getByPlaceholder('you@example.com').fill('tester@example.com')
  await window.locator('input[type="password"]').fill('secret-password')
  await window.getByPlaceholder('imap.example.com').fill('imap.example.com')
  await window.getByPlaceholder('smtp.example.com').fill('smtp.example.com')

  await expect(submit).toBeEnabled()
})

test('visual regression: full window light mode', async () => {
  const { window } = launched
  await window.emulateMedia({ colorScheme: 'light' })
  await expect(window).toHaveScreenshot('app-shell-light.png', { maxDiffPixelRatio: 0.02 })
})

test('visual regression: full window dark mode', async () => {
  const { window } = launched
  await window.emulateMedia({ colorScheme: 'dark' })
  await expect(window).toHaveScreenshot('app-shell-dark.png', { maxDiffPixelRatio: 0.02 })
})
