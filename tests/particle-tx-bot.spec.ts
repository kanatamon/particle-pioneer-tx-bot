import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fetch from 'node-fetch';
import type { SocialNetworKCredential } from '../credentials';
import { credentials } from '../credentials';

const FIVE_HOURS = 5 * 60 * 60 * 1000;

const POINT_PER_TX = 50;
const MAX_DAILY_TX = 100;

test.describe.configure({ mode: 'parallel' });

test.beforeAll(async () => {
  await fetch('http://localhost:3000/user/list', {
    method: 'POST',
    body: JSON.stringify({ users: credentials.map((c) => c.emailOrUsername) }),
    headers: { 'Content-Type': 'application/json' },
  });
});

function updateTxCount(user: string, txCount: number) {
  return fetch('http://localhost:3000/user/tx-count', {
    method: 'POST',
    body: JSON.stringify({ user, txCount }),
    headers: { 'Content-Type': 'application/json' },
  });
}

// {
//     "id": 1368546,
//     "created_at": "2024-05-07T16:24:31.000Z",
//     "updated_at": "2024-05-07T16:24:31.000Z",
//     "address": "0xbD3C8c0CFDfF5F8327eDad278a17C0483508Ae83",
//     "type": 2,
//     "typeKey": "2024-05-07",
//     "point": "100"
// }
type PointRecord = {
  id: number;
  created_at: string;
  updated_at: string;
  address: string;
  type: number;
  typeKey: string;
  point: string;
};

for (const credential of credentials as SocialNetworKCredential[]) {
  test(`[${credential.emailOrUsername}] daily check-in & transfer tx`, async ({
    page,
  }) => {
    test.setTimeout(FIVE_HOURS);

    await page.setViewportSize({
      width: 900,
      height: 788,
    });

    await signInViaSocialNetwork(credential, page);
    const userLoggedIn = await checkUserLoggedIn(page);
    if (!userLoggedIn) {
      throw new Error('Failed to login');
    }
    for (let i = await currentTxMade(page); i < MAX_DAILY_TX; i++) {
      await makeSuccessfulTx(credential, page);
      updateTxCount(credential.emailOrUsername, i + 1);
      const wait = 5_000;
      await page.waitForTimeout(wait);
    }
  });
}

async function makeSuccessfulTx(
  credential: SocialNetworKCredential,
  page: Page
) {
  await page.goto('https://pioneer.particle.network/en/point');

  const userLoggedIn = await checkUserLoggedIn(page);
  if (!userLoggedIn) {
    await signInViaSocialNetwork(credential, page);
  }

  await openPweWindow(page);
  const chain = {
    id: '11155111',
    name: 'Ethereum Sepolia',
  };
  await selectChain(chain, page);

  await goToSendPage(page);
  await fillSendPageFields(
    {
      address: '0xe2f35B11c5B54DbB2176D055E5531E41e7721457',
      amount: '0.000001',
    },
    page
  );
  await locators(page).pweSendPageFieldsSendButton().click();

  await invariantErc4337Modal(page);
  await locators(page).pweErc4337ModalSendButton().click();

  const signInfoPopUp = await checkSignInfoPopUp(page);
  if (!signInfoPopUp) {
    return makeSuccessfulTx(credential, page);
  }

  // 🚨 Due to shadow-root (close mode), it's impossible to interact the sign-info UI using javascript
  // ,instead, we just blindly click the "Confirm" button
  // ✅ Make sure to set the viewport size to 900x788 ~ then the button will be at [546, 652]
  expect(page.viewportSize()).toEqual({ width: 900, height: 788 });
  await page.mouse.click(546, 652);

  const success = await checkTxSuccess(page);
  if (!success) {
    return makeSuccessfulTx(credential, page);
  }
  await locators(page).pweTxSuccessModalCloseButton().click();
  await expect(locators(page).pweIndexPage()).toBeVisible();
}

function signInViaSocialNetwork(
  credential: SocialNetworKCredential,
  page: Page
) {
  switch (credential.type) {
    case 'discord':
      return signInViaDiscord(credential, page);
    case 'twitter':
      return signInViaTwitter(credential, page);
  }
}

async function signInViaDiscord(
  { emailOrUsername, password }: { emailOrUsername: string; password: string },
  page: Page
) {
  await page.goto('https://pioneer.particle.network/en/signup');

  // Verify Discord login button
  const discordLoginBtn = page.locator(
    '//html/body/div[1]/div[1]/div/div[1]/div[3]/div[2]/button[5]'
  );
  await expect(discordLoginBtn).toBeVisible();

  // Click the Discord login button
  await discordLoginBtn.click();

  // Verify navigation to Discord login page
  await page.waitForURL('https://discord.com/*');
  await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();

  // Type email and password
  await page.getByLabel(/email or phone number/i).fill(emailOrUsername);
  await page.getByLabel(/password/i).fill(password);

  // Click the "Log In" button
  await page.getByRole('button', { name: /log in/i }).click();

  // Verify navigation to authorize page
  await expect(page.getByRole('button', { name: /authorize/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: /authorize/i }).click();

  // Verify navigation back to the Pioneer page
  await page.waitForURL('https://pioneer.particle.network/*');
  await expect(page).toHaveTitle(/Particle Pioneer/);
}

async function signInViaTwitter(
  { emailOrUsername, password }: { emailOrUsername: string; password: string },
  page: Page
) {
  await page.goto('https://pioneer.particle.network/en/signup');

  const xLoginBtn = page.locator(
    '//html/body/div[1]/div[1]/div/div[1]/div[3]/div[2]/button[2]'
  );
  await expect(xLoginBtn).toBeVisible();

  await xLoginBtn.click();

  const usernameInput = page.locator('input[autocomplete=username]');
  await expect(usernameInput).toBeVisible({
    timeout: 20_000,
  });

  await usernameInput.pressSequentially(emailOrUsername, { delay: 100 });

  await page.getByRole('button', { name: /next/i }).click();

  const passwordInput = page.locator('input[autocomplete=current-password]');
  await expect(passwordInput).toBeVisible();

  await passwordInput.pressSequentially(password, { delay: 100 });

  await page.getByRole('button', { name: /log in/i }).click();

  // Verify navigation to authorize page
  await expect(
    page.getByRole('button', { name: /authorize app/i })
  ).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: /authorize app/i }).click();

  // Verify navigation back to the Pioneer page
  await page.waitForURL('https://pioneer.particle.network/*');
  await expect(page).toHaveTitle(/Particle Pioneer/);
}

/**
 *  Wait for the "Sign Info" modal to show up
 *
 * 🚨 Due to shadow-root (close mode), it's impossible to access the sign-info UI using javascript
 * ,instead, we implicitly check whether the "Sign" modal is visible by listening to the network request
 *
 */
async function checkSignInfoPopUp(page: Page, options?: { timeout?: number }) {
  await page.waitForTimeout(3_000);
  return true;
  /**
   * @deprecated The pioneer.particle.network is now using a different method to handle the sign-info modal
   */
  // let isIgnored = false;
  // return new Promise<boolean>((resolve) => {
  //   page.on('response', async (response) => {
  //     const request = response.request();
  //     if (isIgnored) return;
  //     if (
  //       response.ok() &&
  //       request.url() === 'https://universal-api.particle.network/' &&
  //       request.method().match(/post/i) &&
  //       request.postDataJSON()?.method ===
  //         'universal_createCrossChainUserOperation'
  //     ) {
  //       // Approximated wait for UI to be attached to the DOM
  //       await new Promise((r) => setTimeout(r, 1000));
  //       resolve(true);
  //     }
  //   });
  //   setTimeout(() => {
  //     isIgnored = true;
  //     resolve(false);
  //   }, options?.timeout ?? 20_000);
  // });
}

async function checkUserLoggedIn(page: Page, options?: { timeout?: number }) {
  await page.goto('https://pioneer.particle.network/en/point');
  return locators(page)
    .pweBtn()
    .waitFor({ state: 'attached', timeout: options?.timeout ?? 20_000 })
    .then(() => true)
    .catch(() => false);
}

async function openPweWindow(page: Page) {
  await locators(page).pweBtn().click();
  await expect(locators(page).pweIndexPage()).toBeInViewport();
}

function locators(page: Page) {
  const pwe = () => page.frameLocator('.particle-pwe-iframe');
  return {
    pwe,
    pweTxSuccessModalCloseButton() {
      return pwe().locator(
        '//html/body/div[5]/div/div[3]/div/div/div[1]/div[2]/span'
      );
    },
    pweTxSuccessModal() {
      return pwe().getByText('View on block explorer');
    },
    pweErc4337ModalSendButton() {
      return pwe().locator(
        '//html/body/div[4]/div/div[3]/div/div/div[2]/div/div[2]/button'
      );
    },
    pweErc4337Modal() {
      return pwe().locator('.erc4337-transaction-container');
    },
    pweErc4337ModalTokenName() {
      return pwe().locator('.gas-fee-item[data-selected=true] .fee-name');
    },
    pweErc4337ModalTokenUsage() {
      return pwe().locator('.gas-fee-item[data-selected=true] .gas-fee');
    },
    pweErc4337ModalTokenBalance() {
      return pwe().locator('.gas-fee-item[data-selected=true] .token-balance');
    },
    pweSendPageEstimatedAmountInUsd() {
      return pwe().locator('.usd-content');
    },
    pweSendPageAddressField() {
      return pwe().locator('textarea[id=send_to]');
    },
    pweSendPageAmountField() {
      return pwe().locator('input[id=send_amount]');
    },
    pweSendPageFieldsSendButton() {
      return pwe().locator('//*[@id="send"]/div[4]/div/div/div/div/button');
    },
    pweBtn() {
      return page.locator('.particle-pwe-btn');
    },
    pweIndexPage() {
      return pwe().locator('body._page_index');
    },
    pweSendPage() {
      return pwe().locator('body._page_send');
    },
    pweLinkToSendPage() {
      return pwe().locator('.mini-link-content:has(a[href*=send])');
    },
    pweNetworkAvatar() {
      return pwe().locator('.network.type.m-network > .ant-image');
    },
    pweNetworkSwitcher() {
      return pwe().locator('.network.type.m-network');
    },
    pweNetworkSwitcherModal() {
      return pwe().locator('.swaitch-chain-modal.ant-drawer-open');
    },
    pweNetworkSwitcherChainItem(chainId: string) {
      return pwe().locator(`.item[data-chainid="${chainId}"]`);
    },
  };
}

async function selectChain(
  chain: {
    id: string;
    name: string;
  },
  page: Page
) {
  await expect(locators(page).pweNetworkAvatar()).toBeAttached();

  await locators(page).pweNetworkSwitcher().click();
  await expect(locators(page).pweNetworkSwitcherModal()).toBeInViewport();

  await locators(page).pweNetworkSwitcherChainItem(chain.id).click();
  await expect(locators(page).pweNetworkSwitcherModal()).not.toBeInViewport();

  await expect(locators(page).pweNetworkSwitcher()).toContainText(chain.name);
}

async function goToSendPage(page: Page) {
  await locators(page).pweLinkToSendPage().click();
  await expect(locators(page).pweSendPage()).toBeVisible();
}

async function fillSendPageFields(
  sendInfo: {
    address: string;
    amount: string;
  },
  page: Page
) {
  await locators(page)
    .pweSendPageAddressField()
    .pressSequentially(sendInfo.address, { delay: 100 });
  await locators(page)
    .pweSendPageAmountField()
    .pressSequentially(sendInfo.amount, {
      delay: 100,
    });
  await expect(
    locators(page).pweSendPageEstimatedAmountInUsd()
  ).not.toContainText('≈0 USD');
}

async function invariantErc4337Modal(page: Page) {
  await expect(locators(page).pweErc4337Modal()).toBeInViewport({
    timeout: 60_000,
  });

  await expect(locators(page).pweErc4337ModalTokenName()).toHaveText('USDG');

  const gasFeeText = await locators(page)
    .pweErc4337ModalTokenUsage()
    .innerText();
  const tokenBalanceText = await locators(page)
    .pweErc4337ModalTokenBalance()
    .innerText();
  // @ts-ignore
  const gasFee = Number(gasFeeText.replaceAll(',', ''));
  // @ts-ignore
  const tokenBalance = Number(tokenBalanceText.replaceAll(',', ''));
  if (Number.isNaN(gasFee) || Number.isNaN(tokenBalance)) {
    throw new Error('Failed to parse gas fee or token balance');
  }
  if (tokenBalance < Math.abs(gasFee)) {
    throw new Error('Insufficient token balance');
  }
}

async function checkTxSuccess(page: Page) {
  return expect(locators(page).pweTxSuccessModal())
    .toBeInViewport({
      timeout: 60_000,
    })
    .then(() => true)
    .catch(() => false);
}

async function checkTodayPointEarned(page: Page) {
  await page.goto('https://pioneer.particle.network/en/point');
  await page.getByText('Points History').click();
  return new Promise<number>((resolve) => {
    page.on('response', async (response) => {
      if (
        response.ok() &&
        response
          .url()
          .includes('https://pioneer-api.particle.network/users/point_records')
      ) {
        const records = (await response.json()).data! as PointRecord[];
        const maybeTodayDailyTxRecord = records.find(
          (record) =>
            record.type === 4 &&
            record.typeKey === new Date().toISOString().split('T')[0]
        );
        resolve(Number(maybeTodayDailyTxRecord?.point ?? 0));
      }
    });
  });
}

async function currentTxMade(page: Page) {
  const pointEarned = await checkTodayPointEarned(page);
  return Math.floor(pointEarned / POINT_PER_TX);
}
