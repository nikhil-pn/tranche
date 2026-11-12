# Tranche

The delivery plan where money is a dependency.

A small studio splits a client project into phases. Each phase ends in a PayPal payment gate, and the work after a gate stays locked until the client's money arrives. A Claude agent does the money work: it asks for the deposit hold, raises the PayPal invoice when a phase is delivered, sends a reminder when the client is late and moves the plan to match, and proposes the crew's pay. It can only propose. Money goes out through PayPal Payouts only after a person approves the exact payout, and plain code checks it against a mandate that person signed.

Built for the PayPal AI Hackathon (2026). Work in progress; a full write-up follows.

## Run it locally

You need Node 20 or newer, a PayPal sandbox REST app, five sandbox test accounts (one business, one client, three crew) and a Claude API key.

```bash
npm install
cp .env.example .env   # then fill it in
npm run dev            # http://localhost:3000
```

`npm run dev` and `npm run build` first copy the Bryntum Gantt trial bundle from `node_modules` into `public/vendor/` (see `scripts/copy-bryntum.mjs`). That folder is not committed.

## Licence

MIT, see `LICENSE`. Bryntum Gantt and AG Studio are used under their trial licences and are not covered by it.
