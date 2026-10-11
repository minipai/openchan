# Cloudflare deployment

Run `./deployment/deploy.sh` to build `packages/app` for production, copy its
output without source maps, and deploy the static assets to
`openchan.starcoder.dev`.

The script needs Bun, Node.js 22.18 or later with npm, and rsync. Set
`CLOUDFLARE_API_TOKEN` before running it; set `CLOUDFLARE_ACCOUNT_ID` too when
the token can access multiple accounts.
