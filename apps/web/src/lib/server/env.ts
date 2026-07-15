export function normalizeEnvValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/\\r|\\n/g, "").trim();
}

export function getEnvValue(name: string) {
  return normalizeEnvValue(process.env[name]);
}

export function getFirstEnvValue(names: string[]) {
  for (const name of names) {
    const value = getEnvValue(name);
    if (value) {
      return value;
    }
  }

  return "";
}
