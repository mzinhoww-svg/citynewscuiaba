import { act, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { useHydratedForm } from "./useHydratedForm";

/*
 * Regressão do mobile-webkit no CI (privacy.spec "excluir conta", login-migrate "erro de login"):
 * o que foi digitado antes da hidratação sumia na primeira renderização seguinte.
 */
function Form({ adopt }: { adopt: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const { ref, ready } = useHydratedForm(({ text, checked }) => {
    if (!adopt) return;
    setName((v) => text("name") ?? v);
    setEmail((v) => text("email") ?? v);
    setTerms((v) => checked("terms") ?? v);
  });
  return (
    <form ref={ref} data-ready={ready ? "true" : undefined}>
      <input name="name" value={name} onChange={(e) => setName(e.target.value)} />
      <input name="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        name="terms"
        type="checkbox"
        checked={terms}
        onChange={(e) => setTerms(e.target.checked)}
      />
    </form>
  );
}

let root: Root | null = null;
let container: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** HTML do servidor, digitação antes do JavaScript, hidratação e uma renderização depois. */
async function typeBeforeHydration(adopt: boolean) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const c = document.createElement("div");
  container = c;
  c.innerHTML = renderToString(<Form adopt={adopt} />);
  document.body.append(c);
  const get = (n: string) => c.querySelector<HTMLInputElement>(`[name=${n}]`)!;
  get("name").value = "Ana Cuiabana";
  get("terms").checked = true;
  await act(async () => {
    root = hydrateRoot(c, <Form adopt={adopt} />);
  });
  // Primeira renderização depois da hidratação: digitar em outro campo.
  const email = get("email");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(email, "ana@exemplo.com");
    email.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return { form: c.querySelector("form")!, name: get("name"), terms: get("terms") };
}

it("sem adotar, o React apaga o que foi digitado antes da hidratação (o bug)", async () => {
  const { name, terms } = await typeBeforeHydration(false);
  expect(name.value).toBe("");
  expect(terms.checked).toBe(false);
});

it("adota o texto e a marcação feitos antes da hidratação e expõe data-ready", async () => {
  const { form, name, terms } = await typeBeforeHydration(true);
  expect(name.value).toBe("Ana Cuiabana");
  expect(terms.checked).toBe(true);
  expect(form.dataset.ready).toBe("true");
});
