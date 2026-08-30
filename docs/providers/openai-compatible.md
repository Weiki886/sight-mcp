# OpenAI-compatible vision Provider

- Status: Implemented and connected to the public `analyze_image` MCP Tool by Issue #5
- Adapter name: `openai-compatible`
- Operation: `{SIGHT_PROVIDER_BASE_URL}/chat/completions`
- Formats transmitted: normalized JPEG or PNG data URL

## Compatibility contract

The adapter uses the minimum Chat Completions vision intersection commonly supported by OpenAI,
Ollama, LM Studio, vLLM, and similar gateways. It sends a configured model, a safety-oriented system
message, one user text part, one `image_url` data URL, and `max_tokens`. It accepts only a non-empty
`choices[0].message.content` string or documented text-part array.

This follows the official OpenAI
[Create chat completion API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
which documents text/image user content and base64 image data in `image_url`. Sight MCP deliberately
does not use vendor-specific response fields or an OpenAI SDK, keeping the domain port independent.

## Destination policy

- Remote hosts require HTTPS.
- Plain HTTP is allowed only for exact `localhost`, IPv4 `127.0.0.0/8`, or IPv6 `::1` destinations.
- Userinfo, query, fragment, non-HTTP schemes, encoded path separators, and a base URL that already
  contains `/chat/completions` are rejected at startup.
- The operation URL, model, key, headers, timeouts, and retry policy come only from validated
  process configuration. A Tool call cannot override them.
- Redirects are returned as a sanitized Provider failure and are never followed.
- There is no fallback endpoint, automatic Provider switching, proxy discovery, or URL supplied by
  model/tool input.

## Bounds and retries

The adapter streams the response through a configured byte cap before UTF-8/JSON parsing. Answers
are bounded on a Unicode code-point boundary. The overall deadline covers attempts, response reads,
parsing, and backoff.

Only connection failures and HTTP 408, 429, 502, 503, or 504 are retried. Exponential jitter,
`Retry-After`, total attempts, individual delays, and the remaining deadline are bounded. Redirects,
authentication failures, other 4xx/5xx responses, malformed responses, cancellation, and local limit
failures do not retry.

## Privacy and logs

An exact-loopback endpoint keeps the Provider request on the local host, subject to the local
Provider's own storage behavior. Any other endpoint transmits the normalized visible pixels and
prompt to that remote operator. Metadata is removed before this adapter, but visible image content
can still contain sensitive information.

The API key is held behind a redacted configuration wrapper and is added only to the Authorization
header. Logs contain a generated request ID, stable stage/result fields, attempt count, delay, and
duration. They never contain the endpoint, model, key, headers, prompt, data URL, raw body, or
stack. Raw Provider errors and request IDs are not trusted or forwarded.
