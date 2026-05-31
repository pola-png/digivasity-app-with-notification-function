const GEMINI_BACKEND_BASE_URL = import.meta.env.VITE_GEMINI_BACKEND_URL?.trim() || '';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;

  console.error('Gemini API Error Details:', error);

  try {
    let msg = error.message || '';
    let errorObj = error;

    let depth = 0;
    while (typeof msg === 'string' && msg.includes('{') && depth < 3) {
      try {
        const start = msg.indexOf('{');
        const end = msg.lastIndexOf('}') + 1;
        const parsed = JSON.parse(msg.substring(start, end));
        errorObj = parsed;
        msg = parsed.error?.message || parsed.message || '';
      } catch {
        break;
      }
      depth += 1;
    }

    const apiError = errorObj.error || errorObj;
    const details = apiError.details || [];

    const errorInfo = details.find((d: any) => d['@type']?.includes('ErrorInfo'));
    if (errorInfo) {
      const reason = errorInfo.reason;

      if (reason === 'API_KEY_INVALID') return 'Invalid API Key. Please check your Gemini API key in settings.';
      if (reason === 'QUOTA_EXCEEDED') return 'Quota exceeded. Please try again later or check your billing status.';
      if (reason === 'LOCATION_NOT_SUPPORTED' || reason === 'USER_LOCATION_NOT_SUPPORTED') {
        return 'The Gemini API (or the Search tool) is not available in your current location.';
      }
      if (reason === 'ACCESS_TOKEN_EXPIRED') return 'Session expired. Please refresh the page.';

      return `API Error: ${reason} ${apiError.message ? `- ${apiError.message}` : ''}`;
    }

    const localizedMsg = details.find((d: any) => d['@type']?.includes('LocalizedMessage'));
    if (localizedMsg?.message) return localizedMsg.message;

    if (apiError.message && typeof apiError.message === 'string') {
      let cleanMsg = apiError.message;
      if (cleanMsg.includes('{')) {
        try {
          const parsed = JSON.parse(cleanMsg);
          if (parsed.error?.message) cleanMsg = parsed.error.message;
        } catch {
          // ignore
        }
      }
      return cleanMsg;
    }

    if (apiError.status) return `API Error: ${apiError.status}`;
  } catch (e) {
    console.error('Error during error parsing:', e);
  }

  return error.message || 'An unexpected error occurred. Please try again.';
};

async function* withRetry<T>(
  fn: () => Promise<AsyncIterable<T>>,
  maxRetries = 3,
  initialDelay = 1000
): AsyncIterable<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const stream = await fn();
      for await (const chunk of stream) {
        yield chunk;
      }
      return;
    } catch (error: any) {
      lastError = error;
      const errorStr = (JSON.stringify(error) + (error.message || '')).toLowerCase();

      const isRetryable =
        errorStr.includes('503') ||
        errorStr.includes('high demand') ||
        errorStr.includes('unavailable') ||
        errorStr.includes('deadline exceeded') ||
        errorStr.includes('rate limit') ||
        errorStr.includes('429');

      if (isRetryable && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await sleep(delay);
        continue;
      }
      throw new Error(parseErrorMessage(error));
    }
  }
  throw new Error(parseErrorMessage(lastError));
}

function buildGeminiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!GEMINI_BACKEND_BASE_URL) {
    return `/api/gemini${normalizedPath}`;
  }

  return new URL(`/api/gemini${normalizedPath}`, GEMINI_BACKEND_BASE_URL).toString();
}

async function* streamTextResponse(response: Response): AsyncIterable<string> {
  if (!response.body) {
    const text = await response.text();
    yield text;
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        yield decoder.decode(value, { stream: true });
      }
    }
    const tail = decoder.decode();
    if (tail) {
      yield tail;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* requestGeminiStream(path: string, payload: Record<string, unknown>): AsyncIterable<string> {
  const response = await fetch(buildGeminiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Gemini request failed with status ${response.status}`);
  }

  return streamTextResponse(response);
}

export const chatWithGeminiStream = (message: string, systemInstruction?: string) => {
  return withRetry(async () =>
    requestGeminiStream('/chat', {
      message,
      systemInstruction: systemInstruction || 'You are Digivasity AI, a helpful overseas education advisor.',
    })
  );
};

export const findUniversitiesStream = (profile: any) => {
  return withRetry(async () =>
    requestGeminiStream('/universities', {
      residence: profile.residence,
      targetCountry: profile.targetCountry,
      qualification: profile.qualification,
      cgpa: profile.cgpa,
      englishScore: profile.englishScore,
      course: profile.course,
      program: profile.program,
    })
  );
};

export const calculatePOFStream = (data: any) => {
  return withRetry(async () =>
    requestGeminiStream('/pof', {
      residence: data.residence,
      targetCountry: data.targetCountry,
      university: data.university,
      program: data.program,
      dependants: data.dependants,
    })
  );
};

export const getVisaGuideStream = (data: any) => {
  return withRetry(async () =>
    requestGeminiStream('/visa', {
      nationality: data.nationality,
      destination: data.destination,
      program: data.program,
    })
  );
};
