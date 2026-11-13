import { vi } from "vitest";

export const API = "https://api.github.com";
export const REPO = "o/r";

export interface FakeUser {
  login: string;
  type?: "Bot" | "User";
}
export interface FakeComment {
  id: number;
  body: string;
  user: FakeUser;
  /** The web address that opens the comment on GitHub, under the field name GitHub's REST API uses. */
  html_url?: string;
}
export interface FakeReview {
  id: number;
  body: string;
  state: string;
  user: FakeUser;
  commit_id: string;
}
/** One entry of GET /pulls/{n}/commits: `author` is GitHub's verified email-to-account mapping. */
export interface FakeCommit {
  sha: string;
  author: { login: string } | null;
  commit: { author: { email: string } };
}

/** How the real GITHUB_TOKEN appears on REST reviews and comments. */
export const BOT: FakeUser = { login: "github-actions[bot]", type: "Bot" };

/** A ruleset rule that requires one approval and dismisses it on a new push. */
export const STALE_APPROVALS_DISMISSED = {
  type: "pull_request",
  parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true },
};

export type Op =
  | "viewer"
  | "user"
  | "getPull"
  | "listCommits"
  | "disableAutoMerge"
  | "dequeue"
  | "listComments"
  | "createComment"
  | "updateComment"
  | "addLabels"
  | "removeLabel"
  | "getLabel"
  | "createLabel"
  | "updateLabel"
  | "listReviews"
  | "createReview"
  | "dismissReview"
  | "checkRuns"
  | "rules"
  | "protection"
  | "mergeSettings"
  | "enableAutoMerge"
  | "enqueue"
  | "requestReviewers";

export interface FakeGitHub {
  /** GraphQL `viewer.login`. For GITHUB_TOKEN that is "github-actions", without "[bot]". */
  viewer: string;
  /** Author of the comments and reviews this token creates, as REST shows it. */
  self: FakeUser;
  /** PR #7's current head sha, as GET /pulls/7 reports it. */
  headSha: string;
  /** GET /pulls/7/commits, oldest first. */
  commits: FakeCommit[];
  /** Message of the GraphQL error that disable/dequeue return; undefined = success. */
  mergeStateError?: string;
  comments: FakeComment[];
  /** Labels on PR #7. */
  labels: string[];
  /** The repository's labels (GET /labels/{name}); a label missing here answers 404. */
  repoLabels: Record<string, { color: string; description?: string }>;
  reviews: FakeReview[];
  /** Check runs on the requested commit; `head_sha`, `status` and `app` default to that commit, completed, github-actions. */
  checkRuns: Array<{ name: string; conclusion: string | null; status?: string; details_url?: string; app?: { slug: string } }>;
  /** GET /rules/branches/main: the active rules on the base branch. */
  rules: Array<{ type: string; parameters?: Record<string, unknown> }>;
  /** GET /branches/main/protection (classic); undefined answers 404 "Branch not protected". */
  protection?: { required_pull_request_reviews?: { dismiss_stale_reviews?: boolean; required_approving_review_count?: number } };
  mergeQueue: boolean;
  mergeCommitAllowed: boolean;
  /** Operations that answer 403. */
  forbid: Set<Op>;
  /** Operations that answer 500. */
  fail: Set<Op>;
  /** Operations that answer 422. */
  reject: Set<Op>;
  /** Every operation performed, with its payload. */
  log: Array<{ op: Op; body?: unknown; path: string }>;
  ops(op: Op): Array<{ op: Op; body?: unknown; path: string }>;
}

const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

/** Stub global fetch with a small in-memory GitHub for PR #7 of o/r. */
export function installFakeGitHub(init: Partial<FakeGitHub> = {}): FakeGitHub {
  const gh: FakeGitHub = {
    viewer: "github-actions",
    self: BOT,
    headSha: "",
    commits: [],
    comments: [],
    labels: [],
    repoLabels: {},
    reviews: [],
    checkRuns: [],
    rules: [STALE_APPROVALS_DISMISSED],
    mergeQueue: false,
    mergeCommitAllowed: true,
    forbid: new Set(),
    fail: new Set(),
    reject: new Set(),
    log: [],
    ops: (op) => gh.log.filter((e) => e.op === op),
    ...init,
  };
  let nextId = 1000;

  const handle = (op: Op, path: string, body: unknown, ok: () => Response): Response => {
    gh.log.push({ op, body, path });
    if (gh.forbid.has(op)) return json(403, { message: "Resource not accessible by integration" });
    if (gh.fail.has(op)) return json(500, { message: "Server Error" });
    if (gh.reject.has(op)) return json(422, { message: "Validation Failed" });
    return ok();
  };

  const graphql = (query: string, variables: Record<string, unknown>): Response => {
    // GraphQL reports failures as 200 with an `errors` array.
    const gql = (op: Op, data: () => unknown) => {
      gh.log.push({ op, body: variables, path: "/graphql" });
      if (gh.forbid.has(op)) return json(200, { errors: [{ type: "FORBIDDEN", message: "Resource not accessible by integration" }] });
      if (gh.fail.has(op)) return json(200, { errors: [{ type: "UNPROCESSABLE", message: "Pull request is in clean status" }] });
      return json(200, { data: data() });
    };
    if (query.includes("viewer")) return gql("viewer", () => ({ viewer: { login: gh.viewer } }));
    for (const [mutation, op] of [["disablePullRequestAutoMerge", "disableAutoMerge"], ["dequeuePullRequest", "dequeue"]] as const) {
      if (!query.includes(mutation)) continue;
      if (gh.mergeStateError && !gh.forbid.has(op) && !gh.fail.has(op)) {
        gh.log.push({ op, body: variables, path: "/graphql" });
        return json(200, { errors: [{ type: "UNPROCESSABLE", message: gh.mergeStateError }] });
      }
      return gql(op, () => ({ [mutation]: { clientMutationId: null } }));
    }
    if (/enablePullRequestAutoMerge|enqueuePullRequest/.test(query) && !query.includes("expectedHeadOid: $head"))
      throw new Error("fake GitHub: merge mutation without expectedHeadOid");
    if (query.includes("enablePullRequestAutoMerge")) return gql("enableAutoMerge", () => ({ enablePullRequestAutoMerge: { clientMutationId: null } }));
    if (query.includes("enqueuePullRequest")) return gql("enqueue", () => ({ enqueuePullRequest: { mergeQueueEntry: { position: 1 } } }));
    if (query.includes("mergeQueue"))
      return gql("mergeSettings", () => ({
        repository: {
          mergeCommitAllowed: gh.mergeCommitAllowed,
          squashMergeAllowed: true,
          rebaseMergeAllowed: true,
          mergeQueue: gh.mergeQueue ? { id: "MQ_1" } : null,
        },
      }));
    throw new Error(`fake GitHub: unexpected GraphQL ${query}`);
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      const path = url.pathname;
      const route = `${method} ${path}`;
      const pr = `/repos/${REPO}`;
      let m: RegExpMatchArray | null;

      if (route === "POST /graphql") return graphql(body.query, body.variables ?? {});
      // Installation tokens such as GITHUB_TOKEN cannot read /user.
      if (route === "GET /user") return handle("user", path, undefined, () => json(403, { message: "Resource not accessible by integration" }));
      if (route === `GET ${pr}/pulls/7`) return handle("getPull", path, undefined, () => json(200, { number: 7, head: { sha: gh.headSha } }));
      if (route === `GET ${pr}/pulls/7/commits`) return handle("listCommits", path, undefined, () => json(200, gh.commits));
      if (route === `GET ${pr}/issues/7/comments`) return handle("listComments", path, undefined, () => json(200, gh.comments));
      if (route === `POST ${pr}/issues/7/comments`)
        return handle("createComment", path, body, () => {
          const id = nextId++;
          const c = { id, body: body.body, user: gh.self, html_url: `https://github.com/${REPO}/pull/7#issuecomment-${id}` };
          gh.comments.push(c);
          return json(201, c);
        });
      if ((m = route.match(new RegExp(`^PATCH ${pr}/issues/comments/(\\d+)$`))))
        return handle("updateComment", path, body, () => {
          const c = gh.comments.find((x) => x.id === Number(m![1]));
          if (!c) return json(404, { message: "Not Found" });
          c.body = body.body;
          return json(200, c);
        });
      if ((m = route.match(new RegExp(`^GET ${pr}/labels/(.+)$`))))
        return handle("getLabel", path, undefined, () => {
          const name = decodeURIComponent(m![1]!);
          const l = gh.repoLabels[name];
          return l ? json(200, { name, ...l }) : json(404, { message: "Not Found" });
        });
      if (route === `POST ${pr}/labels`)
        return handle("createLabel", path, body, () => {
          if (gh.repoLabels[body.name]) return json(422, { message: "Validation Failed" });
          gh.repoLabels[body.name] = { color: body.color, description: body.description };
          return json(201, body);
        });
      if ((m = route.match(new RegExp(`^PATCH ${pr}/labels/(.+)$`))))
        return handle("updateLabel", path, body, () => {
          const name = decodeURIComponent(m![1]!);
          if (!gh.repoLabels[name]) return json(404, { message: "Not Found" });
          Object.assign(gh.repoLabels[name]!, body);
          return json(200, { name, ...gh.repoLabels[name] });
        });
      if (route === `POST ${pr}/issues/7/labels`)
        return handle("addLabels", path, body, () => {
          for (const l of body.labels as string[]) if (!gh.labels.includes(l)) gh.labels.push(l);
          return json(200, gh.labels.map((name) => ({ name })));
        });
      if ((m = route.match(new RegExp(`^DELETE ${pr}/issues/7/labels/(.+)$`))))
        return handle("removeLabel", path, undefined, () => {
          const name = decodeURIComponent(m![1]!);
          if (!gh.labels.includes(name)) return json(404, { message: "Label does not exist" });
          gh.labels = gh.labels.filter((l) => l !== name);
          return json(200, gh.labels.map((n) => ({ name: n })));
        });
      if (route === `GET ${pr}/pulls/7/reviews`) return handle("listReviews", path, undefined, () => json(200, gh.reviews));
      if (route === `POST ${pr}/pulls/7/reviews`)
        return handle("createReview", path, body, () => {
          const r = { id: nextId++, body: body.body, state: "APPROVED", user: gh.self, commit_id: body.commit_id };
          gh.reviews.push(r);
          return json(200, r);
        });
      if (route === `POST ${pr}/pulls/7/requested_reviewers`) return handle("requestReviewers", path, body, () => json(201, { number: 7 }));
      if ((m = route.match(new RegExp(`^PUT ${pr}/pulls/7/reviews/(\\d+)/dismissals$`))))
        return handle("dismissReview", path, body, () => {
          const r = gh.reviews.find((x) => x.id === Number(m![1]));
          if (!r) return json(404, { message: "Not Found" });
          r.state = "DISMISSED";
          return json(200, r);
        });
      if ((m = route.match(new RegExp(`^GET ${pr}/commits/(\\w+)/check-runs$`))))
        return handle("checkRuns", path, undefined, () => {
          const runs = gh.checkRuns.map((r) => ({ head_sha: m![1], status: "completed", app: { slug: "github-actions" }, ...r }));
          return json(200, { total_count: runs.length, check_runs: runs });
        });
      if (route === `GET ${pr}/rules/branches/main`) return handle("rules", path, undefined, () => json(200, gh.rules));
      if (route === `GET ${pr}/branches/main/protection`)
        return handle("protection", path, undefined, () => (gh.protection ? json(200, gh.protection) : json(404, { message: "Branch not protected" })));
      throw new Error(`fake GitHub: unexpected ${route}`);
    }),
  );
  return gh;
}
