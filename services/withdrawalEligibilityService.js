import mongoose from "mongoose";
import Referral from "../models/Referral.js";
import Transaction from "../models/Transaction.js";

export const MIN_DEPOSIT_FOR_WITHDRAWAL = 500;
export const MIN_KYC_VERIFIED_REFERRALS_FOR_WITHDRAWAL = 3;
export const WITHDRAWAL_ELIGIBILITY_MESSAGE =
  "You must have deposited at least 500 usdt in the platform for your withdrawal to be successfull. Or reffered at least 3 users who have completed KYC verification for your withdrawal to be successfull.";

const formatUsdtAmount = (amount) =>
  Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export const buildWithdrawalEligibilityMessage = ({
  depositTotal = 0,
  minDeposit = MIN_DEPOSIT_FOR_WITHDRAWAL,
}) => {
  const remaining = Math.max(Number(minDeposit) - Number(depositTotal || 0), 0);

  return `Sorry, you can't make a withdrawal now. Users must have deposited at least ${formatUsdtAmount(minDeposit)} USDT before withdrawing. You have deposited ${formatUsdtAmount(depositTotal)} USDT and need ${formatUsdtAmount(remaining)} USDT more.`;
};

const toObjectId = (userId) =>
  typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

export const getCompletedDepositTotal = async (userId, session) => {
  const pipeline = [
    {
      $match: {
        user: toObjectId(userId),
        type: "deposit",
        status: "completed",
        currency: { $in: ["USD", "USDT"] },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ];

  const query = Transaction.aggregate(pipeline);
  if (session) query.session(session);

  const agg = await query;
  return agg[0]?.total || 0;
};

export const getKycVerifiedReferralCount = async (userId, session) => {
  const pipeline = [
    { $match: { referrer: toObjectId(userId) } },
    { $group: { _id: "$referee" } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "referee",
      },
    },
    { $unwind: "$referee" },
    {
      $match: {
        $or: [
          { "referee.kycVerified": true },
          { "referee.kycStatus": "approved" },
        ],
      },
    },
    { $count: "count" },
  ];

  const query = Referral.aggregate(pipeline);
  if (session) query.session(session);

  const agg = await query;
  return agg[0]?.count || 0;
};

export const getWithdrawalEligibility = async (userId, session) => {
  const depositTotal = await getCompletedDepositTotal(userId, session);
  const kycVerifiedReferralCount = await getKycVerifiedReferralCount(
    userId,
    session,
  );

  return {
    eligible:
      depositTotal >= MIN_DEPOSIT_FOR_WITHDRAWAL ||
      kycVerifiedReferralCount >= MIN_KYC_VERIFIED_REFERRALS_FOR_WITHDRAWAL,
    depositTotal,
    kycVerifiedReferralCount,
    minDeposit: MIN_DEPOSIT_FOR_WITHDRAWAL,
    minKycVerifiedReferrals: MIN_KYC_VERIFIED_REFERRALS_FOR_WITHDRAWAL,
  };
};
