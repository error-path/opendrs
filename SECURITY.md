# Security policy

opendrs can approve and merge pull requests, so a way around its safety rails is a security bug.

## Reporting

Report privately through GitHub: **Security → Report a vulnerability** on this repository
(<https://github.com/error-path/opendrs/security/advisories/new>). Do not open a public issue. Include the opendrs version, your `.opendrs.yml`, and the steps or diff that
reproduce the problem.

You should get a reply within 7 days. Confirmed issues are fixed in a patch release and credited in
the advisory unless you ask otherwise.

## In scope

- Any PR that the Action approves or enqueues when the policy in `docs/specs` says it must not.
- Leaking `GITHUB_TOKEN` or an LLM API key.
- Prompt injection that lowers a score.
- The Action failing open (an earlier approval or auto-merge surviving an error or a riskier push).

## Out of scope

- The score being a poor predictor for a particular repository. That is a calibration question;
  open a normal issue.
- Problems that need write access to the base branch's `.opendrs.yml` or workflows.
