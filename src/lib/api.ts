function getConfiguredApiBaseUrl() {
  return (
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
    (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL)
  )?.trim();
}

export function getAbsoluteApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getConfiguredApiBaseUrl();

  if (!base || !base.startsWith('http')) {
    throw new Error('No backend API is configured for this app.');
  }

  try {
    return new URL(normalizedPath, base).toString();
  } catch {
    const trimmedBase = base.replace(/\/$/, '');
    return `${trimmedBase}${normalizedPath}`;
  }
}

export const apiUrl = getAbsoluteApiUrl;
export const apiFallbackUrl = (path: string) => {
  throw new Error(`No backend API is configured for ${path}.`);
};
