import "@testing-library/jest-dom/vitest";
import { loadEnvConfig } from "@next/env";

// O @next/env ignora `.env.local` quando NODE_ENV=test. Os testes de integração precisam
// das chaves da pilha local (escritas em `.env.local` por scripts/local-stack/start.sh),
// então carregamos no modo de desenvolvimento. Variáveis já definidas (CI) têm precedência.
const nodeEnv = process.env.NODE_ENV;
Object.assign(process.env, { NODE_ENV: "development" });
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
Object.assign(process.env, { NODE_ENV: nodeEnv });
