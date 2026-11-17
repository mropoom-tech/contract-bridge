/** Client-side nickname check (server re-validates with Zod). 2–24 code points, no < > or control chars. */
export const isValidNickname = (raw: string): boolean => {
  const name = raw.trim();
  const len = [...name].length;
  return len >= 2 && len <= 24 && !/[<>\p{Cc}]/u.test(name);
};
