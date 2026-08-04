# Minimal fallback prompt for a new agent

Выполни цель: `<ONE_CONCRETE_OBJECTIVE>`.

Используй репозиторий как единственный вводный пакет: начни с `AGENTS.md`, затем
строго выполни `docs/AGENT_START_PROTOCOL.md` и read-only команду
`npm run agent:bootstrap -- --objective "<ONE_CONCRETE_OBJECTIVE>"`. Не начинай
write, пока bootstrap, authority reading order и архитектурный preflight не
прошли. Не выдавай target architecture за current runtime и не смешивай Product
Core, Command Kernel, Design OS, renderer, state classes или product/interface
planes. При STOP-сигнале остановись и верни один конкретный blocker.

Этот prompt — только fallback для внешнего launcher. Канон, архитектура, scope,
delivery и формат отчёта определяются актуальными файлами репозитория, а не
текстом prompt-а.
