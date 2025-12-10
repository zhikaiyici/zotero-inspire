/**
 * Copied and modified from https://github.com/l0o0/jasminum/blob/main/typings/scrape.d.ts
 */

// interface ScrapeService {
//   search(searchOption: SearchOption): Promise<ScrapeSearchResult[] | null>;
//   searchSnapshot?(task: ScrapeTask): Promise<ScrapeSearchResult[] | null>;
//   translate(
//     task: ScrapeTask,
//     saveAttachments: false,
//   ): Promise<Zotero.Item | null | undefined>;
//   translateSnapshot?(task: ScrapeTask): Promise<Zotero.Item | null | undefined>;
// }

type SearchOption = {
  source?: string;
  author?: string;
  title: string;
};

type ScrapeSearchResult = {
  source: string;
  title: string;
  url: string;
  [key: string]: string | number | null;
};

// type TaskStatus =
//   | "waiting"
//   | "processing"
//   | "multiple_results"
//   | "success"
//   | "fail";
// type TaskType = "attachment" | "snapshot";
// interface ScrapeTask {
//   id: string;
//   type: TaskType;
//   item: Zotero.Item;
//   searchResults: ScrapeSearchResult[];
//   resultIndex?: 0;
//   status: TaskStatus;
//   silent?: boolean;
//   message?: string;
//   addMsg: (msg: string) => void;
// }
