# News Notifier Function

This Appwrite Function sends a push notification through Appwrite Messaging to the `news-updates` topic.

## Function Settings

Runtime:

- Node.js

Entrypoint:

- `src/index.js`

Install command:

- `npm install`

Build command:

- leave empty

## Function Variables

Set these variables inside the Appwrite Function:

- `APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1`
- `APPWRITE_PROJECT_ID=digivasity`
- `APPWRITE_API_KEY=your_appwrite_server_api_key`

The `APPWRITE_API_KEY` must have Messaging permission, especially permission to create push messages.

Do not put the Firebase service account private key in this function. Firebase credentials belong only in Appwrite Messaging's FCM provider settings.

## Execute Permission

Allow your signed-in app users/admins to execute this function.

For easiest testing, temporarily allow:

- `Any`

For production, restrict execution to users/admins.

## Test Payload

Run the function manually with this JSON body:

```json
{
  "topic": "news-updates",
  "title": "New Update: Test notification",
  "body": "This is a test push from Appwrite Functions.",
  "newsId": "test-news",
  "slug": "test-news"
}
```

Expected response:

```json
{
  "success": true,
  "messageId": "...",
  "topic": "news-updates"
}
```

## Frontend Link

After deploying the function, put the Function ID in the frontend env:

- `VITE_APPWRITE_NEWS_NOTIFIER_FUNCTION_ID=your_function_id`

The publish flow calls this function after it creates the news document and notification record.

