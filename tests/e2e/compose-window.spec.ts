import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type LaunchedApp } from './helpers/launchApp'
import { addTestAccount } from './helpers/addTestAccount'

let launched: LaunchedApp

test.beforeEach(async () => {
  launched = await launchApp()
  // Compose needs an account to address a "From" to.
  await addTestAccount(launched.window)
})

test.afterEach(async () => {
  await closeApp(launched)
})

test('New Message opens as its own window with its own traffic lights', async () => {
  const { app, window } = launched

  const [composeWindow] = await Promise.all([
    app.waitForEvent('window'),
    window.getByTitle('New Message').click()
  ])
  await composeWindow.waitForLoadState('domcontentloaded')

  expect(app.windows().length).toBe(2)
  await expect(composeWindow.getByText('To:')).toBeVisible()
  await expect(composeWindow.getByText('Subject:')).toBeVisible()
  await expect(composeWindow.getByTitle('Bold')).toBeVisible()
  await expect(composeWindow.getByTitle('Attach File')).toBeVisible()
  await expect(composeWindow.getByRole('button', { name: 'Send' })).toBeDisabled()
})

test('compose window send button enables once a recipient is entered', async () => {
  const { app, window } = launched

  const [composeWindow] = await Promise.all([
    app.waitForEvent('window'),
    window.getByTitle('New Message').click()
  ])
  await composeWindow.waitForLoadState('domcontentloaded')

  const toField = composeWindow.locator('input').first()
  await toField.fill('someone@example.com')
  await expect(composeWindow.getByRole('button', { name: 'Send' })).toBeEnabled()
})

test('Bold toolbar button reflects formatting at the cursor', async () => {
  const { app, window } = launched

  const [composeWindow] = await Promise.all([
    app.waitForEvent('window'),
    window.getByTitle('New Message').click()
  ])
  await composeWindow.waitForLoadState('domcontentloaded')

  const body = composeWindow.locator('[contenteditable]')
  const boldButton = composeWindow.getByTitle('Bold')

  await body.click()
  await composeWindow.keyboard.type('Hello World')
  await expect(boldButton).not.toHaveClass(/active/)

  // Select "Hello" and make it bold.
  await composeWindow.keyboard.press('Control+Home')
  for (let i = 0; i < 5; i++) await composeWindow.keyboard.press('Shift+ArrowRight')
  await boldButton.click()
  await expect(boldButton).toHaveClass(/active/)

  // Move the caret into the now-plain " World" — button should turn off.
  await composeWindow.keyboard.press('End')
  await expect(boldButton).not.toHaveClass(/active/)

  // Move the caret back into the bold word — button should turn back on.
  await composeWindow.keyboard.press('Control+Home')
  await composeWindow.keyboard.press('ArrowRight')
  await composeWindow.keyboard.press('ArrowRight')
  await expect(boldButton).toHaveClass(/active/)
})
