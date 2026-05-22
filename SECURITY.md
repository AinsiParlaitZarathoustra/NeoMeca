# Security Policy

## Supported Versions

NeoMeca currently supports the following versions with security updates :

| Version | Status | Release | Support End |
|---------|--------|---------|-------------|
| 1.5.x   | Upcoming | 26 May – 3 June 2026 | TBD |
| 1.0.x   | Active | 8 May 2026 | 2026-12-31 |
| < 1.0   | Unsupported | - | - |

## Reporting a Vulnerability

If you discover a security vulnerability in NeoMeca, please report it **privately** :

1. **Do not open a public GitHub issue**
2. Open a [GitHub Security Advisory](https://github.com/AinsiParlaitZarathoustra/NeoMeca/security/advisories)
3. Or email via GitHub's private vulnerability reporting feature

### Response Timeline

- **Acknowledgment :** Within 48 hours
- **Assessment :** Within 1 week
- **Fix & release :** Depends on severity
  - Critical : Within 2 weeks
  - High : Within 1 month
  - Medium/Low : Within next scheduled release

### Vulnerability Disclosure

Once fixed and released, we will publicly disclose the vulnerability with credit to the reporter (unless otherwise requested).

## Security Expectations

NeoMeca is educational software designed for physics teachers and students. It is **not** intended for production systems or sensitive data handling.

Security issues we take seriously :
- Buffer overflows or memory corruption
- Arbitrary code execution
- Privilege escalation
- Data exfiltration

Issues we may decline :
- Denial of Service attacks
- Social engineering vectors
- Issues in third-party dependencies (report directly to those projects)

## Third-Party Dependencies

NeoMeca uses well-maintained libraries (OpenCV, FFmpeg, PySide6, NumPy, etc.). For vulnerabilities in these dependencies, please report directly to their respective projects.

---

*Last updated : 21 May 2026*
