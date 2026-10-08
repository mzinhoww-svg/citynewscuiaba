import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// C4-04: o dump de produção leva `auth.users` (e-mails e hashes de senha). O artifact só sai
// cifrado, em repositório público ou privado. Workflow lido como texto, sem comentários.
const workflow = readFileSync(join(process.cwd(), ".github/workflows/backup.yml"), "utf8")
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .map((l) => l.replace(/\s+#.*$/, ""))
  .join("\n");

describe("backup do banco (C4-04)", () => {
  it("sem BACKUP_PASSPHRASE o backup não roda, qualquer que seja a visibilidade do repositório", () => {
    expect(workflow).not.toMatch(/REPO_PRIVATE/);
    expect(workflow).toMatch(/-z "\$\{BACKUP_PASSPHRASE:-\}"[\s\S]*?skip=true/);
  });

  it("o dump é sempre cifrado e o artifact publicado é o .gpg", () => {
    expect(workflow).not.toMatch(/if \[ -n "\$\{BACKUP_PASSPHRASE:-\}" \]/);
    expect(workflow).toMatch(/gpg --batch[\s\S]*--symmetric/);
    expect(workflow).toMatch(/file="\$\{file\}\.gpg"/);
    expect(workflow).toMatch(/path: backup\/\*\.gpg/);
  });
});
