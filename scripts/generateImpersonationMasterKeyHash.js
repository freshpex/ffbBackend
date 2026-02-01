import bcrypt from "bcrypt";

const raw = process.argv.slice(2).join(" ").trim();

if (!raw) {
  // eslint-disable-next-line no-console
  console.error(
    "Usage: node scripts/generateImpersonationMasterKeyHash.js <your-master-key>",
  );
  process.exit(1);
}

const rounds = 12;
const hash = await bcrypt.hash(raw, rounds);

// eslint-disable-next-line no-console
console.log(hash);
