/** Точка входа для совместимости — модули запуска живут в runners/. */
export { RUN_TIMEOUT_MS, getRunner, runChecks, runTests, toReport, type Checks, type RunOutcome, type Runner } from "./runners/index.ts";
