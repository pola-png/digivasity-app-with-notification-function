import { Client, ID, Messaging } from 'node-appwrite';

const DEFAULT_TOPIC_ID = 'news-updates';
const DEFAULT_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function createMessaging() {
  const endpoint = env('APPWRITE_ENDPOINT', DEFAULT_ENDPOINT);
  const projectId = env('APPWRITE_PROJECT_ID');
  const apiKey = env('APPWRITE_API_KEY');

  if (!projectId) {
    throw new Error('Missing APPWRITE_PROJECT_ID in function variables.');
  }

  if (!apiKey) {
    throw new Error('Missing APPWRITE_API_KEY in function variables.');
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  return new Messaging(client);
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getRequestPayload(req) {
  const candidates = [
    req?.bodyJson,
    req?.body,
    req?.bodyText,
    req?.bodyRaw,
    req?.payload,
    process.env.APPWRITE_FUNCTION_EVENT_DATA,
  ];

  for (const candidate of candidates) {
    const parsed = parseJson(candidate);
    if (parsed) return parsed;
  }

  return {};
}

function unwrapDocument(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload.document || payload.row || payload.news || payload.data || payload.payload || payload;
}

function asText(value, fallback = '') {
  return String(value || fallback).trim();
}

function buildPush(payload) {
  const document = unwrapDocument(payload);
  const title = asText(document.title, payload.title);
  const body = asText(document.summary, asText(document.excerpt, asText(payload.body, title)));
  const newsId = asText(document.$id, asText(document.id, asText(document.newsId, payload.newsId)));
  const slug = asText(document.slug, payload.slug);
  const topicId = asText(payload.topic, DEFAULT_TOPIC_ID);

  return {
    topicId,
    title,
    body,
    data: {
      view: 'news',
      newsId,
      slug,
    },
  };
}

export default async ({ req, res, log, error }) => {
  try {
    const payload = getRequestPayload(req);
    const push = buildPush(payload);

    if (!push.title) {
      return res.json({
        success: false,
        error: 'Missing push title. Send { "title": "...", "body": "..." } or a news document payload.',
      }, 400);
    }

    if (!push.topicId) {
      return res.json({
        success: false,
        error: 'Missing topic ID.',
      }, 400);
    }

    if (typeof log === 'function') {
      log(`Sending push to topic "${push.topicId}" with title "${push.title}"`);
    }

    const messaging = createMessaging();
    const message = await messaging.createPush({
      messageId: ID.unique(),
      title: push.title,
      body: push.body || push.title,
      topics: [push.topicId],
      data: push.data,
    });

    return res.json({
      success: true,
      messageId: message.$id,
      topic: push.topicId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'Push notification failed.');
    if (typeof error === 'function') {
      error(message);
    }

    return res.json({
      success: false,
      error: message,
    }, 500);
  }
};
