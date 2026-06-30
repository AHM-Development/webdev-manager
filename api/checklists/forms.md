# AHM Forms Checklist

Version: 1.0.0

- Detect every visible form and record page, selector, action, method, fields, required fields, and submit control.
- Verify every control has an accessible name and appropriate input type/autocomplete metadata.
- Verify required fields expose clear validation and errors.
- Detect reCAPTCHA, hCaptcha, Turnstile, honeypots, and missing anti-spam controls.
- Record browser console and network failures associated with validation or submission.
- Never submit booking, payment, login, medical, account, or destructive forms automatically.
- Submit only forms explicitly allowlisted in the website profile and use marked synthetic data.
- A safe form test must not notify a real client, create a real booking, charge a payment method, or retain personal data.
