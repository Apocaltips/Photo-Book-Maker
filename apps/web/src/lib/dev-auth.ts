export const DEV_AUTH_EMAIL = "android-tester@example.com";
export const DEV_AUTH_ID = "android-tester";
export const DEV_AUTH_NAME = "Android Tester";

export function getDevAuthHeaders() {
  return {
    "X-Photo-Book-Dev-Email": DEV_AUTH_EMAIL,
    "X-Photo-Book-Dev-Id": DEV_AUTH_ID,
    "X-Photo-Book-Dev-Name": DEV_AUTH_NAME,
  };
}
