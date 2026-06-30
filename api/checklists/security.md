# AHM Passive Website Security Checklist

Version: 1.1.0

- HTTPS is enforced and the certificate is valid and not near expiry.
- Mixed content is absent.
- HSTS, Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, and frame protection are reviewed.
- Cookies visible to the scanner use appropriate Secure, HttpOnly, and SameSite attributes.
- Sensitive files, directory listings, debug output, and stack traces are not publicly exposed.
- Server and framework version disclosure is minimized.
- Theme and plugin names are not trivially fingerprintable from public markup beyond what is unavoidable.
- The site is not flagged by Google Safe Browsing (no malware, phishing, or unwanted-software warnings).
- WordPress REST user enumeration and XML-RPC exposure are reviewed against site requirements.
- No intrusive exploitation, credential testing, vulnerability exploitation, or destructive request is permitted.
