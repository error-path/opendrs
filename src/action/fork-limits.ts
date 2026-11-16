/**
 * Every cap on what the fork scoring job reads about a pull request. A fork chooses how big its
 * pull request is, so each cap ends the job early with a "too large to score" result, or leaves a
 * signal unknown, instead of letting the job run long or hold a lot of memory.
 */
export interface ForkScoreLimits {
  /** More changed files than this: not scored. GitHub's files endpoint itself stops at 3000. */
  maxChangedFiles: number;
  /** More bytes of patch text than this, summed over the changed files: not scored. */
  maxPatchBytes: number;
  /** More commits than this: not scored. */
  maxCommits: number;
  /** At most this many changed code files have their contents read at the head commit. */
  maxHeadFiles: number;
  /** A changed code file bigger than this at the head commit is not read. */
  maxHeadFileBytes: number;
  /** Stop reading head contents once this many bytes have been read in total. */
  maxHeadTotalBytes: number;
  /** How many times the file listing is read again when the pull request changed while it was listed. */
  maxListingAttempts: number;
}

/** The caps the Action uses. Tests pass smaller ones. */
export const FORK_SCORE_LIMITS: ForkScoreLimits = {
  maxChangedFiles: 2000,
  maxPatchBytes: 20_000_000,
  maxCommits: 1000,
  maxHeadFiles: 30,
  maxHeadFileBytes: 1_000_000,
  maxHeadTotalBytes: 8_000_000,
  maxListingAttempts: 3,
};

/**
 * The most pages (100 pull requests each) read when looking for the completed run's pull request.
 * GitHub filters the listing by head owner and branch, so one page is the normal case.
 */
export const MAX_PULL_LISTING_PAGES = 3;

/**
 * The most pages (100 comments each) read when looking for opendrs's own fork comment. GitHub lists
 * a pull request's comments oldest first, and opendrs comments soon after the pull request opens,
 * so its comment is on an early page. Past this many pages the job fails instead of adding a
 * second comment on every run.
 */
export const MAX_COMMENT_PAGES = 10;
