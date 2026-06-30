import { __testables } from "../TaskController.js";

const { calculateTaskProgress } = __testables;

describe("TaskController deposit window behavior", () => {
  test("ignores deposits outside the task window when useTaskWindow is true", () => {
    const task = {
      category: "deposit",
      duration: 14,
      requirements: { minAmount: 200, useTaskWindow: true },
    };

    const startedAt = new Date("2025-12-01T00:00:00Z");
    const expiresAt = new Date("2025-12-15T00:00:00Z");

    const userTask = { progress: 0, relatedData: {}, startedAt, expiresAt };

    // Deposit before start -> ignored
    let p = calculateTaskProgress(task, "deposit_approved", { amount: 200, processedAt: new Date("2025-11-30T12:00:00Z") }, userTask);
    expect(p).toBe(0);
    expect(userTask.relatedData.accumulatedDeposits).toBe(0);

    // Deposit during window -> counts
    p = calculateTaskProgress(task, "deposit_approved", { amount: 200, processedAt: new Date("2025-12-02T12:00:00Z") }, userTask);
    expect(p).toBe(100);
    expect(userTask.relatedData.accumulatedDeposits).toBe(200);
  });
});