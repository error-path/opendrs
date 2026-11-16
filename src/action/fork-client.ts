import type { GitHubClient } from "./github.js";

/**
 * Narrows a GitHub client to a fixed list of its methods.
 *
 * The fork modes are handed the result, not the client, so the methods left out (approve, dismiss,
 * auto-merge, merge queue, raw GraphQL) do not exist on the object they hold: no bug or hostile
 * input in those modes can reach them.
 *
 * @param client - The full client.
 * @param methodNames - The methods to keep.
 * @returns A frozen object with only those methods, each bound to `client`.
 */
export function restrictClient<MethodName extends keyof GitHubClient>(client: GitHubClient, methodNames: readonly MethodName[]): Readonly<Pick<GitHubClient, MethodName>> {
  const restrictedClient: Partial<Record<MethodName, unknown>> = {};
  for (const methodName of methodNames) {
    restrictedClient[methodName] = (client[methodName] as (...args: never[]) => unknown).bind(client);
  }
  return Object.freeze(restrictedClient) as Readonly<Pick<GitHubClient, MethodName>>;
}
