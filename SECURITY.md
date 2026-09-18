# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public issue.**

Instead, please email **yakupbulbul@users.noreply.github.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within 48 hours. We will work with you to understand and address the issue before any public disclosure.

## Security Measures

Scenarix implements the following security practices:

- JWT authentication with configurable secrets (no hardcoded defaults)
- Input validation on all API routes
- Path traversal protection on file serving routes
- SQL injection prevention via Prisma ORM
- HTTP security headers
- Auth middleware on all admin routes
- Sanitized error responses (no internal details leaked)
- Environment-only API key storage (never stored in database)

## Best Practices for Self-Hosting

- Always set a strong `JWT_SECRET` in your `.env`
- Keep API keys in `.env` only — never commit them
- Use HTTPS in production
- Keep dependencies up to date
- Do not expose your database port publicly
