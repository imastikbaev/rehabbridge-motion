# Сторонние компоненты

- React и React DOM 19.2.4: MIT, https://github.com/facebook/react
- Vite 7.3.5 и Vitest 4.1.11: MIT, https://github.com/vitejs/vite и https://github.com/vitest-dev/vitest
- TypeScript 5.8.3: Apache-2.0, https://github.com/microsoft/TypeScript
- Playwright 1.61.0: Apache-2.0, https://github.com/microsoft/playwright
- MediaPipe Tasks Vision 1.0.1 (JS/WASM): Apache-2.0, https://github.com/google-ai-edge/mediapipe
- Готовый Pose Landmarker Lite float16 v1: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
  SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`.
  Model card и upstream условия: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker#models

Новая модель не обучалась. Модель загружается во время подготовки, не из RehabBridge. Лицензионные уведомления JS-зависимостей сохраняются сборщиком. Лицензии установленного дерева доступны в node_modules соответствующих пакетов; при публичном распространении соблюдать upstream условия модели и зависимостей. Графика — новый SVG/CSS, звук — Web Audio синтез, внешние шрифты/картинки не используются.

MediaPipe 1.0.1 содержит telemetry API для метрик использования; Google описывает его в https://developers.google.com/edge/mediapipe/solutions/tasks#mediapipe_tasks_privacy_notice . В RehabBridge Motion внешние соединения запрещены CSP страницы; попытка запроса к odml.pa.googleapis.com блокируется браузером. Исходники зависимости не патчились.

- Hand Landmarker float16 v1 (готовая модель Google): https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
  SHA-256: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`. Загружена напрямую, не из RehabBridge.
