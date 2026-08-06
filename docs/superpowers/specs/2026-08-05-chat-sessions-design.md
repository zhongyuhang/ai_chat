# Chat Sessions Design

Goal: Upgrade the local DeepSeek chat page into a persistent multi-session writing chat tool.

Architecture: Keep the app as a single local HTML file with embedded CSS and JavaScript. Store settings, sessions, messages, active session id, and UI state in localStorage. Add a Playwright smoke test that opens the local file and verifies session and settings behavior without calling the remote API.

Requirements:
- Use model `deepseek-v4-flash`.
- Settings have an explicit save button and visible saved status.
- Every API request sends the active session's full message history.
- Users can create, switch, rename, delete, clear, export, and import sessions.
- Sessions and settings survive page refresh.
- The UI must use readable Chinese copy and avoid the existing mojibake text.
- Keep the current local-file workflow and do not add a backend in this pass.

Risks:
- The API key remains visible because the app still calls DeepSeek directly from browser JavaScript.
- Very long sessions may exceed model context or localStorage quota; the page should warn but still keep user control.
