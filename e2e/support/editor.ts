import { expect, type Page, type Response } from "@playwright/test";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);
const WRITE_PATH = /^\/api\/(pages|blog|settings|redirects)(\/[^/]+)?$/;

/** Clicks the editor's save button and returns the answer to the write request that click started. */
export async function submitSave(page: Page): Promise<Response> {
  const answer = page.waitForResponse((response) => WRITE_METHODS.has(response.request().method()) && WRITE_PATH.test(new URL(response.url()).pathname));
  await page.getByRole("button", { name: "Speichern" }).click();
  return answer;
}

/** Saves, asserts the write succeeded, and waits until the editor holds no unsaved change. */
export async function save(page: Page): Promise<Response> {
  const response = await submitSave(page);
  expect(response.status(), `${response.request().method()} ${response.url()}`).toBeLessThan(300);
  await expect(page.getByRole("button", { name: "Speichern" })).toBeDisabled();
  return response;
}
