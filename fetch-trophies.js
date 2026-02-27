/**
 * fetch-trophies.js
 * ─────────────────────────────────────────────────────
 * Fetches your PSN trophy data using psn-api and writes
 * trophies.json for use with trophies.html.
 *
 * SETUP:
 *   npm install psn-api
 *   node fetch-trophies.js
 *
 * HOW TO GET YOUR NPSSO TOKEN:
 *   1. Go to https://www.playstation.com and sign in
 *   2. In the same browser, visit:
 *      https://ca.account.sony.com/api/v1/ssocookie
 *   3. Copy the "npsso" value from the JSON response
 *   4. Paste it below (keep it secret — treat it like a password)
 */

import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  getTitleTrophies,
  getProfileFromUserName,
  makeUniversalSearch,
} from "psn-api";
import fs from "fs/promises";

// ── CONFIGURE THESE ──────────────────────────────────────────────────────────
const NPSSO = process.env.PSN_NPSSO;
const PSN_ID = process.env.PSN_ID ?? "YourPSNID";
const MAX_GAMES     = 200;                  // How many games to fetch (max 500)
const RARE_THRESHOLD = 10;                 // Trophy earn rate % below which = "rare"
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔑 Authenticating with PSN…");

  const accessCode = await exchangeNpssoForAccessCode(NPSSO);
  const { accessToken, refreshToken } = await exchangeAccessCodeForAuthTokens(accessCode);
  const auth = { accessToken };

  console.log("✅ Auth successful");
  console.log("👤 Fetching profile for:", PSN_ID);

  // Get profile
  let profile = null;
  try {
    const results = await makeUniversalSearch(auth, PSN_ID, "SocialAllAccounts");
    const match = results?.domainResponses?.[0]?.results?.[0]?.socialMetadata;
    profile = {
      onlineId:      match?.onlineId ?? PSN_ID,
      displayName:   match?.displayName ?? PSN_ID,
      avatarUrl:     match?.avatarUrl ?? null,
      trophyLevel:   0,
      earnedTrophies: { platinum: 0, gold: 0, silver: 0, bronze: 0 }
    };
  } catch (e) {
    console.warn("⚠ Could not fetch profile details, using defaults.");
    profile = { onlineId: PSN_ID, displayName: PSN_ID, avatarUrl: null, trophyLevel: 0, earnedTrophies: { platinum: 0, gold: 0, silver: 0, bronze: 0 } };
  }

  // Get game titles
  console.log(`🎮 Fetching up to ${MAX_GAMES} games…`);
  const { trophyTitles } = await getUserTitles(auth, "me", { limit: MAX_GAMES });

  // Accumulate overall counts
  let totalPlat = 0, totalGold = 0, totalSilver = 0, totalBronze = 0;

  const games = [];

  for (const title of trophyTitles) {
    const earned = title.earnedTrophies ?? {};
    const defined = title.definedTrophies ?? {};

    totalPlat   += earned.platinum ?? 0;
    totalGold   += earned.gold    ?? 0;
    totalSilver += earned.silver  ?? 0;
    totalBronze += earned.bronze  ?? 0;

    const totalEarned  = (earned.platinum??0) + (earned.gold??0) + (earned.silver??0) + (earned.bronze??0);
    const totalDefined = (defined.platinum??0) + (defined.gold??0) + (defined.silver??0) + (defined.bronze??0);
    const completion   = totalDefined > 0 ? Math.round((totalEarned / totalDefined) * 100) : 0;

    console.log(`  ↳ ${title.trophyTitleName} (${completion}%)`);

    // Fetch individual trophy list
    let trophyList = [];
    try {
      const [titleTrophies, earnedTrophies] = await Promise.all([
        getTitleTrophies(auth, title.npCommunicationId, "all", { npServiceName: title.trophyTitlePlatform !== "PS5" ? "trophy" : "trophy2" }),
        getUserTrophiesEarnedForTitle(auth, "me", title.npCommunicationId, "all", { npServiceName: title.trophyTitlePlatform !== "PS5" ? "trophy" : "trophy2" })
      ]);

      const earnedMap = {};
      for (const t of earnedTrophies.trophies ?? []) {
        earnedMap[t.trophyId] = t;
      }

      trophyList = (titleTrophies.trophies ?? []).map(t => ({
        id:       t.trophyId,
        name:     t.trophyName ?? "Unknown Trophy",
        desc:     t.trophyDetail ?? "",
        grade:    t.trophyType ?? "bronze",
        earned:   earnedMap[t.trophyId]?.earned ?? false,
        earnedAt: earnedMap[t.trophyId]?.trophyEarnedDate ?? null,
        iconUrl:  t.trophyIconUrl ?? null,
        iconEmoji: gradeEmoji(t.trophyType),
        rare:     (t.trophyEarnedRate !== undefined) && parseFloat(t.trophyEarnedRate) < RARE_THRESHOLD,
        earnRate: t.trophyEarnedRate ?? null,
      }));
    } catch(e) {
      console.warn(`    ⚠ Could not fetch trophy list for ${title.trophyTitleName}`);
    }

    games.push({
      id:        title.npCommunicationId,
      title:     title.trophyTitleName,
      coverUrl:  title.trophyTitleIconUrl ?? null,
      coverEmoji: "🎮",
      platform:  title.trophyTitlePlatform ?? "PS",
      trophies: {
        earned:  earned,
        total:   defined
      },
      completion,
      hasPlatinum: (earned.platinum ?? 0) > 0,
      trophyList,
    });
  }

  profile.earnedTrophies = { platinum: totalPlat, gold: totalGold, silver: totalSilver, bronze: totalBronze };

  const output = { profile, games };
  await fs.writeFile("trophies.json", JSON.stringify(output, null, 2));

  console.log("\n✅ Done! trophies.json written.");
  console.log(`   ${games.length} games · ${totalPlat}P ${totalGold}G ${totalSilver}S ${totalBronze}B`);
}

function gradeEmoji(grade) {
  switch(grade) {
    case "platinum": return "💎";
    case "gold":     return "🥇";
    case "silver":   return "🥈";
    default:         return "🥉";
  }
}

main().catch(err => {
  console.error("❌ Error:", err.message ?? err);
  process.exit(1);
});
