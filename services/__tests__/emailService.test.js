import { __testables } from "../emailService.js";
import { DEFAULT_EMAIL_TEMPLATES } from "../emailTemplates.js";

describe("emailService helpers", () => {
  test("normalizeToList normalizes recipients", () => {
    expect(__testables.normalizeToList(null)).toEqual([]);
    expect(__testables.normalizeToList("a@b.com")).toEqual([{ email: "a@b.com" }]);
    expect(__testables.normalizeToList({ email: "a@b.com", name: "A" })).toEqual([
      { email: "a@b.com", name: "A" },
    ]);
    expect(__testables.normalizeToList(["a@b.com", { email: "b@c.com" }])).toEqual([
      { email: "a@b.com" },
      { email: "b@c.com" },
    ]);
  });

  test("renderHandlebars substitutes variables", () => {
    const subj = DEFAULT_EMAIL_TEMPLATES.password_changed_admin.subject;
    const out = __testables.renderHandlebars(subj, { email: "user@example.com" });
    expect(out).toContain("user@example.com");
  });
});
