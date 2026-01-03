import mongoose from "mongoose";
import Product from "../models/Product.js";
import productSearchService from "../services/productSearchService.js";
import config from "../config/config.js";

async function seed() {
  try {
    await mongoose.connect(config.db.uri || config.mongodb?.uri);
    console.log("Connected to DB");

    const queries = [
      "nike shoes",
      "laptop",
      "sofa",
      "iphone",
      "headphones",
      "dining table",
      "jacket",
      "watch",
      "backpack",
    ];

    for (const q of queries) {
      console.log(`Searching for: ${q}`);
      try {
        const res = await productSearchService.searchProducts({ query: q, limit: 20 });
        const products = res.products || [];
        console.log(`Found ${products.length} products for ${q}`);

        const ops = products.map((p) => ({
          updateOne: {
            filter: { externalId: p.externalId },
            update: { $set: { ...p, lastSyncedAt: new Date(), isActive: true } },
            upsert: true,
          },
        }));

        if (ops.length) {
          await Product.bulkWrite(ops);
          console.log(`Upserted ${ops.length} products for ${q}`);
        }
      } catch (err) {
        console.error(`Error searching ${q}:`, err.message || err);
      }
    }

    console.log("Seeding complete");
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

seed();
