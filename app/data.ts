export type SourceKey = "vndb" | "bangumi" | "erogamescape";

export type SourceScore = {
  score: number | null;
  votes: number | null;
  href: string | null;
};

export type RankingItem = {
  id: string;
  title: string;
  altTitle: string;
  year: number;
  released: string;
  image: string;
  lengthMinutes: number | null;
  genres: string[];
  platforms: string[];
  synopsis: string;
  sources: Record<SourceKey, SourceScore>;
};

export const sourceWeights: Record<SourceKey, number> = {
  vndb: 0.6,
  bangumi: 0.4,
  erogamescape: 0,
};

export function scoreFor(
  item: RankingItem,
  source: SourceKey | "consensus" = "consensus",
) {
  if (source !== "consensus") return item.sources[source].score ?? 0;

  const available = (Object.keys(sourceWeights) as SourceKey[]).filter(
    (key) => sourceWeights[key] > 0 && item.sources[key].score !== null,
  );
  const activeWeight = available.reduce(
    (total, key) => total + sourceWeights[key],
    0,
  );

  if (!activeWeight) return 0;
  return available.reduce(
    (total, key) =>
      total +
      ((item.sources[key].score ?? 0) * sourceWeights[key]) / activeWeight,
    0,
  );
}

export const seedRankings: RankingItem[] = [
  {
    id: "v7771",
    title: "WHITE ALBUM2",
    altTitle: "ホワイトアルバム2",
    year: 2010,
    released: "2010-03-26",
    image: "https://t.vndb.org/cv/62/88962.jpg",
    lengthMinutes: 4800,
    genres: ["Romance", "Drama"],
    platforms: ["PC"],
    synopsis:
      "A winter romance whose quiet choices accumulate into one of the medium’s most bruising character dramas.",
    sources: {
      vndb: { score: 90.3, votes: 4425, href: "https://vndb.org/v7771" },
      bangumi: {
        score: 89,
        votes: 1754,
        href: "https://bgm.tv/subject/54898",
      },
      erogamescape: {
        score: 95,
        votes: 125,
        href: "https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=18010",
      },
    },
  },
  {
    id: "v2002",
    title: "STEINS;GATE",
    altTitle: "シュタインズ・ゲート",
    year: 2009,
    released: "2009-10-15",
    image: "https://t.vndb.org/cv/19/77819.jpg",
    lengthMinutes: 2625,
    genres: ["Sci-fi", "Thriller"],
    platforms: ["PC", "Switch"],
    synopsis:
      "A homemade time machine turns an Akihabara summer into a tightly wound conspiracy about cause and consequence.",
    sources: {
      vndb: { score: 90.2, votes: 16625, href: "https://vndb.org/v2002" },
      bangumi: {
        score: 89,
        votes: 8433,
        href: "https://bgm.tv/subject/3154",
      },
      erogamescape: {
        score: 93,
        votes: 502,
        href: "https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=12797",
      },
    },
  },
  {
    id: "v92",
    title: "Muv-Luv Alternative",
    altTitle: "マブラヴ オルタネイティヴ",
    year: 2006,
    released: "2006-02-24",
    image: "https://t.vndb.org/cv/60/75660.jpg",
    lengthMinutes: 3292,
    genres: ["Mecha", "Sci-fi"],
    platforms: ["PC", "Vita"],
    synopsis:
      "A sprawling military science-fiction epic about returning to a doomed world with the burden of remembering.",
    sources: {
      vndb: { score: 89.9, votes: 11218, href: "https://vndb.org/v92" },
      bangumi: {
        score: 88,
        votes: 4021,
        href: "https://bgm.tv/subject/4828",
      },
      erogamescape: {
        score: 94,
        votes: 3668,
        href: "https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=4286",
      },
    },
  },
  {
    id: "v2153",
    title: "Umineko no Naku Koro ni Chiru",
    altTitle: "うみねこのなく頃に散",
    year: 2009,
    released: "2009-08-15",
    image: "https://t.vndb.org/cv/64/86264.jpg",
    lengthMinutes: 4276,
    genres: ["Mystery", "Fantasy"],
    platforms: ["PC", "Switch"],
    synopsis:
      "The answer arcs turn a closed-room massacre into a dazzling argument about truth, grief, and interpretation.",
    sources: {
      vndb: { score: 89.9, votes: 10839, href: "https://vndb.org/v2153" },
      bangumi: {
        score: 87,
        votes: 1231,
        href: "https://bgm.tv/subject/56363",
      },
      erogamescape: {
        score: 89,
        votes: 48,
        href: "https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=15861",
      },
    },
  },
  {
    id: "v12402",
    title: "The House in Fata Morgana",
    altTitle: "ファタモルガーナの館",
    year: 2012,
    released: "2012-12-31",
    image: "https://t.vndb.org/cv/31/77731.jpg",
    lengthMinutes: 2100,
    genres: ["Gothic", "Mystery"],
    platforms: ["PC", "Switch"],
    synopsis:
      "A faceless spirit opens the doors of a cursed mansion and uncovers tragedies spanning centuries.",
    sources: {
      vndb: { score: 87.9, votes: 7475, href: "https://vndb.org/v12402" },
      bangumi: {
        score: 84,
        votes: 3024,
        href: "https://bgm.tv/subject/73806",
      },
      erogamescape: {
        score: 89,
        votes: 467,
        href: "https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=18111",
      },
    },
  },
  {
    id: "v68",
    title: "Higurashi no Naku Koro ni Kai",
    altTitle: "ひぐらしのなく頃に解",
    year: 2004,
    released: "2004-12-30",
    image: "https://t.vndb.org/cv/92/76392.jpg",
    lengthMinutes: 3900,
    genres: ["Horror", "Mystery"],
    platforms: ["PC", "Switch"],
    synopsis:
      "The question arcs’ rural paranoia gives way to hard-won answers, friendship, and a fight against fate.",
    sources: {
      vndb: { score: 88.4, votes: 7831, href: "https://vndb.org/v68" },
      bangumi: {
        score: 84,
        votes: 859,
        href: "https://bgm.tv/subject/80705",
      },
      erogamescape: {
        score: 85,
        votes: 764,
        href: "https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=7985",
      },
    },
  },
  {
    id: "v24",
    title: "Umineko no Naku Koro ni",
    altTitle: "うみねこのなく頃に",
    year: 2007,
    released: "2007-08-17",
    image: "https://t.vndb.org/cv/23/85323.jpg",
    lengthMinutes: 4575,
    genres: ["Mystery", "Fantasy"],
    platforms: ["PC", "Switch"],
    synopsis:
      "Eighteen people, a typhoon-locked island, and a witch’s epitaph begin a battle between magic and reason.",
    sources: {
      vndb: { score: 88.7, votes: 13658, href: "https://vndb.org/v24" },
      bangumi: {
        score: 84,
        votes: 2490,
        href: "https://bgm.tv/subject/1020",
      },
      erogamescape: {
        score: 80,
        votes: 308,
        href: "https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=11938",
      },
    },
  },
  {
    id: "v18717",
    title: "Utawarerumono: Mask of Truth",
    altTitle: "うたわれるもの 二人の白皇",
    year: 2016,
    released: "2016-09-21",
    image: "https://t.vndb.org/cv/64/85164.jpg",
    lengthMinutes: 3234,
    genres: ["Fantasy", "Strategy"],
    platforms: ["PC", "PlayStation"],
    synopsis:
      "A masked general inherits a name, a rebellion, and the impossible task of holding a fractured nation together.",
    sources: {
      vndb: { score: 89.3, votes: 2908, href: "https://vndb.org/v18717" },
      bangumi: {
        score: 82,
        votes: 1540,
        href: "https://bgm.tv/subject/157916",
      },
      erogamescape: {
        score: 90,
        votes: 326,
        href: "https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=22900",
      },
    },
  },
];
