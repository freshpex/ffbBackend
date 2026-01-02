import ImportHistory from "../models/ImportHistory.js";

export async function listImportHistory(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const items = await ImportHistory.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await ImportHistory.countDocuments();
    res.status(200).json({ success: true, data: items, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    next(err);
  }
}

export async function getImportHistoryById(req, res, next) {
  try {
    const { id } = req.params;
    const doc = await ImportHistory.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export default { listImportHistory, getImportHistoryById };
