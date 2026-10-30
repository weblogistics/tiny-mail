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

// Regression test for a real bug: Electron does not implement
// window.prompt() (it throws "prompt() is not supported"), so clicking
// "New Mailbox" used to silently do nothing. The folder name now comes
// from a custom in-app dialog instead — this verifies that dialog
// actually renders, accepts input, and can be submitted or cancelled.
test('New Mailbox opens an in-app naming dialog that can be filled in and cancelled', async () => {
  const { window } = launched

  await window.getByText('+ New Mailbox').click()
  await expect(window.getByText('New Mailbox', { exact: true })).toBeVisible()

  const input = window.locator('input').last()
  const createButton = window.getByRole('button', { name: 'Create' })
  await expect(createButton).toBeDisabled()

  await input.fill('Receipts')
  await expect(createButton).toBeEnabled()

  await window.getByText('Cancel').click()
  await expect(window.getByText('New Mailbox', { exact: true })).toBeHidden()
})

test('New Mailbox dialog submits and closes', async () => {
  const { window } = launched

  await window.getByText('+ New Mailbox').click()
  await window.locator('input').last().fill('Receipts')
  await window.getByRole('button', { name: 'Create' }).click()

  await expect(window.getByText('New Mailbox', { exact: true })).toBeHidden()
})
