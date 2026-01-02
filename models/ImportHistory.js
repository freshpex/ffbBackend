import mongoose from "mongoose";

const importHistorySchema = new mongoose.Schema(
  {
    playlistId: { type: String, required: true, index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["pending", "running", "succeeded", "failed"],
      default: "pending",
    },
    importedCount: { type: Number, default: 0 },
    errorLog: { type: [String], default: [] },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    lastImportedAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

const ImportHistory = mongoose.model("ImportHistory", importHistorySchema);

export default ImportHistory;
