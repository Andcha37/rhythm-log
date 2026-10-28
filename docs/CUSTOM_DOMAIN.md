# Rhythm Log custom domain: rhythm-log.io

The domain is a **target**, not currently connected or verified as owned.
Do not configure the GitHub Pages custom domain until the domain is registered and under your DNS control.

1. Deploy first at https://andcha37.github.io/rhythm-log/.
2. Register/confirm ownership of rhythm-log.io through a domain registrar.
3. At your DNS provider create four apex A records, name `@`, values:
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   Optionally `www` CNAME to `andcha37.github.io`.
   Remove conflicting default apex records; don't use wildcard DNS.
4. In https://github.com/Andcha37/rhythm-log/settings/pages configure
   Custom domain: `rhythm-log.io`; wait for verification/HTTPS and enable Enforce HTTPS.
   With GitHub Actions publishing a `CNAME` file is not required.
5. Authorize `https://rhythm-log.io` in Clerk production settings and optional
   username-check Worker `ALLOWED_ORIGINS`; redeploy the Worker if needed.
6. Test HTTPS, login, CORS, RLS with two accounts, model initialization and PWA.

Sources:
https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
