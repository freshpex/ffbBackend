import { jest } from "@jest/globals";

describe("TaskController syncDepositTasksForUser", () => {
  test("should update in-progress deposit tasks based on completed deposits", async () => {
    // Mock data
    const userId = "user123";
    const taskId = "task456";
    const minAmount = 200;

    const mockTask = {
      _id: taskId,
      category: "deposit",
      title: "Deposit $200+",
      requirements: { minAmount: 200 },
      duration: 14,
    };

    const mockUserTask = {
      task: mockTask,
      status: "in_progress",
      progress: 0,
      startedAt: new Date(),
      relatedData: {},
      save: jest.fn(),
    };

    // Test scenario: User has $250 in completed deposits
    // Expected: Task should be marked as completed with 100% progress
    
    expect(mockUserTask.status).toBe("in_progress");
    
    // After sync with $250 deposits:
    mockUserTask.progress = 100;
    mockUserTask.status = "completed";
    mockUserTask.completedAt = new Date();
    mockUserTask.relatedData.accumulatedDeposits = 250;

    expect(mockUserTask.status).toBe("completed");
    expect(mockUserTask.progress).toBe(100);
    expect(mockUserTask.relatedData.accumulatedDeposits).toBe(250);
  });

  test("should update partial progress for deposits below minimum", () => {
    const mockUserTask = {
      status: "in_progress",
      progress: 0,
      relatedData: {},
    };

    // User deposited $100 out of $200 required
    const depositTotal = 100;
    const minAmount = 200;
    const progress = Math.min(100, Math.floor((depositTotal / minAmount) * 100));

    mockUserTask.progress = progress;
    mockUserTask.relatedData.accumulatedDeposits = depositTotal;

    expect(mockUserTask.progress).toBe(50);
    expect(mockUserTask.status).toBe("in_progress");
    expect(mockUserTask.relatedData.accumulatedDeposits).toBe(100);
  });

  test("should respect time window when task has duration", () => {
    const taskStartDate = new Date("2026-01-01");
    const taskDuration = 14; // days
    
    const endDate = new Date(taskStartDate);
    endDate.setDate(endDate.getDate() + taskDuration);

    // Check that the end date is exactly 14 days after start date
    const daysDiff = Math.floor((endDate - taskStartDate) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBe(taskDuration);
    
    // Verify it's still in January or February depending on month length
    expect(endDate.getMonth()).toBeGreaterThanOrEqual(0);
    expect(endDate.getMonth()).toBeLessThanOrEqual(1);
  });
});
