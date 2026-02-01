import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "";

if (!MONGO_URI) {
  console.error(
    "Missing MONGO_URI (or MONGODB_URI/DATABASE_URL) in environment. Aborting.",
  );
  process.exit(1);
}

const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE || 200);

async function main() {
  await mongoose.connect(MONGO_URI);

  let updated = 0;
  let scanned = 0;

  while (true) {
    const users = await User.find({
      $or: [
        { accountNumber: { $exists: false } },
        { accountNumber: null },
        { accountNumber: "" },
      ],
    })
      .select("_id accountNumber")
      .limit(BATCH_SIZE);

    if (users.length === 0) break;

    for (const u of users) {
      scanned += 1;
      try {
        const accountNumber = await User.generateUniqueAccountNumber();
        await User.updateOne(
          { _id: u._id, $or: [{ accountNumber: { $exists: false } }, { accountNumber: null }, { accountNumber: "" }] },
          { $set: { accountNumber } },
        );
        updated += 1;
      } catch (err) {
        console.error(`Failed for user ${u._id}:`, err?.message || err);
      }
    }

    console.log(`Scanned ${scanned}; updated ${updated}...`);
  }

  console.log(`Done. Updated ${updated} users.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
