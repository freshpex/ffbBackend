import { __testables } from "../TaskController.js";

const { calculateTaskProgress } = __testables;

describe("TaskController deposit tasks", () => {
  test("deposit tasks accumulate deposits over multiple events", () => {
    const task = {
      category: "deposit",
      requirements: { minAmount: 200 },
    };

    const userTask = { progress: 0, relatedData: {} };

    // First deposit: 50
    let p = calculateTaskProgress(task, "deposit_approved", { amount: 50 }, userTask);
    expect(p).toBe(25);
    expect(userTask.relatedData.accumulatedDeposits).toBe(50);

    // Second deposit: 150 (total 200)
    p = calculateTaskProgress(task, "deposit_approved", { amount: 150 }, userTask);
    expect(p).toBe(100);
    expect(userTask.relatedData.accumulatedDeposits).toBe(200);
  });

  test("deposit tasks ignore non-numeric amounts safely", () => {
    const task = {
      category: "deposit",
      requirements: { minAmount: 200 },
    };

    const userTask = { progress: 0, relatedData: { accumulatedDeposits: 100 } };

    const p = calculateTaskProgress(task, "deposit_approved", { amount: "oops" }, userTask);
    expect(p).toBe(50);
    expect(userTask.relatedData.accumulatedDeposits).toBe(100);
  });
});
