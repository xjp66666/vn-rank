import { seedRankings, type RankingItem } from "../../data";

const crosswalk: Record<
  string,
  { bangumi: number; erogamescape: string }
> = {
  v7771: { bangumi: 54898, erogamescape: "18010" },
  v2002: { bangumi: 3154, erogamescape: "12797" },
  v92: { bangumi: 4828, erogamescape: "4286" },
  v2153: { bangumi: 56363, erogamescape: "15861" },
  v18717: { bangumi: 157916, erogamescape: "22900" },
  v68: { bangumi: 80705, erogamescape: "7985" },
  v12402: { bangumi: 73806, erogamescape: "18111" },
  v24: { bangumi: 1020, erogamescape: "11938" },
};

type VndbResult = {
  id: string;
  title: string;
  alttitle: string | null;
  rating: number;
  votecount: number;
  released: string;
  image: { url: string } | null;
  length_minutes: number | null;
};

const siteAgent = "VN-Rank/0.1 (+https://vnrank.pages.dev)";

async function getBangumi(subjectId: number) {
  const response = await fetch(`https://api.bgm.tv/v0/subjects/${subjectId}`, {
    headers: { "User-Agent": siteAgent, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Bangumi returned ${response.status}`);
  const subject = (await response.json()) as {
    rating?: { score?: number; total?: number };
  };
  return {
    score: subject.rating?.score ? subject.rating.score * 10 : null,
    votes: subject.rating?.total ?? null,
  };
}

async function getErogameScape(gameId: string) {
  const href = `https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=${gameId}`;
  const response = await fetch(href, {
    headers: { "User-Agent": siteAgent, Accept: "text/html" },
  });
  if (!response.ok) throw new Error(`ErogameScape returned ${response.status}`);
  const html = await response.text();
  const median = html.match(/中央値\s*(?:<\/th>\s*<td[^>]*>\s*)?(\d+)/)?.[1];
  const votes = html.match(/データ数\s*(?:<\/th>\s*<td[^>]*>\s*)?(\d+)/)?.[1];
  return {
    score: median ? Number(median) : null,
    votes: votes ? Number(votes) : null,
  };
}

export async function GET() {
  try {
    const response = await fetch("https://api.vndb.org/kana/vn", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": siteAgent },
      body: JSON.stringify({
        fields:
          "title,alttitle,rating,votecount,released,image.url,length_minutes",
        sort: "rating",
        reverse: true,
        results: 12,
        filters: ["votecount", ">=", 1000],
      }),
    });
    if (!response.ok) throw new Error(`VNDB returned ${response.status}`);

    const payload = (await response.json()) as { results: VndbResult[] };
    const seedById = new Map(seedRankings.map((item) => [item.id, item]));

    const rankings = await Promise.all(
      payload.results.map(async (vn): Promise<RankingItem> => {
        const seed = seedById.get(vn.id);
        const linked = crosswalk[vn.id];
        const [bangumi, erogamescape] = linked
          ? await Promise.allSettled([
              getBangumi(linked.bangumi),
              getErogameScape(linked.erogamescape),
            ])
          : [null, null];

        const bangumiData =
          bangumi?.status === "fulfilled" ? bangumi.value : null;
        const erogameData =
          erogamescape?.status === "fulfilled" ? erogamescape.value : null;
        const year = Number(vn.released?.slice(0, 4)) || seed?.year || 0;

        return {
          id: vn.id,
          title: seed?.title ?? vn.title,
          altTitle: seed?.altTitle ?? vn.alttitle ?? vn.title,
          year,
          released: vn.released,
          image: vn.image?.url ?? seed?.image ?? "",
          lengthMinutes: vn.length_minutes,
          genres: seed?.genres ?? ["Visual novel"],
          platforms: seed?.platforms ?? ["PC"],
          synopsis:
            seed?.synopsis ??
            "A highly rated visual novel currently rising across the VNDB community.",
          sources: {
            vndb: {
              score: vn.rating,
              votes: vn.votecount,
              href: `https://vndb.org/${vn.id}`,
            },
            bangumi: {
              score: bangumiData?.score ?? seed?.sources.bangumi.score ?? null,
              votes: bangumiData?.votes ?? seed?.sources.bangumi.votes ?? null,
              href: linked
                ? `https://bgm.tv/subject/${linked.bangumi}`
                : (seed?.sources.bangumi.href ?? null),
            },
            erogamescape: {
              score:
                erogameData?.score ?? seed?.sources.erogamescape.score ?? null,
              votes:
                erogameData?.votes ?? seed?.sources.erogamescape.votes ?? null,
              href: linked
                ? `https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=${linked.erogamescape}`
                : (seed?.sources.erogamescape.href ?? null),
            },
          },
        };
      }),
    );

    return Response.json(
      { rankings, updatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control":
            "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return Response.json(
      { rankings: seedRankings, updatedAt: null, snapshot: true },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }
}
