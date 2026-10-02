# Security

## Reporting

Do not put credentials, private keys, session cookies, or exploit details into public issues. Use GitHub's **Report a vulnerability** feature if enabled on the repository. Otherwise contact the repository owner privately to arrange disclosure. Do not test attacks against mosques without their authorization.

## Boundaries

Public JSON is public. Do not store attendee information, donations, passwords, admin identities, children’s personal information, or other private records in it. Deleting data from the current JSON does not remove its Git history.

GitHub App private keys, OAuth client secrets, and session encryption secrets belong in the publisher's secret store, never in frontend environment variables, public repositories, logs, or native apps. Limit App installation to the intended repository and necessary permissions. Use a repository-scoped publisher; v1 is not a shared multi-tenant authorizer.

Use HTTPS in production, exact trusted origins and callbacks, and a same-origin API route where possible. Keep the generated website and admin dependencies updated. Preserve origin and CSRF checks. Validate schemas server-side, not only in the editor. Never make arbitrary GitHub paths or repository identifiers writable based on client input.

Changing a GitHub user's permissions or revoking App access must prevent subsequent edits. Review publisher session expiration, logout, and permission checks before deployment. If compromised, revoke the App installation/tokens, rotate App keys and session secrets, review Git history and GitHub audit records, then redeploy from a known-good commit.

## Operational checklist

- Approve a test GitHub login on the exact deployed callback URL.
- Verify a user without repository write access cannot read admin content or publish.
- Verify a user from another mosque cannot publish here.
- Verify wrong-origin and missing-CSRF requests are rejected.
- Verify simultaneous edits produce a conflict instead of silently overwriting.
- Confirm public bundles and `/data/` contain no credentials.
- Configure API rate limits/WAF controls appropriate to your deployment; do not assume an in-memory counter is distributed protection.
- Back up repository content and media; test rollback.
- Treat free-tier exhaustion and upstream outages as availability risks.

Automated testing and dependency auditing reduce risk but do not certify absence of vulnerabilities. Live account configuration is part of the security boundary.
