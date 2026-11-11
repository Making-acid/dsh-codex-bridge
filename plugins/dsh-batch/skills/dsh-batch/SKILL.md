---
name: dsh-batch
description: Submit a batch to DeepSeek Harness when the user asks to delegate work to local DSH or run tasks through DSH in the background.
---

Use the client script at scripts/client.mjs relative to this skill directory. Run it with Node.js on the local Windows host.

1. Run the script with the health argument to check availability.
2. Write the user-authorized task prompts to a UTF-8 JSON file with a tasks array of up to eight nonempty strings. Include the necessary context and use absolute paths for authorized files. Do not include credentials.
3. Run the script with submit followed by the absolute JSON file path. Wait for the result and report per-task answers or errors with their DSH session IDs. A disconnected request may still be running. Check with the user before resubmitting tasks with side effects.
