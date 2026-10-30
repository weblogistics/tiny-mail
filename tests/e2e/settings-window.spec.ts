import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type LaunchedApp } from './helpers/launchApp'
import { addTestAccount } from './helpers/addTestAccount'

let launched: LaunchedApp

test.beforeEach(async () => {
  launched = await launchApp()
  await addTestAccount(launched.window)
})

test.afterEach(async () => {
  await closeApp(launched)
})

test('Settings opens as its own window with General and Accounts tabs', async () => {
  const { app, window } = launched

  const [settingsWindow] = await Promise.all([
    app.waitForEvent('window'),
    window.getByTitle('Settings').click()
  ])
  await settingsWindow.waitForLoadState('domcontentloaded')

  expect(app.windows().length).toBe(2)
  await expect(settingsWindow.getByText('General')).toBeVisible()
  await expect(settingsWindow.getByText('Accounts')).toBeVisible()
  await expect(settingsWindow.getByText('Mark messages as read when selected')).toBeVisible()
})

test('Settings reuses the same window instead of opening duplicates', async () => {
  const { app, window } = launched

  const [settingsWindow] = await Promise.all([
    app.waitForEvent('window'),
    window.getByTitle('Settings').click()
  ])
  await settingsWindow.waitForLoadState('domcontentloaded')

  await window.getByTitle('Settings').click()
  await window.waitForTimeout(500)

  expect(app.windows().length).toBe(2)
})

test('editing an account from Settings updates its name', async () => {
  const { app, window } = launched

  const [settingsWindow] = await Promise.all([
    app.waitForEvent('window'),
    window.getByTitle('Settings').click()
  ])
  await settingsWindow.waitForLoadState('domcontentloaded')

  await settingsWindow.getByText('Accounts', { exact: true }).click()
  await expect(settingsWindow.getByText('tester@example.com').first()).toBeVisible()

  await settingsWindow.getByTitle('Edit').click()
  const nameInput = settingsWindow.locator('input').first()
  await nameInput.fill('Renamed Tester')
  await settingsWindow.getByRole('button', { name: 'Save' }).click()

  await expect(settingsWindow.getByText('Renamed Tester')).toBeVisible()
})
