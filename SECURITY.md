# Security Policy

## Reporting a Vulnerability

Please report security issues privately by opening a GitHub security advisory or by
emailing the maintainer listed in the repository profile.

DevSurface runs local commands from the project it scans. It never binds outside
`127.0.0.1`, never sends telemetry, and never exposes `.env` values.
