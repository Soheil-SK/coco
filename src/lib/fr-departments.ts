/** Codes département France métropolitaine + DOM (+ Corse 2A / 2B). */
export const FRANCE_DEPARTMENT_CODES: string[] = (() => {
  const codes: string[] = [];
  for (let n = 1; n <= 95; n += 1) {
    codes.push(String(n).padStart(2, "0"));
  }
  codes.push("2A", "2B", "971", "972", "973", "974", "976");
  return codes;
})();
