# Tify Plus

Tify Plus is a browser-based Spotify library and playlist workspace built as a static Vite application.

## Local development

```bash
npm install
npm run dev
```

The development server is available at `http://127.0.0.1:5173/`.

## Production build

```bash
npm run build
```

The production output is written to `dist/`.

## Spotify connection

Tify Plus uses the OAuth 2.0 Authorization Code flow with PKCE. When using your own Spotify application, add the exact deployment origin with a trailing slash to the application's allowed redirect URIs and enter only its public Client ID in Tify Plus. Never commit a Client Secret.

## Privacy

Spotify session tokens remain in the active browser tab session. Optional interface preferences and cached library metadata are stored locally only after functional storage consent.

## License

Released under the [MIT License](LICENSE).
