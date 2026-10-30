import { expect, type Page } from '@playwright/test'

// Adds an account through the real Add Account UI. The test profile has no
// reachable IMAP/SMTP server, so this only exercises local account storage
// (no live connection), which is all most UI-flow tests need.
export async function addTestAccount(window: Page, email = 'tester@example.com'): Promise<void> {
  await window.getByPlaceholder('you@example.com').fill(email)
  await window.locator('input[type="password"]').fill('irrelevant-for-this-test')
  await window.getByPlaceholder('imap.example.com').fill('imap.example.com')
  await window.getByPlaceholder('smtp.example.com').fill('smtp.example.com')
  await window.getByRole('button', { name: 'Add Account', exact: true }).click()
  // Wait for the dialog to actually close rather than racing the click —
  // addAccount() sets selectedAccountId synchronously in the same update
  // that closes this dialog, so this is a reliable "account is selected" signal.
  await expect(window.getByRole('heading', { name: 'Add Account' })).toBeHidden()
}
